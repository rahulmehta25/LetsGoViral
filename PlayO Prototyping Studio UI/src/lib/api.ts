import {
  ChatMessage,
  ProjectDetails,
  ProjectSummary,
  Script,
  VideoDetails,
  Clip,
  SoundSuggestion,
} from '../types';

// Empty string = use same origin (Vite proxy in dev). Omitted = local API on 8080.
const rawApiUrl = import.meta.env.VITE_API_URL;
const API_BASE_URL = typeof rawApiUrl === 'string' ? rawApiUrl.replace(/\/+$/, '') : 'http://localhost:8080';
const API_KEY = (import.meta.env.VITE_API_KEY as string | undefined) || 'dev-api-key';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const json = (await response.json()) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      // Ignore parse errors and use fallback message.
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;

  const json = (await response.json()) as { data: T };
  return json.data;
}

export const webApi = {
  projects: {
    list: () => request<ProjectSummary[]>('/projects'),
    create: (payload: { name: string; description?: string }) =>
      request<ProjectSummary>('/projects', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    get: (projectId: string) => request<ProjectDetails>(`/projects/${projectId}`),
  },
  videos: {
    getUploadUrl: (payload: {
      project_id: string;
      filename: string;
      content_type: string;
      file_size_mb?: number;
      duration_seconds?: number;
    }) =>
      request<{ video: { id: string }; signed_url: string }>('/videos/upload-url', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    get: (videoId: string) => request<VideoDetails>(`/videos/${videoId}`),
    getSourcePreview: (videoId: string) =>
      request<{ source_video_url: string }>(`/videos/${videoId}/source-preview`),
    finalizeClips: (
      videoId: string,
      clips: Array<{ id: string; start_time_seconds: number; end_time_seconds: number }>,
    ) =>
      request<{ video_id: string; clips: Clip[] }>(`/videos/${videoId}/finalize-clips`, {
        method: 'POST',
        body: JSON.stringify({ clips }),
      }),
    reanalyzeClips: (videoId: string, suggestion: string) =>
      request<{ video_id: string; clips: Clip[] }>(`/videos/${videoId}/reanalyze-clips`, {
        method: 'POST',
        body: JSON.stringify({ suggestion }),
      }),
  },
  clips: {
    updateApproval: (clipId: string, userApproved: boolean) =>
      request<Clip>(`/clips/${clipId}`, {
        method: 'PUT',
        body: JSON.stringify({ user_approved: userApproved }),
      }),
    autoGenerateSound: (clipId: string) =>
      request<{ clip: Clip; suggestions: { tone: string; vibe: string; sfx: SoundSuggestion[]; music: SoundSuggestion[] } }>(
        `/clips/${clipId}/auto-sound`,
        { method: 'POST' }
      ),
    getSoundSuggestions: (clipId: string) =>
      request<{ tone: string; vibe: string; sfx: SoundSuggestion[]; music: SoundSuggestion[] }>(
        `/clips/${clipId}/sound-suggestions`
      ),
    generateSound: (
      clipId: string,
      payload: { prompt: string; type: 'sfx' | 'music'; duration_seconds?: number }
    ) =>
      request<Clip>(`/clips/${clipId}/sound`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    generateSfx: (clipId: string) =>
      request<{ clip: Clip }>(`/clips/${clipId}/generate-sfx`, { method: 'POST' }),
    deleteSfxItem: (clipId: string, sfxId: string) =>
      request<{ clip: Clip }>(`/clips/${clipId}/sfx/${sfxId}`, { method: 'DELETE' }),
    updateSfxItem: (clipId: string, sfxId: string, prompt: string) =>
      request<{ clip: Clip }>(`/clips/${clipId}/sfx/${sfxId}`, {
        method: 'PUT',
        body: JSON.stringify({ prompt }),
      }),
    updateSfxTimestamp: (clipId: string, sfxId: string, timestamp_seconds: number) =>
      request<{ clip: Clip }>(`/clips/${clipId}/sfx/${sfxId}`, {
        method: 'PATCH',
        body: JSON.stringify({ timestamp_seconds }),
      }),
    addSfx: (clipId: string, payload: { prompt: string; timestamp_seconds: number; label?: string }) =>
      request<{ clip: Clip }>(`/clips/${clipId}/sfx`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },
  scripts: {
    create: (projectId: string) =>
      request<Script>('/scripts', {
        method: 'POST',
        body: JSON.stringify({ project_id: projectId, title: 'Web Script Session' }),
      }),
    get: (scriptId: string) => request<{ id: string; messages: ChatMessage[] }>(`/scripts/${scriptId}`),
    streamChat: async (
      scriptId: string,
      message: string,
      onChunk: (chunk: string) => void,
    ): Promise<void> => {
      const response = await fetch(`${API_BASE_URL}/api/scripts/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ script_id: scriptId, message }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Chat request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const event of events) {
          const lines = event.split('\n');
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6);
            if (payload === '[DONE]') return;
            try {
              const parsed = JSON.parse(payload) as { text?: string; error?: string };
              if (parsed.error) throw new Error(parsed.error);
              if (parsed.text) onChunk(parsed.text);
            } catch (error) {
              if (error instanceof Error) throw error;
            }
          }
        }
      }
    },
  },
};
