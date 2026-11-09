-- Sauvegarde de la clé E2E protégée par PIN (4 chiffres).
-- À exécuter dans l'éditeur SQL de Supabase.
-- Aucune policy : seule la clé service_role (api/e2e-backup.js) peut lire/écrire.
-- Les clients ne peuvent donc jamais lire la sauvegarde sans passer par la limite d'essais.

create table if not exists public.e2e_key_backups (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  proof_hash      text not null,          -- HMAC(pepper, preuve dérivée du PIN)
  salt            text not null,          -- sel PBKDF2 (public)
  iter            integer not null,       -- itérations PBKDF2
  wrap_secret     text not null,          -- secret d'enveloppe (libéré seulement après PIN correct)
  backup          jsonb not null,         -- clé privée chiffrée (PIN + wrap_secret)
  failed_attempts integer not null default 0,
  lock_level      integer not null default 0,
  locked_until    timestamptz,
  updated_at      timestamptz not null default now()
);

alter table public.e2e_key_backups enable row level security;
revoke all on public.e2e_key_backups from anon, authenticated;

-- Variable d'environnement Vercel à ajouter (32+ caractères aléatoires) :
--   E2E_PIN_PEPPER=<chaîne aléatoire longue>
