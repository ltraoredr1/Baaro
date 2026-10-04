# BAARO database migration

Fresh Supabase databases use one coordinated migration: `supabase/migrations/0001_baaro_unified.sql`. It contains the previous schema layers in order plus profile statistics, cloud settings and performance/language controls.

Legacy migration sources are kept under `supabase/legacy_migrations/` for audit only.

**Important:** the unified file is for a fresh/rebuilt database. Do not apply it over an already-migrated production database without a controlled rebuild.
