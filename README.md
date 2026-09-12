# BAARO — Profil : contacts, liens et réseaux sociaux

Fichiers concernés uniquement.

## Installation
1. Copier `src/components/ProfileContactsLinks.jsx` dans `src/components/`.
2. Copier `src/components/ProfileContactLinksView.jsx` dans `src/components/`.
3. Remplacer `src/hooks/useProfile.js` par celui du patch.
4. Ajouter `supabase/migrations/029_profile_contacts_links_socials.sql`.
5. Dans l'écran de modification du profil, afficher `<ProfileContactsLinks userId={userId} />`.

Fonctionnalités :
- jusqu'à 3 numéros de téléphone par profil ;
- jusqu'à 3 e-mails ;
- site Web et liens ;
- Facebook, YouTube, TikTok, Bigo, Instagram, X, LinkedIn, WhatsApp, Telegram, Snapchat et autre ;
- RLS propriétaire pour l'écriture ;
- aucune nouvelle API.
