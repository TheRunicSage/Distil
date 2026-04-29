-- ===== Storage buckets =====
-- Two private buckets per app_handoff_v8.md §6.3.
-- master-cvs: persists until user replaces or deletes account (no expiry).
-- generated: 60-day file expiry handled by the expire-files cron.

insert into storage.buckets (id, name, public)
values ('master-cvs', 'master-cvs', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('generated', 'generated', false)
on conflict (id) do nothing;

-- ===== RLS policies =====
-- Per spec §6.3: storage.foldername(name)[1] = auth.uid()::text gates access by user folder.
-- The first path segment is the user's UUID for both buckets.

-- master-cvs: owners can read/write their own folder.
drop policy if exists "master_cvs_owner_select" on storage.objects;
create policy "master_cvs_owner_select" on storage.objects
  for select using (
    bucket_id = 'master-cvs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "master_cvs_owner_insert" on storage.objects;
create policy "master_cvs_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'master-cvs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "master_cvs_owner_update" on storage.objects;
create policy "master_cvs_owner_update" on storage.objects
  for update using (
    bucket_id = 'master-cvs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "master_cvs_owner_delete" on storage.objects;
create policy "master_cvs_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'master-cvs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- generated: owners can read their own folder. Writes happen via service-role (Inngest),
-- which bypasses RLS, so no insert/update/delete policy is needed for the user.
drop policy if exists "generated_owner_select" on storage.objects;
create policy "generated_owner_select" on storage.objects
  for select using (
    bucket_id = 'generated'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
