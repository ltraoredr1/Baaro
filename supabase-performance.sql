-- ============================================================
-- BAARO — Optimisation performances SQL
-- A executer dans Supabase → SQL Editor
-- Idempotent (safe a relancer)
-- ============================================================

-- ------------------------------------------------------------
-- 1. FOLLOWS (requetes les plus frequentes)
-- ------------------------------------------------------------
create index if not exists idx_follows_follower_status
  on public.follows (follower_id, status);

create index if not exists idx_follows_following_status
  on public.follows (following_id, status);

create index if not exists idx_follows_friends
  on public.follows (follower_id, is_friend, status)
  where is_friend = true;

create index if not exists idx_follows_pending
  on public.follows (following_id, status, is_friend)
  where status = 'pending' and is_friend = true;

-- ------------------------------------------------------------
-- 2. PROFILES (recherche + lookup)
-- ------------------------------------------------------------
create index if not exists idx_profiles_handle
  on public.profiles (handle);

create index if not exists idx_profiles_display_name
  on public.profiles (display_name);

create extension if not exists pg_trgm;

create index if not exists idx_profiles_display_name_trgm
  on public.profiles using gin (display_name gin_trgm_ops);

create index if not exists idx_profiles_handle_trgm
  on public.profiles using gin (handle gin_trgm_ops);

-- ------------------------------------------------------------
-- 3. POSTS (feed)
-- ------------------------------------------------------------
create index if not exists idx_posts_created_at
  on public.posts (created_at desc);

create index if not exists idx_posts_author_created
  on public.posts (author_id, created_at desc);

-- ------------------------------------------------------------
-- 4. POST_LIKES
-- ------------------------------------------------------------
create index if not exists idx_post_likes_user
  on public.post_likes (user_id);

create index if not exists idx_post_likes_post
  on public.post_likes (post_id);

-- ------------------------------------------------------------
-- 5. COMMENTS
-- ------------------------------------------------------------
create index if not exists idx_comments_post_created
  on public.comments (post_id, created_at desc);

create index if not exists idx_comments_author
  on public.comments (author_id);

-- ------------------------------------------------------------
-- 6. MESSAGES
-- ------------------------------------------------------------
create index if not exists idx_messages_conversation_created
  on public.messages (conversation_id, created_at desc);

create index if not exists idx_messages_sender
  on public.messages (sender_id);

create index if not exists idx_messages_recipient
  on public.messages (recipient_id);

-- ------------------------------------------------------------
-- 7. NOTIFICATIONS
-- ------------------------------------------------------------
create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);

create index if not exists idx_notifications_user_unread
  on public.notifications (user_id, created_at desc)
  where read = false;

-- ------------------------------------------------------------
-- 8. VIDEOS
-- ------------------------------------------------------------
create index if not exists idx_videos_author_created
  on public.videos (author_id, created_at desc);

create index if not exists idx_videos_created
  on public.videos (created_at desc);

-- ------------------------------------------------------------
-- 9. STORIES
-- ------------------------------------------------------------
create index if not exists idx_stories_author
  on public.stories (author_id);

create index if not exists idx_stories_expires
  on public.stories (expires_at);

-- ------------------------------------------------------------
-- 10. DEBATES
-- ------------------------------------------------------------
create index if not exists idx_debate_rooms_host
  on public.debate_rooms (host_id);

create index if not exists idx_debate_rooms_created
  on public.debate_rooms (created_at desc);

create index if not exists idx_debate_participants_user
  on public.debate_participants (user_id);

create index if not exists idx_debate_messages_room_created
  on public.debate_messages (room_id, created_at);

-- ------------------------------------------------------------
-- 11. TRANSACTIONS
-- ------------------------------------------------------------
create index if not exists idx_transactions_user_created
  on public.transactions (user_id, created_at desc);

-- ------------------------------------------------------------
-- 12. BLOCKS
-- ------------------------------------------------------------
create index if not exists idx_blocks_blocker
  on public.blocks (blocker_id);

create index if not exists idx_blocks_blocked
  on public.blocks (blocked_id);

-- ------------------------------------------------------------
-- 13. ANALYZE (met a jour les stats du planificateur Postgres)
-- ------------------------------------------------------------
analyze public.follows;
analyze public.profiles;
analyze public.posts;
analyze public.post_likes;
analyze public.comments;
analyze public.messages;
analyze public.notifications;
analyze public.videos;
analyze public.wallets;
analyze public.transactions;

-- ============================================================
-- FIN
-- ============================================================
