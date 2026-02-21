import axios from 'axios';

// Mock axios before importing the client
jest.mock('axios', () => {
  const mockInstance = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      response: { use: jest.fn() },
    },
  };
  return {
    create: jest.fn().mockReturnValue(mockInstance),
    __mockInstance: mockInstance,
  };
});

// Mock expo-secure-store (which imports expo internals)
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

// Mock the expo virtual env module
jest.mock('expo/virtual/env', () => ({
  env: process.env,
}), { virtual: true });

import { projectsApi, clipsApi, scriptsApi, videosApi } from '../api/client';

const { __mockInstance } = axios as any;

describe('API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('projectsApi', () => {
    test('list fetches all projects', async () => {
      __mockInstance.get.mockResolvedValue({
        data: { data: [{ id: '1', name: 'Project A' }] },
      });

      const result = await projectsApi.list();

      expect(__mockInstance.get).toHaveBeenCalledWith('/projects');
      expect(result).toEqual([{ id: '1', name: 'Project A' }]);
    });

    test('create sends project payload', async () => {
      __mockInstance.post.mockResolvedValue({
        data: { data: { id: '2', name: 'New Project' } },
      });

      const result = await projectsApi.create({ name: 'New Project' });

      expect(__mockInstance.post).toHaveBeenCalledWith('/projects', { name: 'New Project' });
      expect(result.name).toBe('New Project');
    });

    test('delete calls correct endpoint', async () => {
      __mockInstance.delete.mockResolvedValue({});

      await projectsApi.delete('abc-123');

      expect(__mockInstance.delete).toHaveBeenCalledWith('/projects/abc-123');
    });
  });

  describe('clipsApi', () => {
    test('get fetches clip by id', async () => {
      __mockInstance.get.mockResolvedValue({
        data: { data: { id: 'clip-1', hook_score: 8.5 } },
      });

      const result = await clipsApi.get('clip-1');

      expect(__mockInstance.get).toHaveBeenCalledWith('/clips/clip-1');
      expect(result.hook_score).toBe(8.5);
    });

    test('approve sends user_approved: true', async () => {
      __mockInstance.put.mockResolvedValue({
        data: { data: { id: 'clip-1', user_approved: true } },
      });

      const result = await clipsApi.approve('clip-1');

      expect(__mockInstance.put).toHaveBeenCalledWith('/clips/clip-1', { user_approved: true });
      expect(result.user_approved).toBe(true);
    });

    test('reject sends user_approved: false', async () => {
      __mockInstance.put.mockResolvedValue({
        data: { data: { id: 'clip-1', user_approved: false } },
      });

      const result = await clipsApi.reject('clip-1');

      expect(__mockInstance.put).toHaveBeenCalledWith('/clips/clip-1', { user_approved: false });
      expect(result.user_approved).toBe(false);
    });
  });

  describe('scriptsApi', () => {
    test('create sends project_id', async () => {
      __mockInstance.post.mockResolvedValue({
        data: { data: { id: 'script-1', project_id: 'proj-1' } },
      });

      const result = await scriptsApi.create({ project_id: 'proj-1' });

      expect(__mockInstance.post).toHaveBeenCalledWith('/scripts', { project_id: 'proj-1' });
      expect(result.project_id).toBe('proj-1');
    });
  });

  describe('videosApi', () => {
    test('getUploadUrl sends upload payload', async () => {
      __mockInstance.post.mockResolvedValue({
        data: {
          data: {
            upload_url: 'https://storage.googleapis.com/signed-url',
            video_id: 'vid-1',
          },
        },
      });

      const result = await videosApi.getUploadUrl({
        project_id: 'proj-1',
        filename: 'video.mp4',
        content_type: 'video/mp4',
      });

      expect(result.upload_url).toContain('googleapis.com');
      expect(result.video_id).toBe('vid-1');
    });
  });
});
