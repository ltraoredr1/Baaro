# Import natif des contacts (Android / iOS)

Complète `PATCH-CommunityTab.md`. Le web (Contact Picker) fonctionnait déjà ;
ceci ajoute l'import massif du répertoire dans la vraie app installée.

## 1. Installer le plugin

```
npm install @capacitor-community/contacts
```

**Point d'attention** : ce plugin publie officiellement jusqu'à Capacitor 5.x
(votre projet est en Capacitor 6.1.2). Dans la pratique l'API native n'a pas
changé entre ces versions et il tourne généralement sans modification sur
Capacitor 6 — mais si `npm install` refuse à cause d'un conflit de
peer-dependency, relancez avec :

```
npm install @capacitor-community/contacts --legacy-peer-deps
```

Si malgré tout vous rencontrez un bug bloquant propre à Capacitor 6, l'
alternative est `@capacitor/contacts` (plugin officiel Ionic, plus récent,
API différente : `Contacts.find(...)` / `Contacts.pickContact()`) — mais il
vise Capacitor 7+, donc à réserver pour votre prochaine montée de version
globale de Capacitor plutôt qu'à mélanger avec le reste du projet en 6.x.

## 2. package.json

Ajoutez la ligne suivante dans `"dependencies"` (ordre alphabétique comme le
reste du fichier) :

```diff
   "dependencies": {
     "@capacitor/core": "^6.1.2",
+    "@capacitor-community/contacts": "^5.0.0",
     "@capacitor/push-notifications": "^6.0.5",
```

## 3. Android — permission

Dans `android/app/src/main/AndroidManifest.xml`, ajoutez avant `<application>`
(même emplacement que les permissions Bluetooth du mode Hors-ligne) :

```xml
<uses-permission android:name="android.permission.READ_CONTACTS" />
```

Rien d'autre à faire côté Android : Capacitor 6 fait l'auto-linking des
plugins npm, contrairement au plugin `nearby` fait maison qui, lui, doit être
enregistré à la main dans `MainActivity`.

## 4. iOS — description d'usage

Dans `ios/App/App/Info.plist`, ajoutez :

```xml
<key>NSContactsUsageDescription</key>
<string>BAARO a besoin d'accéder à vos contacts pour vous montrer lesquels sont déjà sur BAARO.</string>
```

Sans cette clé, l'app plante au premier accès aux contacts sur iOS.

## 5. Régénérer et tester

```
npm run cap:sync
npm run cap:android   # ou npm run cap:ios (Mac uniquement)
```

Testez sur un appareil physique (l'émulateur a rarement un vrai répertoire de
contacts) : ouvrez Communauté → Contacts → "Importer mes contacts du
téléphone". Sur l'app native, ça lit tout le répertoire directement (avec
demande de permission au premier lancement) ; sur le web, ça reste le
sélecteur Chrome Android existant. Aucun changement de comportement sur
desktop/iOS web — le hook (`useContacts.js`) détecte l'environnement tout
seul via `Capacitor.isNativePlatform()`.
