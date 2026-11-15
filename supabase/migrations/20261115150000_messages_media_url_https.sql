-- Défense en profondeur : une URL de média de message doit être en https.
-- NOT VALID : n'inspecte que les nouvelles lignes (les anciennes ne bloquent pas la
-- migration ; l'interface ignore de toute façon les URL non https).
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_media_url_https;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_media_url_https
  CHECK (media_url IS NULL OR media_url ~* '^https://') NOT VALID;
