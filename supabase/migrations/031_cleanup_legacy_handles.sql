-- 031_cleanup_legacy_handles.sql
-- Nettoie les handles hérités : @user_xxx, @membre, uuid-like
-- Après 029 + 030

-- 1) Repérer (lecture seule — à exécuter d'abord pour voir le volume)
-- select user_id, display_name, handle
-- from public.profiles
-- where handle ~* '^@?user_[0-9a-f]'
--    or lower(handle) in ('@membre', '@member', '@user', 'membre', 'member', 'user')
--    or handle ~* '^[0-9a-f]{8}-[0-9a-f]{4}-';

-- 2) Libérer les handles legacy (force une vraie saisie au prochain enregistrement)
update public.profiles
set
  handle = null,
  updated_at = now()
where
  handle is not null
  and (
    handle ~* '^@?user_[0-9a-f]'
    or lower(coalesce(handle, '')) in (
      '@membre', '@member', '@user',
      'membre', 'member', 'user'
    )
    or handle ~* '^[0-9a-f]{8}-[0-9a-f]{4}-'
  );

-- 3) Optionnel : si display_name est encore le défaut, le laisser ;
--    l'utilisateur choisira nom + @ dans Réglages.

comment on table public.profiles is
  'BAARO profiles — handles legacy @user_xxx nettoyés (031)';
