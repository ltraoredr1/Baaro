# Publication des mises à jour Android BAARO

BAARO utilise deux workflows distincts pour une seule chaîne de distribution APK. Le premier fabrique un APK prêt à valider sans le rendre disponible aux utilisateurs. Le second publie manuellement l’artefact validé comme GitHub Release; l’application BAARO détecte ensuite cette Release et propose son installation Android.

## 1. Construire l’APK

Dans GitHub, ouvrez **Actions → Build BAARO Android APK → Run workflow**. Choisissez l’incrément `patch`, `minor` ou `major`, puis lancez l’action depuis `main`.

Le workflow vérifie les secrets de build, signe l’APK avec le keystore officiel, vérifie la signature, exécute le contrôle Android/updater, calcule SHA-256 et prépare `manifest.json`. Ce workflow **ne crée ni tag ni GitHub Release**. Après réussite du build, il enregistre le nouveau numéro de version dans `package.json` et `package-lock.json`, puis téléverse l’APK, le manifeste et les métadonnées sous l’artefact `baaro-apk` (conservé 30 jours).

Notez le **Run ID** indiqué dans le résumé du workflow. L’artefact doit correspondre à un run réussi depuis `main`.

## 2. Publier pour les utilisateurs

Après validation de l’APK, ouvrez **Actions → Publier mise à jour BAARO → Run workflow**, toujours depuis `main`. Dans le champ `build_run_id`, saisissez le Run ID de l’étape de build validée.

Le workflow de publication récupère l’artefact de ce run et vérifie qu’il s’agit bien d’un build Android officiel réussi, que l’APK et le manifeste portent la même version, que l’URL vise l’asset GitHub attendu, que les empreintes SHA-256 concordent, que la signature APK est valide, que le commit de build appartient à `main`, qu’aucun tag identique n’existe déjà et que la version dépasse la dernière Release. En cas de divergence, il s’arrête sans publier.

Après ces contrôles, le workflow crée le tag `vX.Y.Z` et une GitHub Release avec les assets `manifest.json` et `baaro-vX.Y.Z.apk`. La Release devient la dernière version que l’application native peut détecter via l’API GitHub Releases.

## Responsabilités

- **Build BAARO Android APK** : produit un APK signé vérifiable et un artefact; ne le diffuse pas.
- **Publier mise à jour BAARO** : étape manuelle de diffusion après validation; publie les assets de Release lus par l’updater Android.

L’ancien mécanisme web ZIP a été retiré : son script de génération, son manifeste Vercel et ses copies archivées ne sont plus dans le dépôt. `public/manifest.json` à la racine est conservé : c’est le manifeste PWA, pas un manifeste de mise à jour Android.
