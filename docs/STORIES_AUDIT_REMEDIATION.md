# Remédiation de l’audit du module Stories

**Dépôt :** BAARO (`ltraoredr1/Baaro`) — correctifs appliqués à la copie de travail issue de l’audit du 9 novembre 2026.  
**Portée :** code source Stories, route média R2, compilation WebAssembly et tests disponibles dans le dépôt.  
**Limite :** aucun accès au schéma/policies Supabase déployés, à un staging, ni aux journaux de commandes réels n’a été utilisé.

## État par constat

| ID | État | Remédiation / limite restante |
|---|---|---|
| S-01 | Corrigé | Le viewer initialise le chargement selon le média réel; les stories texte/highlights texte démarrent directement. Une vidéo qui échoue est sautée au lieu de laisser un spinner bloquant. |
| S-02 | Corrigé | Chaque média sélectionné produit une ligne `stories`; le lot est envoyé par un seul INSERT. Un test garantit le nombre d’assets et les dates persistées. |
| S-03 | Partiellement corrigé — intégration volontairement non activée | Le helper ne renvoie désormais `true` que si le RPC d’achat a réussi, exige une commande et refuse les quantités invalides. Aucun appel n’est ajouté au checkout : le checkout présent crée une commande de boutique dont l’état peut encore être `pending`; le dépôt ne fournit pas de preuve d’un paiement/encaissement confirmé, ni de contrat RPC/migration permettant de vérifier commande, acheteur, produits et idempotence côté serveur. Enregistrer cela comme vente depuis le navigateur risquerait de compter des commandes annulées ou falsifiées. À terminer après vérification de l’API d’ordre et de la RPC en production. |
| S-04 | Corrigé pour Stories | La limite de 100 MiB est vérifiée dans le compositeur, après compression côté client et par API au `prepare` et au `finalize`, sur la taille réelle R2. La signature binaire et le MIME sont contrôlés côté serveur avant d’enregistrer l’asset. |
| S-05 | Corrigé dans les échecs déterministes | Le chemin R2 est retenu et nettoyé après erreur d’envoi/finalisation; le compositeur nettoie les uploads si aucune insertion n’a commencé ou si PostgreSQL confirme l’échec du batch. En cas de timeout d’INSERT ambigu, les objets ne sont pas supprimés à l’aveugle pour éviter de casser une ligne déjà créée; une purge périodique des orphelins reste une amélioration séparée. |
| S-06 | Corrigé côté code client | Les lectures vérifient les erreurs Supabase; les compteurs ne convertissent plus une erreur/absence de donnée en zéro affiché; le prix/stock ne montre plus le snapshot comme donnée live et bloque le CTA tant que la donnée live est indisponible. Les retours RPC d’analytics sont examinés et journalisés. |
| S-07 | Corrigé | Le viewer examine aussi les objets `{ error }` renvoyés par les actions Follow/Friend et affiche un message d’échec. |
| S-08 | Non certifiable depuis ce dépôt | Aucune migration Stories ou policy effectivement déployée n’est disponible ici. Les contrôles RLS, visibilité par compte, droits `EXECUTE`, réponses/stats nominatives et blocages doivent être testés en staging avec des comptes distincts. Aucun changement SQL n’a été inventé. Le WASM navigateur ne constitue pas un contrôle de sécurité; le contrôle média autoritaire est effectué par l’API. |
| S-09 | Corrigé côté écriture | Le compositeur envoie toujours `publish_at` et `expires_at`, avec expiration calculée 24 h après l’heure de publication prévue (pas après la création d’un post programmé). |
| S-10 | Partiellement corrigé | Un échec explicite de l’insertion du premier item déclenche une suppression compensatoire du parent et journalise l’échec du rollback. Une vraie transaction parent+item, ainsi que l’unicité de `position` entre clients, exigent une RPC/contrainte confirmée dans le schéma réel. |
| S-11 | Partiellement couvert | Ajout de tests Node, de tests d’exécution des binaires WASM, de tests Rust, de génération WASM en CI et d’un contrôle de fraîcheur des binaires versionnés. Il n’y a pas encore de test d’intégration live Supabase/RLS ni de parcours composant monté dans un vrai navigateur. |

## Rust et C / exécution WASM

`story_policy.rs` applique les limites locales et est compilé en WASM `no_std`; `media_sniff.c` examine les signatures binaires. Le wrapper navigateur charge ces modules et conserve un fallback JS. Les binaires de `public/wasm/` sont versionnés pour permettre les déploiements sans toolchain Rust/Clang; les sources, binaires et tests doivent rester synchronisés. Le serveur répète la vérification de signature depuis les premiers octets R2 avant validation de l’asset.

## Vérifications exécutées

- `npm run test:stories` : 7 tests JS verts et 17 assertions d’exécution Rust/C WASM vertes.
- `rustc --test src/features/stories/native/story_policy.rs` : 2 tests Rust verts; `rustfmt --check` vert.
- `npm run build` : build Vite/PWA de production réussi.
- `node --check` des fichiers API/upload modifiés : réussi.
- `npm run check:lock` : manifest/lockfile synchronisés.
- `git diff --check` : aucune erreur d’espace/bloc.
- `npm run audit:security` : terminé; le scanner existant signale 15 références nécessitant une revue manuelle (notamment des références service-role déjà présentes dans la documentation/scripts/API). Ces avertissements ne constituent pas, seuls, des vulnérabilités confirmées.

## Conditions restantes avant une affirmation « production-ready »

1. Vérifier en staging les RLS/RPC et la visibilité stories avec au moins deux comptes et un utilisateur anonyme.
2. Définir le contrat d’une vente confirmée (commande, état payé/annulé, lignes, idempotence) et raccorder l’attribution côté serveur ou à une RPC qui vérifie le paiement; ne pas compter une commande simplement `pending`.
3. Si l’atomicité des highlights est exigée, examiner le schéma réel puis ajouter une RPC transactionnelle et une contrainte d’ordre adaptées.
4. Ajouter une purge planifiée d’assets réellement orphelins, après définition d’un garde-fou qui couvre toutes les tables référençant `media_assets`.
