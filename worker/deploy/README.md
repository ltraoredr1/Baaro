# Déploiement du worker BAARO

Le worker est conçu pour rester hors de Vercel. Il reçoit uniquement le petit objet `job` de l'API BAARO, télécharge la source depuis R2, traite le média localement puis ré-envoie les résultats vers R2.

## Cloud Run

Pré-requis : Google Cloud SDK (`gcloud`), un projet GCP, Artifact Registry et Secret Manager activés.

```bash
export GCP_PROJECT_ID="votre-projet"
export GCP_REGION="europe-west1"
export GCP_REPOSITORY="baaro"
export WORKER_SECRET="un-secret-long-et-aleatoire"
export R2_ACCOUNT_ID="..."
export R2_ACCESS_KEY_ID="..."
export R2_SECRET_ACCESS_KEY="..."
export R2_PUBLIC_BASE_URL="https://..."
export OPENAI_API_KEY="..."
./deploy-cloudrun.sh
```

Le script construit l'image, crée/met à jour les secrets, déploie le service avec 4 CPU / 8 Go RAM, concurrence 1, timeout 1 h et autoscaling 0–5 instances.

## Vercel

Dans le projet Vercel, conserver les API existantes et ajouter seulement :

```text
BAARO_MEDIA_PROCESSOR_URL=https://URL_CLOUD_RUN/process
BAARO_WORKER_SECRET=<même valeur que WORKER_SECRET>
```

L'URL doit être celle retournée par le déploiement Cloud Run, suivie de `/process`.

## Gros fichiers

Le payload Vercel → worker ne contient pas la vidéo. Il contient la référence R2 (`payload.sourceKey`). Le worker télécharge le fichier vers `/tmp`, le traite avec FFmpeg/Whisper, puis écrit les sorties dans R2. Cela évite de faire transiter les gros fichiers par Vercel.

Le worker ne doit pas recevoir directement un upload vidéo du navigateur.
