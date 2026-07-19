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

## Points importants avant un vrai lancement public

- **Ne jamais** committer vos clés dans le code ou sur GitHub — toujours
  via les variables d'environnement
- L'authentification est actuellement **anonyme** (un compte est créé
  silencieusement par navigateur) — pour de vrais comptes persistants
  (connexion par e-mail, changement d'appareil), il faudra activer
  l'authentification par e-mail/mot de passe de Supabase et ajouter un
  écran de connexion
- Il n'y a pas encore de vraies tables pour les publications, vidéos,
  abonnés ou messages (ils restent simulés en mémoire) — la même logique
  que pour le portefeuille peut leur être appliquée
- Le chiffrement des messages est actuellement symbolique (affiché), pas
  réellement implémenté cryptographiquement

