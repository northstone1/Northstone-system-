-- Northstone RLS policies and client-portal RPC functions
--
-- Access model:
--  * "staff" profiles run the internal app and get broad read/write access
--    to everything (fine-grained permissions per TEAM_ROLES is a future
--    improvement, not v1).
--  * "client" profiles can only ever see their own project (via
--    projects.client_user_id) and that project's related rows. They never
--    get direct table INSERT/UPDATE grants — every client-portal action
--    (sending a message, approving a variation, signing a proposal, etc.)
--    goes through a security-definer function below that checks ownership
--    and applies a narrow, validated change. This keeps a client from being
--    able to edit arbitrary columns even if the app's UI is bypassed.
--  * Anonymous (signed-out) users have no access to anything.

create function public.is_staff()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'staff'
  );
$$;

create function public.owns_project(p_project_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.projects
    where id = p_project_id and client_user_id = auth.uid()
  );
$$;

grant execute on function public.is_staff() to authenticated;
grant execute on function public.owns_project(uuid) to authenticated;

-- Supabase no longer auto-exposes new tables to the Data API roles — table
-- grants must be explicit, separate from RLS. RLS policies below are the
-- real access control; anon gets nothing at all, so it's deliberately left
-- out of these grants.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ============================================================
-- PROFILES
-- ============================================================
alter table public.profiles enable row level security;

create policy "staff read all profiles" on public.profiles
  for select to authenticated using (public.is_staff());

create policy "users read own profile" on public.profiles
  for select to authenticated using (id = auth.uid());

create policy "users update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ============================================================
-- STAFF-ONLY TABLES
-- (team roster, leads, calendar, pricing tool data, settings writes)
-- ============================================================
alter table public.team_members enable row level security;
create policy "staff manage team_members" on public.team_members
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

alter table public.leads enable row level security;
create policy "staff manage leads" on public.leads
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

alter table public.calendar_events enable row level security;
create policy "staff manage calendar_events" on public.calendar_events
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

alter table public.saved_quotes enable row level security;
create policy "staff manage saved_quotes" on public.saved_quotes
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

alter table public.supplier_contacts enable row level security;
create policy "staff manage supplier_contacts" on public.supplier_contacts
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

alter table public.project_team_members enable row level security;
create policy "staff manage project_team_members" on public.project_team_members
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ============================================================
-- PROJECTS
-- ============================================================
alter table public.projects enable row level security;

create policy "staff manage projects" on public.projects
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "clients read own project" on public.projects
  for select to authenticated using (client_user_id = auth.uid());

-- ============================================================
-- PROJECT CHILD TABLES — staff full access, clients read-only on their own
-- project's rows. Client writes go through the functions below.
-- ============================================================
alter table public.project_visuals enable row level security;
create policy "staff manage project_visuals" on public.project_visuals
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "clients read own project_visuals" on public.project_visuals
  for select to authenticated using (public.owns_project(project_id));

alter table public.project_variations enable row level security;
create policy "staff manage project_variations" on public.project_variations
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "clients read own project_variations" on public.project_variations
  for select to authenticated using (public.owns_project(project_id));

alter table public.project_messages enable row level security;
create policy "staff manage project_messages" on public.project_messages
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "clients read own project_messages" on public.project_messages
  for select to authenticated using (public.owns_project(project_id));

alter table public.project_site_updates enable row level security;
create policy "staff manage project_site_updates" on public.project_site_updates
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "clients read own project_site_updates" on public.project_site_updates
  for select to authenticated using (public.owns_project(project_id));

alter table public.project_support_tickets enable row level security;
create policy "staff manage project_support_tickets" on public.project_support_tickets
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "clients read own project_support_tickets" on public.project_support_tickets
  for select to authenticated using (public.owns_project(project_id));

alter table public.project_referrals enable row level security;
create policy "staff manage project_referrals" on public.project_referrals
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "clients read own project_referrals" on public.project_referrals
  for select to authenticated using (public.owns_project(project_id));

-- ============================================================
-- SHARED READ-ONLY TABLES
-- ============================================================
alter table public.portfolio_photos enable row level security;
create policy "staff manage portfolio_photos" on public.portfolio_photos
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "everyone reads portfolio_photos" on public.portfolio_photos
  for select to authenticated using (true);

alter table public.company_settings enable row level security;
create policy "staff manage company_settings" on public.company_settings
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "everyone reads company_settings" on public.company_settings
  for select to authenticated using (true);

-- ============================================================
-- CLIENT PORTAL ACTIONS — narrow, validated writes for signed-in clients.
-- Each function checks the caller owns the project before touching it.
-- ============================================================

create function public.submit_client_message(p_project_id uuid, p_body text)
returns public.project_messages
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.project_messages;
begin
  if not public.owns_project(p_project_id) then
    raise exception 'not authorized for this project';
  end if;
  if trim(p_body) = '' then
    raise exception 'message body cannot be empty';
  end if;
  insert into public.project_messages (project_id, sender, author_id, body)
  values (p_project_id, 'client', auth.uid(), trim(p_body))
  returning * into v_row;
  return v_row;
end;
$$;

create function public.submit_support_ticket(p_project_id uuid, p_subject text, p_description text)
returns public.project_support_tickets
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.project_support_tickets;
begin
  if not public.owns_project(p_project_id) then
    raise exception 'not authorized for this project';
  end if;
  if trim(p_subject) = '' then
    raise exception 'subject is required';
  end if;
  insert into public.project_support_tickets (project_id, subject, description)
  values (p_project_id, trim(p_subject), p_description)
  returning * into v_row;
  return v_row;
end;
$$;

create function public.submit_review(p_project_id uuid, p_rating smallint, p_text text)
returns public.projects
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.projects;
begin
  if not public.owns_project(p_project_id) then
    raise exception 'not authorized for this project';
  end if;
  if p_rating < 1 or p_rating > 5 then
    raise exception 'rating must be between 1 and 5';
  end if;
  update public.projects
  set review_rating = p_rating, review_text = p_text, review_submitted_at = current_date
  where id = p_project_id
  returning * into v_row;
  return v_row;
end;
$$;

create function public.respond_to_variation(p_variation_id uuid, p_status text)
returns public.project_variations
language plpgsql
security definer set search_path = public
as $$
declare
  v_project_id uuid;
  v_row public.project_variations;
begin
  if p_status not in ('Approved', 'Rejected') then
    raise exception 'status must be Approved or Rejected';
  end if;
  select project_id into v_project_id from public.project_variations where id = p_variation_id;
  if v_project_id is null or not public.owns_project(v_project_id) then
    raise exception 'not authorized for this variation';
  end if;
  update public.project_variations
  set status = p_status, responded_at = now()
  where id = p_variation_id
  returning * into v_row;
  return v_row;
end;
$$;

create function public.dismiss_portal_welcome(p_project_id uuid)
returns public.projects
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.projects;
begin
  if not public.owns_project(p_project_id) then
    raise exception 'not authorized for this project';
  end if;
  update public.projects set portal_welcomed = true
  where id = p_project_id
  returning * into v_row;
  return v_row;
end;
$$;

-- Client accepts & signs a proposal. Generates a referral code for the now-
-- signed project and, if this project itself came from a referral, marks
-- that referral "Rewarded" — mirrors signProposal() in NorthstoneSystem.jsx,
-- moved server-side so the reward can't be forged by a client-side call.
create function public.sign_project_proposal(p_project_id uuid, p_typed_signature text, p_client_name text)
returns public.projects
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.projects;
  v_code text;
  v_reward numeric(10, 2);
begin
  if not public.owns_project(p_project_id) then
    raise exception 'not authorized for this project';
  end if;
  if trim(p_typed_signature) = '' or trim(p_client_name) = '' then
    raise exception 'signature and client name are required';
  end if;

  select referral_code into v_code from public.projects where id = p_project_id;
  if v_code is null then
    v_code := 'NORTH-' || upper(left(regexp_replace(split_part(p_client_name, ' ', 1), '[^A-Za-z]', '', 'g'), 6))
              || floor(1000 + random() * 9000)::int;
  end if;

  update public.projects
  set
    signature = jsonb_build_object(
      'clientName', p_client_name,
      'date', coalesce(signature ->> 'date', to_char(current_date, 'YYYY-MM-DD')),
      'agreed', true,
      'signed', true,
      'typedSignature', p_typed_signature
    ),
    status = 'Signed',
    referral_code = v_code
  where id = p_project_id
  returning * into v_row;

  if v_row.referred_by_project_id is not null and v_row.referral_entry_id is not null then
    select referral_reward_amount into v_reward from public.company_settings limit 1;
    update public.project_referrals
    set status = 'Rewarded', reward_amount = v_reward, rewarded_at = current_date
    where id = v_row.referral_entry_id;
  end if;

  return v_row;
end;
$$;

-- Client submits a referral from their portal. Creates the project_referrals
-- row and a matching lead for the sales team to work, in one transaction.
create function public.submit_referral(
  p_project_id uuid, p_name text, p_phone text, p_email text, p_notes text
)
returns public.project_referrals
language plpgsql
security definer set search_path = public
as $$
declare
  v_referral public.project_referrals;
  v_lead_id uuid;
  v_referrer_name text;
begin
  if not public.owns_project(p_project_id) then
    raise exception 'not authorized for this project';
  end if;
  if trim(p_name) = '' then
    raise exception 'referral name is required';
  end if;

  select client_name into v_referrer_name from public.projects where id = p_project_id;

  insert into public.project_referrals (project_id, name, phone, email, notes)
  values (p_project_id, trim(p_name), p_phone, p_email, p_notes)
  returning * into v_referral;

  insert into public.leads (name, phone, email, source, notes, referred_by_project_id, referral_id)
  values (
    trim(p_name), p_phone, p_email, 'Referral',
    'Referred by ' || coalesce(v_referrer_name, 'a client')
      || case when p_notes is not null and trim(p_notes) <> '' then ' — ' || p_notes else '' end,
    p_project_id, v_referral.id
  )
  returning id into v_lead_id;

  update public.project_referrals set lead_id = v_lead_id where id = v_referral.id;
  select * into v_referral from public.project_referrals where id = v_referral.id;

  return v_referral;
end;
$$;

-- Lock down function execution: only signed-in users, not anon.
revoke execute on function
  public.submit_client_message(uuid, text),
  public.submit_support_ticket(uuid, text, text),
  public.submit_review(uuid, smallint, text),
  public.respond_to_variation(uuid, text),
  public.dismiss_portal_welcome(uuid),
  public.sign_project_proposal(uuid, text, text),
  public.submit_referral(uuid, text, text, text, text)
from public, anon;

grant execute on function
  public.submit_client_message(uuid, text),
  public.submit_support_ticket(uuid, text, text),
  public.submit_review(uuid, smallint, text),
  public.respond_to_variation(uuid, text),
  public.dismiss_portal_welcome(uuid),
  public.sign_project_proposal(uuid, text, text),
  public.submit_referral(uuid, text, text, text, text)
to authenticated;
