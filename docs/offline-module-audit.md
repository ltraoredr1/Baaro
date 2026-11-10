# Audit complet du module offline — BAARO

**Date :** 10 novembre 2026  
**Périmètre :** `src/features/offline`, files d’actions et d’événements, caches locaux, reconnexion, service worker/PWA et intégration Rust/C en WebAssembly.

## Synthèse

Le mode offline avait plusieurs écarts entre ce que l’interface annonçait et ce que le code garantissait : pas de chemin de rejeu sûr pour les abonnements, files vulnérables au changement de compte, reprise des erreurs réseau et des erreurs Supabase incohérente, préférences de cache non respectées par les caches de profil, et rechargement complet d’écran à la reconnexion. L’application disposait déjà d’un pipeline PWA Workbox, mais l’enregistrement manuel et le service worker généré n’étaient pas coordonnés ; les nouveaux WASM offline n’étaient pas pré-cacheés.

Les corrections ci-dessous sont appliquées dans la copie de travail. Les actions et événements conservés sont isolés par utilisateur, soumis à des limites et rejeu avec backoff ; les actions follow/unfollow utilisent désormais le RPC métier `toggle_follow` au lieu de créer directement une relation acceptée. Un noyau Rust et un validateur C sont compilés en WASM et testés, avec repli JavaScript si le WASM ne peut pas être chargé.

## Constats corrigés

1. **Isolation des comptes et rejeu.** Les files actions et événements sont indexées par UUID utilisateur, bornées, verrouillées avec Web Locks lorsqu’ils sont disponibles et rejouées uniquement sous leur compte propriétaire. Le rejeu s’interrompt et conserve le reste de la file si la session change. Aucune action d’un ancien compte n’est transférée ou rejouée au compte suivant.
2. **Fiabilité de persistance.** Les écritures `localStorage` sont vérifiées après sauvegarde ; une erreur de quota ou de stockage est remontée au lieu d’afficher à tort que l’action est conservée. Les files sont limitées à 100 actions et 200 événements. Les entrées définitivement échouées restent visibles et peuvent être supprimées explicitement sans effacer les éléments encore en attente.
3. **Reprise réseau et erreurs métier.** Les erreurs réseau, temporisations, réponses 5xx et HTTP 408/425/429 sont distinguées des erreurs d’authentification, de validation et des autres 4xx. Les tentatives ont un délai exponentiel borné et les échecs définitifs sont séparés en lettres mortes.
4. **Abonnements.** Le rejeu est idempotent : il relit l’état puis appelle `toggle_follow` uniquement si l’état demandé diffère. Cela évite l’upsert direct qui pouvait contourner les demandes d’abonnement privé ou les règles serveur. Le chemin UI n’exécute plus deux fois l’action en ligne.
5. **Événements du feed.** Les erreurs retournées par Supabase sont traitées comme des échecs et peuvent être mises en file si elles sont transitoires. Une erreur de lecture de session ne génère pas de rejet de promesse non géré.
6. **Cache local.** Le réglage `local_cache` contrôle maintenant le cache du profil et le cache des profils publics ; ces caches sont supprimés/lus comme vides lorsque l’option est désactivée.
7. **Reconnexion et PWA.** La reprise des files est déclenchée au retour du réseau et au démarrage en ligne. Le rechargement brutal de Stories est supprimé et le libellé de statut ne prétend plus que les données dynamiques sont toutes en cache. L’enregistrement PWA n’est plus injecté en doublon ; le code de démarrage l’active en production web et l’exclut des APK Capacitor. Workbox pré-cache les deux petits modules WASM offline, sans pré-cache des modèles ONNX/MediaPipe volumineux.
8. **Rust et C.** `offline_core.rs` valide les types d’action, le nombre de tentatives et calcule le backoff. `offline_payload.c` contrôle la limite de taille et l’UTF‑8. Le pont JS les charge en WebAssembly, avec repli JavaScript déterministe si le chargement échoue.

## Vérifications exécutées

- `npm run check:lock` : réussi.
- `npm run test:offline` : réussi ; compilation stricte Rust/C, exports WASM, bornes, types, charge utile, UTF‑8 et classification d’erreurs vérifiés.
- Tests natifs Rust : **2 tests réussis**.
- `npm run build` : réussi ; Workbox génère le service worker et pré-cache 182 ressources (~3,35 Mio), incluant `offline_core.wasm` et `offline_payload.wasm`.
- `git diff --check` : réussi.
- Le build émet des avertissements de compatibilité du plugin PWA avec Rolldown/Vite, mais se termine avec succès.

## Limites restantes à connaître

- Le dépôt ne contient pas la définition SQL de `record_feed_event`. Son idempotence côté serveur et ses contraintes d’unicité n’ont donc pas pu être vérifiées. Si le serveur a enregistré un événement mais que sa réponse s’est perdue, le rejeu peut produire une métrique en double ; une clé d’idempotence persistée côté RPC serait la correction complète.
- Le mode offline ne transforme pas le feed, les données dynamiques, la messagerie ni le chat de proximité en fonctionnalités hors ligne complètes. Les changements couvrent les likes, abonnements/désabonnements et événements de feed ; le cache PWA couvre les ressources de l’application, pas les réponses privées d’API.
- Le chat de proximité dépend du plugin natif et du transport Bluetooth/Wi‑Fi Direct disponible ; il n’est pas une file de messages à envoyer ultérieurement. Son avertissement de sécurité sur le transport en clair est conservé.
- Les tests ne se connectent pas au projet Supabase réel et ne remplacent pas un essai sur appareil Android en mode avion. Les politiques RLS et les effets secondaires serveur doivent être confirmés avec l’environnement de recette.
- `npm ci` a signalé 11 avis de vulnérabilité dans l’arbre de dépendances (2 faibles, 9 modérés). Aucun `npm audit fix` n’a été lancé ; ces mises à niveau sortent du périmètre de l’audit offline.

## État Git

Les modifications sont dans la copie de travail locale `/tmp/Baaro`. Aucun commit ni push GitHub n’a été effectué. Le patch joint est destiné à être appliqué à un checkout correspondant du dépôt.
