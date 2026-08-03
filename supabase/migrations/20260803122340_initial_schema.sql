-- Northstone initial schema
--
-- Design notes:
--  * Highly structured, frequently-filtered data (status, dates, foreign keys)
--    is modelled as real columns/tables. Free-form nested content that the
--    prototype already treats as a document (survey answers, proposal copy,
--    pricing selections, timeline percentages) stays as jsonb, mirroring the
--    shape NorthstoneSystem.jsx already reads/writes so the frontend port is
--    mostly a find-and-replace of window.storage calls for supabase-js calls.
--  * Photos are NOT stored as base64 in the database (the prototype currently
--    inlines data URLs). Every photo column here is a Supabase Storage path
--    instead — create matching storage buckets (e.g. "project-photos",
--    "portfolio-photos") before wiring up uploads.
--  * The pricing catalogue (PRICING_CATEGORIES / rates & costs) stays in
--    frontend code for v1, same as today. `projects.pricing` only stores each
--    project's *selections* against that catalogue. Moving the catalogue
--    itself into the database (so office staff can update rates without a
--    deploy) is a reasonable phase-2 change — see README notes.

create extension if not exists pgcrypto;

-- ============================================================
-- PROFILES — one row per Supabase Auth user (staff or client)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('staff', 'client')),
  full_name text,
  email text,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Extends auth.users. role=staff → internal team app; role=client → project portal only.';

-- Auto-create a profile row whenever someone signs up. Role defaults to
-- 'client' unless explicitly set in the signup metadata (staff accounts
-- should be created by an admin passing role: 'staff').
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'role', 'client'),
    new.raw_user_meta_data ->> 'full_name',
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- TEAM MEMBERS — internal roster (calendar colour, contact info).
-- Optionally linked to a profile if that person also has a login.
-- ============================================================
create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  name text not null,
  role text not null check (
    role in (
      'Project Manager', 'Site Supervisor', 'Groundworker', 'Landscaper',
      'Electrician', 'Subcontractor', 'Admin', 'Owner / Director'
    )
  ),
  phone text,
  email text,
  color text not null default '#0f2a20',
  created_at timestamptz not null default now()
);

-- ============================================================
-- PROJECTS — the core record: lead → survey → estimate → proposal →
-- construction → completed. One row per job.
-- ============================================================
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  ref text unique,
  name text not null default '',

  client_user_id uuid references public.profiles (id) on delete set null,
  client_name text not null default '',
  email text,
  phone text,
  address text,
  town text,
  county text,
  postcode text,
  project_type text not null default 'Residential' check (project_type in ('Residential', 'Commercial')),

  services jsonb not null default '{}'::jsonb, -- { "Driveways": true, ... }
  goals text,

  -- { info, measurements, photos, services, vision } — photos values are
  -- storage paths, not data URLs.
  survey jsonb not null default '{}'::jsonb,

  -- { itemState, poaState, collapsed, customItems } — selections against the
  -- frontend pricing catalogue.
  pricing jsonb not null default '{}'::jsonb,

  -- { welcomeMessage, highlights[], validityDays, warrantyYears, durationWeeks }
  proposal jsonb not null default '{}'::jsonb,

  -- { clientName, date, agreed, signed, typedSignature }. Mutated only via
  -- the sign_project_proposal() function, not written directly by clients.
  signature jsonb not null default '{}'::jsonb,

  status text not null default 'Draft' check (
    status in (
      'Draft', 'Survey Booked', 'Proposal Sent', 'Signed',
      'In Construction', 'Completed', 'Lost'
    )
  ),
  previous_status text,

  -- { prep, ground, landscaping, structures, finishing, handover } 0-100
  timeline jsonb not null default '{"prep":0,"ground":0,"landscaping":0,"structures":0,"finishing":0,"handover":0}'::jsonb,

  -- { "0": true, "1": false, ... } keyed by PAYMENT_STAGES index
  payments jsonb not null default '{}'::jsonb,

  portal_welcomed boolean not null default false,

  referral_code text unique,
  referred_by_project_id uuid references public.projects (id) on delete set null,
  referral_entry_id uuid, -- which project_referrals row on the referring project earns the reward

  lost_reason text,
  lost_notes text,
  lost_at date,

  review_rating smallint check (review_rating between 1 and 5),
  review_text text,
  review_submitted_at date,

  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_status_idx on public.projects (status);
create index projects_client_user_id_idx on public.projects (client_user_id);
create index projects_referred_by_project_id_idx on public.projects (referred_by_project_id);

create function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- Many-to-many: which team members are staffed on which jobs.
create table public.project_team_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  team_member_id uuid not null references public.team_members (id) on delete cascade,
  primary key (project_id, team_member_id)
);

-- 2D plans / 3D renders shown in the client portal's design section.
create table public.project_visuals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null check (kind in ('plans2d', 'renders3d')),
  storage_path text not null,
  caption text default '',
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index project_visuals_project_id_idx on public.project_visuals (project_id);

-- Change orders / variations, approved or rejected by the client.
create table public.project_variations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  description text,
  amount numeric(10, 2) not null default 0,
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index project_variations_project_id_idx on public.project_variations (project_id);

-- Team <-> client chat thread, one thread per project.
create table public.project_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  sender text not null check (sender in ('team', 'client')),
  author_id uuid references public.profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index project_messages_project_id_idx on public.project_messages (project_id);

-- Site progress feed (photo + caption) visible to the client.
create table public.project_site_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  stage text,
  caption text,
  storage_path text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

create index project_site_updates_project_id_idx on public.project_site_updates (project_id);

-- Client-raised support tickets.
create table public.project_support_tickets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  subject text not null,
  description text,
  status text not null default 'Open' check (status in ('Open', 'Resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index project_support_tickets_project_id_idx on public.project_support_tickets (project_id);

-- Referrals a client submits from their own project's portal.
create table public.project_referrals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade, -- the referrer's project
  name text not null,
  phone text,
  email text,
  notes text,
  status text not null default 'Pending' check (status in ('Pending', 'Rewarded')),
  reward_amount numeric(10, 2),
  rewarded_at date,
  lead_id uuid, -- backfilled once a lead row is created for this referral
  created_at timestamptz not null default now()
);

create index project_referrals_project_id_idx on public.project_referrals (project_id);

alter table public.projects
  add constraint projects_referral_entry_id_fkey
  foreign key (referral_entry_id) references public.project_referrals (id) on delete set null;

-- ============================================================
-- LEADS — pre-project enquiries, staff-only.
-- ============================================================
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  source text not null default 'Phone Call' check (
    source in ('Phone Call', 'Website', 'Referral', 'Google Ads', 'Social Media', 'Walk-in', 'Other')
  ),
  notes text,
  status text not null default 'New' check (
    status in ('New', 'Contacted', 'Survey Booked', 'Quoted', 'Won', 'Lost')
  ),
  lost_reason text,
  referred_by_project_id uuid references public.projects (id) on delete set null,
  referral_id uuid references public.project_referrals (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index leads_status_idx on public.leads (status);

alter table public.project_referrals
  add constraint project_referrals_lead_id_fkey
  foreign key (lead_id) references public.leads (id) on delete set null;

-- ============================================================
-- CALENDAR EVENTS — staff-only scheduling.
-- ============================================================
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null default 'Site Visit' check (
    type in ('Site Visit', 'Site Survey', 'Client Meeting', 'Phone Call', 'Team Meeting', 'Delivery', 'Other')
  ),
  event_date date not null,
  event_time time,
  project_id uuid references public.projects (id) on delete set null,
  lead_id uuid references public.leads (id) on delete set null,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index calendar_events_event_date_idx on public.calendar_events (event_date);

-- ============================================================
-- PORTFOLIO PHOTOS — company-wide gallery, feeds "design inspiration" in
-- generated proposals. Readable by clients, writable by staff only.
-- ============================================================
create table public.portfolio_photos (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  caption text default '',
  created_at timestamptz not null default now()
);

-- ============================================================
-- JOB PRICING TOOL — standalone quotes/contacts, not tied to a project.
-- Staff-only.
-- ============================================================
create table public.saved_quotes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  item_state jsonb not null default '{}'::jsonb,
  poa_state jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.supplier_contacts (
  supplier_id text primary key,
  contact jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- COMPANY SETTINGS — single row (VAT %, referral reward, target margin).
-- Readable by everyone signed in (clients see VAT-inclusive totals and the
-- referral reward amount), writable by staff only.
-- ============================================================
create table public.company_settings (
  id boolean primary key default true check (id), -- forces exactly one row
  vat_pct numeric(5, 2) not null default 20,
  referral_reward_amount numeric(10, 2) not null default 250,
  target_margin_pct numeric(5, 2) not null default 30
);

insert into public.company_settings (id) values (true);
