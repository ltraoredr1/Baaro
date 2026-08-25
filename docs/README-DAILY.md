# Intégration Daily.co — BAARO Live

## 1. Compte Daily.co
1. [dashboard.daily.co](https://dashboard.daily.co) → créer un compte (aucune carte requise)
2. Récupérer la clé API dans **Developers**
3. Noter votre sous-domaine (ex: `baaro.daily.co`)

## 2. Variables d'environnement (Vercel + `.env.local`)
```
DAILY_API_KEY=xxxxx        # secrète, jamais préfixée VITE_
DAILY_DOMAIN=baaro          # votre sous-domaine Daily
```

## 3. Dépendance
```
npm install @daily-co/daily-js
```

## 4. Fichiers à copier dans votre projet
- `api/create-room.js` → remplace/complète votre dossier `api/`
- `src/lib/webrtc.js` → **remplace** l'ancien fichier (diffusion pair-à-pair)

## 5. Changements dans `src/App.jsx` (composants `DebatesTab` / `DebateRoom`)
L'ancienne logique de connexion pair-à-pair manuelle est remplacée par les
fonctions exportées de `src/lib/webrtc.js` :
- `startLive({ userName })` — l'hôte démarre un live
- `joinLive({ roomName, userName })` — un spectateur rejoint
- `subscribeToEvents({...})` — écoute des participants/flux
- `leaveLive({ roomName, isHost })` — quitte proprement

Le chat, la présence, les cœurs restent inchangés (toujours Supabase Realtime,
comme avant) — seul le flux audio/vidéo passe maintenant par Daily.

## 6. Ce qui NE change pas
- Code d'invitation à 8 caractères, vérifié côté serveur : inchangé
- `debate_messages`, `debate_participants` (Supabase) : inchangés
- Bouton IA co-animatrice (`/api/chat`) : inchangé

## 7. Limite gratuite
10 000 minutes/mois cumulées (tous participants). Au-delà : facturation à la
minute, dégressive avec le volume. Suivez votre usage dans le dashboard Daily.

## 8. Mode HLS (façon TikTok, optionnel — pour plus tard)
Désactivé par défaut. À activer seulement si vos lives dépassent régulièrement
une vingtaine de spectateurs simultanés.

**Prérequis avant activation :**
- Un bucket S3-compatible (AWS S3 ou Cloudflare R2, moins cher)
- Variables d'environnement supplémentaires :
```
DAILY_S3_BUCKET=xxxxx
DAILY_S3_REGION=xxxxx
DAILY_S3_ACCESS_KEY=xxxxx
DAILY_S3_SECRET_KEY=xxxxx
```

**Différences à connaître :**
- Délai de 12 à 20 secondes pour les spectateurs (contre quasi temps réel en WebRTC)
- Coût de stockage S3 en plus du plan Daily
- Scalable à des milliers de spectateurs (contrairement au WebRTC en étoile)

**Utilisation** : `startLive({ userName, enableHLS: true })`, puis
`startHLSBroadcast()` une fois le live démarré. `stopHLSBroadcast()` pour
revenir en WebRTC classique.

⚠️ Vérifiez les noms exacts des paramètres `hls_config` dans la
[documentation Daily à jour](https://docs.daily.co/guides/products/live-streaming-recording/hls)
avant activation en production — cette partie de l'API évolue.

## 8. Test
```
npm run dev
```
Démarrez un live avec un compte, rejoignez avec un second navigateur/appareil
pour vérifier la connexion audio/vidéo.
