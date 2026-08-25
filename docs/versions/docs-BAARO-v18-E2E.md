# BAARO 2.0 v18 — E2E & Quality

## Parcours critiques

1. Auth : inscription / connexion / déconnexion / récupération.
2. Profil : création, édition, avatar, bio.
3. Social : publication, like, commentaire, follow, repost.
4. Vidéo : upload, lecture, vue, like, commentaire.
5. Stories : publication, expiration, lecture.
6. Messages : conversation, texte, média privé, realtime.
7. Appels : création, acceptation, refus, fin, token Daily.
8. Live : création, join, capacité, co-hôte, cadeau, fin.
9. Wallet : earn, redeem, gift, ledger, idempotence.
10. IA : routage régional, fallback, quota, erreurs fournisseur.
11. Notifications : web push, token natif, préférences, deep link.
12. Android : permissions, offline, reprise, caméra/micro, notifications.

## Tests de sécurité à exécuter

- deux utilisateurs ne voient pas les messages privés de l'autre ;
- un utilisateur ne peut pas modifier l'identité d'un message ;
- une vue vidéo ne peut pas être comptée deux fois pour la même clé ;
- un cadeau concurrent ne peut pas débiter deux fois le même solde ;
- une récompense ne peut pas être rejouée ;
- une demande de payout est idempotente ;
- un utilisateur ne peut pas obtenir un token d'appel pour une room qui ne lui appartient pas ;
- une story expirée n'est pas retournée ;
- un token push ne peut pas être associé à un autre compte via le client.

## Validation réelle

Dans un environnement CI avec secrets de test :

```bash
npm ci
npm run check:lock
npm run check:ai
npm run check:notifications
npm run check:performance
npm run check:android
npm run check:payout
npm run check:e2e
npm run build
```

Puis lancer les tests navigateur et Android avec des comptes de test dédiés.

Cette version ne prétend pas avoir exécuté un navigateur ou un émulateur Android dans l'environnement de génération.
