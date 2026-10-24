-- Registre serveur pour empêcher le double traitement des webhooks de paiement.
-- À appliquer après sauvegarde, d'abord sur staging puis en production.

create table if not exists public.payment_webhook_events (
  provider text not null,
  event_id text not null,
  payload_hash text not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (provider, event_id)
);

create index if not exists idx_payment_webhook_events_status_updated
  on public.payment_webhook_events (status, updated_at);

alter table public.payment_webhook_events enable row level security;

revoke all on public.payment_webhook_events from anon, authenticated;

comment on table public.payment_webhook_events is
  'Registre privé de déduplication des événements Stripe, PayPal et CinetPay; accès serveur uniquement.';
