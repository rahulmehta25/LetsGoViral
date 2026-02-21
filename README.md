# Clipora — AI-Powered Viral Clip Generator

**Repo:** [github.com/rahulmehta25/LetsGoViral](https://github.com/rahulmehta25/LetsGoViral) · **Started:** Feb 20

Clipora is a mobile-first platform that takes your long-form video, applies AI analysis, and automatically extracts the best short-form clips for TikTok, Reels, and YouTube Shorts.

---

## Architecture Overview

```
Mobile App (Expo RN)
    │
    │  REST + SSE
    ▼
Cloud Run API Service (Node.js/Express)
    │                │
    │ PostgreSQL      │ Pub/Sub trigger
    ▼                ▼
Cloud SQL         Cloud Run Job (Video Processor)
                      │
              ┌───────┼───────────────────┐
              ▼       ▼                   ▼
   Video Intelligence  Speech-to-Text  Vertex AI (Gemini)
   (shot detection)   (transcription)  (clip analysis)
                              │
                        FFmpeg → Cloud Storage → Cloud CDN
```

## Project Structure

```
Clipora/
├── infrastructure/          # Terraform — GCP provisioning
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   └── database/init.sql
│
├── backend/
│   ├── api-service/         # Phase 1 — Cloud Run API (Node.js/Express)
│   │   ├── src/
│   │   │   ├── index.js
│   │   │   ├── middleware/auth.js
│   │   │   ├── db/index.js
│   │   │   ├── routes/{projects,scripts,videos,clips}.js
│   │   │   └── services/{storage,gemini}.js
│   │   └── Dockerfile
│   │
│   └── video-processor/     # Phase 2 — Cloud Run Job (FFmpeg + AI)
│       ├── src/
│       │   ├── run-job.js
│       │   └── services/{ffmpeg,videoIntelligence,speechToText,geminiAnalyzer}.js
│       └── Dockerfile
│
├── mobile/                  # Phase 3–5 — Expo SDK 53 React Native app
│   ├── app/
│   │   ├── (tabs)/          # Home, Upload, Chat, Settings
│   │   ├── projects/[id]    # Project detail + clips list
│   │   ├── processing/[id]  # Processing status with polling
│   │   └── clips/[id]       # Clip reviewer + download
│   ├── api/client.ts
│   ├── store/index.ts
│   └── constants/Colors.ts
│
├── PlayO Prototyping Studio UI/  # Web UI prototype (React + Vite)
└── .github/workflows/deploy.yml # CI/CD — GitHub Actions → Cloud Run
```

---

## Setup Guide

### 1. GCP Prerequisites

```bash
# Install Terraform
brew install terraform

# Authenticate
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Provision all GCP resources
cd infrastructure
terraform init
terraform plan -var="project_id=YOUR_PROJECT_ID" -var="db_password=SECURE_PW" -var="mvp_api_key=$(openssl rand -hex 32)"
terraform apply
```

### 2. Database Schema

```bash
# Apply schema to Cloud SQL (via Cloud SQL Auth Proxy or private IP)
psql -h 10.x.x.x -U clipora -d creator_mvp -f infrastructure/database/init.sql
```

### 3. Backend API Service (Local Dev)

```bash
cd backend/api-service
cp .env.example .env
# Fill in .env with your GCP values
npm install
npm run dev
```

### 4. Mobile App (Local Dev)

```bash
cd mobile
npm install
# Create .env.local
echo "EXPO_PUBLIC_API_URL=http://localhost:8080" > .env.local
echo "EXPO_PUBLIC_API_KEY=your-api-key" >> .env.local
npx expo start
```

### 5. CI/CD Setup

Add these GitHub Secrets to your repository:
- `GCP_PROJECT_ID`
- `GCP_WIF_PROVIDER` — Workload Identity Federation provider
- `GCP_SERVICE_ACCOUNT_EMAIL`
- `GCS_UPLOADS_BUCKET`
- `GCS_PROCESSED_BUCKET`
- `CDN_BASE_URL`

---

## Cost Management (⚠️ Important)

With the $300 GCP free trial:

| Service | Cost |
|---|---|
| Per 20-min video | ~$2.30 |
| Cloud SQL (24/7) | ~$60/month |
| Cloud Run API | ~$0 (scales to zero) |

**Stop Cloud SQL when not developing:**
```bash
gcloud sql instances patch clipora-db --activation-policy NEVER
# Resume:
gcloud sql instances patch clipora-db --activation-policy ALWAYS
```

This gives you ~80–100 test videos before exhausting the free credits.

---

## API Reference

All endpoints require `X-API-Key` header.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/projects` | List all projects |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/:id` | Get project with videos |
| POST | `/api/scripts` | Create script |
| GET | `/api/scripts/:id` | Get script + chat history |
| POST | `/api/scripts/chat` | Chat with Viralizer AI (SSE stream) |
| POST | `/api/videos/upload-url` | Get signed URL for direct GCS upload |
| GET | `/api/videos/:id` | Poll processing status |
| GET | `/api/videos/:id/clips` | Get all clips |
| PUT | `/api/clips/:id` | Approve/reject clip |
