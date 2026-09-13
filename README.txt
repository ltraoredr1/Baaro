BAARO — Point 2 corrigé : Comptes & profils

Fichiers complets corrigés :
- src/contexts/AppContext.jsx
- src/features/settings/index.tsx
- src/components/ProfileContactsLinks.jsx
- supabase/migrations/033_profile_identity_location_country.sql

Fonctionnalités ajoutées/corrigées :
- user_id stable distinct du handle
- prénom + nom de famille
- date de naissance avec minimum 13 ans côté serveur
- localisation
- pays d'inscription immuable
- pays actuel avec changement limité à une fois tous les 4 mois
- drapeau dérivé du pays côté serveur
- e-mail du compte affiché depuis Supabase Auth, sans duplication dans profiles
- photo de profil/couverture conservées
- contacts, liens et réseaux sociaux conservés
- contrôles RLS existants conservés
- aucun nouvel endpoint API
- aucune virtualisation

Migration à appliquer : 033_profile_identity_location_country.sql
