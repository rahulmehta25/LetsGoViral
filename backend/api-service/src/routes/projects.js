'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const router = express.Router();

// GET /api/projects — list all projects for current user
// NOTE: Post-MVP this will filter by authenticated user_id.
router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT p.*,
            COUNT(v.id) AS video_count
     FROM projects p
     LEFT JOIN videos v ON v.project_id = p.id
     GROUP BY p.id
     ORDER BY p.updated_at DESC`
  );
  res.json({ data: rows });
});

// POST /api/projects — create a project
router.post('/', async (req, res) => {
  const { name, description, user_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const { rows } = await db.query(
    `INSERT INTO projects (id, user_id, name, description)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [uuidv4(), user_id || null, name, description || null]
  );
  res.status(201).json({ data: rows[0] });
});

// GET /api/projects/:id
router.get('/:id', async (req, res) => {
  const { rows } = await db.query(
    `SELECT p.*,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', v.id,
                  'original_filename', v.original_filename,
                  'processing_status', v.processing_status,
                  'duration_seconds',  v.duration_seconds,
                  'created_at',        v.created_at
                )
              ) FILTER (WHERE v.id IS NOT NULL),
              '[]'
            ) AS videos
     FROM projects p
     LEFT JOIN videos v ON v.project_id = p.id
     WHERE p.id = $1
     GROUP BY p.id`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Project not found' });
  res.json({ data: rows[0] });
});

// PUT /api/projects/:id
router.put('/:id', async (req, res) => {
  const { name, description } = req.body;
  const { rows } = await db.query(
    `UPDATE projects
     SET name        = COALESCE($1, name),
         description = COALESCE($2, description),
         updated_at  = now()
     WHERE id = $3
     RETURNING *`,
    [name, description, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Project not found' });
  res.json({ data: rows[0] });
});

// DELETE /api/projects/:id
router.delete('/:id', async (req, res) => {
  const { rowCount } = await db.query(
    'DELETE FROM projects WHERE id = $1',
    [req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Project not found' });
  res.status(204).end();
});

module.exports = router;
