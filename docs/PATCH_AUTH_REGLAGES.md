# Patch inscription et réglages BAARO

Corrections apportées :
- L'écran d'authentification ne crée plus automatiquement une session invitée après le captcha.
- Le mode invité doit être choisi volontairement.
- L'inscription e-mail reste sur l'écran jusqu'à la création effective du compte.
- Les erreurs Supabase ne sont plus ignorées dans `AuthModal`.
- L'écran Réglages intègre `ProfileContactsLinks` pour les comptes permanents.
- Jusqu'à 3 numéros et 3 e-mails, site/liens et réseaux sociaux restent accessibles.
- Aucun nouvel endpoint API.
- Aucune virtualisation ajoutée.
