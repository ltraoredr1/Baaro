# Supabase - BAARO

## Structure

- `schema.sql` → Schéma de base (tables principales)
- `migrations/` → Migrations à exécuter dans l'ordre

## Ordre d'exécution

1. schema.sql
2. 001_security_fix.sql
3. 002_add_media.sql
4. 003_add_debates.sql
5. 004_add_social_features.sql
6. 005_add_profile_bio.sql
7. 006_add_messages_security.sql
8. 007_add_multihost_gifts.sql
9. 008_fix_chat_friends.sql
10. 009_fix_debates_security.sql
11. 010_performance.sql
