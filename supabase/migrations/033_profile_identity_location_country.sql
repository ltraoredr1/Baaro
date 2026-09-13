-- 033_profile_identity_location_country.sql
-- BAARO — identité de profil, âge, localisation et pays d'inscription.
-- Aucun nouvel endpoint API. Les règles sensibles sont imposées par PostgreSQL/RLS.

alter table public.profiles
  add column if not exists first_name text not null default '',
  add column if not exists last_name text not null default '',
  add column if not exists birth_date date,
  add column if not exists location text,
  add column if not exists registered_country text,
  add column if not exists country_changed_at timestamptz,
  add column if not exists country_change_available_at timestamptz,
  add column if not exists country text;

-- Normalisation + règles métier côté serveur.
create or replace function public.guard_profile_identity_and_country()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registered text;
  v_previous text;
  v_next text;
  v_flag text;
begin
  -- Nettoyage et limites de taille.
  new.first_name := left(trim(coalesce(new.first_name, '')), 60);
  new.last_name := left(trim(coalesce(new.last_name, '')), 60);
  new.location := left(trim(coalesce(new.location, '')), 120);
  new.display_name := left(trim(coalesce(new.display_name, '')), 120);
  new.bio := left(trim(coalesce(new.bio, '')), 500);

  v_previous := upper(nullif(trim(coalesce(old.country, '')), ''));
  v_next := upper(nullif(trim(coalesce(new.country, '')), ''));
  v_registered := upper(nullif(trim(coalesce(old.registered_country, '')), ''));

  if new.birth_date is not null then
    if new.birth_date < date '1900-01-01' or new.birth_date > (current_date - interval '13 years')::date then
      raise exception 'Date de naissance invalide: âge minimum de 13 ans';
    end if;
  end if;

  -- Le pays d'inscription est immuable après sa première définition.
  if tg_op = 'INSERT' then
    if v_next is not null then
      new.country := v_next;
      new.registered_country := v_next;
      new.country_changed_at := null;
      new.country_change_available_at := null;
    else
      new.country := null;
      new.registered_country := null;
    end if;
  else
    if v_registered is not null then
      new.registered_country := v_registered;
    elsif v_next is not null then
      new.registered_country := v_next;
    else
      new.registered_country := null;
    end if;

    if v_previous is distinct from v_next then
      -- Première définition du pays : pas de délai.
      if v_previous is null then
        new.country_changed_at := null;
        new.country_change_available_at := null;
      else
        -- Tout changement ultérieur est bloqué pendant 4 mois.
        if old.country_change_available_at is not null
           and old.country_change_available_at > now() then
          raise exception 'Changement de pays disponible le %', old.country_change_available_at;
        end if;
        new.country_changed_at := now();
        new.country_change_available_at := now() + interval '4 months';
      end if;
    else
      new.country_changed_at := old.country_changed_at;
      new.country_change_available_at := old.country_change_available_at;
    end if;
  end if;

  -- Le drapeau est dérivé du pays et ne peut pas être arbitrairement modifié.
  v_next := upper(nullif(trim(coalesce(new.country, '')), ''));
  v_flag := case v_next
    when 'ML' then '🇲🇱'
    when 'SN' then '🇸🇳'
    when 'CI' then '🇨🇮'
    when 'BF' then '🇧🇫'
    when 'GN' then '🇬🇳'
    when 'NE' then '🇳🇪'
    when 'TG' then '🇹🇬'
    when 'BJ' then '🇧🇯'
    when 'CM' then '🇨🇲'
    when 'NG' then '🇳🇬'
    when 'GH' then '🇬🇭'
    when 'MA' then '🇲🇦'
    else '🌍'
  end;
  new.flag := v_flag;

  return new;
end;
$$;

drop trigger if exists profiles_identity_country_guard on public.profiles;
create trigger profiles_identity_country_guard
before insert or update of first_name, last_name, birth_date, location, country, registered_country, flag, display_name, bio
on public.profiles
for each row execute function public.guard_profile_identity_and_country();

-- Remet les anciennes lignes en état cohérent sans modifier le pays d'inscription
-- lorsqu'il existe déjà.
update public.profiles
set
  first_name = left(trim(coalesce(first_name, '')), 60),
  last_name = left(trim(coalesce(last_name, '')), 60),
  location = left(trim(coalesce(location, '')), 120),
  registered_country = upper(nullif(trim(coalesce(registered_country, country)), '')),
  country = upper(nullif(trim(coalesce(country, registered_country)), '')),
  flag = case upper(nullif(trim(coalesce(country, '')), ''))
    when 'ML' then '🇲🇱'
    when 'SN' then '🇸🇳'
    when 'CI' then '🇨🇮'
    when 'BF' then '🇧🇫'
    when 'GN' then '🇬🇳'
    when 'NE' then '🇳🇪'
    when 'TG' then '🇹🇬'
    when 'BJ' then '🇧🇯'
    when 'CM' then '🇨🇲'
    when 'NG' then '🇳🇬'
    when 'GH' then '🇬🇭'
    when 'MA' then '🇲🇦'
    else '🌍'
  end
where true;

create index if not exists idx_profiles_country on public.profiles(country);
create index if not exists idx_profiles_registered_country on public.profiles(registered_country);
create index if not exists idx_profiles_country_change_available on public.profiles(country_change_available_at);

comment on column public.profiles.user_id is 'Identifiant utilisateur stable: UUID Supabase Auth, distinct du handle public.';
comment on column public.profiles.first_name is 'Prénom du profil.';
comment on column public.profiles.last_name is 'Nom de famille du profil.';
comment on column public.profiles.birth_date is 'Date de naissance; l''âge affiché est calculé à partir de cette date.';
comment on column public.profiles.location is 'Localisation déclarée par l''utilisateur.';
comment on column public.profiles.registered_country is 'Pays d''inscription initial, immuable.';
comment on column public.profiles.country is 'Pays actuel du profil; changement limité à une fois tous les 4 mois.';
comment on column public.profiles.country_change_available_at is 'Prochaine date à laquelle un changement de pays est autorisé.';
