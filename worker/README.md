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
npm run build:rust
npm start
```

Pour compiler localement, installer `build-essential`, `pkg-config`, `libavformat-dev` et FFmpeg. Le endpoint `POST /process` est protégé par `x-baaro-worker-secret`.

## Valider et mesurer Rust/C

Rust détecte la signature du fichier ; un shim C appelle `libavformat` pour vérifier que le conteneur est réellement ouvrable et qu'il contient un flux audio ou vidéo. Le worker échoue au démarrage si le binaire natif est absent, et refuse les fichiers inconnus, malformés ou non média avant FFmpeg. Le découpage WebVTT reste en JavaScript : les mesures précédentes ne justifiaient pas un chemin Rust séparé. Aucun crate Cargo ni paquet npm supplémentaire n'est utilisé ; le build C requiert les outils système et les headers libavformat.

```bash
cd worker
cargo fmt --check --manifest-path rust/baaro-media/Cargo.toml
cargo clippy --locked --manifest-path rust/baaro-media/Cargo.toml -- -D warnings
cargo test --locked --manifest-path rust/baaro-media/Cargo.toml
npm run build:rust
BAARO_MEDIA_BIN="$PWD/rust/baaro-media/target/release/baaro-media" npm run test:rust
```

`npm run test:rust` vérifie des fichiers WAV et MP4 vidéo réellement générés par le chemin C/libavformat, ainsi que le comportement fail-closed si le binaire est absent. Pour mesurer la latence du contrôle combiné sur la même architecture que le worker déployé :

```bash
BAARO_MEDIA_BIN="$PWD/rust/baaro-media/target/release/baaro-media" npm run bench:rust
```

Le rapport affiche la médiane, le p95, la moyenne et le débit du contrôle. C'est un microbenchmark local : une décision de performance doit aussi s'appuyer sur des mesures de Cloud Run avec la même image, la même région et une charge représentative. Le CI compile aussi les deux images Docker et vérifie le binaire natif dans chacune.

## Uploads vidéo volumineux

Le worker expose un multipart upload authentifié pour l'onglet Vidéos :
- `POST /upload/prepare`
- `POST /upload/sign-parts`
- `POST /upload/complete`
- `POST /upload/abort`

Le navigateur envoie directement les morceaux vers R2 avec des URLs présignées. Aucun fichier vidéo volumineux ne transite par Vercel.
