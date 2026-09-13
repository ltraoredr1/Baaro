-- 030_profile_handle_unique.sql
-- Unicité des identifiants (handle) + protection conflits

drop index if exists public.profiles_handle_unique;
create unique index profiles_handle_unique
  on public.profiles (lower(handle))
  where handle is not null
    and length(trim(handle)) > 0;

comment on index public.profiles_handle_unique is
  'BAARO: un seul profil par handle (case-insensitive)';

-- Optionnel — décommente pour reset les placeholders :
-- update public.profiles
--   set handle = null, updated_at = now()
-- where lower(handle) in ('@membre', '@member', '@user', 'membre', 'member', 'user');
