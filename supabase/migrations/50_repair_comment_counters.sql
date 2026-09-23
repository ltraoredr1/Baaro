-- ============================================================
-- BAARO
-- Réparation définitive des compteurs de commentaires
-- Feed + Vidéos
--
-- Ne modifie PAS le modèle d'identité.
-- Ne modifie PAS follows / friends / notifications.
-- Migration idempotente.
-- ============================================================


-- ============================================================
-- 1. POSTS : compteur exact des commentaires
-- ============================================================

create or replace function public.baaro_sync_post_comment_count()
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

  update public.posts p
  set comments_count = (
    select count(*)
    from public.comments c
    where c.post_id = target_post_id
  )
  where p.id = target_post_id;

  return case
    when tg_op = 'DELETE' then old
    else new
  end;
end;
$$;


drop trigger if exists trg_baaro_post_comment_count
on public.comments;


create trigger trg_baaro_post_comment_count
after insert or delete
on public.comments
for each row
execute function public.baaro_sync_post_comment_count();


-- ============================================================
-- 2. VIDEOS : compteur exact des commentaires
-- ============================================================

create or replace function public.baaro_sync_video_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_video_id uuid;
begin
  target_video_id :=
    case
      when tg_op = 'DELETE' then old.video_id
      else new.video_id
    end;

  update public.videos v
  set comments_count = (
    select count(*)
    from public.video_comments c
    where c.video_id = target_video_id
  )
  where v.id = target_video_id;

  return case
    when tg_op = 'DELETE' then old
    else new
  end;
end;
$$;


drop trigger if exists trg_baaro_video_comment_count
on public.video_comments;


create trigger trg_baaro_video_comment_count
after insert or delete
on public.video_comments
for each row
execute function public.baaro_sync_video_comment_count();


-- ============================================================
-- 3. RECALCUL INITIAL DES COMPTEURS POSTS
-- ============================================================

update public.posts p
set comments_count = coalesce(
  (
    select count(*)
    from public.comments c
    where c.post_id = p.id
  ),
  0
);


-- ============================================================
-- 4. RECALCUL INITIAL DES COMPTEURS VIDÉOS
-- ============================================================

update public.videos v
set comments_count = coalesce(
  (
    select count(*)
    from public.video_comments c
    where c.video_id = v.id
  ),
  0
);


-- ============================================================
-- FIN
-- ============================================================
