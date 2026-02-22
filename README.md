# Clipora -- AI-Powered Viral Clip Generator

**Repo:** [github.com/rahulmehta25/LetsGoViral](https://github.com/rahulmehta25/LetsGoViral)

Clipora is a platform that takes long-form video, applies AI analysis (shot detection, transcription, multimodal Gemini scoring), and automatically extracts the best short-form clips for TikTok, Reels, and YouTube Shorts.

---

## Architecture

```
Mobile App (Expo RN)          Web App (React + Vite)
        │                             │
        │  REST + SSE                 │
        └──────────┬──────────────────┘
                   ▼
    Cloud Run API Service (Node.js / Express)
           │                │
           │ PostgreSQL     │ Pub/Sub trigger
           ▼                ▼
       Cloud SQL      Cloud Run Job (Video Processor)
                            │
                ┌───────────┼───────────────────┐
                ▼           ▼                   ▼
     Video Intelligence  Speech-to-Text   Vertex AI (Gemini)
     (shot detection)    (transcription)  (multimodal clip analysis)
                                │
                          FFmpeg (OGG_OPUS)
                                │
                    Cloud Storage → Cloud CDN
```

---

## Tech Stack

| Layer | Stack |
|---|---|
| **API Service** | Node 22, Express, PostgreSQL, Vertex AI, Cloud Storage |
| **Video Processor** | Node 22, FFmpeg, Video Intelligence, Speech-to-Text, Gemini |
| **Web UI** | React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons |
| **Mobile** | React Native 0.76, Expo SDK 53, Zustand, React Query |
| **Infrastructure** | Terraform, Cloud Run, Cloud SQL, Artifact Registry, Cloud CDN |
| **CI/CD** | GitHub Actions, Workload Identity Federation, Google Secret Manager |

---

## Project Structure

```
Lets-Go-Viral/
├── backend/
│   ├── api-service/              # Cloud Run API (Node.js/Express)
│   │   ├── src/
│   │   │   ├── index.js
│   │   │   ├── middleware/auth.js
│   │   │   ├── db/index.js
│   │   │   ├── routes/
│   │   │   │   ├── projects.js
│   │   │   │   ├── videos.js
│   │   │   │   ├── clips.js
│   │   │   │   └── scripts.js
│   │   │   ├── services/
│   │   │   │   ├── storage.js    # GCS signed URLs (ADC support)
│   │   │   │   └── gemini.js     # Vertex AI Gemini
│   │   │   ├── utils/logger.js
│   │   │   └── __tests__/
│   │   ├── Dockerfile
│   │   └── .env.example
│   │
│   └── video-processor/          # Cloud Run Job (FFmpeg + AI)
│       ├── src/
│       │   ├── run-job.js
│       │   ├── process-local.js  # Local dev processing
│       │   ├── services/
│       │   │   ├── ffmpeg.js
│       │   │   ├── videoIntelligence.js
│       │   │   ├── speechToText.js
│       │   │   ├── geminiAnalyzer.js
│       │   │   └── editGuidance.js
│       │   ├── db/index.js
│       │   ├── utils/logger.js
│       │   └── __tests__/
│       ├── Dockerfile
│       └── .env.example
│
├── PlayO Prototyping Studio UI/  # Web App (React + Vite + TypeScript)
│   ├── src/
│   │   ├── screens/
│   │   │   ├── SplashScreen.tsx
│   │   │   ├── OnboardingScreen.tsx
│   │   │   ├── ProjectsScreen.tsx
│   │   │   ├── ProjectDetailScreen.tsx
│   │   │   ├── UploadScreen.tsx
│   │   │   ├── ProcessingScreen.tsx
│   │   │   ├── ClipReviewerScreen.tsx
│   │   │   └── ChatScreen.tsx
│   │   ├── components/
│   │   ├── hooks/
│   │   └── lib/
│   ├── Dockerfile                # Multi-stage: Node build → Nginx
│   ├── nginx.conf
│   └── .env.example
│
├── mobile/                       # Expo SDK 53 React Native app
│   ├── app/
│   │   ├── (tabs)/               # Home, Upload, Chat, Settings
│   │   ├── projects/[id]/        # Project detail + clips
│   │   ├── processing/[id]/      # Processing status
│   │   └── clips/[id]/           # Clip reviewer + download
│   ├── api/client.ts
│   ├── store/index.ts            # Zustand state
│   └── constants/Colors.ts
│
├── infrastructure/               # Terraform GCP provisioning
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   └── database/init.sql
│
├── scripts/
│   ├── setup-local.sh            # Local dev setup automation
│   └── deploy-frontend.sh        # Cloud Run frontend deployment
│
├── docs/
│   ├── LetsGoViral MVP PRD.md    # Product requirements
│   └── activity_log.md           # Development activity log
│
├── index.html                    # Landing page
├── .env.example                  # Shared env config template
└── .github/workflows/deploy.yml  # CI/CD pipeline
```

---

## Setup Guide

### Quick Start (Local)

```bash
# Run the automated setup script
./scripts/setup-local.sh
```

This checks prerequisites (Node 22+, psql, ffmpeg), creates the database, copies `.env` files from templates, and installs all dependencies.

### Manual Setup

#### 1. GCP Prerequisites

```bash
brew install terraform
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

cd infrastructure
terraform init
terraform plan \
  -var="project_id=YOUR_PROJECT_ID" \
  -var="db_password=SECURE_PW" \
  -var="mvp_api_key=$(openssl rand -hex 32)"
terraform apply
```

#### 2. Database Schema

```bash
psql -h 10.x.x.x -U clipora -d creator_mvp -f infrastructure/database/init.sql
```

#### 3. Backend API Service

```bash
cd backend/api-service
cp .env.example .env    # Fill in GCP values
npm install
npm run dev             # http://localhost:8080
```

#### 4. Video Processor (Local)

```bash
cd backend/video-processor
cp .env.example .env    # Fill in GCP values
npm install
node src/process-local.js <video-id>
```

#### 5. Web App

```bash
cd "PlayO Prototyping Studio UI"
cp .env.example .env    # Set VITE_API_URL and VITE_API_KEY
npm install
npm run dev             # http://localhost:5173
```

#### 6. Mobile App

```bash
cd mobile
npm install
echo "EXPO_PUBLIC_API_URL=http://localhost:8080" > .env.local
echo "EXPO_PUBLIC_API_KEY=your-api-key" >> .env.local
npx expo start
```

---

## Deployment

### CI/CD (GitHub Actions)

The pipeline at `.github/workflows/deploy.yml` runs three parallel jobs:

| Job | Target | Resources |
|---|---|---|
| **deploy-api** | Cloud Run Service | 512Mi / 1 CPU, 0-10 instances |
| **deploy-video-processor** | Cloud Run Job | 2Gi / 2 CPU, 3600s timeout |
| **test-api** | Jest + PostgreSQL 15 | Node 22 |

**Required GitHub Secrets:**
- `GCP_PROJECT_ID`
- `GCP_WIF_PROVIDER` -- Workload Identity Federation provider
- `GCP_SERVICE_ACCOUNT_EMAIL`
- `GCS_UPLOADS_BUCKET`
- `GCS_PROCESSED_BUCKET`
- `CDN_BASE_URL`

### Frontend Deployment

```bash
./scripts/deploy-frontend.sh
```

Builds the Docker image (Vite build + Nginx) and deploys to Cloud Run.

---

## API Reference

All endpoints require the `X-API-Key` header.

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
| GET | `/api/videos/:id/clips` | Get all clips for a video |
| PUT | `/api/clips/:id` | Approve/reject clip |

---

## Video Processing Pipeline

1. **Upload** -- Client gets a signed URL and uploads directly to GCS
2. **Trigger** -- Pub/Sub message triggers the Cloud Run Job
3. **Shot Detection** -- Video Intelligence API identifies scene boundaries
4. **Transcription** -- Speech-to-Text extracts dialogue (OGG_OPUS codec)
5. **AI Analysis** -- Gemini multimodal model scores segments for virality
6. **Clip Extraction** -- FFmpeg cuts the top-scoring segments
7. **Storage** -- Clips uploaded to processed bucket with CDN delivery
8. **Metadata** -- Clip titles, hooks, and scores persisted to database

---

## Cost Management

With the $300 GCP free trial:

| Service | Estimated Cost |
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

This gives roughly 80-100 test videos before exhausting free credits.

---

## Testing

```bash
# API service tests
cd backend/api-service && npm test

# Video processor tests
cd backend/video-processor && npm test

# Web UI lint
cd "PlayO Prototyping Studio UI" && npm run lint
```

---

## License

Private -- all rights reserved.
