# Technical Implementation Guide: Viral Content Creator Platform

**Author**: Manus AI
**Date**: February 20, 2026
**Version**: 1.0

## 1. Introduction

This document provides a comprehensive technical implementation plan for the MVP of the viral content creator platform. It is designed to be executed by a code generation agent like Claude Code, with detailed specifications for architecture, infrastructure, backend services, AI pipelines, and the mobile application. The goal is to build a scalable, cost-effective, and feature-rich platform on Google Cloud Platform (GCP) that addresses key gaps in the current creator tool market.

### 1.1. Core MVP Features

1.  **AI Script Co-Pilot**: A chat-based interface for creators to co-write viral-style scripts with an AI assistant.
2.  **Video Upload & Processing**: Creators upload a long-form video recorded from the script.
3.  **AI Clip Extraction & Ranking**: The platform automatically identifies key moments, extracts short-form clips, and ranks them based on strategic value.
4.  **Long-Form Edit Guidance**: The platform provides suggestions for editing the original long-form video to improve engagement.
5.  **Clip Review & Download**: A mobile interface to review, approve, and download the generated clips, ready for manual upload to social platforms.

### 1.2. Technology Stack Summary

| Component | Technology | Rationale |
| :--- | :--- | :--- |
| **Cloud Provider** | Google Cloud Platform (GCP) | User preference; excellent AI/ML services and serverless offerings. |
| **Mobile App** | React Native + Expo (SDK 53) | High-quality cross-platform development with a mature ecosystem. |
| **Backend API** | Node.js + Express on Cloud Run | Serverless, scalable, and cost-effective for event-driven workloads. |
| **Database** | Cloud SQL (PostgreSQL) + pgvector | Structured data integrity with powerful vector similarity search for AI. |
| **AI - Language** | Vertex AI (Gemini 3 Pro & Flash) | State-of-the-art models for chat, scriptwriting, and analysis. |
| **AI - Video Analysis** | Video Intelligence API | For intelligent shot detection and content analysis. |
| **AI - Transcription** | Speech-to-Text API v2 | High-accuracy transcription, included in GCP free tier. |
| **Video Processing** | FFmpeg on Cloud Run Jobs | Highly cost-effective and powerful for transcoding and clipping. |
| **Storage & CDN** | Cloud Storage + Cloud CDN | Secure, scalable, and globally distributed object storage and delivery. |
| **Authentication** | Clerk (or custom with JWT) | To be implemented post-MVP, but Clerk is recommended for speed. |

## 2. System Architecture

The system is designed around a decoupled, event-driven architecture using serverless components on GCP. This ensures scalability, resilience, and cost-efficiency, as resources are only consumed when actively processing data.

### 2.1. Architecture Diagram

```mermaid
graph TD
    subgraph "User Device (React Native / Expo)"
        A[Mobile App] -->|1. Upload Video & Chat| B(API Gateway)
    end

    subgraph "GCP (us-east1)"
        B --> C{Cloud Run Service: API}
        C -->|User & Project Data| D[Cloud SQL: PostgreSQL]
        C -->|Trigger Job| E[Pub/Sub]
        E --> F[Cloud Run Job: Video Processor]
        F -->|2. Analyze Video| G[Video Intelligence API]
        F -->|3. Transcribe| H[Speech-to-Text API]
        F -->|4. Cut Clips (FFmpeg)| F
        F -->|5. Store Clips| I[Cloud Storage]
        C -->|6. Generate Script| J[Vertex AI: Gemini 3]
        I -->|CDN| K[Cloud CDN]
        K --> A
    end

    style A fill:#f9f,stroke:#333,stroke-width:2px
    style B fill:#bbf,stroke:#333,stroke-width:2px
    style C fill:#bbf,stroke:#333,stroke-width:2px
    style D fill:#fb9,stroke:#333,stroke-width:2px
    style E fill:#9cf,stroke:#333,stroke-width:2px
    style F fill:#9cf,stroke:#333,stroke-width:2px
    style G fill:#9f9,stroke:#333,stroke-width:2px
    style H fill:#9f9,stroke:#333,stroke-width:2px
    style J fill:#9f9,stroke:#333,stroke-width:2px
    style I fill:#fb9,stroke:#333,stroke-width:2px
    style K fill:#fb9,stroke:#333,stroke-width:2px
```

*A diagram illustrating the flow of data from the mobile app through the GCP backend services.*

### 2.2. Data & Process Flow

1.  **Initiation (Mobile App)**: The user interacts with the AI Script Co-Pilot (chat) or uploads a video. All interactions are routed through the API Gateway to the main Cloud Run API service.
2.  **Video Ingestion**: The API service generates a signed URL for the mobile app to upload the video directly to a dedicated "uploads" bucket in Cloud Storage. This avoids proxying large files through the API service.
3.  **Processing Trigger**: Upon successful upload, a Cloud Storage trigger sends a message to a Pub/Sub topic containing the file metadata.
4.  **Asynchronous Processing (Cloud Run Job)**: A Cloud Run Job, subscribed to the Pub/Sub topic, is initiated. This job orchestrates the entire video processing pipeline for a single video.
5.  **AI Analysis & Transcription**: The job calls the Video Intelligence API to get shot/scene change timestamps and the Speech-to-Text API to get a full transcription.
6.  **Clipping (FFmpeg)**: Using the timestamps from the Video Intelligence API and transcription data, the job uses FFmpeg to cut the original video into multiple short-form clips.
7.  **Storage & Delivery**: The generated clips are stored in a separate "processed" bucket in Cloud Storage. Cloud CDN is configured to serve these clips to the mobile app for review.
8.  **Database Updates**: The job updates the PostgreSQL database with the status, transcription, and URLs of the generated clips.

## 3. Infrastructure Setup (GCP)

This section details the GCP services to be provisioned, preferably using Infrastructure as Code (Terraform). All resources should be created in the `us-east1` region.

### 3.1. GCP Project & Billing

-   Create a new GCP Project.
-   Link a billing account and activate the $300 free trial.

### 3.2. IAM & Service Accounts

-   Create a dedicated service account for the Cloud Run services/jobs with the following roles:
    -   `roles/run.invoker`
    -   `roles/pubsub.publisher`
    -   `roles/storage.objectAdmin` (for reading uploads and writing processed clips. Do **not** use `roles/storage.admin` — it grants bucket-level operations like deletion, which is unnecessary and dangerous if the key leaks.)
    -   `roles/cloudsql.client`
    -   `roles/aiplatform.user` (for Vertex AI)
    -   `roles/videointelligence.user`
    -   `roles/cloudspeech.user`

### 3.3. Networking

-   Use the default VPC for simplicity in the MVP.
-   Configure a Serverless VPC Access connector to allow Cloud Run to connect to the Cloud SQL instance privately.

### 3.4. Cloud Storage

-   Create two buckets:
    1.  `[project-id]-uploads`: Standard storage class, uniform bucket-level access. This is for raw video uploads.
    2.  `[project-id]-processed`: Standard storage class, uniform bucket-level access. This will be the origin for the Cloud CDN.
-   Configure a Cloud Storage trigger on the `[project-id]-uploads` bucket for the `google.storage.object.finalize` event, sending notifications to the `video-processing-topic` Pub/Sub topic.

### 3.5. Pub/Sub

-   Create one topic: `video-processing-topic`.

### 3.6. Cloud SQL for PostgreSQL

-   Provision a Cloud SQL for PostgreSQL instance (v15 or later).
-   Choose a small machine type for the MVP (e.g., `db-custom-1-3840`).
-   Enable **private IP only** and connect exclusively through the Serverless VPC Access connector. **Do not enable public IP** — it creates an unnecessary attack surface, even with IP restrictions.
-   Create a database named `creator_mvp`.
-   Install the `pgvector` extension: `CREATE EXTENSION vector;`

### 3.7. Cloud CDN

-   Create a Cloud CDN backend pointing to the `[project-id]-processed` Cloud Storage bucket.
-   Enable "Cloud CDN for Cloud Storage".
-   Enable signed URLs to restrict access to authenticated users.


## 4. Data Model (Cloud SQL - PostgreSQL)

The database will store user data, project information, scripts, and metadata about videos and clips. The use of `pgvector` will be crucial for future AI-powered search and recommendation features.

### 4.1. SQL Schema

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Users table (for post-MVP)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    clerk_id VARCHAR(255) UNIQUE, -- For Clerk integration
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Projects table to organize content
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Scripts table for the AI Co-Pilot
CREATE TABLE scripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content JSONB, -- Store script as a structured document (e.g., scenes, dialogue)
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Original long-form videos
CREATE TABLE videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    original_filename VARCHAR(255) NOT NULL,
    upload_path TEXT NOT NULL, -- Path in GCS '-uploads' bucket
    processing_status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, PROCESSING, COMPLETED, FAILED
    duration_seconds INT,
    transcription TEXT,
    shot_change_timestamps JSONB, -- Array of timestamps from Video Intelligence API
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Generated short-form clips
CREATE TABLE clips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
    processed_path TEXT NOT NULL, -- Path in GCS '-processed' bucket
    cdn_url TEXT, -- URL from Cloud CDN
    start_time_seconds NUMERIC(10,3) NOT NULL, -- Sub-second precision is critical for frame-accurate cuts
    end_time_seconds NUMERIC(10,3) NOT NULL,
    duration_seconds NUMERIC(10,3) NOT NULL,
    strategic_rank INT, -- The AI-generated rank for posting order
    hook_score FLOAT, -- AI-generated score for the clip's hook
    content_embedding VECTOR(768), -- For similarity search (post-MVP)
    user_approved BOOLEAN DEFAULT NULL, -- NULL, TRUE, or FALSE
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Chat messages for AI Script Co-Pilot conversation history
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id UUID REFERENCES scripts(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_videos_project_id ON videos(project_id);
CREATE INDEX idx_clips_video_id ON clips(video_id);
CREATE INDEX idx_chat_messages_script_id ON chat_messages(script_id);

-- HNSW index for vector similarity search (post-MVP)
-- CREATE INDEX ON clips USING hnsw (content_embedding vector_l2_ops);

```

## 5. Backend Services & API Design

The backend will consist of two main components: a primary API service for handling user requests and a video processing job for asynchronous tasks.

### 5.1. API Service (Cloud Run Service)

-   **Runtime**: Node.js (v22+) with Express.js
-   **Container**: Dockerized Node.js application.
-   **Function**: Handles all synchronous API requests from the mobile app, interacts with the database, and triggers the video processing job.

#### API Endpoints (RESTful)

All endpoints should be authenticated (post-MVP).

> **MVP Authentication**: For the MVP, implement a simple API key middleware to prevent unauthorized access to the API and protect your GCP spend. Generate a random API key, store it as a secret in **Google Secret Manager**, and require it in the `X-API-Key` header of all requests. This is ~10 lines of Express middleware:
>
> ```javascript
> const API_KEY = process.env.MVP_API_KEY;
> function authMiddleware(req, res, next) {
>     if (req.headers['x-api-key'] !== API_KEY) {
>         return res.status(401).json({ error: 'Unauthorized' });
>     }
>     next();
> }
> app.use('/api', authMiddleware);
> ```
>
> Hardcode this same key in the mobile app's API client. This is not a long-term auth solution, but it prevents anyone who discovers your Cloud Run URL from burning through your $300 in Vertex AI and Video Intelligence API calls.

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/auth/signup` | POST | Creates a new user (post-MVP). |
| `/projects` | GET | Get all projects for the current user. |
| `/projects` | POST | Create a new project. |
| `/projects/{id}` | GET | Get details for a specific project. |
| `/scripts` | POST | Create a new script within a project. |
| `/scripts/chat` | POST | Interact with the AI Script Co-Pilot (streams response). |
| `/videos/upload-url` | POST | Get a signed URL to upload a video to Cloud Storage. |
| `/videos/{id}` | GET | Get video details including `processing_status` (used for polling). |
| `/videos/{id}/clips` | GET | Get all processed clips for a specific video. |
| `/clips/{id}` | PUT | Update a clip (e.g., user approval). |

> **Upload Validation**: The `/videos/upload-url` endpoint **must** enforce limits before generating a signed URL. Reject requests where the client-reported duration exceeds **30 minutes** or file size exceeds **2 GB**. A single 2-hour 4K upload can cost $12+ in Video Intelligence API fees alone and will likely time out the Cloud Run Job. This is a direct budget protection measure.
>
> ```javascript
> app.post('/api/videos/upload-url', authMiddleware, (req, res) => {
>     const { fileSizeMB, durationSeconds } = req.body;
>     if (fileSizeMB > 2048) return res.status(413).json({ error: 'File exceeds 2 GB limit' });
>     if (durationSeconds > 1800) return res.status(413).json({ error: 'Video exceeds 30 minute limit' });
>     // ... generate signed URL
> });
> ```

### 5.2. Video Processor (Cloud Run Job)

-   **Runtime**: Node.js (v22+)
-   **Container**: Dockerized Node.js application containing FFmpeg.
-   **Trigger**: Pub/Sub message from Cloud Storage upload.
-   **Function**: Orchestrates the entire video processing pipeline.

#### Job Logic Flow

1.  **Receive Message**: Parse the Pub/Sub message to get the bucket and filename of the uploaded video.
2.  **Update Status**: Update the video's status in the database to `PROCESSING`.
3.  **Call GCP APIs**:
    -   Send the video to the **Video Intelligence API** to get shot change timestamps.
    -   Send the video to the **Speech-to-Text API** to get the full transcription.
4.  **Analyze & Select Clips**:
    -   Use **Vertex AI (Gemini 3 Flash)** to analyze the transcription, shot timestamps, **and the original script** (if available from the Script Co-Pilot).
    -   **Important**: Use Gemini's **JSON response mode** (`responseMimeType: "application/json"`) with a defined schema to ensure structured, parseable output. Do not rely on free-form text responses.
    -   **Prompt**: `"You are a viral content strategist. Given the following script (if provided), transcription, and shot change timestamps, identify the most engaging 15-30 second clips suitable for TikTok/Reels/Shorts. For each clip, provide a start_time (seconds, decimal), end_time (seconds, decimal), a hook_score (1-10), a strategic_rank for posting order, and a one-sentence rationale. Prioritize moments with strong emotional language, questions, surprising statements, or key moments from the script's intended narrative. Adjust the number of clips to the video length — approximately 1 clip per 3 minutes of content, minimum 3, maximum 15."`
    -   **Response Schema** (enforce via Gemini JSON mode):
        ```json
        {
            "clips": [
                {
                    "start_time": 90.5,
                    "end_time": 112.3,
                    "hook_score": 8,
                    "strategic_rank": 1,
                    "rationale": "Strong opening question that creates curiosity"
                }
            ]
        }
        ```
    -   **Validation & Retry**: Wrap the Gemini response parse in a try/catch. If JSON parsing fails or the response doesn't match the expected schema, retry the Gemini call once. If it fails again, log the error and mark the video as `FAILED`. This prevents wasting the Video Intelligence and Speech-to-Text API costs already incurred on the video.
        ```javascript
        let clipData;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const response = await geminiModel.generateContent({ /* ... */ });
                clipData = JSON.parse(response.text());
                if (!Array.isArray(clipData.clips) || clipData.clips.length === 0) {
                    throw new Error('Invalid clip structure');
                }
                // Validate each clip has required fields and sane values
                for (const clip of clipData.clips) {
                    if (clip.start_time >= clip.end_time) throw new Error('Invalid timestamps');
                    if (clip.end_time > videoDurationSeconds) throw new Error('Clip exceeds video duration');
                }
                break; // Success
            } catch (err) {
                if (attempt === 1) throw err; // Final attempt failed
                console.warn(`Gemini response validation failed (attempt ${attempt + 1}), retrying...`);
            }
        }
        ```
5.  **Execute FFmpeg**:
    -   For each clip identified by Gemini, execute an FFmpeg command in a child process.
    -   `ffmpeg -ss [start_time] -i [input_video_path] -t [duration] -c:v libx264 -preset ultrafast -c:a aac -movflags +faststart [output_clip_path]`
    -   **Why not `-c copy`?** Stream copy can only cut on keyframes. Since keyframes are typically 2-10 seconds apart, clips would start at the wrong timestamp — visibly broken for a product built around precise AI-selected moments. `-preset ultrafast` re-encodes with minimal CPU overhead. The `-movflags +faststart` flag moves the moov atom to the beginning of the file, enabling progressive playback on mobile devices.
6.  **Upload Clips**: Upload the generated clip files to the `[project-id]-processed` Cloud Storage bucket.
7.  **Update Database**: For each clip, insert a new record into the `clips` table with the storage path, CDN URL, rank, and scores.
8.  **Finalize**: Update the video's status in the database to `COMPLETED`. If any step fails, update to `FAILED` and log the error.


## 6. AI & Video Processing Pipeline

This hybrid pipeline is the core of the product, combining the intelligence of GCP's AI services with the cost-efficiency of FFmpeg.

### 6.1. AI Script Co-Pilot

-   **Model**: Vertex AI - **Gemini 3 Pro** (for highest quality reasoning and creative generation).
-   **Interface**: A chat screen in the mobile app.
-   **Backend**: The `/scripts/chat` endpoint on the API service will manage the conversation.
-   **System Prompt**: A detailed system prompt is crucial for guiding the AI. It should be stored and managed by the backend.

    > **Example System Prompt**:
    > "You are a world-class scriptwriting assistant for viral social media content. Your name is 'Viralizer'. You help creators write compelling, human-sounding scripts using proven frameworks from top creators like MrBeast, Alex Hormozi, and popular TikTok trends. Always start by asking the creator for their initial idea. Then, guide them to structure the script with a strong hook, a compelling story, and a clear call to action. Provide suggestions for visual gags, pattern interrupts, and on-screen text. Respond in short, easy-to-read paragraphs. Maintain a helpful and encouraging tone."

-   **Interaction Flow**: The backend will maintain the chat history in the `chat_messages` table (keyed by `script_id`) and send it with each new user message to the Gemini API. Each user message and assistant response should be persisted as a row in `chat_messages` so that conversations survive app restarts and session changes. The response from Gemini will be streamed back to the mobile app for a real-time feel.

### 6.2. Long-Form Edit Guidance

-   **Model**: Vertex AI - **Gemini 3 Flash** (for speed and cost-effectiveness).
-   **Trigger**: After the video is processed and transcribed.
-   **Logic**: The backend will send the full script and the full transcription to Gemini.

    > **Example Prompt**:
    > "Analyze the provided script and the final video transcription. Identify discrepancies and suggest edits for the long-form video to improve pacing and engagement. Provide a list of timestamps where a pattern interrupt, B-roll, or on-screen graphic should be added to maintain viewer attention. Output the suggestions in a structured JSON format."

-   **Output**: The suggestions will be stored in the database and displayed to the user in the mobile app.

### 6.3. Video Processing with FFmpeg

-   **Environment**: The Cloud Run Job will use a custom Docker container with the `node:22-slim` base image and FFmpeg installed.

    **`Dockerfile` for Video Processor:**
    ```Dockerfile
    # Use Node.js 22 slim as the base image
    FROM node:22-slim

    # Install FFmpeg
    RUN apt-get update && apt-get install -y ffmpeg

    # Set up the working directory
    WORKDIR /usr/src/app

    # Copy application dependency manifests
    COPY package*.json ./

    # Install dependencies
    RUN npm install

    # Copy application source code
    COPY . .

    # Command to run the job
    CMD [ "node", "run-job.js" ]
    ```

-   **Execution**: The Node.js job will use the `child_process` module to execute FFmpeg commands. It's critical to listen for `stdout`, `stderr`, and `exit` events to handle progress and errors properly.
-   **Key Command**: The primary command uses `-preset ultrafast` for the fastest possible re-encode. Note the placement of `-ss` **before** `-i` — this enables input seeking, which is significantly faster than output seeking on large files.

    ```bash
    ffmpeg -ss 00:01:30.500 -i /tmp/input_video.mp4 -t 00:00:15 -c:v libx264 -preset ultrafast -c:a aac -movflags +faststart /tmp/output_clip.mp4
    ```

    > **Why not `-c copy`?** Stream copy (`-c copy`) is fast because it doesn't re-encode, but it can only cut on keyframes (typically every 2-10 seconds). This means clips will start at the nearest keyframe before the requested timestamp, not at the actual timestamp. For a product built around precise, AI-selected moments, this produces visibly incorrect clips. The `-preset ultrafast` option minimizes the re-encode cost while ensuring frame-accurate cuts. The additional compute time on Cloud Run Jobs is negligible at MVP volumes.

-   **Error Handling**: The job must be resilient to FFmpeg errors, such as invalid timestamps or corrupted video files.

## 7. Mobile Application (React Native + Expo)

The mobile app is the sole user-facing component of the MVP. It must be intuitive, responsive, and provide a seamless user experience.

### 7.1. Project Setup

-   **Framework**: **Expo SDK 53** with React Native.
-   **Initialization**: `npx create-expo-app -t tabs` (a tab-based navigation is a good starting point).
-   **Routing**: Use **Expo Router v3** for file-based routing.
-   **UI Library**: **Tamagui** or **NativeWind** for a consistent and performant UI component library.
-   **State Management**: **Zustand**. It's simple, lightweight, and avoids boilerplate compared to Redux.
-   **Data Fetching**: **TanStack Query (React Query)** for managing server state, caching, and background refetching.

### 7.2. Key Screens & Components

1.  **Projects Screen (`/app/projects.tsx`)**
    -   Displays a list of user projects.
    -   Allows creation of a new project.

2.  **Project Detail Screen (`/app/projects/[id].tsx`)**
    -   Shows the script, the original video, and the list of generated clips.
    -   This will be the main hub for a piece of content.

3.  **AI Script Co-Pilot Screen (`/app/scripts/[id]/chat.tsx`)**
    -   A standard chat interface.
    -   Component for displaying streamed messages from the Gemini API.

4.  **Video Upload Component**
    -   Uses `expo-image-picker` to select a video from the user's library.
    -   Uses `expo-file-system` to get file info and manage the upload.
    -   **Upload Limits (Client-Side)**: Before requesting a signed URL, validate that the selected video is **under 2 GB** and **under 30 minutes**. Use `expo-file-system` for file size and `expo-av` to read the video duration. Reject with a user-friendly error message if either limit is exceeded. These limits protect the $300 GCP budget — a single 2-hour 4K video can cost $12+ in API fees.
    -   **Crucial**: Implements a background-capable upload using the signed URL from the backend. Do not block the UI during upload. `expo-background-fetch` or a custom native module might be needed for true background uploads on large files.

5.  **Clip Reviewer Screen (`/app/clips/[id].tsx`)**
    -   Uses `expo-av` to play the video clip served from Cloud CDN.
    -   Provides "Approve" and "Reject" buttons.
    -   Allows the user to download the clip to their device's camera roll using `expo-media-library`.

6.  **Video Processing Status Polling**
    -   After a video is uploaded, the app must poll for processing completion since the pipeline is asynchronous.
    -   Use TanStack Query's `useQuery` with `refetchInterval` to poll `GET /videos/{id}` every **5 seconds** while `processing_status` is `PENDING` or `PROCESSING`.
    -   **Stop polling** when the status changes to `COMPLETED` or `FAILED`, or after a **10-minute timeout** (whichever comes first).
    -   Display a simple progress indicator (e.g., "Analyzing video...", "Extracting clips...") during polling. The backend can update `processing_status` with more granular states if desired (e.g., `TRANSCRIBING`, `ANALYZING`, `CLIPPING`).
    ```typescript
    const { data: video } = useQuery({
        queryKey: ['video', videoId],
        queryFn: () => api.getVideo(videoId),
        refetchInterval: (query) => {
            const status = query.state.data?.processing_status;
            if (status === 'COMPLETED' || status === 'FAILED') return false;
            return 5000; // Poll every 5 seconds
        },
    });
    ```

### 7.3. API Integration

-   Create a centralized API client using `axios`.
-   Use TanStack Query's `useQuery` and `useMutation` hooks to interact with the backend API, providing a clean separation of concerns and excellent UX features like loading states and error handling.

## 8. Deployment & CI/CD

A robust CI/CD pipeline is essential for rapid iteration. We will use GitHub Actions for the backend and Expo Application Services (EAS) for the mobile app.

### 8.1. Backend (Cloud Run)

-   **Source Control**: GitHub repository.
-   **CI/CD**: GitHub Actions.
-   **Workflow Trigger**: On push to the `main` branch.

**GitHub Actions Workflow (`.github/workflows/deploy.yml`):**

1.  **Authenticate to GCP**: Use `google-github-actions/auth` to authenticate using a Workload Identity Federation service account.
2.  **Build & Push Docker Images**: For both the API service and the video processor job, build the Docker image and push it to **Google Artifact Registry**.
3.  **Deploy to Cloud Run**: Use `google-github-actions/deploy-cloud-run` to deploy the new image to the Cloud Run service and update the Cloud Run job definition.
4.  **Secrets Management**: Store sensitive information (database credentials, API keys) in **Google Secret Manager** and access them as environment variables in the Cloud Run configurations.

### 8.2. Mobile App (Expo)

-   **Service**: Expo Application Services (EAS).
-   **Builds**: Use `eas build` to create production builds for the Apple App Store and Google Play Store. EAS handles the entire native build process in the cloud, including signing.
-   **Updates**: Use `eas update` to publish over-the-air (OTA) updates. This allows for instant deployment of JavaScript code changes, UI tweaks, and bug fixes without requiring a new app store submission.
-   **Release Channels**: Configure different release channels in `eas.json` (e.g., `development`, `preview`, `production`) to test updates before pushing them to all users.

## 9. Testing Strategy

A multi-layered testing approach will ensure application quality and reliability.

### 9.1. Backend Testing

-   **Unit Tests**: Use **Jest** to test individual functions, modules, and utilities in isolation. Mock external dependencies like GCP APIs and the database.
-   **Integration Tests**: Use **Jest** and **Supertest** to test API endpoints. For database interactions, use **Testcontainers** to spin up a temporary PostgreSQL + pgvector database in Docker for each test run, ensuring tests run against a real, isolated database.
-   **End-to-End (E2E) Tests**: A script (using Node.js or Python) that simulates the full user flow: calls the `/upload-url` endpoint, uploads a small sample video, polls the API for processing status, and verifies that the clip records are created in the database.

### 9.2. Mobile App Testing

-   **Unit Tests**: Use **Jest** with **React Native Testing Library** to test individual components, hooks, and utility functions.
-   **Integration Tests**: Test navigation flows and interactions between multiple components and screens.
-   **E2E Tests**: Use **Maestro**. It's a simple, YAML-based framework that is easy to set up and write tests for, simulating real user taps, swipes, and text input on emulators or real devices.

## 10. Phased Implementation Plan (for Claude Code)

This plan breaks down the MVP development into logical, sequential phases.

### Phase 1: Backend Foundation & Infrastructure

1.  **Infrastructure as Code**: Write Terraform scripts to provision all GCP resources defined in Section 3.
2.  **Database Schema**: Initialize the Cloud SQL instance and apply the SQL schema from Section 4.
3.  **API Service Setup**: Create the Node.js/Express project for the main API. Establish a connection to the Cloud SQL database.
4.  **API Key Auth Middleware**: Implement the simple API key authentication middleware (see Section 5.1) and store the key in Google Secret Manager. This must be in place before any endpoints are exposed.
5.  **Core Endpoints**: Implement the basic CRUD endpoints for `projects` and `scripts` (without AI logic). Implement the `/videos/upload-url` endpoint to return a signed URL for Cloud Storage, including the upload size/duration validation.

### Phase 2: Core Video Processing Pipeline

1.  **Job Service Setup**: Create the Node.js project for the video processor Cloud Run Job.
2.  **Dockerfile**: Create the Dockerfile that includes FFmpeg.
3.  **Pub/Sub Trigger**: Implement the logic to receive and parse the Pub/Sub message from a Cloud Storage upload.
4.  **GCP API Integration**: Integrate the clients for the Video Intelligence API and Speech-to-Text API.
5.  **FFmpeg Execution**: Write the wrapper function to execute FFmpeg commands using `child_process`. Start by cutting a dummy 10-second clip from the uploaded video.
6.  **Storage & Database Update**: Implement the logic to upload the processed clip back to Cloud Storage and update the `videos` and `clips` tables in the database.

### Phase 3: Mobile App - Scaffolding & Video Upload

1.  **Project Initialization**: Create the Expo (SDK 53) project using the `tabs` template and set up Expo Router.
2.  **UI Scaffolding**: Implement the basic UI for the main screens (Projects, Project Detail, Settings) using a chosen UI library like Tamagui.
3.  **API Client**: Set up the API client (axios) and TanStack Query for data fetching.
4.  **Video Upload Flow**: Implement the video selection (`expo-image-picker`) and direct-to-GCS upload functionality using the signed URL from the backend. Include client-side validation for the 2 GB / 30-minute upload limits before requesting the signed URL.

### Phase 4: AI Integration & Clip Generation

1.  **AI Script Co-Pilot**: Implement the chat interface in the mobile app. Create the `/scripts/chat` backend endpoint that manages the conversation state (persisting messages to the `chat_messages` table) and streams responses from the Gemini 3 Pro API.
2.  **Intelligent Clipping Logic**: In the video processing job, implement the call to Gemini 3 Flash (as described in Section 5.2) to analyze the transcription and shot timestamps to determine which clips to cut.
3.  **Dynamic FFmpeg Execution**: Modify the FFmpeg logic to use the start and end times returned by Gemini to cut the clips.
4.  **Clip Ranking**: Store the `strategic_rank` and `hook_score` from the Gemini response in the `clips` table.

### Phase 5: Clip Review & Finalization

1.  **Clip List UI**: In the mobile app's Project Detail screen, display the list of generated clips, ordered by their `strategic_rank`. Implement the processing status polling (see Section 7.2, item 6) to show progress and transition to the clip list when processing completes.
2.  **Video Player**: Implement the clip reviewer screen using `expo-av` to play the clips from their Cloud CDN URLs.
3.  **User Actions**: Implement the "Approve"/"Reject" buttons, which call the `PUT /clips/{id}` endpoint.
4.  **Download Functionality**: Implement the "Download" button using `expo-media-library` to save the selected clip to the user's device.
5.  **Long-Form Guidance**: Display the AI-generated long-form editing suggestions on the Project Detail screen.

## 11. MVP Cost Estimation ($300 Free Credits Budget)

Understanding the cost profile is critical for managing the $300 GCP free credits effectively. The two biggest cost drivers are the Video Intelligence API and the always-on Cloud SQL instance.

### 11.1. Per-Video Processing Cost

| Service | Est. Cost (20 min video) | Notes |
| :--- | :--- | :--- |
| Video Intelligence API (shot detection) | ~$2.00 | $0.10/min of video analyzed |
| Speech-to-Text v2 | Free | 60 min/month included in free tier |
| Vertex AI - Gemini (script chat) | ~$0.05 | Varies with conversation length |
| Vertex AI - Gemini (clip analysis) | ~$0.10 | Single prompt + structured response |
| Cloud Run Job (processing) | ~$0.15 | ~10 min of 2 vCPU compute |
| Cloud Storage | Negligible | Pennies at MVP volume |
| **Total per video** | **~$2.30** | |

### 11.2. Fixed Infrastructure Cost

| Service | Monthly Cost | Notes |
| :--- | :--- | :--- |
| Cloud SQL (`db-custom-1-3840`) | ~$60/month (24/7) | **Biggest budget risk.** Stop the instance when not actively developing or testing. |
| Cloud CDN | Negligible | Minimal egress at MVP volume |
| Cloud Run API Service | Negligible | Scales to zero when idle |

### 11.3. Budget Planning

With careful Cloud SQL management (stopping the instance when idle), the $300 budget supports approximately **80–100 video processing runs** during validation. This is sufficient to test with real users and iterate on the clip selection prompt.

> **⚠️ Critical**: Set a calendar reminder or write a simple script to **stop the Cloud SQL instance at end of day**. Left running 24/7, it alone will consume your entire $300 in ~5 months — even with zero video processing. During active development sprints, budget ~$2/day for Cloud SQL uptime.

## 12. Conclusion

This guide outlines a robust, scalable, and cost-effective architecture for the viral content creator platform MVP. By leveraging GCP's powerful serverless and AI capabilities, combined with the efficiency of open-source tools like FFmpeg and the rapid development cycle of React Native/Expo, this plan provides a clear path to building a product that addresses significant and valuable gaps in the creator market. Adherence to this phased implementation will enable a focused and efficient development process, resulting in a high-quality MVP ready for user validation.
