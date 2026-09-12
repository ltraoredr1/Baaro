-- BAARO — comptes utilisateurs stables et profils persistants
-- À appliquer après 027. Aucun nouvel endpoint API.

alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles
  add column if not exists last_seen_at timestamptz;

alter table public.profiles
  add column if not exists phone text;

-- Création automatique du profil lors de la création d'un compte Supabase.
-- Cela évite les comptes authentifiés sans ligne profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_handle text;
  v_flag text;
  v_email_prefix text;
begin
  v_email_prefix := split_part(coalesce(new.email, 'membre'), '@', 1);
  v_name := nullif(left(coalesce(new.raw_user_meta_data->>'display_name', v_email_prefix, 'Membre BAARO'), 60), '');
  v_handle := nullif(left(coalesce(new.raw_user_meta_data->>'handle', '@user_' || left(new.id::text, 8)), 31), '');
  if left(v_handle, 1) <> '@' then v_handle := '@' || v_handle; end if;
  v_flag := coalesce(nullif(new.raw_user_meta_data->>'flag', ''), '🌍');

  insert into public.profiles (user_id, display_name, handle, flag, bio, updated_at)
  values (new.id, v_name, v_handle, v_flag, coalesce(new.raw_user_meta_data->>'bio', ''), now())
  on conflict (user_id) do update set
    display_name = coalesce(nullif(excluded.display_name, ''), public.profiles.display_name),
    handle = coalesce(nullif(excluded.handle, ''), public.profiles.handle),
    flag = coalesce(nullif(excluded.flag, ''), public.profiles.flag),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mise à jour fiable de la date de modification du profil.
create or replace function public.touch_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_profile_updated_at();

create index if not exists idx_profiles_updated_at on public.profiles(updated_at desc);
create index if not exists idx_profiles_last_seen_at on public.profiles(last_seen_at desc);

-- Persistance d'un compte invité: les sessions sont conservées côté client
-- par Supabase. La conversion en compte permanent continue d'utiliser
-- supabase.auth.updateUser({email,password}) depuis Settings.
