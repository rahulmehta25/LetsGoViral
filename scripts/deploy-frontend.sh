#!/usr/bin/env bash
set -euo pipefail

# Deploy the Clipora web frontend to Google Cloud Run.
#
# Usage:
#   bash scripts/deploy-frontend.sh
#
# Prerequisites:
#   - gcloud CLI authenticated (`gcloud auth login`)
#   - Docker running locally
#
# Environment variables (optional overrides):
#   GCP_PROJECT_ID   (default: clipora-487805)
#   GCP_REGION       (default: us-east1)
#   BACKEND_URL      (default: https://clipora-api-594534640965.us-east1.run.app)
#   API_KEY          (default: reads from MVP_API_KEY env var)

PROJECT_ID="${GCP_PROJECT_ID:-clipora-487805}"
REGION="${GCP_REGION:-us-east1}"
SERVICE_NAME="clipora-web"
BACKEND_URL="${BACKEND_URL:-https://clipora-api-594534640965.us-east1.run.app}"
API_KEY="${API_KEY:-${MVP_API_KEY:-}}"

if [ -z "$API_KEY" ]; then
  echo "ERROR: Set API_KEY or MVP_API_KEY env var (must match the backend's MVP_API_KEY)"
  exit 1
fi

IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"
DIR="$(cd "$(dirname "$0")/../PlayO Prototyping Studio UI" && pwd)"

echo "=== Deploying Clipora Web Frontend ==="
echo "  Project:  $PROJECT_ID"
echo "  Region:   $REGION"
echo "  Backend:  $BACKEND_URL"
echo "  Image:    $IMAGE"
echo ""

echo "Building Docker image..."
docker build \
  --build-arg VITE_API_URL="$BACKEND_URL" \
  --build-arg VITE_API_KEY="$API_KEY" \
  -t "$IMAGE" \
  "$DIR"

echo ""
echo "Pushing to GCR..."
docker push "$IMAGE"

echo ""
echo "Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE" \
  --platform managed \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --allow-unauthenticated \
  --port 8080 \
  --memory 256Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 3

echo ""
echo "=== Deploy complete! ==="
gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --format "value(status.url)"
