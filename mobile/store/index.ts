import { create } from 'zustand';

export interface Clip {
  id: string;
  video_id: string;
  cdn_url: string;
  duration_seconds: number;
  strategic_rank: number;
  hook_score: number;
  rationale: string;
  user_approved: boolean | null;
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
