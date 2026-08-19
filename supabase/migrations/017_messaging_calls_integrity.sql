-- BAARO 2.0 — Messaging + Calls integrity hardening
-- Apply after migrations 001-016.

-- 1) Messages: sender/recipient/conversation must describe the same private chat.
create or replace function public.validate_message_participants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.conversations;
begin
  select * into c from public.conversations where id = new.conversation_id for share;
  if not found then raise exception 'CONVERSATION_NOT_FOUND'; end if;

  if new.sender_id is null or new.sender_id <> auth.uid() then
    raise exception 'MESSAGE_SENDER_FORBIDDEN';
  end if;

  if not ((c.user1_id = new.sender_id and c.user2_id = new.recipient_id)
       or (c.user2_id = new.sender_id and c.user1_id = new.recipient_id)) then
    raise exception 'MESSAGE_PARTICIPANTS_MISMATCH';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_messages_validate_participants on public.messages;
create trigger trg_messages_validate_participants
before insert on public.messages
for each row execute function public.validate_message_participants();

create or replace function public.prevent_message_identity_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender_id <> old.sender_id
     or coalesce(new.recipient_id::text,'') <> coalesce(old.recipient_id::text,'')
     or new.conversation_id <> old.conversation_id then
    raise exception 'MESSAGE_IDENTITY_FIELDS_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_messages_identity_guard on public.messages;
create trigger trg_messages_identity_guard
before update on public.messages
for each row execute function public.prevent_message_identity_change();

-- 2) Conversations: prevent self-conversations and make pair ordering canonical.
create or replace function public.normalize_conversation_pair()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare tmp uuid;
begin
  if new.user1_id = new.user2_id then raise exception 'SELF_CONVERSATION_FORBIDDEN'; end if;
  if new.user1_id > new.user2_id then
    tmp := new.user1_id; new.user1_id := new.user2_id; new.user2_id := tmp;
  end if;
  if auth.uid() is not null and auth.uid() <> new.user1_id and auth.uid() <> new.user2_id then
    raise exception 'CONVERSATION_PARTICIPANT_FORBIDDEN';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_conversations_normalize on public.conversations;
create trigger trg_conversations_normalize
before insert on public.conversations
for each row execute function public.normalize_conversation_pair();

-- 3) Calls: caller/callee must belong to the same conversation.
create or replace function public.validate_call_participants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare c public.conversations;
begin
  if new.caller_id = new.callee_id then raise exception 'SELF_CALL_FORBIDDEN'; end if;
  select * into c from public.conversations where id = new.conversation_id;
  if not found then raise exception 'CONVERSATION_NOT_FOUND'; end if;
  if not ((c.user1_id = new.caller_id and c.user2_id = new.callee_id)
       or (c.user2_id = new.caller_id and c.user1_id = new.callee_id)) then
    raise exception 'CALL_PARTICIPANTS_MISMATCH';
  end if;
  if new.caller_id <> auth.uid() then raise exception 'CALLER_FORBIDDEN'; end if;
  return new;
end;
$$;

drop trigger if exists trg_calls_validate_participants on public.calls;
create trigger trg_calls_validate_participants
before insert on public.calls
for each row execute function public.validate_call_participants();

-- Restrict call status transitions to sensible forward states.
create or replace function public.validate_call_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'ringing' and new.status not in ('ringing','accepted','rejected','missed','cancelled','ended') then
    raise exception 'INVALID_CALL_STATUS_TRANSITION';
  elsif old.status = 'accepted' and new.status not in ('accepted','ended','cancelled') then
    raise exception 'INVALID_CALL_STATUS_TRANSITION';
  elsif old.status in ('rejected','missed','ended','cancelled') and new.status <> old.status then
    raise exception 'CALL_ALREADY_TERMINAL';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_calls_status_transition on public.calls;
create trigger trg_calls_status_transition
before update on public.calls
for each row execute function public.validate_call_status_transition();

-- Realtime remains useful for incoming calls and messages.
do $$ begin
  alter publication supabase_realtime add table public.calls;
exception when duplicate_object then null; end $$;
