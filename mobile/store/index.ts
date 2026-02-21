import { create } from 'zustand';

export interface Clip {
  id: string;
  video_id: string;
  cdn_url: string;
  start_time_seconds: number;
  end_time_seconds: number;
  duration_seconds: number;
  strategic_rank: number;
  hook_score: number;
  rationale: string;
  title: string | null;
  hook: string | null;
  user_approved: boolean | null;
}

export interface EditGuidanceSuggestion {
  timestamp_seconds: number;
  type: 'pattern_interrupt' | 'b_roll' | 'on_screen_graphic' | 'pacing_edit';
  suggestion: string;
}

export interface EditGuidance {
  overall_feedback: string;
  suggestions: EditGuidanceSuggestion[];
}

export interface Video {
  id: string;
  project_id: string;
  original_filename: string;
  processing_status:
    | 'PENDING' | 'PROCESSING' | 'TRANSCRIBING'
    | 'ANALYZING' | 'CLIPPING' | 'COMPLETED' | 'FAILED';
  duration_seconds: number | null;
  transcription: string | null;
  edit_guidance: EditGuidance | null;
  clips: Clip[];
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  video_count: number;
  created_at: string;
  updated_at: string;
}

interface AppState {
  // Navigation context
  selectedProjectId: string | null;
  selectedVideoId:   string | null;
  selectedClipId:    string | null;

  // Upload state
  uploadProgress: number;
  isUploading:    boolean;

  // Actions
  setSelectedProject: (id: string | null) => void;
  setSelectedVideo:   (id: string | null) => void;
  setSelectedClip:    (id: string | null) => void;
  setUploadProgress:  (progress: number)  => void;
  setIsUploading:     (uploading: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedProjectId: null,
  selectedVideoId:   null,
  selectedClipId:    null,
  uploadProgress:    0,
  isUploading:       false,

  setSelectedProject: (id)       => set({ selectedProjectId: id }),
  setSelectedVideo:   (id)       => set({ selectedVideoId: id }),
  setSelectedClip:    (id)       => set({ selectedClipId: id }),
  setUploadProgress:  (progress) => set({ uploadProgress: progress }),
  setIsUploading:     (uploading) => set({ isUploading: uploading }),
}));
