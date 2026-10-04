-- BAARO Next-Gen Messaging
-- Realtime state, reactions, receipts, edits, pins, stars, disappearing messages,
-- device/session metadata and abuse controls. Message body remains client-side E2E.

alter table public.messages add column if not exists client_message_id text;
alter table public.messages add column if not exists reply_to_id uuid references public.messages(id) on delete set null;
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists expires_at timestamptz;
alter table public.messages add column if not exists delivered_at timestamptz;
alter table public.messages add column if not exists read_at timestamptz;
alter table public.messages add column if not exists metadata jsonb not null default '{}'::jsonb;
create unique index if not exists idx_messages_client_id on public.messages(sender_id, client_message_id) where client_message_id is not null;
create index if not exists idx_messages_reply on public.messages(reply_to_id);
create index if not exists idx_messages_expiry on public.messages(expires_at) where expires_at is not null;

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('❤️','😂','😮','😢','😡','👍','👎','🔥','🙏','🎉')),
  created_at timestamptz not null default now(),
  unique(message_id, user_id)
);
create index if not exists idx_message_reactions_message on public.message_reactions(message_id);

create table if not exists public.message_stars (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(message_id, user_id)
);

create table if not exists public.conversation_settings (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  disappearing_seconds integer check (disappearing_seconds is null or disappearing_seconds in (0, 86400, 604800, 2592000)),
  read_receipts boolean not null default true,
  typing_indicators boolean not null default true,
  link_previews boolean not null default true,
  media_auto_download boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  public_key jsonb not null,
  label text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(user_id, device_id)
);
create index if not exists idx_chat_devices_user on public.chat_devices(user_id);

create table if not exists public.message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam','harassment','scam','violence','sexual','other')),
  created_at timestamptz not null default now(),
  unique(message_id, reporter_id)
);

alter table public.message_reactions enable row level security;
alter table public.message_stars enable row level security;
alter table public.conversation_settings enable row level security;
alter table public.chat_devices enable row level security;
alter table public.message_reports enable row level security;

-- A reaction/star is visible only to participants of its conversation.
drop policy if exists message_reactions_read on public.message_reactions;
create policy message_reactions_read on public.message_reactions for select using (
  exists (select 1 from public.messages m join public.conversations c on c.id=m.conversation_id
          where m.id=message_reactions.message_id and (c.user1_id=auth.uid() or c.user2_id=auth.uid()))
);
drop policy if exists message_reactions_write on public.message_reactions;
create policy message_reactions_write on public.message_reactions for all using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists message_stars_own on public.message_stars;
create policy message_stars_own on public.message_stars for all using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists conversation_settings_read on public.conversation_settings;
create policy conversation_settings_read on public.conversation_settings for select using (
  exists (select 1 from public.conversations c where c.id=conversation_settings.conversation_id and (c.user1_id=auth.uid() or c.user2_id=auth.uid()))
);
drop policy if exists conversation_settings_write on public.conversation_settings;
create policy conversation_settings_write on public.conversation_settings for all using (
  exists (select 1 from public.conversations c where c.id=conversation_settings.conversation_id and (c.user1_id=auth.uid() or c.user2_id=auth.uid()))
) with check (
  exists (select 1 from public.conversations c where c.id=conversation_settings.conversation_id and (c.user1_id=auth.uid() or c.user2_id=auth.uid()))
);

drop policy if exists chat_devices_own on public.chat_devices;
create policy chat_devices_own on public.chat_devices for all using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists message_reports_own on public.message_reports;
create policy message_reports_own on public.message_reports for insert with check (reporter_id=auth.uid());
create policy message_reports_read_own on public.message_reports for select using (reporter_id=auth.uid());

-- Realtime only for non-secret metadata/state tables; message text stays E2E.
do $$ begin alter publication supabase_realtime add table public.message_reactions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.message_stars; exception when duplicate_object then null; end $$;

create or replace function public.touch_message_read(p_message_id uuid)
returns void language plpgsql security invoker set search_path=public as $$
begin
  update public.messages m
     set read_at = now(), delivered_at = coalesce(delivered_at, now())
   where m.id = p_message_id
     and m.recipient_id = auth.uid();
end;
$$;

create or replace function public.set_message_expiry(p_message_id uuid, p_seconds integer)
returns void language plpgsql security invoker set search_path=public as $$
begin
  update public.messages m
     set expires_at = case when p_seconds is null or p_seconds <= 0 then null else now() + make_interval(secs => p_seconds) end
   where m.id = p_message_id and m.sender_id = auth.uid();
end;
$$;

create table if not exists public.message_pins (
  message_id uuid primary key references public.messages(id) on delete cascade,
  pinned_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.message_pins enable row level security;
create policy message_pins_read on public.message_pins for select using (
  exists (select 1 from public.messages m join public.conversations c on c.id=m.conversation_id where m.id=message_pins.message_id and (c.user1_id=auth.uid() or c.user2_id=auth.uid()))
);
create policy message_pins_write on public.message_pins for all using (pinned_by=auth.uid()) with check (pinned_by=auth.uid());

alter table public.messages add column if not exists scheduled_for timestamptz;
create index if not exists idx_messages_scheduled on public.messages(scheduled_for) where scheduled_for is not null;

create table if not exists public.chat_ai_jobs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('summary','smart_reply','translate','rewrite','tone','extract_tasks')),
  target_language text,
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.chat_ai_jobs enable row level security;
create policy chat_ai_jobs_own on public.chat_ai_jobs for all using (requested_by=auth.uid()) with check (requested_by=auth.uid());
