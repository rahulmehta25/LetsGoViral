import axios, { AxiosInstance } from 'axios';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.clipora.io';
const API_KEY  = process.env.EXPO_PUBLIC_API_KEY  || '';

let _client: AxiosInstance | null = null;

function getClient(): AxiosInstance {
  if (!_client) {
    _client = axios.create({
      baseURL: `${BASE_URL}/api`,
      timeout: 30_000,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
    });

    // Response interceptor — log errors in dev
    _client.interceptors.response.use(
      (res) => res,
      (err) => {
        if (__DEV__) {
          console.error('[API Error]', err.response?.status, err.response?.data);
        }
        return Promise.reject(err);
      }
    );
  }
  return _client;
}

// ─── Projects ─────────────────────────────────────────────────────────────
export const projectsApi = {
  list: ()              => getClient().get('/projects').then(r => r.data.data),
  get:  (id: string)   => getClient().get(`/projects/${id}`).then(r => r.data.data),
  create: (payload: { name: string; description?: string }) =>
    getClient().post('/projects', payload).then(r => r.data.data),
  update: (id: string, payload: { name?: string; description?: string }) =>
    getClient().put(`/projects/${id}`, payload).then(r => r.data.data),
  delete: (id: string) => getClient().delete(`/projects/${id}`),
};

// ─── Scripts ──────────────────────────────────────────────────────────────
export const scriptsApi = {
  create: (payload: { project_id: string; title?: string }) =>
    getClient().post('/scripts', payload).then(r => r.data.data),
  get:    (id: string) => getClient().get(`/scripts/${id}`).then(r => r.data.data),
};

// ─── Videos ───────────────────────────────────────────────────────────────
export const videosApi = {
  getUploadUrl: (payload: {
    project_id: string;
    filename: string;
    content_type: string;
    file_size_mb?: number;
    duration_seconds?: number;
  }) => getClient().post('/videos/upload-url', payload).then(r => r.data.data),

  get:      (id: string) => getClient().get(`/videos/${id}`).then(r => r.data.data),
  getClips: (id: string) => getClient().get(`/videos/${id}/clips`).then(r => r.data.data),

  /**
   * Upload a video file directly to GCS using the signed URL.
   * Uses fetch for streaming upload (axios doesn't support it well on RN).
   */
  uploadToGCS: async (
    signedUrl: string,
    fileUri: string,
    contentType: string,
    onProgress?: (progress: number) => void
  ) => {
    const response = await fetch(fileUri);
    const blob     = await response.blob();

    return fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: blob,
    });
  },
};

// ─── Clips ────────────────────────────────────────────────────────────────
export const clipsApi = {
  get:     (id: string) => getClient().get(`/clips/${id}`).then(r => r.data.data),
  approve: (id: string) => getClient().put(`/clips/${id}`, { user_approved: true }).then(r => r.data.data),
  reject:  (id: string) => getClient().put(`/clips/${id}`, { user_approved: false }).then(r => r.data.data),
};
