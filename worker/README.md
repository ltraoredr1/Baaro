# BAARO Media Worker

Worker externe pour les traitements lourds. **Aucun endpoint `api/` n'est remplacé.**

## Pipeline

`Vercel /api/video-engine` → `media_jobs` → `worker/server.mjs` → FFmpeg/Whisper/IA → R2 → Supabase.

Le worker accepte les jobs `transcode`, `thumbnail`, `captions`, `translate`, `dub`, `moderate`, `features`, `highlights` et `edit_plan`.

## Gros fichiers

Les sources R2 sont téléchargées vers un fichier temporaire sur disque (`BAARO_WORKER_TMP_DIR`) puis traitées en streaming par FFmpeg. Les sorties sont envoyées vers R2 au fur et à mesure. Cela évite de charger une vidéo entière en RAM.

Pour les très gros fichiers, le worker doit être déployé sur une machine/disque ayant assez d'espace temporaire. Le navigateur reste responsable de l'upload vers R2 via les API BAARO existantes.

## Variables

Voir `.env.example` à la racine. Les variables principales sont `R2_*`, `BAARO_WORKER_SECRET`, `BAARO_WORKER_PORT`, `BAARO_WORKER_TMP_DIR`, `FFMPEG_BIN`, `FFPROBE_BIN`, `WHISPER_BIN`, `OPENAI_API_KEY`, `OPENAI_API_BASE` et `OPENAI_MODEL`.

## Lancer

```bash
cd worker
npm install
npm start
```

Le endpoint `POST /process` est protégé par `x-baaro-worker-secret`.

## Uploads vidéo volumineux

Le worker expose un multipart upload authentifié pour l'onglet Vidéos :
- `POST /upload/prepare`
- `POST /upload/sign-parts`
- `POST /upload/complete`
- `POST /upload/abort`

Le navigateur envoie directement les morceaux vers R2 avec des URLs présignées. Aucun fichier vidéo volumineux ne transite par Vercel.
