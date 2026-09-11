-- BAARO 025: avis entreprises
create table if not exists public.company_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, user_id)
);
create index if not exists idx_company_reviews_company on public.company_reviews(company_id, created_at desc);
alter table public.company_reviews enable row level security;
drop policy if exists "company_reviews_public_select" on public.company_reviews;
create policy "company_reviews_public_select" on public.company_reviews for select using (true);
drop policy if exists "company_reviews_user_insert" on public.company_reviews;
create policy "company_reviews_user_insert" on public.company_reviews for insert with check (user_id = auth.uid());
drop policy if exists "company_reviews_user_update" on public.company_reviews;
create policy "company_reviews_user_update" on public.company_reviews for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "company_reviews_user_delete" on public.company_reviews;
create policy "company_reviews_user_delete" on public.company_reviews for delete using (user_id = auth.uid());
