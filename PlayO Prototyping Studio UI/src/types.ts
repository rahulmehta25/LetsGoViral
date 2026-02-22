export type Screen =
  | 'splash'
  | 'onboarding'
  | 'projects'
  | 'upload'
  | 'processing'
  | 'chat'
  | 'detail'
  | 'reviewer';

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  updated_at: string;
  video_count: number;
}

export interface ProjectDetails {
  id: string;
  name: string;
  description: string | null;
  videos: Array<{
    id: string;
    original_filename: string;
    processing_status: string;
    duration_seconds: number | null;
    created_at: string;
  }>;
}

export interface EditGuidanceSuggestion {
  timestamp_seconds: number;
  type: string;
  suggestion: string;
}

export interface EditGuidance {
  overall_feedback?: string;
  suggestions?: EditGuidanceSuggestion[];
}

export interface SoundSuggestion {
  label: string;
  prompt: string;
}

export interface SfxItem {
  id: string;
  timestamp_seconds: number;
  label: string;
  prompt: string;
  sfx_url: string;
  duration_seconds: number;
  volume?: number;
}

export interface Clip {
  id: string;
  video_id: string;
  start_time_seconds: number | null;
  end_time_seconds: number | null;
  duration_seconds: number | null;
  strategic_rank: number | null;
  hook_score: number | null;
  rationale: string | null;
  cdn_url: string | null;
  title: string | null;
  hook: string | null;
  user_approved: boolean | null;
  sound_url: string | null;
  sound_prompt: string | null;
  sound_type: 'sfx' | 'music' | null;
  sfx_data: SfxItem[] | null;
  sfx_video_url: string | null;
  music_data: { track_id: string; track_url: string; volume: number } | null;
}

export interface VideoDetails {
  id: string;
  project_id: string;
  processing_status: string;
  source_video_url?: string | null;
  clips: Clip[];
  edit_guidance?: EditGuidance;
}

export interface Script {
  id: string;
  project_id: string;
  title: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}
