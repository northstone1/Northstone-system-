# Northstone

Business management app for Northstone landscaping: leads/CRM, site surveys,
job pricing & estimates, proposals, construction tracking, team calendar, and
a client portal.

## Stack

- **React + Vite** (JavaScript)
- **Supabase** — database & auth
- **Cloudflare Pages** — hosting

## Project structure

```
src/
  main.jsx              Vite entry point
  App.jsx                Top-level app: AuthProvider + AuthGate
  AuthGate.jsx            Decides login/signup/reset vs. the real app based on auth state
  NorthstoneSystem.jsx    The full app (prototype, ported as-is for now)
  components/
    PhotoImg.jsx           Resolves a project-photos Storage path to a signed URL and renders it
  lib/
    supabaseClient.js     Supabase client, reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
    AuthProvider.jsx       Auth context: session, profile (role), sign in/up/out, password reset
    brand.js                Shared brand tokens/styles used by the auth screens
    data/                   All Supabase reads/writes — see "Data layer" below
  screens/
    auth/                  LoginScreen, SignUpScreen, ForgotPasswordScreen, ResetPasswordScreen
wrangler.toml            Cloudflare Workers deploy config — see "Deploying" below
supabase/
  config.toml              Supabase CLI project config
  migrations/               SQL schema, RLS policies, and client-portal RPC functions
```

`NorthstoneSystem.jsx` still holds the whole app (all screens, all UI state)
as it was ported from the original single-file prototype — that part hasn't
changed. What has changed: it no longer touches `window.storage` or
`localStorage` at all. Every read on load and every mutation goes through
`src/lib/data/*`, which wraps real Supabase table/RPC calls. Splitting
`NorthstoneSystem.jsx` itself into smaller components is still open — this
pass focused on the data layer underneath it, not restructuring the file.

## Database schema (Supabase)

`supabase/migrations/` has the full schema, split into two files:

- `20260803122340_initial_schema.sql` — tables (projects, leads, calendar
  events, team members, and the project's child records: messages, site
  updates, variations, support tickets, referrals, design visuals), indexes,
  and the `handle_new_user` trigger that creates a `profiles` row for every
  new Supabase Auth signup.
- `20260803122341_rls_and_functions.sql` — Row Level Security policies plus
  a set of `security definer` RPC functions for client-portal actions
  (`sign_project_proposal`, `submit_referral`, `respond_to_variation`,
  `submit_client_message`, `submit_support_ticket`, `submit_review`,
  `dismiss_portal_welcome`).

**Access model:** two profile roles, `staff` and `client`. Staff (the
internal team using the main app) get full read/write access to everything.
Clients only ever see their own project — enforced by
`projects.client_user_id = auth.uid()` — and never get direct table
write access; every portal action goes through one of the RPC functions
above, which validates project ownership before making a narrow, specific
change. This was chosen over blanket client UPDATE grants so a client can't
edit arbitrary columns (e.g. their project's price or status) even if the
frontend is bypassed. All of this was tested against a local Postgres
instance (seeded `auth.users`/`auth.uid()` stand-ins) before being committed
— staff/client isolation, every RPC function, and the referral-reward chain
(client refers a friend → lead created → friend signs → referrer's referral
marked "Rewarded") all behave as designed.

**Design decisions worth knowing:**
- Structured, frequently-filtered data (status, dates, foreign keys) is real
  columns/tables. Free-form nested content the prototype already treated as
  a document — survey answers, proposal copy, pricing selections, timeline
  percentages — stays `jsonb`, matching the shape `NorthstoneSystem.jsx`
  already reads/writes (see "Data layer" below for how that's wired up).
- Photos are stored as Supabase Storage paths, not base64 — see "Data
  layer" below for the two buckets this requires.
- The pricing catalogue (`PRICING_CATEGORIES` — labour/plant/materials
  rates & costs) stays in frontend code for now; `projects.pricing` only
  stores each project's *selections* against it. Moving the catalogue itself
  into the database (so office staff can update rates without a deploy) is a
  reasonable phase-2 change, not done here.
- Supabase's current default no longer auto-exposes new `public` schema
  tables to the API roles — the migration grants `authenticated` explicit
  table privileges and relies on RLS for the actual row-level restriction;
  `anon` gets nothing, so signed-out requests see no data anywhere.

To apply these migrations to a real Supabase project:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

## Auth

Two ways in, matching the `staff`/`client` roles from the schema above:

- **Staff sign in with email + password.** There's no public staff sign-up
  screen on purpose — you (the owner) create staff accounts directly in
  Supabase: **Dashboard → Authentication → Users → Add user**, set an email
  and password, and under user metadata add
  `{"role": "staff", "full_name": "Their Name"}`. The `handle_new_user`
  trigger reads that metadata and creates the matching `profiles` row
  automatically. (Same result via the CLI/Admin API if you'd rather script
  it: `supabase.auth.admin.createUser({ email, password, user_metadata: { role: "staff" } })`
  from a trusted environment — never from the frontend, since that call
  needs the service-role key.)
- **Clients get invited by staff**, from the Proposal screen's "Invite
  Client to Portal" button. This calls the `invite-client` Edge Function
  (see below), which creates their account, emails them a link to set a
  password, and links the account to the project (`projects.client_user_id`)
  — all in one step. If that email address already has an account (they
  self-signed-up already, or were invited to an earlier project), it skips
  re-inviting and just links the existing account instead. Clients can
  still self sign-up from the "Client? Create an account" link on the login
  screen if you'd rather send them there directly and link manually via
  SQL: `update projects set client_user_id = (select id from profiles where email = '...') where id = '...';`
- **Forgot/reset password** works for both roles via Supabase's standard
  email-link flow (`resetPasswordForEmail` → link to `/reset-password` →
  `updateUser({ password })`). The invite email uses the same underlying
  "set your password" mechanism.
- Once signed in, the sidebar shows who's signed in and a **Sign out**
  link (in the team app's sidebar for staff, in the portal sidebar for
  clients). Clients never see the "Team View" toggle — `NorthstoneSystem`
  reads `role` from `useAuth()` and hides it, forcing them into their own
  portal.
- Email delivery (confirmation, password reset, invites) uses Supabase's
  built-in email service by default, which is rate-limited and fine for
  testing but not production — swap in a custom SMTP provider under
  **Dashboard → Authentication → Emails** before going live.

### The owner flag — permanently deleting leads/quotes

`profiles.is_owner` (added by the `20260825150000_owner_delete_restriction`
migration) marks one staff account as the business owner/admin. It's what
gates permanently deleting a lead or a quote-stage project (Draft/Survey
Booked/Proposal Sent/Lost) — a destructive, unrecoverable action that
ordinary staff logins (including any added later) can't do, on
Signed/In Construction/Completed projects nobody can do, and it's enforced
by RLS at the database level, not just by hiding the button in the UI. No
account has this flag by default, including the first staff account — set
it once via SQL after running the migration:

```sql
update public.profiles set is_owner = true where email = 'you@yourdomain.com';
```

### Deploying the invite-client Edge Function

`supabase/functions/invite-client/` creates/invites a client's account and
links it to a project. It needs the service-role key, which is why it's a
server-side function rather than a direct browser call — deploy it once:

```bash
npx supabase functions deploy invite-client
npx supabase secrets set APP_URL=https://app.northstonedesignandbuild.com
```

`APP_URL` is where the invite email's link sends the client back to (your
Cloudflare Pages URL or custom domain) — without it the link falls back to
whatever default Supabase has configured, which likely isn't this app.
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
injected automatically by the Edge Functions runtime; nothing to set for
those. The function itself checks the caller's `profiles.role` and rejects
anything but `staff` before doing anything privileged.

### The /auth/confirm route — and the email template it depends on

`src/screens/auth/ConfirmInviteScreen.jsx` is a deliberate-tap confirmation
page: it reads `token_hash` and `type` from the URL's query string, shows a
"Set up my account" button (no auto-submit), calls
`supabase.auth.verifyOtp({ token_hash, type })` on tap, then shows a
password + confirm-password form, calls `supabase.auth.updateUser({
password })` on submit, and redirects to `/` on success — landing signed in,
since `verifyOtp` already established a session. `App.jsx` checks
`window.location.pathname === "/auth/confirm"` for this; no router library
needed for one route.

**This only works if Supabase's invite email actually links here with those
params.** By default it doesn't — the stock "Invite user" template uses
`{{ .ConfirmationURL }}`, which verifies the token server-side on Supabase's
own domain and redirects with a session already established (the
`detectSessionInUrl` flow `AuthProvider` otherwise relies on, e.g. for
password reset). That's a different, more automatic flow than what this
route expects. To point invites at `/auth/confirm` instead:

**Dashboard → Authentication → Email Templates → Invite user**, replace the
confirmation link with:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}
```

`{{ .SiteURL }}` resolves from **Authentication → URL Configuration → Site
URL** — make sure that's set to your deployed app's URL (not `localhost`),
separately from the Edge Function's `APP_URL` secret above.

## Data layer

Everything in `src/lib/data/` follows the same shape: fetch functions map
DB rows (snake_case, relational children) to the camelCase/nested shape
`NorthstoneSystem.jsx` already expects, and mutation functions do the
reverse. The app fetches everything once on load (`fetchAllProjects()` plus
leads/events/team/portfolio/settings, run in parallel) — no `window.storage`,
no `localStorage`, no bulk "save everything" effect. Each user action writes
straight to the specific table or RPC it affects, right when it happens:

- **`projects.js`** is the biggest one. `saveProjectCore()` is the single
  checkpoint every "save the draft" action goes through (matches the
  prototype's original `syncDraft()` timing exactly — e.g. survey answers
  still don't hit the database until the survey's final review step, same
  as before). Everything else — messages, variations, site updates, support
  tickets, referrals, design visuals, assigned team — writes directly to
  its own table the moment it happens, since those live in child tables,
  not the `projects` row's jsonb columns.
- **Staff vs. client branching**: several actions (sending a portal
  message, approving a variation, leaving a review, raising a support
  ticket, submitting a referral, dismissing the welcome modal) are reachable
  by two different people — a real client (their own project only) and
  staff previewing via the "Client Portal" toggle (full access). Each of
  these branches on `role` from `useAuth()`: staff get a direct table
  write, clients go through the matching `security definer` RPC from the
  schema migration. `signProposal` doesn't need this — it's only reachable
  from the staff-side wizard (capturing a signature in person/on a call),
  there's no remote client-signing flow in this app.
- **`markPaid`** ("Pay Now" in the client portal) is staff-only for now — a
  client clicking it sees "online payment isn't connected yet, contact
  Northstone" rather than a fake instant success. Wiring up a real payment
  provider is future work; self-reporting your own payment as received
  isn't something worth building in the meantime.
- **Photos** upload to Supabase Storage instead of inlining base64. Two
  buckets are required — create them before uploading anything:
  - `project-photos` — **private**. Survey photos, site-update photos, and
    design visuals. Every display resolves a signed URL on the fly via
    `<PhotoImg path={...} />` (`src/components/PhotoImg.jsx`), cached
    in-memory per path.
  - `portfolio-photos` — **public read**. The proposal "design inspiration"
    gallery — no signing needed, `getPublicPhotoUrl()` is synchronous
    string construction.
- **Backup/restore**: export still works unchanged (it just serializes
  current in-memory state). Import now does more than the prototype's
  local-only restore — it upserts projects/leads/events/team/settings into
  Supabase, preserving original ids so references between them (an event's
  `projectId`, a lead's `referredByProjectId`) still resolve. It does not
  restore child-table data that didn't exist in the old local-storage
  format (messages, variations, site updates, support tickets, referrals,
  design visuals) or portfolio photos (old backups hold those as base64,
  incompatible with the Storage-path model) — those are skipped rather than
  imported broken.
- **Dropped, not carried forward**: the prototype persisted which screen/
  tab you were on and which mode (team/portal) across reloads. That was
  tied to the old single-blob `window.storage` key and wasn't re-implemented
  — the app now just opens to a sensible default (dashboard for staff, your
  own portal for clients) on every load.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project URL + anon key
npm run dev
```

## Build

```bash
npm run build      # outputs to dist/
npm run preview    # preview the production build locally
```

## Deploying to Cloudflare Pages

**Cloudflare Dashboard → Workers & Pages → Create application → Pages → Connect to Git**, authorize GitHub if needed, and select this repo. Then:

- **Production branch**: whichever branch you want live — there's no `main` yet, everything so far has been developed on `claude/northstone-app-setup-kzjs3g`, and Pages is happy to treat any branch as production. Merge to `main` first if you'd rather keep that convention; not required.
- **Framework preset**: Vite (or leave as None and set the two fields below manually — either works)
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Environment variables** (Settings → Environment variables, set for both Production and Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — same values as `.env.local`, not committed to the repo.

Cloudflare's current dashboard provisions new "Workers & Pages" projects on their
unified Workers deployment model, whose deploy step runs `npx wrangler deploy`
rather than the older Pages-only asset upload. `wrangler.toml` (already in this
repo) is what tells it what to deploy:

```toml
name = "northstone-system"
compatibility_date = "2026-08-04"

[assets]
directory = "./dist"
not_found_handling = "single-page-application"

routes = [
  { pattern = "app.northstonedesignandbuild.com", custom_domain = true }
]
```

The `routes` block attaches the app to the custom domain
`app.northstonedesignandbuild.com` instead of the default
`*.workers.dev` subdomain. This only works once `northstonedesignandbuild.com`
has been added as a zone in the same Cloudflare account (**Cloudflare
Dashboard → Add a domain**, or it's already there if the site is already on
Cloudflare) — otherwise `wrangler deploy` will fail to attach the route. Once
it's live, `app.northstonedesignandbuild.com` becomes the app's real URL in
place of the `workers.dev` one.

In practice, `wrangler deploy`'s auto-config wizard (on by default) detects the
Vite framework and manages its own generated config each run regardless of this
file — that's expected, not a bug, and this `wrangler.toml` still matters if you
ever deploy with plain `wrangler deploy` outside Cloudflare's dashboard pipeline.

`not_found_handling = "single-page-application"` is what makes client-side
routes work — it's the platform-level replacement for the old Cloudflare Pages
`public/_redirects` file, which this repo intentionally does **not** have.
Adding one back would conflict: `_redirects`' catch-all rule and the assets
system's own URL canonicalization (which strips `.html`/`/index` from paths)
end up re-triggering each other, and the deploy fails with
`Invalid _redirects configuration: ... Infinite loop detected` at the
**Deploying** step (after the build itself succeeds).

**One gotcha:** Supabase Auth checks outgoing links (password reset, email confirmation) against an allowlist under **your Supabase project's Dashboard → Authentication → URL Configuration**. Add `https://app.northstonedesignandbuild.com` there as both the **Site URL** and in **Redirect URLs** (`https://app.northstonedesignandbuild.com/*`) — otherwise those emailed links will point at the wrong place or get rejected. If the app was previously reachable at a `*.workers.dev` URL, remove that from Redirect URLs once the custom domain is confirmed working, and update the `APP_URL` secret on the `invite-client` Edge Function (see above) and the "Invite user" email template's link (see below) to match.
