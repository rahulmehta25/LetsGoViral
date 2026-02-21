'use strict';

const { VertexAI } = require('@google-cloud/vertexai');
const { logger }  = require('../utils/logger');

const PROJECT  = process.env.GCP_PROJECT_ID;
const LOCATION = process.env.GCP_REGION || 'us-east1';

const vertexAI    = new VertexAI({ project: PROJECT, location: LOCATION });
const flashModel  = vertexAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

const CLIP_COUNT_FORMULA = (durationMinutes) =>
  Math.max(3, Math.min(15, Math.round(durationMinutes / 3)));

/**
 * Analyze transcription + shot timestamps to identify best clips.
 * Uses Gemini JSON mode to enforce structured output.
 *
 * @param {object} opts
 * @param {string}   opts.transcription         Full video transcription
 * @param {Array}    opts.shotTimestamps         [{ startTime, endTime }] in seconds
 * @param {number}   opts.videoDurationSeconds   Total video duration
 * @param {string}   [opts.script]               Optional original script from Co-Pilot
 * @returns {Promise<Array>} Array of clip objects with start_time, end_time, hook_score, strategic_rank, rationale
 */
async function analyzeClips({ transcription, shotTimestamps, videoDurationSeconds, script }) {
  const durationMinutes = videoDurationSeconds / 60;
  const targetClipCount = CLIP_COUNT_FORMULA(durationMinutes);

  const prompt = buildPrompt({
    transcription,
    shotTimestamps,
    videoDurationSeconds,
    script,
    targetClipCount,
  });

  const schema = {
    type: 'OBJECT',
    properties: {
      clips: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            start_time:     { type: 'NUMBER' },
            end_time:       { type: 'NUMBER' },
            hook_score:     { type: 'NUMBER' },
            strategic_rank: { type: 'INTEGER' },
            rationale:      { type: 'STRING' },
          },
          required: ['start_time', 'end_time', 'hook_score', 'strategic_rank', 'rationale'],
        },
      },
    },
    required: ['clips'],
  };

  // Retry logic: attempt twice before failing
  let clipData;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await flashModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema:    schema,
          temperature:       0.3, // Lower temperature for more consistent structured output
        },
      });

      const text = result.response.candidates[0].content.parts[0].text;
      clipData   = JSON.parse(text);

      // Validate structure
      if (!Array.isArray(clipData.clips) || clipData.clips.length === 0) {
        throw new Error('Empty or invalid clips array');
      }

      // Validate each clip's timestamps
      for (const clip of clipData.clips) {
        if (clip.start_time >= clip.end_time) {
          throw new Error(`Invalid timestamps: start=${clip.start_time} end=${clip.end_time}`);
        }
        if (clip.end_time > videoDurationSeconds) {
          throw new Error(`Clip end time ${clip.end_time} exceeds video duration ${videoDurationSeconds}`);
        }
        if (clip.end_time - clip.start_time < 5) {
          throw new Error(`Clip too short: ${clip.end_time - clip.start_time}s`);
        }
      }

      logger.info(`Gemini identified ${clipData.clips.length} clips (attempt ${attempt + 1})`);
      break; // Success — exit retry loop
    } catch (err) {
      logger.warn(`Gemini analysis attempt ${attempt + 1} failed: ${err.message}`);
      if (attempt === 1) throw err; // Final attempt failed
    }
  }

  return clipData.clips;
}

function buildPrompt({ transcription, shotTimestamps, videoDurationSeconds, script, targetClipCount }) {
  const shotsJson = JSON.stringify(shotTimestamps.slice(0, 200)); // Cap at 200 shots to stay within token limits

  return `You are a viral content strategist and editor. Given the following information about a video, identify the ${targetClipCount} most engaging 15-30 second clips suitable for TikTok, Instagram Reels, and YouTube Shorts.

${script ? `ORIGINAL SCRIPT (creator's intended narrative):\n${script}\n\n` : ''}
VIDEO TRANSCRIPTION:
${transcription}

SHOT CHANGE TIMESTAMPS (seconds):
${shotsJson}

TOTAL VIDEO DURATION: ${videoDurationSeconds} seconds

For each clip, provide:
- start_time: precise start in seconds (decimal)
- end_time: precise end in seconds (decimal)
- hook_score: 1-10 rating for viral potential (10 = extremely viral)
- strategic_rank: posting order (1 = post first)
- rationale: one sentence explaining why this clip is valuable

PRIORITIZE moments with:
- Strong emotional language or reactions
- Surprising statements or revelations
- Questions that create curiosity gaps
- Key moments from the script's intended narrative
- Natural beginning/end points at shot changes
- Clips between 15-30 seconds duration

Return ONLY a valid JSON object. Each clip must start and end within the video duration.`;
}

module.exports = { analyzeClips };
