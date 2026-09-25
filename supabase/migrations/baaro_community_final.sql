-- ============================================================
-- BAARO COMMUNAUTE — FINAL (invites + canaux style Telegram)
-- Pre-requis: script communaute v4 deja applique
-- (group_role, is_banned, tables groups/channels/group_members)
-- ============================================================

alter table public.channels drop constraint if exists channels_type_check;

alter table public.channels
  add constraint channels_type_check
  check (type in ('text', 'voice', 'announce'));

create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  code text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  max_uses int default 0,
  uses int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (group_id, code)
);

create index if not exists idx_group_invites_code
  on public.group_invites (upper(code));

alter table public.group_invites enable row level security;

drop policy if exists invites_select on public.group_invites;
create policy invites_select on public.group_invites
  for select to authenticated
  using (public.group_role(group_id) in ('owner', 'admin'));

drop policy if exists invites_insert on public.group_invites;
create policy invites_insert on public.group_invites
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.group_role(group_id) in ('owner', 'admin')
  );

drop policy if exists invites_delete on public.group_invites;
create policy invites_delete on public.group_invites
  for delete to authenticated
  using (public.group_role(group_id) in ('owner', 'admin'));

create or replace function public.can_post_in_channel(p_channel uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.channels c
    where c.id = p_channel
      and public.group_role(c.group_id) is not null
      and not public.is_banned(c.group_id, auth.uid())
      and (
        c.type in ('text', 'voice')
        or public.group_role(c.group_id) in ('owner', 'admin', 'moderator')
      )
  );
$$;

drop policy if exists messages_insert on public.channel_messages;
create policy messages_insert on public.channel_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_post_in_channel(channel_id)
  );

create or replace function public.create_community_channel(
  p_group_id uuid,
  p_name text,
  p_type text default 'text',
  p_description text default null
)
returns public.channels
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_type text;
  v_channel public.channels;
  v_role text := public.group_role(p_group_id);
begin
  if auth.uid() is null then
    raise exception 'Non authentifie';
  end if;

  if coalesce(v_role, '') not in ('owner', 'admin') then
    raise exception 'Seuls les admins peuvent creer un canal';
  end if;

  v_type := case
    when p_type in ('voice', 'announce') then p_type
    else 'text'
  end;

  v_name := lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', '-', 'g'));
  v_name := regexp_replace(
    v_name,
    '[<>"''`&/\\?#%@:;,.!$^*()+=\[\]{}|~]',
    '',
    'g'
  );
  v_name := left(v_name, 40);

  if length(v_name) < 1 then
    raise exception 'Nom de canal invalide';
  end if;

  insert into public.channels (group_id, name, type, description)
  values (
    p_group_id,
    v_name,
    v_type,
    nullif(left(trim(coalesce(p_description, '')), 200), '')
  )
  returning * into v_channel;

  return v_channel;
end;
$$;

create or replace function public.create_group_invite(
  p_group uuid,
  p_max_uses int default 0,
  p_expires_hours int default null
)
returns public.group_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_row public.group_invites;
begin
  if v_uid is null then
    raise exception 'Non authentifie';
  end if;

  if public.group_role(p_group) not in ('owner', 'admin') then
    raise exception 'Seuls les admins peuvent creer une invitation';
  end if;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.group_invites (
    group_id, code, created_by, max_uses, expires_at
  )
  values (
    p_group,
    v_code,
    v_uid,
    greatest(coalesce(p_max_uses, 0), 0),
    case
      when p_expires_hours is null or p_expires_hours <= 0 then null
      else now() + (p_expires_hours || ' hours')::interval
    end
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.list_group_invites(p_group uuid)
returns setof public.group_invites
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.group_role(p_group) not in ('owner', 'admin') then
    raise exception 'Droits insuffisants';
  end if;

  return query
  select *
  from public.group_invites
  where group_id = p_group
  order by created_at desc;
end;
$$;

create or replace function public.revoke_group_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group uuid;
begin
  select group_id into v_group
  from public.group_invites
  where id = p_invite_id;

  if v_group is null then
    raise exception 'Invitation introuvable';
  end if;

  if public.group_role(v_group) not in ('owner', 'admin') then
    raise exception 'Droits insuffisants';
  end if;

  delete from public.group_invites where id = p_invite_id;
end;
$$;

create or replace function public.peek_group_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.group_invites;
  v_g public.groups;
  v_count int;
begin
  select * into v_inv
  from public.group_invites
  where upper(code) = upper(trim(p_code))
    and (expires_at is null or expires_at > now())
    and (coalesce(max_uses, 0) = 0 or coalesce(uses, 0) < max_uses);

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into v_g from public.groups where id = v_inv.group_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'group_gone');
  end if;

  select count(*)::int into v_count
  from public.group_members
  where group_id = v_g.id;

  return jsonb_build_object(
    'ok', true,
    'group_id', v_g.id,
    'name', v_g.name,
    'description', v_g.description,
    'is_public', coalesce(v_g.is_public, true),
    'member_count', v_count,
    'code', v_inv.code
  );
end;
$$;

-- Ancienne version (v4) retournait void — DROP obligatoire avant changement de type
drop function if exists public.join_community_group(uuid, text);
drop function if exists public.join_community_group(uuid);

create or replace function public.join_community_group(
  p_group uuid default null,
  p_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_group_id uuid;
  v_public boolean;
  v_inv public.group_invites;
begin
  if v_uid is null then
    raise exception 'Non authentifie';
  end if;

  -- Mode 1: code d'invitation
  if p_code is not null and length(trim(p_code)) > 0 then
    select * into v_inv
    from public.group_invites
    where upper(code) = upper(trim(p_code))
      and (expires_at is null or expires_at > now())
      and (coalesce(max_uses, 0) = 0 or coalesce(uses, 0) < max_uses)
    for update;

    if not found then
      raise exception 'Invitation invalide ou expiree';
    end if;

    v_group_id := v_inv.group_id;

    if public.is_banned(v_group_id, v_uid) then
      raise exception 'Acces refuse';
    end if;

    if public.group_role(v_group_id) is not null then
      return jsonb_build_object(
        'ok', true,
        'group_id', v_group_id,
        'already_member', true
      );
    end if;

    update public.group_invites
    set uses = coalesce(uses, 0) + 1
    where id = v_inv.id;

    insert into public.group_members (group_id, user_id, role)
    values (v_group_id, v_uid, 'member')
    on conflict do nothing;

    return jsonb_build_object(
      'ok', true,
      'group_id', v_group_id,
      'via', 'invite'
    );
  end if;

  -- Mode 2: groupe public
  if p_group is null then
    raise exception 'Groupe ou code requis';
  end if;

  v_group_id := p_group;

  if public.is_banned(v_group_id, v_uid) then
    raise exception 'Acces refuse';
  end if;

  if public.group_role(v_group_id) is not null then
    return jsonb_build_object(
      'ok', true,
      'group_id', v_group_id,
      'already_member', true
    );
  end if;

  select coalesce(is_public, true) into v_public
  from public.groups
  where id = v_group_id;

  if not found then
    raise exception 'Groupe introuvable';
  end if;

  if not v_public then
    raise exception 'Groupe prive : code d''invitation requis';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_group_id, v_uid, 'member')
  on conflict do nothing;

  return jsonb_build_object(
    'ok', true,
    'group_id', v_group_id,
    'via', 'public'
  );
end;
$$;

grant execute on function public.can_post_in_channel(uuid) to authenticated;
grant execute on function public.create_community_channel(uuid, text, text, text) to authenticated;
grant execute on function public.create_group_invite(uuid, int, int) to authenticated;
grant execute on function public.list_group_invites(uuid) to authenticated;
grant execute on function public.revoke_group_invite(uuid) to authenticated;
grant execute on function public.peek_group_invite(text) to authenticated;
grant execute on function public.join_community_group(uuid, text) to authenticated;
