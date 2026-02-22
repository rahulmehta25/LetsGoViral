-- Migration 003: Add multi-SFX overlay columns to clips table
-- Run after 002_sound_effects.sql

ALTER TABLE clips ADD COLUMN IF NOT EXISTS sfx_data JSONB;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS sfx_video_url TEXT;
