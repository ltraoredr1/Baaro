-- 029_profile_contacts_links_socials.sql
-- BAARO: jusqu'à 3 téléphones + 3 e-mails par profil,
-- liens personnels/site web et réseaux sociaux.
-- Aucun secret ni mot de passe n'est stocké ici.

create table if not exists public.profile_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  contact_type text not null check (contact_type in ('phone','email')),
  value text not null,
  label text not null default '',
  position smallint not null check (position between 1 and 3),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, contact_type, position)
);

create unique index if not exists profile_contacts_one_primary
  on public.profile_contacts(user_id, contact_type)
  where is_primary = true;

create table if not exists public.profile_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  link_type text not null check (link_type in ('website','link')),
  label text not null default '',
  url text not null,
  position smallint not null default 1 check (position between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_social_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  platform text not null check (
    platform in (
      'facebook','youtube','tiktok','bigo','instagram','x',
      'linkedin','whatsapp','telegram','snapchat','other'
    )
  ),
  username text not null default '',
  url text not null,
  position smallint not null default 1 check (position between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform)
);

create index if not exists profile_contacts_user_idx on public.profile_contacts(user_id);
create index if not exists profile_links_user_idx on public.profile_links(user_id);
create index if not exists profile_social_links_user_idx on public.profile_social_links(user_id);

alter table public.profile_contacts enable row level security;
alter table public.profile_links enable row level security;
alter table public.profile_social_links enable row level security;

drop policy if exists profile_contacts_public_read on public.profile_contacts;
create policy profile_contacts_public_read on public.profile_contacts
  for select using (true);

drop policy if exists profile_contacts_owner_write on public.profile_contacts;
create policy profile_contacts_owner_write on public.profile_contacts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists profile_links_public_read on public.profile_links;
create policy profile_links_public_read on public.profile_links
  for select using (true);

drop policy if exists profile_links_owner_write on public.profile_links;
create policy profile_links_owner_write on public.profile_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists profile_social_public_read on public.profile_social_links;
create policy profile_social_public_read on public.profile_social_links
  for select using (true);

drop policy if exists profile_social_owner_write on public.profile_social_links;
create policy profile_social_owner_write on public.profile_social_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Limite stricte de 3 numéros et 3 e-mails par profil.
create or replace function public.enforce_profile_contact_limit()
returns trigger
language plpgsql
as $$
declare
  total integer;
begin
  select count(*) into total
  from public.profile_contacts
  where user_id = new.user_id
    and contact_type = new.contact_type
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if total >= 3 then
    raise exception 'Maximum de 3 contacts de ce type par profil';
  end if;

  return new;
end;
$$;

drop trigger if exists profile_contacts_limit on public.profile_contacts;
create trigger profile_contacts_limit
before insert or update of user_id, contact_type
on public.profile_contacts
for each row execute function public.enforce_profile_contact_limit();

-- Un seul primaire par type, géré par l'index partiel ci-dessus.
