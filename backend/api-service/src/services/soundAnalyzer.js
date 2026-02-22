'use strict';

const { VertexAI } = require('@google-cloud/vertexai');
const { logger }   = require('../utils/logger');

const PROJECT  = process.env.GCP_PROJECT_ID;
const LOCATION = process.env.GCP_REGION || 'us-east1';

const FALLBACK_SUGGESTIONS = {
  tone: 'energetic',
  vibe: 'dynamic engaging content',
  sfx: [
    { label: 'Impact Hit',   prompt: 'powerful bass impact hit with reverb tail sound effect' },
    { label: 'Whoosh',       prompt: 'cinematic whoosh swipe transition sound effect' },
    { label: 'Crowd Cheer',  prompt: 'crowd cheering and gasping reaction sound effect' },
  ],
  music: [
    { label: 'Hype Beat',      prompt: 'upbeat trap hip hop background beat with bass drops, no lyrics, background music' },
    { label: 'Cinematic Rise', prompt: 'orchestral swell building to triumphant peak, no lyrics, background music' },
  ],
};

/**
 * Use Gemini 2.0 Flash (fast, low-cost) for tone analysis and SFX suggestions.
 * clipReanalyzer.js uses Gemini 2.5 Pro (slower, more expensive) for multimodal video re-analysis.
 *
 * @param {object} clip - Clip row from DB (title, rationale, hook_score, duration_seconds)
 * @param {string} transcriptExcerpt - First 600 chars of the video transcription
 * @returns {Promise<{ tone: string, vibe: string, sfx: Array, music: Array }>}
 */
async function analyzeToneAndSuggestSounds(clip, transcriptExcerpt) {
  try {
    const vertexAI  = new VertexAI({ project: PROJECT, location: LOCATION });
    const flashModel = vertexAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `You are a TikTok sound designer. Analyze this video clip and suggest specific ElevenLabs sound effect and background music prompts to make it more engaging and viral.

CLIP INFO:
- Title: ${clip.title || 'Untitled'}
- AI Rationale: ${clip.rationale || 'N/A'}
- Hook Score: ${clip.hook_score ?? 'N/A'}/10
- Duration: ${clip.duration_seconds ?? 'N/A'} seconds
- Transcript excerpt: "${transcriptExcerpt || 'N/A'}"

Return ONLY a JSON object (no markdown, no explanation) with this exact structure:
{
  "tone": "one or two words describing the emotional tone (e.g. high-energy, calm, humorous)",
  "vibe": "a short punchy phrase describing the overall vibe (e.g. punchy motivational reveal)",
  "sfx": [
    { "label": "Short display name", "prompt": "detailed ElevenLabs sound effect prompt" },
    { "label": "Short display name", "prompt": "detailed ElevenLabs sound effect prompt" },
    { "label": "Short display name", "prompt": "detailed ElevenLabs sound effect prompt" }
  ],
  "music": [
    { "label": "Short display name", "prompt": "background music prompt with no lyrics, background music suffix" },
    { "label": "Short display name", "prompt": "background music prompt with no lyrics, background music suffix" }
  ]
}

Rules:
- sfx: exactly 3 suggestions, each prompt ends with "sound effect"
- music: exactly 2 suggestions, each prompt ends with "no lyrics, background music"
- Keep label under 15 characters
- Make prompts specific and evocative, matching the clip's tone`;

    const result = await flashModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });

    const text = result.response.candidates[0].content.parts[0].text;
    const parsed = JSON.parse(text);

    // Validate minimal structure
    if (!parsed.sfx || !parsed.music || !Array.isArray(parsed.sfx) || !Array.isArray(parsed.music)) {
      throw new Error('Invalid response structure from Gemini');
    }

    return parsed;
  } catch (err) {
    logger.error(`soundAnalyzer: failed to analyze tone, using fallback: ${err.message}`);
    return FALLBACK_SUGGESTIONS;
  }
}

const FALLBACK_TIMESTAMPED_SFX = [
  { timestamp_seconds: 0.3, label: 'Intro Boom', prompt: 'deep bass impact hit sound effect', duration_seconds: 2 },
  { timestamp_seconds: 2.0, label: 'Whoosh', prompt: 'cinematic whoosh transition sound effect', duration_seconds: 1 },
  { timestamp_seconds: 4.0, label: 'Crowd Wow', prompt: 'crowd amazed wow reaction sound effect', duration_seconds: 2 },
];

/**
 * Use Gemini to identify 2–4 specific moments in a clip that need SFX, with exact timestamps.
 * @param {object} clip - Clip row from DB (duration_seconds, title, rationale)
 * @param {string} transcriptExcerpt - First 600 chars of the video transcription
 * @returns {Promise<Array<{timestamp_seconds: number, label: string, prompt: string, duration_seconds: number}>>}
 */
async function analyzeTimestampedSfx(clip, transcriptExcerpt) {
  const clipDuration = parseFloat(clip.duration_seconds) || 10;

  try {
    const vertexAI = new VertexAI({ project: PROJECT, location: LOCATION });
    const flashModel = vertexAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `You are a TikTok sound designer. Analyze this video clip and identify exactly 2–4 specific moments that need a sound effect to make it more engaging and viral.

CLIP INFO:
- Title: ${clip.title || 'Untitled'}
- Duration: ${clipDuration} seconds
- Transcript excerpt: "${transcriptExcerpt || 'N/A'}"
- Rationale: ${clip.rationale || 'N/A'}

Return ONLY a JSON array (no markdown, no explanation) with this exact structure:
[
  {
    "timestamp_seconds": 0.3,
    "label": "Short name (max 15 chars)",
    "prompt": "detailed ElevenLabs sound effect prompt ending with sound effect",
    "duration_seconds": 2
  }
]

Rules:
- Return exactly 2–4 items
- timestamp_seconds must be a number >= 0 and < ${clipDuration}
- duration_seconds must be between 0.5 and 5
- label must be under 15 characters
- prompt must end with "sound effect" and be specific and evocative
- Space the timestamps throughout the clip for best effect`;

    const result = await flashModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });

    const text = result.response.candidates[0].content.parts[0].text;
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed) || parsed.length < 2 || parsed.length > 4) {
      throw new Error('Invalid response: expected 2–4 SFX items');
    }

    // Validate and clamp timestamps
    const validated = parsed.map((item) => ({
      timestamp_seconds: Math.max(0, Math.min(parseFloat(item.timestamp_seconds) || 0, clipDuration - 0.5)),
      label: String(item.label || 'SFX').slice(0, 15),
      prompt: String(item.prompt || 'sound effect'),
      duration_seconds: Math.max(0.5, Math.min(parseFloat(item.duration_seconds) || 2, 5)),
    }));

    return validated;
  } catch (err) {
    logger.error(`soundAnalyzer: analyzeTimestampedSfx failed, using fallback: ${err.message}`);
    // Return fallback with timestamps clamped to clip duration
    return FALLBACK_TIMESTAMPED_SFX.map((item) => ({
      ...item,
      timestamp_seconds: Math.min(item.timestamp_seconds, clipDuration - 0.5),
    }));
  }
}

module.exports = { analyzeToneAndSuggestSounds, analyzeTimestampedSfx };
