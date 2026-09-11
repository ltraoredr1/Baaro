-- BAARO 024: entreprises, transports, voyages, programmes, tarifs et informations
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(user_id) on delete cascade,
  name text not null,
  description text,
  company_type text not null default 'other',
  category text,
  country text not null,
  city text,
  phone text,
  email text,
  website text,
  logo_url text,
  currency text not null default 'XOF',
  is_active boolean not null default false,
  subscription_status text not null default 'none',
  trial_ends_at timestamptz,
  subscription_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_type_check check (company_type in ('shop','transport','radio','tv','telecom','energy','bank','insurance','education','health','hospitality','other'))
);

create table if not exists public.company_programs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  description text,
  program_type text not null default 'service',
  days_of_week integer[] not null default '{}',
  start_time time,
  end_time time,
  origin text,
  destination text,
  frequency text,
  price numeric(12,2),
  currency text not null default 'XOF',
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_tariffs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  price numeric(12,2) not null check (price >= 0),
  currency text not null default 'XOF',
  unit text,
  tariff_type text,
  valid_from timestamptz,
  valid_until timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_infos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  content text not null,
  is_public boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  amount numeric(12,2) not null default 0,
  currency text not null default 'XOF',
  was_premium_rate boolean not null default false,
  provider text not null,
  payment_ref text unique,
  status text not null default 'pending',
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now(),
  constraint company_subscription_provider_check check (provider in ('stripe','paypal','cinetpay','paydunya','trial')),
  constraint company_subscription_status_check check (status in ('pending','confirmed','failed','trial'))
);

create index if not exists idx_companies_active_type on public.companies(company_type, country, city) where is_active;
create index if not exists idx_company_programs_company on public.company_programs(company_id, is_active, sort_order);
create index if not exists idx_company_tariffs_company on public.company_tariffs(company_id, is_active);
create index if not exists idx_company_infos_company on public.company_infos(company_id, is_public, sort_order);

alter table public.companies enable row level security;
alter table public.company_programs enable row level security;
alter table public.company_tariffs enable row level security;
alter table public.company_infos enable row level security;
alter table public.company_subscriptions enable row level security;

drop policy if exists "companies_select" on public.companies;
create policy "companies_select" on public.companies for select using (is_active = true or owner_id = auth.uid());
drop policy if exists "companies_insert_owner" on public.companies;
create policy "companies_insert_owner" on public.companies for insert with check (owner_id = auth.uid());
drop policy if exists "companies_update_owner" on public.companies;
create policy "companies_update_owner" on public.companies for update using (owner_id = auth.uid());

drop policy if exists "company_programs_select" on public.company_programs;
create policy "company_programs_select" on public.company_programs for select using (
  is_active = true or exists (select 1 from public.companies c where c.id = company_programs.company_id and c.owner_id = auth.uid())
);
drop policy if exists "company_programs_owner_write" on public.company_programs;
create policy "company_programs_owner_write" on public.company_programs for all using (
  exists (select 1 from public.companies c where c.id = company_programs.company_id and c.owner_id = auth.uid())
) with check (
  exists (select 1 from public.companies c where c.id = company_programs.company_id and c.owner_id = auth.uid())
);

drop policy if exists "company_tariffs_select" on public.company_tariffs;
create policy "company_tariffs_select" on public.company_tariffs for select using (
  is_active = true or exists (select 1 from public.companies c where c.id = company_tariffs.company_id and c.owner_id = auth.uid())
);
drop policy if exists "company_tariffs_owner_write" on public.company_tariffs;
create policy "company_tariffs_owner_write" on public.company_tariffs for all using (
  exists (select 1 from public.companies c where c.id = company_tariffs.company_id and c.owner_id = auth.uid())
) with check (
  exists (select 1 from public.companies c where c.id = company_tariffs.company_id and c.owner_id = auth.uid())
);

drop policy if exists "company_infos_select" on public.company_infos;
create policy "company_infos_select" on public.company_infos for select using (
  is_public = true or exists (select 1 from public.companies c where c.id = company_infos.company_id and c.owner_id = auth.uid())
);
drop policy if exists "company_infos_owner_write" on public.company_infos;
create policy "company_infos_owner_write" on public.company_infos for all using (
  exists (select 1 from public.companies c where c.id = company_infos.company_id and c.owner_id = auth.uid())
) with check (
  exists (select 1 from public.companies c where c.id = company_infos.company_id and c.owner_id = auth.uid())
);

drop policy if exists "company_subscriptions_owner_select" on public.company_subscriptions;
create policy "company_subscriptions_owner_select" on public.company_subscriptions for select using (
  exists (select 1 from public.companies c where c.id = company_subscriptions.company_id and c.owner_id = auth.uid())
);
