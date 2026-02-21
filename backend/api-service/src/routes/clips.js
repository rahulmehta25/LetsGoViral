'use strict';

const express = require('express');
const db      = require('../db');

const router = express.Router();

// PUT /api/clips/:id — approve or reject a clip
router.put('/:id', async (req, res) => {
  const { user_approved } = req.body;

  if (user_approved === undefined || user_approved === null) {
    return res.status(400).json({ error: 'user_approved (boolean) is required' });
  }

  const { rows } = await db.query(
    `UPDATE clips SET user_approved = $1 WHERE id = $2 RETURNING *`,
    [Boolean(user_approved), req.params.id]
  );

  if (!rows[0]) return res.status(404).json({ error: 'Clip not found' });
  res.json({ data: rows[0] });
});

// GET /api/clips/:id
router.get('/:id', async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM clips WHERE id = $1',
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Clip not found' });
  res.json({ data: rows[0] });
});

module.exports = router;
