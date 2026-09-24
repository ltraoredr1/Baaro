-- ============================================================
-- BAARO — COMMUNAUTÉ v4 : sécurité + modération (idempotent)
-- À exécuter dans Supabase > SQL Editor. Remplace les policies
-- de groups, group_members, channels, channel_messages, group_invites.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Visibilité : is_public = source de vérité (is_private suit)
-- ------------------------------------------------------------
alter table public.groups add column if not exists is_public boolean default true;
alter table public.groups add column if not exists is_private boolean default false;
alter table public.groups add column if not exists category text default 'community';

-- Un groupe est privé si l'un des deux drapeaux le dit (choix prudent)
update public.groups
set is_public = coalesce(is_public, true) and not coalesce(is_private, false);
update public.groups set is_private = not is_public;

create or replace function public.groups_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.is_public := coalesce(new.is_public, true) and not coalesce(new.is_private, false);
  else
    if new.owner_id is distinct from old.owner_id and auth.uid() is not null then
      raise exception 'Changement de propriétaire interdit';
    end if;
    if new.is_public is not distinct from old.is_public
       and new.is_private is distinct from old.is_private then
      new.is_public := not new.is_private;
    end if;
  end if;
  new.is_private := not coalesce(new.is_public, true);
  return new;
end $$;

drop trigger if exists trg_groups_guard on public.groups;
create trigger trg_groups_guard
before insert or update on public.groups
for each row execute function public.groups_guard();

-- ------------------------------------------------------------
-- 1. Nouvelles tables : bannissements + signalements
-- ------------------------------------------------------------
create table if not exists public.group_bans (
  group_id uuid references public.groups(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  banned_by uuid references auth.users(id),
  reason text,
  created_at timestamptz default now(),
  primary key (group_id, user_id)
);

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete cascade,
  message_id uuid references public.channel_messages(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete cascade not null,
  reason text,
  status text not null default 'open',
  created_at timestamptz default now(),
  unique (message_id, reporter_id)
);

-- ------------------------------------------------------------
-- 2. Fonctions d'aide (SECURITY DEFINER = pas de récursion RLS)
-- ------------------------------------------------------------
create or replace function public.group_role(p_group uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when g.owner_id = auth.uid() then 'owner' else gm.role end
  from public.groups g
  left join public.group_members gm
    on gm.group_id = g.id and gm.user_id = auth.uid()
  where g.id = p_group;
$$;

create or replace function public.role_rank(p_role text)
returns int language sql immutable as $$
  select case p_role
    when 'owner' then 3 when 'admin' then 2
    when 'moderator' then 1 when 'member' then 0 else -1 end;
$$;

create or replace function public.can_see_group(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.groups g
    where g.id = p_group and coalesce(g.is_public, true)
  ) or public.group_role(p_group) is not null;
$$;

create or replace function public.channel_group(p_channel uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select group_id from public.channels where id = p_channel;
$$;

create or replace function public.is_banned(p_group uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_bans
    where group_id = p_group and user_id = p_user
  );
$$;

-- ------------------------------------------------------------
-- 3. Contraintes, index, anti-spam
-- ------------------------------------------------------------
alter table public.channel_messages
  drop constraint if exists channel_messages_text_len;
alter table public.channel_messages
  add constraint channel_messages_text_len
  check (char_length(text) between 1 and 2000) not valid;

create index if not exists idx_msgs_channel_created
  on public.channel_messages (channel_id, created_at desc);
create index if not exists idx_msgs_sender_created
  on public.channel_messages (sender_id, created_at desc);

do $$ begin
  create unique index if not exists uq_channels_group_name
    on public.channels (group_id, name);
exception when unique_violation then
  raise notice 'Doublons de canaux : nettoie puis relance';
end $$;

create or replace function public.messages_rate_limit()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.channel_messages
      where sender_id = new.sender_id
        and created_at > now() - interval '10 seconds') >= 10 then
    raise exception 'Trop de messages, ralentis';
  end if;
  return new;
end $$;

drop trigger if exists trg_messages_rate on public.channel_messages;
create trigger trg_messages_rate
before insert on public.channel_messages
for each row execute function public.messages_rate_limit();

-- ------------------------------------------------------------
-- 4. RLS : on repart de zéro sur ces tables
-- ------------------------------------------------------------
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.channels enable row level security;
alter table public.channel_messages enable row level security;
alter table public.group_invites enable row level security;
alter table public.group_bans enable row level security;
alter table public.community_reports enable row level security;
-- Journal de récompenses : aucune policy = accessible seulement via service_role
create table if not exists public.community_rewards_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  action text not null,
  reference_id text not null,
  points int not null,
  created_at timestamptz default now(),
  unique (user_id, action, reference_id)
);
alter table public.community_rewards_log enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('groups','group_members','channels','channel_messages',
                        'group_invites','group_bans','community_reports')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- GROUPES
create policy groups_select on public.groups for select to authenticated
  using (public.can_see_group(id));
create policy groups_insert on public.groups for insert to authenticated
  with check (owner_id = auth.uid());
create policy groups_update on public.groups for update to authenticated
  using (public.group_role(id) in ('owner','admin'))
  with check (public.group_role(id) in ('owner','admin'));
create policy groups_delete on public.groups for delete to authenticated
  using (owner_id = auth.uid());

-- MEMBRES : auto-inscription = groupe public, rôle 'member', non banni.
-- Tout le reste (owner, rôles, ban, invitations) passe par les fonctions RPC.
create policy members_select on public.group_members for select to authenticated
  using (public.can_see_group(group_id));
create policy members_join on public.group_members for insert to authenticated
  with check (
    user_id = auth.uid()
    and role = 'member'
    and not public.is_banned(group_id, user_id)
    and exists (
      select 1 from public.groups g
      where g.id = group_id and coalesce(g.is_public, true)
    )
  );
create policy members_leave on public.group_members for delete to authenticated
  using (user_id = auth.uid() and role is distinct from 'owner');

-- CANAUX
create policy channels_select on public.channels for select to authenticated
  using (public.can_see_group(group_id));
create policy channels_insert on public.channels for insert to authenticated
  with check (public.group_role(group_id) in ('owner','admin'));
create policy channels_update on public.channels for update to authenticated
  using (public.group_role(group_id) in ('owner','admin'))
  with check (public.group_role(group_id) in ('owner','admin'));
create policy channels_delete on public.channels for delete to authenticated
  using (public.group_role(group_id) in ('owner','admin'));

-- MESSAGES
create policy messages_select on public.channel_messages for select to authenticated
  using (public.group_role(public.channel_group(channel_id)) is not null);
create policy messages_insert on public.channel_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.group_role(public.channel_group(channel_id)) is not null
  );
create policy messages_update on public.channel_messages for update to authenticated
  using (sender_id = auth.uid())
  with check (
    sender_id = auth.uid()
    and public.group_role(public.channel_group(channel_id)) is not null
  );
create policy messages_delete on public.channel_messages for delete to authenticated
  using (
    sender_id = auth.uid()
    or public.group_role(public.channel_group(channel_id))
       in ('owner','admin','moderator')
  );

-- INVITATIONS : gérées par owner/admin ; l'utilisation passe par la RPC
create policy invites_select on public.group_invites for select to authenticated
  using (public.group_role(group_id) in ('owner','admin'));
create policy invites_insert on public.group_invites for insert to authenticated
  with check (created_by = auth.uid()
              and public.group_role(group_id) in ('owner','admin'));
create policy invites_delete on public.group_invites for delete to authenticated
  using (public.group_role(group_id) in ('owner','admin'));

-- BANS et SIGNALEMENTS : visibles par l'équipe de modération
create policy bans_select on public.group_bans for select to authenticated
  using (public.group_role(group_id) in ('owner','admin','moderator'));
create policy reports_select on public.community_reports for select to authenticated
  using (public.group_role(group_id) in ('owner','admin','moderator'));
create policy reports_update on public.community_reports for update to authenticated
  using (public.group_role(group_id) in ('owner','admin','moderator'))
  with check (public.group_role(group_id) in ('owner','admin','moderator'));

-- ------------------------------------------------------------
-- 5. RPC
-- ------------------------------------------------------------
create or replace function public.create_community_group(
  p_name text,
  p_description text default null,
  p_is_public boolean default true,
  p_category text default 'community'
)
returns public.groups
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_group public.groups;
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;
  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'Nom du groupe trop court';
  end if;

  insert into public.groups (name, description, owner_id, is_public, category)
  values (
    left(trim(p_name), 80),
    nullif(left(trim(coalesce(p_description, '')), 500), ''),
    v_uid,
    coalesce(p_is_public, true),
    coalesce(nullif(trim(p_category), ''), 'community')
  )
  returning * into v_group;

  insert into public.group_members (group_id, user_id, role)
  values (v_group.id, v_uid, 'owner')
  on conflict (group_id, user_id) do update set role = 'owner';

  insert into public.channels (group_id, name, type, description)
  values (v_group.id, 'general', 'text', 'Canal principal');

  return v_group;
end $$;

create or replace function public.create_community_channel(
  p_group_id uuid,
  p_name text,
  p_type text default 'text',
  p_description text default null
)
returns public.channels
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_channel public.channels;
begin
  if auth.uid() is null then raise exception 'Non authentifié'; end if;
  if coalesce(public.group_role(p_group_id), '') not in ('owner','admin') then
    raise exception 'Droits insuffisants';
  end if;

  -- Espaces -> tirets ; on retire la ponctuation, on garde lettres/chiffres (arabe inclus)
  v_name := lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', '-', 'g'));
  v_name := regexp_replace(v_name, '[<>"''`&/\\?#%@:;,.!$^*()+=\[\]{}|~]', '', 'g');
  v_name := left(v_name, 40);
  if length(v_name) < 1 then raise exception 'Nom de canal invalide'; end if;

  insert into public.channels (group_id, name, type, description)
  values (
    p_group_id, v_name,
    case when p_type = 'voice' then 'voice' else 'text' end,
    nullif(left(trim(coalesce(p_description, '')), 200), '')
  )
  returning * into v_channel;

  return v_channel;
end $$;

create or replace function public.join_community_group(
  p_group uuid,
  p_code text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_public boolean;
  v_inv public.group_invites;
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;
  if public.is_banned(p_group, v_uid) then raise exception 'Accès refusé'; end if;
  if public.group_role(p_group) is not null then return; end if;

  select coalesce(is_public, true) into v_public
  from public.groups where id = p_group;
  if not found then raise exception 'Groupe introuvable'; end if;

  if not v_public then
    select * into v_inv from public.group_invites
    where group_id = p_group
      and upper(code) = upper(trim(coalesce(p_code, '')))
      and (expires_at is null or expires_at > now())
      and (coalesce(max_uses, 0) = 0 or coalesce(uses, 0) < max_uses)
    for update;
    if not found then raise exception 'Invitation invalide ou expirée'; end if;
    update public.group_invites set uses = coalesce(uses, 0) + 1 where id = v_inv.id;
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (p_group, v_uid, 'member')
  on conflict do nothing;
end $$;

create or replace function public.ban_community_member(
  p_group uuid,
  p_user uuid,
  p_reason text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor text := public.group_role(p_group);
  v_target text;
begin
  if auth.uid() is null then raise exception 'Non authentifié'; end if;
  if p_user = auth.uid() then raise exception 'Action impossible sur soi-même'; end if;

  select case when g.owner_id = p_user then 'owner' else gm.role end
  into v_target
  from public.groups g
  left join public.group_members gm
    on gm.group_id = g.id and gm.user_id = p_user
  where g.id = p_group;

  if public.role_rank(v_actor) < 1
     or public.role_rank(v_actor) <= public.role_rank(v_target) then
    raise exception 'Droits insuffisants';
  end if;

  insert into public.group_bans (group_id, user_id, banned_by, reason)
  values (p_group, p_user, auth.uid(), left(p_reason, 300))
  on conflict do nothing;

  delete from public.group_members
  where group_id = p_group and user_id = p_user;
end $$;

create or replace function public.unban_community_member(
  p_group uuid,
  p_user uuid
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.role_rank(public.group_role(p_group)) < 1 then
    raise exception 'Droits insuffisants';
  end if;
  delete from public.group_bans where group_id = p_group and user_id = p_user;
end $$;

create or replace function public.set_member_role(
  p_group uuid,
  p_user uuid,
  p_role text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor text := public.group_role(p_group);
  v_target text;
begin
  if coalesce(p_role, '') not in ('admin','moderator','member') then
    raise exception 'Rôle invalide';
  end if;

  select role into v_target from public.group_members
  where group_id = p_group and user_id = p_user;
  if v_target is null then raise exception 'Membre introuvable'; end if;
  if v_target = 'owner' then raise exception 'Le propriétaire ne peut pas changer'; end if;

  if v_actor = 'owner' then
    null;
  elsif v_actor = 'admin' and p_role <> 'admin' and v_target <> 'admin' then
    null;
  else
    raise exception 'Droits insuffisants';
  end if;

  update public.group_members set role = p_role
  where group_id = p_group and user_id = p_user;
end $$;

create or replace function public.report_community_message(
  p_message uuid,
  p_reason text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_group uuid;
begin
  select c.group_id into v_group
  from public.channel_messages m
  join public.channels c on c.id = m.channel_id
  where m.id = p_message;

  if v_group is null or public.group_role(v_group) is null then
    raise exception 'Message introuvable';
  end if;

  insert into public.community_reports (group_id, message_id, reporter_id, reason)
  values (v_group, p_message, auth.uid(), left(coalesce(p_reason, ''), 300))
  on conflict (message_id, reporter_id) do nothing;
end $$;

-- ------------------------------------------------------------
-- 6. Droits d'exécution : utilisateurs connectés uniquement
-- ------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'group_role','can_see_group','channel_group','is_banned',
        'create_community_group','create_community_channel',
        'join_community_group','ban_community_member',
        'unban_community_member','set_member_role','report_community_message'
      )
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
