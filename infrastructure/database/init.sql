-- Clipora MVP Database Schema
-- Run against creator_mvp database on Cloud SQL (PostgreSQL 15+)

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────
-- Users
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email      VARCHAR(255) UNIQUE NOT NULL,
    clerk_id   VARCHAR(255) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- Projects
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- Scripts (AI Co-Pilot)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scripts (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    title      VARCHAR(255) NOT NULL,
    content    JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- Videos
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS videos (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id              UUID REFERENCES projects(id) ON DELETE CASCADE,
    original_filename       VARCHAR(255) NOT NULL,
    upload_path             TEXT NOT NULL,
    processing_status       VARCHAR(50) DEFAULT 'PENDING'
                              CHECK (processing_status IN (
                                'PENDING','PROCESSING','TRANSCRIBING',
                                'ANALYZING','CLIPPING','COMPLETED','FAILED'
                              )),
    duration_seconds        INT,
    transcription           TEXT,
    shot_change_timestamps  JSONB,
    edit_guidance           JSONB,
    created_at              TIMESTAMPTZ DEFAULT now(),
    updated_at              TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- Clips
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clips (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id            UUID REFERENCES videos(id) ON DELETE CASCADE,
    processed_path      TEXT NOT NULL,
    cdn_url             TEXT,
    start_time_seconds  NUMERIC(10,3) NOT NULL,
    end_time_seconds    NUMERIC(10,3) NOT NULL,
    duration_seconds    NUMERIC(10,3) NOT NULL,
    strategic_rank      INT,
    hook_score          FLOAT,
    rationale           TEXT,
    content_embedding   VECTOR(768),
    user_approved       BOOLEAN DEFAULT NULL,
    created_at          TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- Chat Messages
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id  UUID REFERENCES scripts(id) ON DELETE CASCADE,
    role       VARCHAR(20) NOT NULL CHECK (role IN ('user','assistant','system')),
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_user_id       ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_project_id      ON videos(project_id);
CREATE INDEX IF NOT EXISTS idx_videos_status          ON videos(processing_status);
CREATE INDEX IF NOT EXISTS idx_clips_video_id         ON clips(video_id);
CREATE INDEX IF NOT EXISTS idx_clips_rank             ON clips(strategic_rank);
CREATE INDEX IF NOT EXISTS idx_chat_messages_script   ON chat_messages(script_id);

-- HNSW vector index (enable post-MVP when embedding column is populated)
-- CREATE INDEX ON clips USING hnsw (content_embedding vector_l2_ops);
