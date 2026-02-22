-- Migration 002: Add sound effect columns to clips table
-- Run after 001_clip_review_workflow.sql

ALTER TABLE clips ADD COLUMN IF NOT EXISTS sound_url TEXT;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS sound_prompt TEXT;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS sound_type VARCHAR(10)
  CHECK (sound_type IN ('sfx', 'music'));
