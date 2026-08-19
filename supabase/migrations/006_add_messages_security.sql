-- Corrige la sécurité de la messagerie privée (table `messages`).
-- La table a été créée avec RLS activée mais SANS aucune policy, ce qui
-- bloquait tout accès (aucune lecture ni écriture possible).
-- À exécuter après supabase-schema.sql, dans une nouvelle requête du SQL Editor.

drop policy if exists "messages_read_own" on messages;
create policy "messages_read_own" on messages
  for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "messages_send_own" on messages;
create policy "messages_send_own" on messages
  for insert
  with check (auth.uid() = sender_id);
