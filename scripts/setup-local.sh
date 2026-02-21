#!/usr/bin/env bash
set -euo pipefail

# Clipora local dev setup script
# Usage: bash scripts/setup-local.sh

echo "=== Clipora local dev setup ==="

# 1. Check prerequisites
echo ""
echo "Checking prerequisites..."

for cmd in node npm psql ffmpeg; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: '$cmd' is not installed. Please install it first."
    exit 1
  fi
done

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  echo "ERROR: Node.js >= 22 required (found v$(node -v))"
  exit 1
fi
echo "  Node $(node -v), npm $(npm -v), psql, ffmpeg  OK"

# 2. Set up PostgreSQL database
echo ""
echo "Setting up PostgreSQL database..."

DB_NAME="creator_mvp"
DB_USER="clipora"
DB_PASSWORD="clipora_dev_password"

if psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
  echo "  Database '$DB_NAME' already exists, skipping creation."
else
  echo "  Creating database '$DB_NAME' and user '$DB_USER'..."
  psql -U postgres -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" 2>/dev/null || true
  psql -U postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || true
  echo "  Running schema migration..."
  psql -U "$DB_USER" -d "$DB_NAME" -f infrastructure/database/init.sql
  echo "  Database setup complete."
fi

# 3. Copy .env files
echo ""
echo "Setting up .env files..."

for envdir in "backend/api-service" "backend/video-processor" "PlayO Prototyping Studio UI"; do
  if [ -f "$envdir/.env" ]; then
    echo "  $envdir/.env already exists, skipping."
  elif [ -f "$envdir/.env.example" ]; then
    cp "$envdir/.env.example" "$envdir/.env"
    echo "  Copied $envdir/.env.example -> .env"
  fi
done

# 4. Install dependencies
echo ""
echo "Installing dependencies..."

echo "  backend/api-service..."
(cd backend/api-service && npm install --silent)

echo "  backend/video-processor..."
(cd backend/video-processor && npm install --silent)

echo "  PlayO Prototyping Studio UI..."
(cd "PlayO Prototyping Studio UI" && npm install --silent)

echo ""
echo "=== Setup complete! ==="
echo ""
echo "To start the API server:    cd backend/api-service && npm run dev"
echo "To start the web UI:        cd 'PlayO Prototyping Studio UI' && npm run dev"
echo ""
echo "NOTE: For GCS signed URLs with ADC (no service account key file):"
echo "  1. Set GCS_SIGNING_SERVICE_ACCOUNT in backend/api-service/.env"
echo "  2. Grant yourself 'Service Account Token Creator' role on that SA"
echo "  See storage.js for details."
