'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');
const gemini  = require('../services/gemini');
const { logger } = require('../utils/logger');

const router = express.Router();

// POST /api/scripts — create a new script within a project
router.post('/', async (req, res) => {
  const { project_id, title } = req.body;
  if (!project_id) return res.status(400).json({ error: 'project_id is required' });

  const scriptId = uuidv4();
  const { rows } = await db.query(
    `INSERT INTO scripts (id, project_id, title)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [scriptId, project_id, title || 'Untitled Script']
  );

  // Seed the script with the AI's system prompt as the first message
  await db.query(
    `INSERT INTO chat_messages (id, script_id, role, content)
     VALUES ($1, $2, 'system', $3)`,
    [uuidv4(), scriptId, gemini.SCRIPT_SYSTEM_PROMPT]
  );

  res.status(201).json({ data: rows[0] });
});

// GET /api/scripts/:id — get script with all chat history
router.get('/:id', async (req, res) => {
  const [scriptRes, messagesRes] = await Promise.all([
    db.query('SELECT * FROM scripts WHERE id = $1', [req.params.id]),
    db.query(
      `SELECT id, role, content, created_at
       FROM chat_messages
       WHERE script_id = $1 AND role != 'system'
       ORDER BY created_at ASC`,
      [req.params.id]
    ),
  ]);

  if (!scriptRes.rows[0]) return res.status(404).json({ error: 'Script not found' });
  res.json({ data: { ...scriptRes.rows[0], messages: messagesRes.rows } });
});

/**
 * POST /api/scripts/chat
 * Body: { script_id, message }
 *
 * Streams Gemini response back as Server-Sent Events (SSE).
 * The client should set `Accept: text/event-stream`.
 */
router.post('/chat', async (req, res) => {
  const { script_id, message } = req.body;
  if (!script_id || !message) {
    return res.status(400).json({ error: 'script_id and message are required' });
  }

  // Fetch full conversation history (including system prompt)
  const { rows: history } = await db.query(
    `SELECT role, content FROM chat_messages
     WHERE script_id = $1
     ORDER BY created_at ASC`,
    [script_id]
  );

  // Persist the user's new message immediately
  await db.query(
    `INSERT INTO chat_messages (id, script_id, role, content) VALUES ($1, $2, 'user', $3)`,
    [uuidv4(), script_id, message]
  );

  // Set up SSE
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  let fullResponse = '';

  try {
    const stream = await gemini.streamChat([
      ...history,
      { role: 'user', content: message },
    ]);

    for await (const chunk of stream) {
      const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (text) {
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    // Persist the assistant's complete response
    await db.query(
      `INSERT INTO chat_messages (id, script_id, role, content) VALUES ($1, $2, 'assistant', $3)`,
      [uuidv4(), script_id, fullResponse]
    );

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    logger.error(`Gemini streaming error: ${err.message}`);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

module.exports = router;
