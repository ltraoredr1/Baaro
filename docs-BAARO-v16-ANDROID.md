# BAARO 2.0 v16 — Android / Capacitor

## Objectif

Cette version prépare une intégration Android réelle sans prétendre qu'un dossier `android/`
déjà compilé existe dans le dépôt.

## Commandes

```bash
npm install --package-lock-only --ignore-scripts
npm ci
npm run build
npx cap add android
npm run cap:sync:android
npm run check:android
```

## Push natif

Le plugin `@capacitor/push-notifications` est utilisé uniquement sur Android/iOS.
Le Web continue d'utiliser le mécanisme Web Push existant.

Le token natif doit être envoyé à une API authentifiée et associé au compte courant.
Ne jamais accepter un `user_id` arbitraire provenant du client.

## Nearby

Le plugin Nearby ne s'auto-autorise plus.

Flux :

1. découverte ;
2. demande de connexion ;
3. événement `connectionRequested` ;
4. vérification/consentement ;
5. `acceptNearbyConnection()` ou `rejectNearbyConnection()` ;
6. échange de messages.

Le contenu reçu de Nearby doit rester non fiable tant qu'il n'est pas authentifié au niveau applicatif.

## Permissions

Sur Android moderne, les permissions Bluetooth Nearby doivent être demandées au moment où
la fonctionnalité est activée. Ne pas demander les permissions Nearby au démarrage général
de BAARO.

La permission de localisation ne doit être conservée que si elle est réellement nécessaire
pour les versions Android ciblées et les fonctionnalités utilisées.

## Play Store

Avant publication :

- générer l'application Android avec Capacitor ;
- vérifier `applicationId` et signature ;
- configurer la politique de confidentialité ;
- déclarer les permissions réellement utilisées ;
- vérifier notifications, caméra, micro et stockage ;
- tester Android 12+ et Android 14+ ;
- tester le retour après mise en veille ;
- tester absence de réseau ;
- tester liens profonds ;
- tester notifications depuis application tuée ;
- supprimer toute permission non utilisée.
