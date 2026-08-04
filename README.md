# BAARO

Réseau social mondial avec portefeuille de points, crypto interne (BARO Coin),
messagerie, abonnements et assistant IA intégré. Les données (points,
transactions, avoirs crypto) sont stockées dans une vraie base de données
Postgres via Supabase, avec un compte anonyme créé automatiquement pour
chaque visiteur.

## Structure

- `src/App.jsx` — l'application complète (React + Tailwind)
- `src/supabaseClient.js` — connexion à la base de données Supabase
- `supabase-schema.sql` — schéma des tables à créer dans Supabase
- `api/chat.js` — fonction serverless qui relaie les appels à l'API Claude
  en gardant la clé secrète côté serveur (jamais exposée au navigateur)

## 1. Créer le projet Supabase (base de données)

1. Allez sur https://supabase.com et créez un compte gratuit
2. Créez un nouveau projet (choisissez une région proche de vos utilisateurs)
3. Dans l'onglet **SQL Editor**, collez le contenu de `supabase-schema.sql`
   et exécutez-le — ça crée les tables `wallets`, `transactions` et
   `crypto_holdings`, avec la sécurité activée (chaque utilisateur ne voit
   que ses propres données)
4. Dans **Authentication > Providers**, activez le fournisseur **Anonymous**
   (permet à chaque visiteur d'avoir un compte sans inscription — vous
   pourrez ajouter une vraie inscription par e-mail plus tard)
5. Dans **Project Settings > API**, notez votre `Project URL` et votre
   clé `anon public`

## 2. Configurer les variables d'environnement

Copiez `.env.example` en `.env.local` et remplissez avec vos valeurs
Supabase (voir étape 1) et votre clé API Anthropic.

Ajoutez aussi `SUPABASE_SERVICE_ROLE_KEY` (Project Settings > API >
`service_role` — gardez-la secrète, jamais préfixée `VITE_`) : elle est
utilisée par `/api/wallet` et `/api/register-device` pour écrire dans la
base sans passer par le navigateur (voir "Sécurité du portefeuille"
plus bas).

## 2bis. Exécuter le correctif de sécurité SQL

Dans le **SQL Editor** de Supabase, collez et exécutez le contenu de
`supabase-security-fix.sql` (après `supabase-schema.sql`). Ce script :
- retire au navigateur le droit d'écrire directement dans `wallets`,
  `transactions` et `crypto_holdings` (lecture seule pour le client) ;
- ajoute la colonne `profiles.restricted` et la table `device_accounts`,
  utilisées par la protection anti faux-comptes ci-dessous.

Sans ce script, le portefeuille reste vulnérable même avec le nouveau code.

## 3. Installer les dépendances

```bash
npm install
```

## 4. Tester en local

```bash
npm run dev
```

Ouvre `http://localhost:5173`. Le portefeuille se connecte à votre vraie
base Supabase dès le premier chargement.

## 5. Créer un dépôt Git et pousser sur GitHub

```bash
git init
git add .
git commit -m "BAARO - premier commit"
```

## 6. Déployer sur Vercel

1. Allez sur https://vercel.com, connectez GitHub, importez le dépôt
2. Vercel détecte Vite automatiquement
3. Ajoutez ces variables d'environnement dans les réglages du projet Vercel :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (secrète — voir étape 2)
   - `VITE_TURNSTILE_SITE_KEY` (voir section CAPTCHA plus bas)
4. Cliquez sur "Deploy"

Votre site est en ligne, avec une vraie base de données partagée entre
tous les visiteurs et tous les appareils.

## Application installable (PWA)

BAARO est configuré comme Progressive Web App : une fois déployé en HTTPS
(automatique sur Vercel), les visiteurs peuvent l'installer comme une vraie
application, sans passer par l'App Store ou le Play Store :

- **Sur Android (Chrome)** : un bandeau "Installer BAARO" apparaît, ou via
  le menu ⋮ > "Ajouter à l'écran d'accueil"
- **Sur iPhone (Safari)** : bouton Partager > "Sur l'écran d'accueil"
- **Sur ordinateur (Chrome/Edge)** : icône d'installation dans la barre
  d'adresse

L'application s'ouvre alors en plein écran, avec sa propre icône, sans
barre de navigateur — comme une app native. Un mode hors-ligne basique
est aussi actif pour la coquille de l'application (le contenu dynamique
nécessite toujours une connexion).

Pour une vraie présence sur l'App Store / Play Store (fichier `.ipa` ou
`.apk` classique), il faudrait envelopper cette PWA avec un outil comme
Capacitor ou React Native — une étape supplémentaire, à faire si vous
visez une distribution via les stores plutôt que le web installable.

## Version hybride (vraie app Android / iOS)

En plus du web installable (PWA), le projet est configuré avec **Capacitor**,
qui enveloppe ce même code React dans une coquille native — pour produire
un vrai fichier `.apk` (Android) et un projet Xcode (`.ipa`, iOS). Un seul
code source pour le web, Android et iOS.

**Prérequis** (à faire une fois BAARO déjà déployé sur Vercel) :

1. Dans `.env.local`, ajoutez :
   ```
   VITE_API_BASE_URL=https://votre-site.vercel.app
   ```
   (obligatoire : la version native n'a pas de backend local, elle doit
   appeler votre site déjà en ligne pour l'assistant IA)

2. Installez les outils natifs :
   - **Pour Android** : [Android Studio](https://developer.android.com/studio) (gratuit, Windows/Mac/Linux)
   - **Pour iOS** : Xcode (nécessite un Mac)

**Générer le projet Android :**

```bash
npm install
npm run cap:add:android
npm run cap:sync
npm run cap:android
```

La dernière commande ouvre Android Studio. De là : **Build > Generate Signed
App Bundle / APK** pour obtenir votre `.apk` installable, ou publiable sur
le Google Play Store.

**Générer le projet iOS (sur Mac uniquement) :**

```bash
npm install
npm run cap:add:ios
npm run cap:sync
npm run cap:ios
```

Ouvre Xcode, où vous pourrez lancer sur un iPhone connecté ou préparer un
envoi vers l'App Store.

**À chaque modification du code**, relancez `npm run cap:sync` pour que
l'app native reprenne la dernière version avant de rebuilder.

## Communication hors-ligne (Bluetooth / Wi-Fi, sans Internet)

Un onglet "Hors-ligne" permet d'échanger des messages avec des téléphones
BAARO proches, via Bluetooth et Wi-Fi (API Google Nearby Connections) —
sans Internet ni forfait data. **Uniquement disponible dans la version
Android installée**, jamais sur le site web (limite imposée par les
navigateurs, voir plus haut dans nos échanges).

Le code du plugin natif est prêt dans `native-plugins/nearby/`, mais il faut
l'intégrer manuellement au projet Android après l'avoir généré :

**1. Générer le projet Android** (si pas déjà fait)
```bash
npm run cap:add:android
```

**2. Copier le plugin natif**

Copiez le dossier `native-plugins/nearby/android/src/main/java/com/baaro/nearby`
vers `android/app/src/main/java/com/baaro/nearby` dans votre projet.

**3. Ajouter la dépendance Nearby Connections**

Dans `android/app/build.gradle`, ajoutez dans le bloc `dependencies` :
```gradle
implementation 'com.google.android.gms:play-services-nearby:19.3.0'
```

**4. Ajouter les permissions**

Dans `android/app/src/main/AndroidManifest.xml`, ajoutez avant `<application>` :
```xml
<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.CHANGE_WIFI_STATE" />
```

**5. Enregistrer le plugin**

Dans `android/app/src/main/java/.../MainActivity.java` (ou `.kt`), ajoutez
avant `super.onCreate` :
```java
registerPlugin(com.baaro.nearby.NearbyChatPlugin.class);
```

**6. Rebuilder**
```bash
npm run cap:sync
npm run cap:android
```

Depuis Android Studio, lancez l'app sur deux téléphones physiques proches
(l'émulateur ne peut pas simuler le Bluetooth) pour tester l'échange de
messages.

## Upload de photos/vidéos (Supabase Storage)

Depuis cette mise à jour, on peut vraiment ajouter une photo ou une vidéo à
une publication. Il faut créer le "bucket" de stockage une seule fois :

1. Dans Supabase, menu ☰ → **Storage**
2. Cliquez **"New bucket"**
3. Nom exact : `media`
4. Activez **"Public bucket"** (pour que les photos/vidéos soient affichables sans configuration supplémentaire)
5. Créez le bucket

**Ajoutez ensuite ces règles d'accès** (SQL Editor, nouvelle requête) :
```sql
create policy "media_public_read" on storage.objects for select using (bucket_id = 'media');
create policy "media_auth_upload" on storage.objects for insert with check (bucket_id = 'media' and auth.role() = 'authenticated');
```

N'oubliez pas non plus d'exécuter `supabase-add-media.sql` (ajoute les colonnes nécessaires à la table `posts`).

## Sécurité du portefeuille (correctif)

Auparavant, le solde de points et les avoirs BARO étaient calculés dans le
navigateur puis écrits directement dans Supabase. La règle de sécurité en
base ne vérifiait que "l'utilisateur modifie sa propre ligne" — pas que le
montant écrit était légitime. N'importe qui pouvait donc, depuis la console
du navigateur, s'attribuer un solde arbitraire.

Ce n'est plus possible : `wallets`, `transactions` et `crypto_holdings` sont
désormais **lecture seule** pour le navigateur (voir
`supabase-security-fix.sql`). Toute écriture passe par deux fonctions
serveur qui recalculent tout elles-mêmes, sans jamais faire confiance à un
montant envoyé par le client :
- `api/wallet.js` — gains (montants fixes par action), rachats de
  récompenses (coûts fixes, vérifiés en base), conversion en BARO (taux
  fixe recalculé serveur) ;
- ces fonctions utilisent `SUPABASE_SERVICE_ROLE_KEY`, qui contourne les
  règles RLS — d'où l'importance de ne jamais l'exposer côté client.

## Protection contre les faux comptes

Trois mécanismes complémentaires, tous appliqués côté serveur :

**1. Vérification humaine à l'entrée (CAPTCHA)**
Avant la création d'un compte anonyme, l'app affiche un défi
[Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) —
gratuit, sans les puzzles à images du CAPTCHA classique. Pour l'activer :
1. Créez un site sur le [dashboard Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile),
   récupérez la **clé de site** (publique) et la **clé secrète**.
2. Mettez la clé de site dans `VITE_TURNSTILE_SITE_KEY` (`.env.local` et Vercel).
3. Dans Supabase, **Authentication > Settings > Bot and Abuse Protection**,
   activez la protection CAPTCHA, choisissez Turnstile et collez la clé
   secrète. Supabase vérifie alors le jeton côté serveur avant de créer
   le compte anonyme — le client ne peut pas contourner cette étape.

Sans clé configurée, l'app ne bloque pas le développement local (mode
`dev-bypass`) — pensez à configurer les clés avant un vrai lancement.

**2. Limite de comptes par appareil**
Chaque appareil génère un identifiant persistant (stocké localement, pas
lié à l'identité de la personne). À chaque connexion, `/api/register-device`
compte combien de comptes ont déjà été créés depuis cet appareil. Au-delà
de 3 (réglable dans `api/register-device.js`), les comptes suivants sont
marqués `restricted` : ils gardent un accès normal à l'app, mais perdent
l'accès aux rachats à valeur réelle. Un utilisateur qui vide son stockage
local contourne ce signal — c'est un frein contre la fraude opportuniste
(multi-compte pour cumuler des points de bienvenue), pas un verrou absolu.

**3. Plafond de gains quotidien + délai avant encaissement**
`api/wallet.js` limite les gains à 100 points par compte et par jour
(réglable via `DAILY_EARN_CAP`), et bloque les rachats à valeur réelle
(carte cadeau, virement, conversion BARO) pour tout compte créé depuis
moins de 3 jours (`MIN_ACCOUNT_AGE_MS_FOR_CASHOUT`). Les récompenses sans
valeur monétaire (badge, boost de visibilité) restent accessibles
immédiatement. Ça rend le farming automatisé (créer un compte, le vider
en points, encaisser, recommencer) beaucoup plus coûteux à grande échelle.

Ces trois protections se renforcent mutuellement mais n'éliminent pas
totalement la fraude déterminée (VPN + appareils multiples + comptes
vieillis) — pour aller plus loin, il faudrait ajouter une vraie
vérification d'identité (e-mail confirmé, téléphone) avant tout rachat
au-delà d'un certain montant.

## Messagerie chiffrée de bout en bout

Depuis cette mise à jour, la messagerie n'est plus simulée : les
conversations viennent de la table `messages` (déjà présente dans
`supabase-schema.sql`), et les messages sont réellement chiffrés de bout
en bout — le serveur ne stocke jamais le texte en clair.

**Comment ça marche** (voir `src/lib/crypto.js` et
`src/hooks/useMessaging.js`) :
- À la première connexion sur un appareil, une paire de clés RSA-OAEP
  est générée dans le navigateur. La clé **publique** est enregistrée
  dans `profiles.public_key` (un annuaire, comme un numéro de téléphone).
  La clé **privée** ne quitte jamais l'appareil (stockée en local).
- Pour chaque message, une clé AES-GCM à usage unique chiffre le texte ;
  cette clé AES est elle-même chiffrée avec la clé publique du
  destinataire (et celle de l'expéditeur, pour qu'il puisse relire ses
  propres envois).
- Les contacts affichés sont vos abonnés/abonnements réels, plus toute
  personne avec qui vous avez déjà échangé.

**À exécuter avant de redéployer** : le contenu de
`supabase-add-e2e-encryption.sql` dans le SQL Editor de Supabase (ajoute
`profiles.public_key` et les colonnes chiffrées de `messages`).

**Limite assumée** : la clé privée vit dans le navigateur qui l'a créée —
changer d'appareil ou vider le stockage local fait perdre l'accès aux
anciens messages, comme sur la plupart des messageries chiffrées de bout
en bout (à la différence, par exemple, d'un simple export vers un
serveur "au cas où", qui casserait le chiffrement).

## Live (façon TikTok LIVE, texte/vocal/vidéo, avec IA)

Un onglet **Live** (menu "Plus") permet de démarrer ou rejoindre des
lives, avec trois formats au choix — écrit seul, vocal (micro), ou
vidéo (caméra + micro) — et la possibilité d'inviter l'assistant IA
comme co-animatrice.

**Modèle diffuseur → spectateur·ices, comme TikTok LIVE** : une seule
personne (l'hôte, celle qui a créé le live) diffuse sa caméra/son micro ;
tout le monde d'autre regarde, commente en direct et peut envoyer des
cœurs. Ce n'est pas un débat à plusieurs caméras où chacun·e voit tout
le monde — si vous voulez ça, gardez l'ancien mode mesh en tête comme
alternative possible.

**Comment ça marche** (tout est dans `src/App.jsx` : composants
`DebatesTab` et `DebateRoom`, voir aussi `src/hooks/useDebates.js` et
`src/lib/webrtc.js`) :
- Chaque live a un code d'invitation à 8 caractères, à partager pour
  que d'autres personnes le rejoignent — vérifié côté serveur (voir plus
  bas), pas juste caché côté client.
- Le chat de groupe est en direct via Supabase Realtime (table
  `debate_messages`).
- L'audio/vidéo de l'hôte passent en **direct entre les appareils**
  (WebRTC, diffusion **en étoile** : l'hôte se connecte à chaque
  spectateur·ice, les spectateur·ices ne se connectent qu'à l'hôte,
  jamais entre eux) — rien ne transite par le serveur BAARO. Seuls les
  messages techniques d'établissement de connexion passent par Supabase
  Realtime, sans être stockés.
- Le nombre de spectateur·ices affiché en direct vient de la "Presence"
  Supabase Realtime (qui est connecté·e *maintenant*), pas d'un comptage
  en base qui serait vite périmé.
- Les cœurs envoyés par les spectateur·ices sont diffusés en direct à
  tout le monde et rejoués à l'écran (animation flottante) — comme sur
  TikTok, ils ne sont jamais stockés en base.
- Le bouton IA (réservé à l'hôte) envoie les derniers échanges du live à
  l'assistant (même relais serveur `/api/chat` que l'onglet Assistant),
  et publie sa réponse comme un message du salon, visible de tous.
- Si l'hôte termine le live ou se déconnecte, les spectateur·ices le
  voient immédiatement et reviennent à la liste.

**À exécuter avant de redéployer** : le contenu de
`supabase-add-debates.sql` **puis** de `supabase-fix-debates-security.sql`
dans le SQL Editor de Supabase (ce second script corrige une faille où
le code d'invitation était en réalité lisible par n'importe quel compte
connecté), puis activer le Realtime sur les tables `debate_messages` et
`debate_participants` si ce n'est pas déjà fait par le premier script
(Database > Replication).

**Limites assumées, à connaître avant un vrai lancement** :
- Contrairement à la messagerie privée, les messages écrits des lives
  **ne sont pas chiffrés de bout en bout** (le chiffrement pour un
  groupe demande un système de clés partagées plus complexe, non inclus
  ici).
- La diffusion WebRTC en étoile encaisse bien jusqu'à une vingtaine de
  spectateur·ices simultané·es environ sur des réseaux courants — au-delà,
  ça dépend surtout du débit montant de l'hôte, puisque son appareil
  envoie son flux une fois par spectateur·ice. Sans serveur TURN, la
  connexion peut aussi échouer sur certains réseaux restrictifs (NAT
  symétrique, certains Wi-Fi d'entreprise) — voir `VITE_TURN_URL` dans
  `.env.example` pour brancher un serveur TURN (Metered.ca, Twilio,
  Cloudflare Calls...) et fiabiliser sans changer le reste du code.
- Pour un vrai passage à l'échelle (des centaines/milliers de
  spectateur·ices, comme un vrai TikTok LIVE), il faudrait remplacer ce
  module par un service pro à serveur média central (SFU) comme LiveKit,
  Agora ou Daily.co, qui gère la diffusion à un CDN plutôt qu'en
  pair-à-pair — cela nécessite de créer un compte et des clés API chez ce
  fournisseur ; la logique de salon, de chat et d'IA resterait identique,
  seul `src/lib/webrtc.js` serait à substituer.

## Organisation du code

`src/App.jsx` reste le corps de l'application (composants d'écran), mais
la logique de données a été extraite pour rester plus facile à
maintenir :
- `src/theme.js` — palette de couleurs partagée
- `src/hooks/dataHooks.js` — session, portefeuille, publications, vidéos,
  abonnés, gouvernance (tout ce qui lit/écrit Supabase hors messagerie)
- `src/hooks/useMessaging.js` — contacts, conversations, envoi/réception
- `src/lib/crypto.js` — chiffrement de bout en bout
- `src/hooks/useDebates.js`, `src/lib/webrtc.js` — logique de données et
  diffusion du Live (les composants d'écran `DebatesTab`/`DebateRoom`
  vivent, eux, directement dans `src/App.jsx`)

## Garde-fou de sécurité

Avant tout déploiement public, lancez :

```bash
npm run check:security
```

Ce script se connecte avec la clé **publique** (la même qu'un visiteur)
et tente une écriture interdite dans le portefeuille. S'il affiche un ❌,
c'est que `supabase-security-fix.sql` n'a pas (ou plus) été appliqué sur
votre projet Supabase — à corriger avant de lancer l'app publiquement.

## Points importants avant un vrai lancement public

- **Ne jamais** committer vos clés dans le code ou sur GitHub — toujours
  via les variables d'environnement. `SUPABASE_SERVICE_ROLE_KEY` en
  particulier ne doit jamais être préfixée `VITE_` ni finir dans le bundle
  envoyé au navigateur
- Exécutez bien `supabase-security-fix.sql`, `supabase-add-e2e-encryption.sql`
  **et**, si vous utilisez les Lives, `supabase-fix-debates-security.sql`
  avant tout lancement public, puis vérifiez avec `npm run check:security`
  (voir sections ci-dessus)
- L'authentification est actuellement **anonyme** (un compte est créé
  silencieusement par navigateur) — pour de vrais comptes persistants
  (connexion par e-mail, changement d'appareil), il faudra activer
  l'authentification par e-mail/mot de passe de Supabase et ajouter un
  écran de connexion
- Publications, vidéos, abonnés, votes et messages sont maintenant de
  vraies données Supabase (plus de simulation en mémoire)
- Le chiffrement des messages est maintenant réellement implémenté
  (RSA-OAEP + AES-GCM, voir "Messagerie chiffrée de bout en bout"
  ci-dessus) — mais la conversion de points en argent réel (carte
  cadeau, virement, BARO Coin) touche à des sujets réglementés
  (paiement, parfois émission de monnaie électronique ou de crypto-actif
  selon les pays) qui dépassent le code : à faire valider par un
  juriste avant un vrai lancement commercial



# Intégration — Live multi-hôtes (Daily.co) + Cadeaux

## Fichiers fournis (remplacent entièrement les précédents)

| Fichier fourni | Remplace |
|---|---|
| `api-create-room.js` | `api/create-room.js` |
| `api-live-roles.js` | nouveau : `api/live-roles.js` |
| `api-gifts.js` | nouveau : `api/gifts.js` |
| `webrtc.js` | `src/lib/webrtc.js` |
| `liveRoles.js` | nouveau : `src/lib/liveRoles.js` |
| `gifts.js` | nouveau : `src/lib/gifts.js` |
| `supabase-add-multihost-gifts.sql` | nouveau, à exécuter après tes scripts existants |

## Ordre d'exécution

1. **SQL** d'abord (`supabase-add-multihost-gifts.sql`), après tes scripts
   existants (`supabase-add-debates.sql`, `supabase-fix-debates-security.sql`).
   Active le Realtime sur `gifts_sent` et `debate_participants` si pas déjà
   fait (Database > Replication).
2. Remplace les 4 fichiers JS ci-dessus.
3. Ajoute les 2 nouveaux fichiers `api/live-roles.js` et `api/gifts.js`,
   `src/lib/liveRoles.js` et `src/lib/gifts.js`.
4. Adapte `DebateRoom.jsx` (voir plus bas — je n'ai pas encore ce fichier
   en entier).

## Correction de sécurité importante

Avant ces fichiers, `hostId` était envoyé tel quel par le client à
`/api/create-room` et jamais vérifié — n'importe qui pouvait se déclarer
hôte d'un live. Corrigé : `host_id` vient désormais uniquement du token
d'authentification Supabase (`requireUser`). Ça veut dire que les appels à
`/api/create-room`, `/api/gifts` et `/api/live-roles` doivent maintenant
tous porter un en-tête `Authorization: Bearer <token>` — c'est fait dans
les fichiers fournis via `authHeaders()` (qui lit
`supabase.auth.getSession()`), mais si tu as d'autres endroits dans le code
qui appellent ces routes directement, il faudra faire pareil.

## Ce qui manque encore côté toi pour finaliser

Je n'ai pas le contenu complet de :

- **`DebateRoom.jsx`** — au-delà du chat, je ne sais pas si tu affiches déjà
  des `<video>` pour les flux distants (host/co-hôtes). Si non, il faut
  ajouter un rendu qui boucle sur `getParticipants()` et attache chaque
  `track` vidéo/audio à un élément `<video>`/`<audio>`, avec une grille
  qui grossit selon le nombre de diffuseurs actifs.
- **`CreateDebateModal.jsx`** — pour vérifier qu'il appelle bien
  `startLive()` de `webrtc.js` (et pas un autre chemin de création).
- **`supabase-add-debates.sql`** — pour confirmer qu'aucune policy
  existante n'entre en conflit avec celle que j'ajoute sur
  `debate_participants` (mise à jour du rôle).
- Structure exacte de **`debate_messages`** : `useRoomChat` (dans
  `useDebates.js`) utilise les colonnes `sender_id`/`sender_type`/`text`,
  alors que `DebateRoom.jsx` insère `user_id`/`text` sans `sender_type`.
  Si `debate_messages` a une contrainte NOT NULL sur `sender_type`, les
  inserts de `DebateRoom.jsx` échouent silencieusement ou plantent — à
  vérifier. Ça suggère aussi que `useDebates.js` (le hook complet) n'est
  peut-être plus utilisé du tout par l'UI réelle (`DebatesTab`/`DebateRoom`
  ont leur propre logique inline) — vaut le coup de vérifier s'il est mort
  et à supprimer, pour ne pas maintenir deux implémentations qui divergent.

## UI à ajouter dans DebateRoom (une fois le fichier complet en main)

- Bouton "Inviter en direct" (visible si `isHost`) → liste des spectateurs
  connectés (`getParticipants()`, filtrés sur ceux sans track vidéo/audio
  actif) → `promoteToCoHost({ roomId, dailyRoomName, targetUserId })`
- Bouton "Retirer" sur chaque vignette co-hôte (visible si `isHost`) →
  `demoteToViewer(...)`
- Écoute `subscribeRoles(roomId, ...)` : si le rôle reçu me concerne et
  vaut `co_host`, appeler `upgradeLocalRole('co_host')` puis proposer
  d'activer micro/caméra (`enableMic(true)`, `enableCamera(true)` —
  fonctionnera réellement maintenant, Daily aura reçu la permission)
- Palette de cadeaux (`fetchGiftCatalog`) + bouton d'envoi (`sendGift`) +
  animation (`subscribeGifts`)

Dis-moi quand tu as `DebateRoom.jsx` en entier et `CreateDebateModal.jsx`,
je te fais le patch complet du composant plutôt que de te laisser
l'assembler à la main.
