-- BAARO — correctif de sécurité du portefeuille + fonctionnalités
-- anti faux-comptes. À coller dans le SQL Editor de Supabase et exécuter
-- APRÈS supabase-schema.sql (et les autres migrations déjà appliquées).

-- 1) Le portefeuille, l'historique et les avoirs crypto ne doivent plus
--    jamais être modifiables directement depuis le navigateur : jusqu'ici,
--    la policy vérifiait seulement "auth.uid() = user_id", pas que la
--    valeur écrite était légitime — n'importe qui pouvait donc se créer
--    un solde arbitraire via la console. Désormais, seule la lecture de
--    ses propres lignes reste autorisée ; toutes les écritures passent par
--    /api/wallet, avec la clé de service (qui ignore RLS).
drop policy if exists "wallet_own" on wallets;
drop policy if exists "crypto_own" on crypto_holdings;
drop policy if exists "tx_own" on transactions;

create policy "wallet_read_own" on wallets for select using (auth.uid() = user_id);
create policy "crypto_read_own" on crypto_holdings for select using (auth.uid() = user_id);
create policy "tx_read_own" on transactions for select using (auth.uid() = user_id);
-- Volontairement aucune policy insert/update/delete pour anon/authenticated
-- sur ces trois tables : seul service_role (bypass RLS) peut désormais y
-- écrire, depuis les fonctions serveur.

-- 2) Marqueur de compte restreint. Posé à true par /api/register-device
--    quand un même appareil dépasse le nombre de comptes autorisés. Un
--    compte restreint peut toujours naviguer et gagner des points, mais
--    pas racheter de récompenses à valeur réelle (carte cadeau, virement,
--    conversion en BARO).
alter table profiles add column if not exists restricted boolean not null default false;

-- 3) Table de liaison appareil <-> comptes. Aucune policy définie : RLS
--    activé + zéro policy = accès refusé à anon/authenticated, seul
--    service_role peut y lire/écrire depuis les fonctions serveur.
create table if not exists device_accounts (
  device_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (device_id, user_id)
);
alter table device_accounts enable row level security;
