-- Adds an owner/admin flag on top of the existing staff/client roles, and
-- uses it to restrict permanently deleting leads and quote-stage projects
-- to that one account. Ordinary staff (including any added later) keep
-- full select/insert/update access to leads and projects — this narrows
-- DELETE only, and is enforced here at the RLS level so it can't be
-- bypassed by calling the API directly, not just by hiding the button in
-- the UI.
--
-- After running this migration, promote your own account with:
--   update public.profiles set is_owner = true where email = 'you@yourdomain.com';

alter table public.profiles
  add column is_owner boolean not null default false;

create function public.is_owner()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'staff' and is_owner = true
  );
$$;

grant execute on function public.is_owner() to authenticated;

-- ============================================================
-- LEADS — split the old "for all" staff policy so DELETE no longer falls
-- under the broad staff grant; only the owner can delete a lead.
-- ============================================================
drop policy "staff manage leads" on public.leads;

create policy "staff read leads" on public.leads
  for select to authenticated using (public.is_staff());
create policy "staff insert leads" on public.leads
  for insert to authenticated with check (public.is_staff());
create policy "staff update leads" on public.leads
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "owner delete leads" on public.leads
  for delete to authenticated using (public.is_owner());

-- ============================================================
-- PROJECTS — same split. DELETE additionally requires the project to
-- still be at quote stage — Signed/In Construction/Completed projects can
-- never be deleted, by the owner or anyone else, even via a direct API
-- call.
-- ============================================================
drop policy "staff manage projects" on public.projects;

create policy "staff read projects" on public.projects
  for select to authenticated using (public.is_staff());
create policy "staff insert projects" on public.projects
  for insert to authenticated with check (public.is_staff());
create policy "staff update projects" on public.projects
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "owner delete quote projects" on public.projects
  for delete to authenticated using (
    public.is_owner() and status not in ('Signed', 'In Construction', 'Completed')
  );
