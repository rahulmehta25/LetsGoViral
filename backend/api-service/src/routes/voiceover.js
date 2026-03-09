'use strict';

const express = require('express');
const { textToSpeech, getVoices } = require('../services/elevenlabs');
const { logger } = require('../utils/logger');

const router = express.Router();

// GET /api/voiceover/voices - List available voices
router.get('/voices', async (req, res) => {
  const data = await getVoices();
  res.json(data);
});

// POST /api/voiceover/generate - Generate voiceover audio
router.post('/generate', async (req, res) => {
  const { text, voiceId, modelId } = req.body;
  
  if (!text || text.length > 5000) {
    return res.status(400).json({ error: 'Text required (max 5000 chars)' });
  }
  
  logger.info(`Generating voiceover: ${text.slice(0, 50)}...`);
  
  const audioBuffer = await textToSpeech(text, voiceId, modelId);
  
  res.set({
    'Content-Type': 'audio/mpeg',
    'Content-Length': audioBuffer.length,
  });
  res.send(audioBuffer);
});

module.exports = router;
