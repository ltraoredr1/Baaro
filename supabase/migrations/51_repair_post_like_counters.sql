-- ============================================================
-- BAARO
-- Réparation définitive du compteur de likes des publications
--
-- Source de vérité :
--   public.post_likes(post_id, user_id)
--
-- Compteur :
--   public.posts.likes_count
--
-- Ne modifie PAS :
--   - identité
--   - profiles
--   - follows / friends
--   - notifications
--   - commentaires
-- ============================================================

-- ------------------------------------------------------------
-- 1. Garantir l'existence du compteur
-- ------------------------------------------------------------

alter table public.posts
add column if not exists likes_count integer not null default 0;


-- ------------------------------------------------------------
-- 2. Fonction de synchronisation
-- ------------------------------------------------------------

create or replace function public.baaro_sync_post_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post_id uuid;
begin

  target_post_id :=
    case
      when tg_op = 'DELETE' then old.post_id
      else new.post_id
    end;

  update public.posts
  set likes_count = (
    select count(*)
    from public.post_likes
    where post_id = target_post_id
  )
  where id = target_post_id;

  return case
    when tg_op = 'DELETE' then old
    else new
  end;

end;
$$;


-- ------------------------------------------------------------
-- 3. Remplacer proprement l'ancien trigger éventuel
-- ------------------------------------------------------------

drop trigger if exists trg_baaro_post_like_count
on public.post_likes;


-- ------------------------------------------------------------
-- 4. Trigger INSERT / DELETE
-- ------------------------------------------------------------

create trigger trg_baaro_post_like_count
after insert or delete
on public.post_likes
for each row
execute function public.baaro_sync_post_like_count();


-- ------------------------------------------------------------
-- 5. Recalcul initial de TOUS les compteurs
-- ------------------------------------------------------------

update public.posts p
set likes_count = (
  select count(*)
  from public.post_likes l
  where l.post_id = p.id
);


-- ------------------------------------------------------------
-- 6. Sécurité : empêcher un compteur négatif
-- ------------------------------------------------------------

update public.posts
set likes_count = 0
where likes_count < 0;
