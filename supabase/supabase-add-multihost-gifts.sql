-- supabase-add-multihost-gifts.sql
-- À exécuter APRÈS supabase-add-debates.sql et supabase-fix-debates-security.sql

-- Ajouter colonnes multi-hôtes à debates (lives)
alter table public.debates add column if not exists daily_room_name text;
alter table public.debates add column if not exists max_co_hosts int default 3;
alter table public.debates add column if not exists allow_gifts boolean default true;

-- Table rôles live (host, co_host, viewer) - temps réel
create table if not exists public.debate_participants (
  debate_id uuid references public.debates(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text default 'viewer', -- host, co_host, viewer
  joined_at timestamptz default now(),
  is_muted boolean default false,
  is_camera_off boolean default false,
  primary key (debate_id, user_id)
);

-- Table cadeaux envoyés
create table if not exists public.gifts_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text not null, -- emoji
  price_points int not null, -- coût en points BARO
  value_baro float default 0, -- valeur pour le host
  animation text default 'float' -- float, burst, big
);

create table if not exists public.gifts_sent (
  id uuid primary key default gen_random_uuid(),
  debate_id uuid references public.debates(id) on delete cascade,
  sender_id uuid references auth.users(id),
  receiver_id uuid references auth.users(id),
  gift_id uuid references public.gifts_catalog(id),
  amount int default 1,
  total_points int,
  created_at timestamptz default now()
);

-- Insérer catalogue cadeaux par défaut
insert into public.gifts_catalog (name, icon, price_points, value_baro) values
('Coeur', '❤️', 1, 0.01),
('Flamme', '🔥', 5, 0.05),
('Étoile', '⭐', 10, 0.10),
('Cadeau', '🎁', 25, 0.25),
('Diamant', '💎', 50, 0.50),
('Couronne', '👑', 100, 1.00),
('Fusée', '🚀', 200, 2.00),
('Lion Baaro', '🦁', 500, 5.00)
on conflict do nothing;

-- RLS
alter table public.debate_participants enable row level security;
alter table public.gifts_catalog enable row level security;
alter table public.gifts_sent enable row level security;

create policy "participants_all" on public.debate_participants for all using (auth.role()='authenticated');
create policy "gifts_catalog_read" on public.gifts_catalog for select using (auth.role()='authenticated');
create policy "gifts_sent_all" on public.gifts_sent for all using (auth.role()='authenticated');

-- Realtime
alter publication supabase_realtime add table public.gifts_sent;
alter publication supabase_realtime add table public.debate_participants;

-- Policy pour debates si pas déjà
-- debates doit avoir daily_room_name lisible
