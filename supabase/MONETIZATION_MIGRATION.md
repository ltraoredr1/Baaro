# Monetization migration

BAARO keeps one active unified migration. Monetization v19 is appended to `supabase/migrations/0001_baaro_unified.sql` so the existing production migration policy remains intact.

Apply the unified migration on a fresh database, or run the additive tail against an existing database through the normal Supabase migration workflow.
