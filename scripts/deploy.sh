#!/usr/bin/env bash
set -euo pipefail

# Universal deploy script for Clipora services.
#
# Usage:
#   ./scripts/deploy.sh api          # deploy API service
#   ./scripts/deploy.sh processor    # deploy video processor
#   ./scripts/deploy.sh web          # deploy frontend
#   ./scripts/deploy.sh all          # deploy everything
#
# Prerequisites:
#   - gcloud CLI authenticated (gcloud auth login)
#   - Docker running locally (only needed for frontend)
#
# Environment overrides:
#   GCP_PROJECT_ID   (default: clipora-487805)
#   GCP_REGION       (default: us-east1)

PROJECT_ID="${GCP_PROJECT_ID:-clipora-487805}"
REGION="${GCP_REGION:-us-east1}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

deploy_api() {
  echo "=== Deploying API Service (source deploy) ==="
  gcloud run deploy clipora-api \
    --source "${REPO_ROOT}/backend/api-service" \
    --region "$REGION" \
    --project "$PROJECT_ID" \
    --quiet
  echo "=== API Service deployed ==="
}

deploy_processor() {
  echo "=== Deploying Video Processor (source deploy) ==="
  gcloud run deploy clipora-video-processor \
    --source "${REPO_ROOT}/backend/video-processor" \
    --region "$REGION" \
    --project "$PROJECT_ID" \
    --no-allow-unauthenticated \
    --quiet
  echo "=== Video Processor deployed ==="
}

deploy_web() {
  echo "=== Deploying Frontend ==="

  local FRONTEND_DIR="${REPO_ROOT}/PlayO Prototyping Studio UI"
  local AR_IMAGE="us-east1-docker.pkg.dev/${PROJECT_ID}/clipora/web:latest"

  # Read build args from Secret Manager (fallback to env vars)
  local VITE_API_URL="${VITE_API_URL:-https://clipora-api-594534640965.us-east1.run.app}"
  local VITE_API_KEY="${VITE_API_KEY:-${MVP_API_KEY:-}}"
  local VITE_GEMINI_API_KEY="${VITE_GEMINI_API_KEY:-}"

  if [ -z "$VITE_API_KEY" ]; then
    # Try reading from Secret Manager
    VITE_API_KEY=$(gcloud secrets versions access latest --secret=clipora-api-key --project="$PROJECT_ID" 2>/dev/null || true)
  fi

  if [ -z "$VITE_API_KEY" ]; then
    echo "ERROR: Set VITE_API_KEY, MVP_API_KEY, or ensure clipora-api-key secret exists in Secret Manager"
    exit 1
  fi

  if [ -z "$VITE_GEMINI_API_KEY" ]; then
    # Try reading from Secret Manager
    VITE_GEMINI_API_KEY=$(gcloud secrets versions access latest --secret=clipora-gemini-api-key --project="$PROJECT_ID" 2>/dev/null || true)
  fi

  # Configure Docker for Artifact Registry
  gcloud auth configure-docker us-east1-docker.pkg.dev --quiet

  docker build \
    --build-arg VITE_API_URL="$VITE_API_URL" \
    --build-arg VITE_API_KEY="$VITE_API_KEY" \
    --build-arg VITE_GEMINI_API_KEY="$VITE_GEMINI_API_KEY" \
    -t "$AR_IMAGE" \
    "$FRONTEND_DIR"

  docker push "$AR_IMAGE"

  gcloud run deploy clipora-web \
    --image "$AR_IMAGE" \
    --region "$REGION" \
    --project "$PROJECT_ID" \
    --port 8080 \
    --memory 256Mi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 3 \
    --allow-unauthenticated \
    --quiet

  echo "=== Frontend deployed ==="
  gcloud run services describe clipora-web \
    --region "$REGION" \
    --project "$PROJECT_ID" \
    --format "value(status.url)"
}

case "${1:-}" in
  api)
    deploy_api
    ;;
  processor)
    deploy_processor
    ;;
  web)
    deploy_web
    ;;
  all)
    deploy_api
    deploy_processor
    deploy_web
    ;;
  *)
    echo "Usage: $0 {api|processor|web|all}"
    exit 1
    ;;
esac
