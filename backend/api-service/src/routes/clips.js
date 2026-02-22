'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
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

// GET /api/clips/:id/sound-suggestions — analyze clip tone and return sound prompts
router.get('/:id/sound-suggestions', async (req, res) => {
  const { analyzeToneAndSuggestSounds } = require('../services/soundAnalyzer');

  const { rows } = await db.query(
    `SELECT c.*, v.transcription
       FROM clips c
       JOIN videos v ON v.id = c.video_id
      WHERE c.id = $1`,
    [req.params.id]
  );

  if (!rows[0]) return res.status(404).json({ error: 'Clip not found' });

  const clip = rows[0];
  const transcriptExcerpt = (clip.transcription || '').substring(0, 600);

  const suggestions = await analyzeToneAndSuggestSounds(clip, transcriptExcerpt);
  res.json({ data: suggestions });
});

// POST /api/clips/:id/auto-sound — Gemini picks best SFX automatically, generates it, saves to clip
router.post('/:id/auto-sound', async (req, res) => {
  const { analyzeToneAndSuggestSounds } = require('../services/soundAnalyzer');
  const { generateAudio, uploadAudioToGCS } = require('../services/elevenlabs');

  const { rows } = await db.query(
    `SELECT c.*, v.transcription
       FROM clips c
       JOIN videos v ON v.id = c.video_id
      WHERE c.id = $1`,
    [req.params.id]
  );

  if (!rows[0]) return res.status(404).json({ error: 'Clip not found' });

  const clip = rows[0];
  const transcriptExcerpt = (clip.transcription || '').substring(0, 600);

  // Gemini analyzes tone and returns ranked suggestions
  const suggestions = await analyzeToneAndSuggestSounds(clip, transcriptExcerpt);

  // Auto-pick the top SFX suggestion
  const topSfx = suggestions.sfx[0];
  const buffer = await generateAudio(topSfx.prompt, 3);
  const cdnUrl = await uploadAudioToGCS(buffer, clip.id, 'sfx');

  const { rows: updated } = await db.query(
    `UPDATE clips SET sound_url=$1, sound_prompt=$2, sound_type=$3 WHERE id=$4 RETURNING *`,
    [cdnUrl, topSfx.prompt, 'sfx', clip.id]
  );

  res.json({ data: { clip: updated[0], suggestions } });
});

// POST /api/clips/:id/sound — generate audio with ElevenLabs and save to clip
router.post('/:id/sound', async (req, res) => {
  const { generateAudio, uploadAudioToGCS, MAX_SFX_DURATION, MAX_MUSIC_DURATION } = require('../services/elevenlabs');

  const { prompt, type, duration_seconds } = req.body;

  if (!prompt || !type) {
    return res.status(400).json({ error: 'prompt and type are required' });
  }
  if (type !== 'sfx' && type !== 'music') {
    return res.status(400).json({ error: 'type must be "sfx" or "music"' });
  }

  // Check clip exists
  const { rows: clipRows } = await db.query('SELECT id FROM clips WHERE id = $1', [req.params.id]);
  if (!clipRows[0]) return res.status(404).json({ error: 'Clip not found' });

  // Cap duration to ElevenLabs limits
  const maxDur  = type === 'music' ? MAX_MUSIC_DURATION : MAX_SFX_DURATION;
  const duration = Math.min(duration_seconds || (type === 'music' ? 20 : 3), maxDur);

  const buffer = await generateAudio(prompt, duration);
  const cdnUrl = await uploadAudioToGCS(buffer, req.params.id, type);

  const { rows } = await db.query(
    `UPDATE clips SET sound_url = $1, sound_prompt = $2, sound_type = $3 WHERE id = $4 RETURNING *`,
    [cdnUrl, prompt, type, req.params.id]
  );

  res.json({ data: rows[0] });
});

// POST /api/clips/:id/generate-sfx — Gemini picks timestamped SFX moments, generates & mixes them
router.post('/:id/generate-sfx', async (req, res) => {
  const { analyzeTimestampedSfx } = require('../services/soundAnalyzer');
  const { generateAudio, uploadSfxToGCS } = require('../services/elevenlabs');
  const { mixSfxOntoVideo, uploadMixedVideoToGCS } = require('../services/sfxMixer');

  const { rows } = await db.query(
    `SELECT c.*, v.transcription
       FROM clips c
       JOIN videos v ON v.id = c.video_id
      WHERE c.id = $1`,
    [req.params.id]
  );

  if (!rows[0]) return res.status(404).json({ error: 'Clip not found' });

  const clip = rows[0];
  const clipId = clip.id;
  const transcriptExcerpt = (clip.transcription || '').substring(0, 600);

  // Step 1: Gemini identifies timestamped SFX moments
  const sfxPlan = await analyzeTimestampedSfx(clip, transcriptExcerpt);

  // Step 2: Generate each SFX audio with ElevenLabs and upload to GCS
  const sfxItems = await Promise.all(
    sfxPlan.map(async (s, i) => {
      const buffer = await generateAudio(s.prompt, s.duration_seconds);
      const sfxUrl = await uploadSfxToGCS(buffer, clipId, i);
      return { ...s, id: uuidv4(), sfx_url: sfxUrl };
    })
  );

  // Step 3: Mix SFX onto the original clip video (skip if clip not yet exported)
  let sfxVideoUrl = null;
  if (clip.cdn_url) {
    const videoBuffer = await mixSfxOntoVideo(clip.cdn_url, sfxItems);
    sfxVideoUrl = await uploadMixedVideoToGCS(videoBuffer, clipId);
  }

  // Step 4: Persist to DB
  const { rows: updated } = await db.query(
    `UPDATE clips SET sfx_data = $1, sfx_video_url = $2 WHERE id = $3 RETURNING *`,
    [JSON.stringify(sfxItems), sfxVideoUrl, clipId]
  );

  res.json({ data: { clip: updated[0] } });
});

// DELETE /api/clips/:id/sfx/:sfx_id — remove one SFX and re-mix
router.delete('/:id/sfx/:sfx_id', async (req, res) => {
  const { mixSfxOntoVideo, uploadMixedVideoToGCS } = require('../services/sfxMixer');

  const { rows } = await db.query('SELECT * FROM clips WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Clip not found' });

  const clip = rows[0];
  const currentSfx = Array.isArray(clip.sfx_data) ? clip.sfx_data : [];
  const remaining = currentSfx.filter((item) => item.id !== req.params.sfx_id);

  let sfxVideoUrl = null;

  if (remaining.length > 0) {
    if (!clip.cdn_url) {
      return res.status(422).json({ error: 'Clip has no cdn_url to re-mix SFX onto' });
    }
    const videoBuffer = await mixSfxOntoVideo(clip.cdn_url, remaining);
    sfxVideoUrl = await uploadMixedVideoToGCS(videoBuffer, clip.id);
  }

  const { rows: updated } = await db.query(
    `UPDATE clips SET sfx_data = $1, sfx_video_url = $2 WHERE id = $3 RETURNING *`,
    [remaining.length > 0 ? JSON.stringify(remaining) : null, sfxVideoUrl, clip.id]
  );

  res.json({ data: { clip: updated[0] } });
});

// PUT /api/clips/:id/sfx/:sfx_id — update prompt (regenerate audio) and/or timestamp_seconds, then re-mix
router.put('/:id/sfx/:sfx_id', async (req, res) => {
  const { generateAudio, uploadSfxToGCS } = require('../services/elevenlabs');
  const { mixSfxOntoVideo, uploadMixedVideoToGCS } = require('../services/sfxMixer');

  const { prompt, timestamp_seconds } = req.body;
  if (!prompt && timestamp_seconds === undefined) {
    return res.status(400).json({ error: 'at least one of prompt or timestamp_seconds is required' });
  }

  const { rows } = await db.query('SELECT * FROM clips WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Clip not found' });

  const clip = rows[0];
  const currentSfx = Array.isArray(clip.sfx_data) ? clip.sfx_data : [];
  const itemIndex = currentSfx.findIndex((item) => item.id === req.params.sfx_id);

  if (itemIndex === -1) return res.status(404).json({ error: 'SFX item not found' });

  const item = currentSfx[itemIndex];
  let updatedSfx = currentSfx.map((s, i) => (i === itemIndex ? { ...s } : s));

  if (prompt) {
    const buffer = await generateAudio(prompt, item.duration_seconds || 2);
    const sfxUrl = await uploadSfxToGCS(buffer, clip.id, itemIndex);
    updatedSfx[itemIndex] = { ...updatedSfx[itemIndex], prompt, sfx_url: sfxUrl };
  }
  if (timestamp_seconds !== undefined) {
    const t = Math.max(0, Number(timestamp_seconds));
    updatedSfx[itemIndex] = { ...updatedSfx[itemIndex], timestamp_seconds: t };
  }

  if (!clip.cdn_url) {
    return res.status(422).json({ error: 'Clip has no cdn_url to re-mix SFX onto' });
  }
  const videoBuffer = await mixSfxOntoVideo(clip.cdn_url, updatedSfx);
  const sfxVideoUrl = await uploadMixedVideoToGCS(videoBuffer, clip.id);

  const { rows: updated } = await db.query(
    `UPDATE clips SET sfx_data = $1, sfx_video_url = $2 WHERE id = $3 RETURNING *`,
    [JSON.stringify(updatedSfx), sfxVideoUrl, clip.id]
  );

  res.json({ data: { clip: updated[0] } });
});

// PATCH /api/clips/:id/sfx/:sfx_id — update only timestamp (move dot), re-mix
router.patch('/:id/sfx/:sfx_id', async (req, res) => {
  const { mixSfxOntoVideo, uploadMixedVideoToGCS } = require('../services/sfxMixer');

  const { timestamp_seconds } = req.body;
  if (timestamp_seconds === undefined) return res.status(400).json({ error: 'timestamp_seconds is required' });

  const { rows } = await db.query('SELECT * FROM clips WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Clip not found' });

  const clip = rows[0];
  const currentSfx = Array.isArray(clip.sfx_data) ? clip.sfx_data : [];
  const itemIndex = currentSfx.findIndex((item) => item.id === req.params.sfx_id);
  if (itemIndex === -1) return res.status(404).json({ error: 'SFX item not found' });

  const t = Math.max(0, Number(timestamp_seconds));
  const updatedSfx = currentSfx.map((s, i) =>
    i === itemIndex ? { ...s, timestamp_seconds: t } : s
  );

  if (!clip.cdn_url) {
    return res.status(422).json({ error: 'Clip has no cdn_url to re-mix SFX onto' });
  }
  const videoBuffer = await mixSfxOntoVideo(clip.cdn_url, updatedSfx);
  const sfxVideoUrl = await uploadMixedVideoToGCS(videoBuffer, clip.id);

  const { rows: updated } = await db.query(
    `UPDATE clips SET sfx_data = $1, sfx_video_url = $2 WHERE id = $3 RETURNING *`,
    [JSON.stringify(updatedSfx), sfxVideoUrl, clip.id]
  );

  res.json({ data: { clip: updated[0] } });
});

// POST /api/clips/:id/sfx — add a new SFX (prompt + timestamp), generate audio, re-mix
router.post('/:id/sfx', async (req, res) => {
  const { generateAudio, uploadSfxToGCS } = require('../services/elevenlabs');
  const { mixSfxOntoVideo, uploadMixedVideoToGCS } = require('../services/sfxMixer');

  const { prompt, timestamp_seconds, label } = req.body;
  if (!prompt || timestamp_seconds === undefined) {
    return res.status(400).json({ error: 'prompt and timestamp_seconds are required' });
  }

  const { rows } = await db.query('SELECT * FROM clips WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Clip not found' });

  const clip = rows[0];
  const currentSfx = Array.isArray(clip.sfx_data) ? clip.sfx_data : [];
  const t = Math.max(0, Number(timestamp_seconds));
  const durationSeconds = 2;

  const buffer = await generateAudio(prompt, durationSeconds);
  const newIndex = currentSfx.length;
  const sfxUrl = await uploadSfxToGCS(buffer, clip.id, newIndex);

  const newItem = {
    id: uuidv4(),
    timestamp_seconds: t,
    label: (label || 'SFX').slice(0, 15),
    prompt,
    sfx_url: sfxUrl,
    duration_seconds: durationSeconds,
  };
  const updatedSfx = [...currentSfx, newItem];

  if (!clip.cdn_url) {
    return res.status(422).json({ error: 'Clip has no cdn_url to re-mix SFX onto' });
  }
  const videoBuffer = await mixSfxOntoVideo(clip.cdn_url, updatedSfx);
  const sfxVideoUrl = await uploadMixedVideoToGCS(videoBuffer, clip.id);

  const { rows: updated } = await db.query(
    `UPDATE clips SET sfx_data = $1, sfx_video_url = $2 WHERE id = $3 RETURNING *`,
    [JSON.stringify(updatedSfx), sfxVideoUrl, clip.id]
  );

  res.json({ data: { clip: updated[0] } });
});

module.exports = router;
