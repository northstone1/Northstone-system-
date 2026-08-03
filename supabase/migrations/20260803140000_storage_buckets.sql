-- Storage buckets referenced by src/lib/data/storage.js.
--
--  * project-photos — private. Survey photos, site-update photos, and
--    design visuals. Paths are structured "<project_id>/<area>/<uuid>.jpg"
--    (see uploadPhoto() call sites in NorthstoneSystem.jsx), which lets the
--    RLS policies below key off the leading project id segment.
--  * portfolio-photos — public read. The proposal "design inspiration"
--    gallery. Public buckets serve objects via a public URL that bypasses
--    RLS entirely, so the read policy here is only relevant to
--    authenticated API access, not the public URL path — kept anyway for
--    defense in depth.

insert into storage.buckets (id, name, public)
values
  ('project-photos', 'project-photos', false),
  ('portfolio-photos', 'portfolio-photos', true)
on conflict (id) do nothing;

create policy "staff manage project-photos" on storage.objects
  for all to authenticated
  using (bucket_id = 'project-photos' and public.is_staff())
  with check (bucket_id = 'project-photos' and public.is_staff());

create policy "clients read own project-photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'project-photos'
    and public.owns_project((split_part(name, '/', 1))::uuid)
  );

create policy "staff manage portfolio-photos" on storage.objects
  for all to authenticated
  using (bucket_id = 'portfolio-photos' and public.is_staff())
  with check (bucket_id = 'portfolio-photos' and public.is_staff());

create policy "everyone reads portfolio-photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'portfolio-photos');
