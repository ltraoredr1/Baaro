create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid,
  caller_id uuid not null,
  callee_id uuid not null,
  type text default 'voice',
  status text default 'ringing',
  daily_room_name text,
  created_at timestamptz default now(),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds int
);
alter table calls add column if not exists started_at timestamptz;
alter table calls add column if not exists ended_at timestamptz;
alter table calls add column if not exists duration_seconds int;
alter table calls enable row level security;

drop policy if exists calls_select on calls;
create policy calls_select on calls for select using (auth.uid() in (caller_id, callee_id));
drop policy if exists calls_insert on calls;
create policy calls_insert on calls for insert with check (auth.uid() = caller_id);
drop policy if exists calls_update on calls;
create policy calls_update on calls for update using (auth.uid() in (caller_id, callee_id));

do $$ begin
  alter publication supabase_realtime add table calls;
exception when others then null;
end $$;

drop policy if exists no_anon_messages on messages;
create policy no_anon_messages on messages as restrictive for all to authenticated
  using ((auth.jwt()->>'is_anonymous')::boolean is not true)
  with check ((auth.jwt()->>'is_anonymous')::boolean is not true);

drop policy if exists no_anon_conversations on conversations;
create policy no_anon_conversations on conversations as restrictive for all to authenticated
  using ((auth.jwt()->>'is_anonymous')::boolean is not true)
  with check ((auth.jwt()->>'is_anonymous')::boolean is not true);

drop policy if exists no_anon_calls on calls;
create policy no_anon_calls on calls as restrictive for all to authenticated
  using ((auth.jwt()->>'is_anonymous')::boolean is not true)
  with check ((auth.jwt()->>'is_anonymous')::boolean is not true);
