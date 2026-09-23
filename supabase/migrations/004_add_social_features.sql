-- BAARO - UPDATE V7 - Comments, Notifications, Blocks, Reports, Stories
-- Respecte ton arborescence: auth.users.id est la racine de tout
-- À exécuter en plus du schéma existant

-- ============================================================
-- 1. COMMENTS - suit auth.users.id + posts.id
-- ============================================================
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  text text not null check (char_length(text) > 0 and char_length(text) <= 1000),
  created_at timestamptz not null default now()
);

-- Index pour perf (ton feed)
create index if not exists comments_post_id_idx on comments(post_id, created_at desc);
create index if not exists comments_author_id_idx on comments(author_id);

alter table comments enable row level security;

-- Nettoie anciennes policies
drop policy if exists "comments_read" on comments;
drop policy if exists "comments_insert" on comments;
drop policy if exists "comments_own_delete" on comments;
drop policy if exists "comments_own_update" on comments;

-- Lecture publique (tout le monde voit les commentaires)
create policy "comments_read" on comments for select using (true);

-- Seul l'auteur peut insérer (auth.uid() = author_id = auth.users.id)
create policy "comments_insert" on comments for insert with check (auth.uid() = author_id);

-- Seul l'auteur peut supprimer son commentaire
create policy "comments_own_delete" on comments for delete using (auth.uid() = author_id);

-- Seul l'auteur peut modifier
create policy "comments_own_update" on comments for update using (auth.uid() = author_id) with check (auth.uid() = author_id);

-- ============================================================
-- 2. NOTIFICATIONS - suit auth.users.id
-- ============================================================
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade, -- suit ton arbre auth.users.id
  actor_id uuid references auth.users(id) on delete cascade, -- qui a déclenché
  type text not null default 'info' check (type in ('like','comment','follow','mention','system','info')),
  message text not null,
  target_id text, -- post_id ou comment_id
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on notifications(user_id, read, created_at desc);
create index if not exists notifications_actor_id_idx on notifications(actor_id);

alter table notifications enable row level security;

drop policy if exists "notif_own" on notifications;
drop policy if exists "notif_own_all" on notifications;
drop policy if exists "notif_insert_system" on notifications;

-- L'utilisateur ne voit que ses notifications (auth.users.id)
create policy "notif_own_all" on notifications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Permet au système (service_role) d'insérer via API, mais bloque insert direct client sauf via actor
-- Pour ton cas, on laisse insert si auth.uid() = actor_id ou user_id (pour tests)
create policy "notif_insert_system" on notifications for insert with check (auth.uid() = actor_id or auth.uid() = user_id);

-- ============================================================
-- 3. BLOCKS - suit auth.users.id (deux fois)
-- ============================================================
create table if not exists blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade, -- suit auth.users.id
  blocked_id uuid not null references auth.users(id) on delete cascade, -- suit auth.users.id
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id != blocked_id)
);

create index if not exists blocks_blocker_idx on blocks(blocker_id);
create index if not exists blocks_blocked_idx on blocks(blocked_id);

alter table blocks enable row level security;

drop policy if exists "blocks_own" on blocks;
drop policy if exists "blocks_own_all" on blocks;

-- Un user ne gère que ses blocks
create policy "blocks_own_all" on blocks for all using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

-- ============================================================
-- 4. REPORTS - suit auth.users.id
-- ============================================================
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade, -- suit auth.users.id
  target_type text not null check (target_type in ('post','comment','user','story','message')),
  target_id text not null,
  reason text check (char_length(reason) <= 500),
  status text not null default 'pending' check (status in ('pending','reviewed','dismissed','actioned')),
  created_at timestamptz not null default now()
);

create index if not exists reports_reporter_idx on reports(reporter_id);
create index if not exists reports_target_idx on reports(target_type, target_id);

alter table reports enable row level security;

drop policy if exists "reports_insert" on reports;
drop policy if exists "reports_own_read" on reports;

-- Seul le reporter peut créer
create policy "reports_insert" on reports for insert with check (auth.uid() = reporter_id);

-- Seul le reporter peut voir ses reports (admin voit via service_role)
create policy "reports_own_read" on reports for select using (auth.uid() = reporter_id);

-- ============================================================
-- 5. STORIES - suit auth.users.id
-- ============================================================
create table if not exists stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade, -- suit auth.users.id
  text text not null check (char_length(text) > 0 and char_length(text) <= 500),
  media_url text,
  media_type text check (media_type in ('image','video')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists stories_author_idx on stories(author_id, created_at desc);
create index if not exists stories_expires_idx on stories(expires_at);
-- Pour nettoyer automatiquement les stories expirées plus vite
create index if not exists stories_active_idx on stories(expires_at) where expires_at > now();

alter table stories enable row level security;

drop policy if exists "stories_read" on stories;
drop policy if exists "stories_insert" on stories;
drop policy if exists "stories_own_delete" on stories;

-- Tout le monde voit les stories non expirées
create policy "stories_read" on stories for select using (expires_at > now());

-- Seul l'auteur peut créer (auth.users.id)
create policy "stories_insert" on stories for insert with check (auth.uid() = author_id);

-- Seul l'auteur peut supprimer sa story
create policy "stories_own_delete" on stories for delete using (auth.uid() = author_id);

-- ============================================================
-- 6. REALTIME - ajoute ces tables au realtime
-- ============================================================
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE comments; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE notifications; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE stories; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ============================================================
-- 7. VERIFICATION FINALE - ton arborescence
-- ============================================================
SELECT 
  'auth.users.id -> ' || table_name || '.' || column_name as hierarchy,
  table_name,
  column_name
FROM information_schema.columns
WHERE (table_name = 'profiles' AND column_name = 'id')
   OR (table_name IN ('wallets','crypto_holdings','device_accounts','transactions','comments','notifications','blocks','reports','stories') 
       AND column_name IN ('user_id','author_id','blocker_id','reporter_id'))
ORDER BY table_name;

SELECT 'Tables créées avec succès - arborescence respectée' as status;
