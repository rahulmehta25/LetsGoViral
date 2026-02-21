'use strict';

const express = require('express');
const request = require('supertest');

// Mock the database module
jest.mock('../db', () => ({
  query: jest.fn(),
}));

const db = require('../db');
const projectsRouter = require('../routes/projects');

// Create a minimal Express app for testing
function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', projectsRouter);
  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: err.message });
  });
  return app;
}

describe('Projects API', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
  });

  describe('GET /api/projects', () => {
    test('returns list of projects', async () => {
      const mockProjects = [
        { id: '1', name: 'Project A', video_count: 2 },
        { id: '2', name: 'Project B', video_count: 0 },
      ];
      db.query.mockResolvedValue({ rows: mockProjects });

      const res = await request(app).get('/api/projects');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(mockProjects);
      expect(db.query).toHaveBeenCalledTimes(1);
    });

    test('returns empty array when no projects', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const res = await request(app).get('/api/projects');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('POST /api/projects', () => {
    test('creates a project with name', async () => {
      const newProject = { id: 'new-id', name: 'Test Project', description: null };
      db.query.mockResolvedValue({ rows: [newProject] });

      const res = await request(app)
        .post('/api/projects')
        .send({ name: 'Test Project' });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Test Project');
      expect(db.query).toHaveBeenCalledTimes(1);
    });

    test('rejects request without name', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('name is required');
    });

    test('creates a project with name and description', async () => {
      const newProject = { id: 'new-id', name: 'Test', description: 'A description' };
      db.query.mockResolvedValue({ rows: [newProject] });

      const res = await request(app)
        .post('/api/projects')
        .send({ name: 'Test', description: 'A description' });

      expect(res.status).toBe(201);
      expect(res.body.data.description).toBe('A description');
    });
  });

  describe('GET /api/projects/:id', () => {
    test('returns project with videos', async () => {
      const project = { id: '1', name: 'Project A', videos: [] };
      db.query.mockResolvedValue({ rows: [project] });

      const res = await request(app).get('/api/projects/1');

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('1');
    });

    test('returns 404 for nonexistent project', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const res = await request(app).get('/api/projects/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Project not found');
    });
  });

  describe('PUT /api/projects/:id', () => {
    test('updates project name', async () => {
      const updated = { id: '1', name: 'Updated Name' };
      db.query.mockResolvedValue({ rows: [updated] });

      const res = await request(app)
        .put('/api/projects/1')
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated Name');
    });

    test('returns 404 for nonexistent project', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .put('/api/projects/nonexistent')
        .send({ name: 'Test' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/projects/:id', () => {
    test('deletes existing project', async () => {
      db.query.mockResolvedValue({ rowCount: 1 });

      const res = await request(app).delete('/api/projects/1');

      expect(res.status).toBe(204);
    });

    test('returns 404 for nonexistent project', async () => {
      db.query.mockResolvedValue({ rowCount: 0 });

      const res = await request(app).delete('/api/projects/nonexistent');

      expect(res.status).toBe(404);
    });
  });
});
