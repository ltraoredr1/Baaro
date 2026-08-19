# BAARO 2.0 v12 — Live / Débats / Cadeaux

## Corrections
- Rejoindre un Live utilise une transaction PostgreSQL verrouillée pour respecter `max_participants` sous concurrence.
- `join_debate_by_code` exige désormais un utilisateur authentifié et compare les codes en majuscules.
- Les demandes de co-hôte utilisent `from_user_id` / `to_user_id` et une réponse atomique.
- Les mutations de rôle sont réservées au serveur.
- Les endpoints Live/Roles utilisent le CORS partagé et un rate limit.
- Les cadeaux Live restent atomiques via `wallet_send_gift`.
- Les cadeaux ne sont plus lisibles par des utilisateurs étrangers au Live.
- Realtime est activé pour cadeaux et demandes de rôle.

## Migration
Exécuter `supabase/migrations/018_live_integrity_realtime.sql` après les migrations 001–017.
