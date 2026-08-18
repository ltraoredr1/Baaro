-- À exécuter en plus du schéma existant, dans une nouvelle requête SQL Supabase.
alter table profiles add column if not exists bio text default '';
