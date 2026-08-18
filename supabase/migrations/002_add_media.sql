-- À exécuter en plus du schéma existant, dans une nouvelle requête SQL Supabase.
alter table posts add column if not exists media_url text;
alter table posts add column if not exists media_type text;
