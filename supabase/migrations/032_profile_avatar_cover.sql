-- 032_profile_avatar_cover.sql
-- Photo de profil + bannière de couverture

alter table public.profiles
  add column if not exists avatar_url text;

alter table public.profiles
  add column if not exists cover_url text;

-- Bucket dédié (public read, write owner only)
insert into storage.buckets (id, name, public)
values ('profile-media', 'profile-media', true)
on conflict (id) do update set public = excluded.public;

-- Lecture publique
drop policy if exists "profile_media_public_read" on storage.objects;
create policy "profile_media_public_read"
  on storage.objects for select
  using (bucket_id = 'profile-media');

-- Écriture : dossier = auth.uid()
drop policy if exists "profile_media_owner_insert" on storage.objects;
create policy "profile_media_owner_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile_media_owner_update" on storage.objects;
create policy "profile_media_owner_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile_media_owner_delete" on storage.objects;
create policy "profile_media_owner_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
