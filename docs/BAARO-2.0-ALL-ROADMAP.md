# BAARO 2.0 — Plan global de consolidation

## Objectif
Transformer le prototype avancé actuel en plateforme sociale internationale maintenable, performante et prête à monter en charge.

## 1. Produit / UX
- Navigation mobile-first et états de chargement homogènes.
- Accessibilité clavier, contrastes, labels et annonces d’erreur.
- Internationalisation réelle : FR/EN puis packs régionaux.
- États offline explicites ; aucune fonctionnalité simulée ne doit être présentée comme active.

## 2. Feed / Social
- Pagination par curseur.
- Compteurs atomiques et idempotents.
- Ranking séparant chronologie, abonnements, découverte et contenu sponsorisé.
- Blocage, signalement, modération et anti-spam.

## 3. Vidéo / Stories
- Upload direct signé vers Storage.
- Transcodage asynchrone et thumbnails.
- Limites MIME/taille côté client + serveur + Storage.
- CDN et URLs signées pour les médias privés.
- Vues/likes/commentaires idempotents.

## 4. Messagerie / Appels / Live
- Conversation comme frontière d’autorisation.
- Pièces jointes privées.
- Realtime avec reprise après reconnexion.
- WebRTC/Daily avec tokens courts et rooms expirables.
- Débats avec rôles immuables côté client.

## 5. Économie BAARO
- Ledger PostgreSQL transactionnel.
- Récompenses vérifiées par référence d’événement.
- Idempotence sur toutes les récompenses.
- Limites quotidiennes et anti-farming.
- Cashout désactivé tant que le payout réel n’est pas implémenté et vérifié.

## 6. IA
- Gateway unique `/api/chat`.
- Quotas par utilisateur et modèle.
- Configuration par région/pays sans exposer les clés fournisseur.
- Routage configurable vers plusieurs fournisseurs.
- Journalisation des coûts et limites de contexte.
- Modération et protection contre l’abus.

## 7. Notifications
- Tokens par appareil.
- Nettoyage des tokens invalides.
- Préférences utilisateur.
- Déduplication et regroupement des notifications.

## 8. Offline / Android
- Plugin natif clairement séparé du mode démonstration web.
- File d’actions offline idempotente.
- Synchronisation avec résolution de conflits.
- Permissions Android minimales.

## 9. Performance
- Lazy loading des onglets lourds.
- Pagination/virtualisation des feeds.
- Cache sélectif.
- Compression et CDN médias.
- Index PostgreSQL surveillés.
- Mesure Web Vitals et temps API.

## 10. Sécurité
- RLS table par table avec tests d’accès croisés.
- Storage privé par défaut.
- CORS strict en production.
- Rate limiting distribué.
- Validation serveur des actions financières.
- Secrets uniquement côté serveur.
- Logs sans PII ni tokens.

## 11. Observabilité
- Erreurs frontend et API centralisées.
- Corrélation par request ID.
- Métriques : latence, erreurs, coût IA, uploads, transactions.
- Alertes sur anomalies wallet et fraude.

## 12. Qualité
- `npm ci` reproductible.
- Build Vite validé.
- Tests unitaires services critiques.
- Tests SQL/RLS.
- Tests E2E auth → feed → vidéo → message → wallet.
- CI avant merge.

## Ordre recommandé
1. Build reproductible et dépendances.
2. RLS/Storage.
3. Wallet/ledger.
4. Feed/social.
5. Vidéo/stories.
6. Messagerie/live/appels.
7. IA régionale.
8. Offline/Android.
9. Observabilité/performance.
10. Payout réel.
11. Tests E2E et lancement progressif.
