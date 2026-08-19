-- BAARO AI routing foundation. Provider credentials stay in server environment variables.
-- This table stores user preference only; it does not store API keys or provider secrets.
alter table public.profiles add column if not exists ai_provider_preference text;
alter table public.profiles add column if not exists ai_language text;

alter table public.profiles drop constraint if exists profiles_ai_provider_preference_check;
alter table public.profiles add constraint profiles_ai_provider_preference_check
  check (ai_provider_preference is null or ai_provider_preference in ('auto','n8n','anthropic','openai','gemini','moonshot','xai'));

create index if not exists profiles_country_idx on public.profiles(country);
create index if not exists profiles_ai_provider_preference_idx on public.profiles(ai_provider_preference);

comment on column public.profiles.ai_provider_preference is 'BAARO AI preference; credentials remain server-side.';
comment on column public.profiles.ai_language is 'Preferred language for BAARO AI responses.';
