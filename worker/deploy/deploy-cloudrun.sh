#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
: "${GCP_REGION:?Set GCP_REGION, e.g. europe-west1}"
: "${GCP_REPOSITORY:?Set GCP_REPOSITORY}"
: "${WORKER_SECRET:?Set WORKER_SECRET}"

IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${GCP_REPOSITORY}/baaro-media-worker:latest"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "[0/4] Preparing Google Cloud"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com --project "$GCP_PROJECT_ID" >/dev/null
gcloud artifacts repositories describe "$GCP_REPOSITORY" --location "$GCP_REGION" --project "$GCP_PROJECT_ID" >/dev/null 2>&1 || \
gcloud artifacts repositories create "$GCP_REPOSITORY" --repository-format=docker --location="$GCP_REGION" --project="$GCP_PROJECT_ID"

PROJECT_NUMBER="$(gcloud projects describe "$GCP_PROJECT_ID" --format="value(projectNumber)")"
RUNTIME_SA="${CLOUD_RUN_SERVICE_ACCOUNT:-${PROJECT_NUMBER}-compute@developer.gserviceaccount.com}"

for secret in baaro-worker-secret baaro-r2-account-id baaro-r2-access-key-id baaro-r2-secret-access-key baaro-r2-public-base-url baaro-openai-api-key; do
  gcloud secrets add-iam-policy-binding "$secret" --member="serviceAccount:${RUNTIME_SA}" --role="roles/secretmanager.secretAccessor" --project="$GCP_PROJECT_ID" >/dev/null 2>&1 || true
done

echo "[1/4] Building ${IMAGE}"
gcloud builds submit "$ROOT" --tag "$IMAGE"

echo "[2/4] Creating/updating secrets"
printf '%s' "$WORKER_SECRET" | gcloud secrets versions add baaro-worker-secret --data-file=- >/dev/null 2>&1 || \
printf '%s' "$WORKER_SECRET" | gcloud secrets create baaro-worker-secret --data-file=-

for pair in R2_ACCOUNT_ID:baaro-r2-account-id R2_ACCESS_KEY_ID:baaro-r2-access-key-id R2_SECRET_ACCESS_KEY:baaro-r2-secret-access-key R2_PUBLIC_BASE_URL:baaro-r2-public-base-url OPENAI_API_KEY:baaro-openai-api-key; do
  var="${pair%%:*}"; secret="${pair##*:}"
  value="${!var:-}"
  if [[ -n "$value" ]]; then
    printf '%s' "$value" | gcloud secrets versions add "$secret" --data-file=- >/dev/null 2>&1 || \
    printf '%s' "$value" | gcloud secrets create "$secret" --data-file=-
  fi
done

echo "[3/4] Deploying Cloud Run"
gcloud run deploy baaro-media-worker \
  --image "$IMAGE" \
  --region "$GCP_REGION" \
  --project "$GCP_PROJECT_ID" \
  --platform managed \
  --allow-unauthenticated \
  --concurrency 1 \
  --cpu 4 \
  --memory 8Gi \
  --timeout 3600 \
  --min-instances 0 \
  --max-instances 5 \
  --set-env-vars "BAARO_WORKER_PORT=8080,BAARO_WORKER_TMP_DIR=/tmp/baaro-worker,FFMPEG_BIN=ffmpeg,FFPROBE_BIN=ffprobe,WHISPER_BIN=whisper,WHISPER_MODEL=small,R2_BUCKET_NAME=${R2_BUCKET_NAME:-baaro-media},OPENAI_API_BASE=${OPENAI_API_BASE:-https://api.openai.com/v1},OPENAI_MODEL=${OPENAI_MODEL:-gpt-4o-mini}" \
  --set-secrets "R2_ACCOUNT_ID=baaro-r2-account-id:latest,R2_ACCESS_KEY_ID=baaro-r2-access-key-id:latest,R2_SECRET_ACCESS_KEY=baaro-r2-secret-access-key:latest,R2_PUBLIC_BASE_URL=baaro-r2-public-base-url:latest,BAARO_WORKER_SECRET=baaro-worker-secret:latest,OPENAI_API_KEY=baaro-openai-api-key:latest"

echo "[4/4] Worker URL"
gcloud run services describe baaro-media-worker --region "$GCP_REGION" --project "$GCP_PROJECT_ID" --format='value(status.url)'
