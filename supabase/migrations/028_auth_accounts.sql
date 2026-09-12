-- BAARO: profils persistants pour tous les modes d'inscription.
-- Couvre email, téléphone OTP et OAuth (Facebook/X/Google/etc.).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base_name text;
  base_handle text;
begin
  base_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    nullif(new.phone, ''),
    'Membre BAARO'
  );

  base_handle := coalesce(
    nullif(new.raw_user_meta_data ->> 'handle', ''),
    '@user_' || substr(replace(new.id::text, '-', ''), 1, 8)
  );

  insert into public.profiles (user_id, display_name, handle, flag)
  values (new.id, left(base_name, 80), left(base_handle, 40), '🌍')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Répare également les utilisateurs déjà créés avant cette migration.
insert into public.profiles (user_id, display_name, handle, flag)
select
  u.id,
  left(coalesce(
    nullif(u.raw_user_meta_data ->> 'display_name', ''),
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    nullif(u.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    nullif(u.phone, ''),
    'Membre BAARO'
  ), 80),
  left('@user_' || substr(replace(u.id::text, '-', ''), 1, 8), 40),
  '🌍'
from auth.users u
left join public.profiles p on p.user_id = u.id
where p.user_id is null;
