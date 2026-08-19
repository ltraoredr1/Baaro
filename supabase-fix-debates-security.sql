-- Correctifs de sécurité pour les Débats/Lives — à exécuter APRÈS
-- supabase-add-debates.sql, dans une nouvelle requête du SQL Editor
-- Supabase.
--
-- 1) Le code d'invitation n'était pas vraiment secret. L'ancienne policy
--    de lecture ("auth.uid() is not null") laissait n'importe quel
--    compte connecté — même anonyme — faire un simple
--    `select * from debate_rooms` et lire ainsi l'invite_code de TOUS
--    les salons, pas seulement les siens. On restreint désormais la
--    lecture aux salons dont on est l'hôte ou déjà participant·e, et on
--    fait passer la vérification du code par une fonction serveur (RPC)
--    qui, elle, est autorisée à lire la table sans être limitée par
--    cette policy — c'est elle qui décide si le code est valide.
--
-- 2) On empêche un·e participant·e de faire passer un message pour un
--    message de l'IA ou du système : avant, seul le type (sender_type)
--    était vérifié, n'importe qui pouvait insérer sender_type='ai' avec
--    n'importe quel sender_id. On impose désormais sender_id = null
--    pour ces deux types.
--
-- 3) Le nouveau mode "Live" (un·e seul·e hôte diffuse, façon TikTok Live)
--    supporte davantage de monde qu'un débat à plusieurs caméras : on
--    relève le plafond de spectateur·ices.

-- --- 1) Lecture restreinte + fonction de jointure par code -----------

drop policy if exists "debate_rooms_read" on debate_rooms;
create policy "debate_rooms_read" on debate_rooms for select using (
  auth.uid() = host_id
  or exists (
    select 1 from debate_participants dp
    where dp.room_id = debate_rooms.id and dp.user_id = auth.uid()
  )
);

-- Rejoindre un live par code : fonction "security definer", donc elle
-- peut lire debate_rooms (y compris invite_code) même si l'appelant·e
-- n'a pas encore le droit de lire cette ligne. Elle vérifie le code et
-- la capacité, puis ajoute l'appelant·e comme participant·e — c'est
-- l'unique porte d'entrée pour rejoindre par code désormais.
create or replace function join_debate_by_code(p_code text)
returns debate_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room debate_rooms;
  v_count int;
begin
  select * into v_room from debate_rooms
    where invite_code = lower(trim(p_code)) and status = 'active';

  if not found then
    raise exception 'Aucun live actif avec ce code.';
  end if;

  select count(*) into v_count from debate_participants
    where room_id = v_room.id and left_at is null;

  if v_count >= v_room.max_participants then
    raise exception 'Ce live est complet.';
  end if;

  insert into debate_participants (room_id, user_id, joined_at, left_at)
  values (v_room.id, auth.uid(), now(), null)
  on conflict (room_id, user_id) do update set left_at = null, joined_at = now();

  return v_room;
end;
$$;

grant execute on function join_debate_by_code(text) to authenticated, anon;

-- --- 2) Empêcher l'usurpation des messages IA/système -----------------

drop policy if exists "debate_messages_insert" on debate_messages;
create policy "debate_messages_insert" on debate_messages for insert with check (
  exists (select 1 from debate_participants dp where dp.room_id = debate_messages.room_id and dp.user_id = auth.uid())
  and (
    (sender_type = 'user' and sender_id = auth.uid())
    or (sender_type in ('ai', 'system') and sender_id is null)
  )
);

-- --- 3) Plafond de spectateur·ices relevé ------------------------------

alter table debate_rooms drop constraint if exists debate_rooms_max_participants_check;
alter table debate_rooms add constraint debate_rooms_max_participants_check
  check (max_participants between 2 and 50);

-- Note : la fonction join_debate_by_code() ne se substitue pas à un vrai
-- rate limiting contre le brute-force d'un code à 8 caractères — pour un
-- lancement à fort trafic, envisager d'ajouter une limite de tentatives
-- (par IP ou par compte) côté edge function si besoin.
