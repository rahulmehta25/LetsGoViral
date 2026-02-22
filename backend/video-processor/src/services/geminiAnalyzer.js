'use strict';

const { VertexAI } = require('@google-cloud/vertexai');
const { logger }  = require('../utils/logger');

const PROJECT  = process.env.GCP_PROJECT_ID;
const LOCATION = process.env.GCP_REGION || 'us-east1';

const vertexAI  = new VertexAI({ project: PROJECT, location: LOCATION });
const proModel  = vertexAI.getGenerativeModel({ model: 'gemini-2.5-pro' });

const CLIP_COUNT_FORMULA = (durationMinutes) =>
  Math.max(3, Math.min(15, Math.round(durationMinutes / 3)));

/**
 * Analyze video using multimodal Gemini (video + word-level transcript) to identify best clips.
 * Returns word-index based selections that the caller maps to timestamps.
 *
 * @param {object} opts
 * @param {Array<{word: string, start: number, end: number}>} opts.words  Word-level transcript
 * @param {number}   opts.videoDurationSeconds   Total video duration
 * @param {string}   [opts.script]               Optional original script
 * @param {string}   opts.gcsUri                 GCS URI of the video (e.g. gs://bucket/path.mp4)
 * @returns {Promise<Array>} Array of clip objects with start_word_index, end_word_index, title, hook, hook_score, strategic_rank, rationale
 */
async function analyzeClips({ words, videoDurationSeconds, script, gcsUri }) {
  const durationMinutes = videoDurationSeconds / 60;
  const targetClipCount = CLIP_COUNT_FORMULA(durationMinutes);

  const prompt = buildPrompt({
    words,
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
            start_word_index: { type: 'INTEGER' },
            end_word_index:   { type: 'INTEGER' },
            title:            { type: 'STRING' },
            hook:             { type: 'STRING' },
            hook_score:       { type: 'NUMBER' },
            strategic_rank:   { type: 'INTEGER' },
            rationale:        { type: 'STRING' },
          },
          required: ['start_word_index', 'end_word_index', 'title', 'hook', 'hook_score', 'strategic_rank', 'rationale'],
        },
      },
    },
    required: ['clips'],
  };

  // Build multimodal content parts: video file + text prompt
  const parts = [
    { fileData: { fileUri: gcsUri, mimeType: 'video/mp4' } },
    { text: prompt },
  ];

  let clipData;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await proModel.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema:    schema,
          temperature:       0.3,
        },
      });

      const text = result.response.candidates[0].content.parts[0].text;
      clipData   = JSON.parse(text);

      if (!Array.isArray(clipData.clips) || clipData.clips.length === 0) {
        throw new Error('Empty or invalid clips array');
      }

      // Validate each clip
      for (const clip of clipData.clips) {
        if (clip.start_word_index >= clip.end_word_index) {
          throw new Error(`Invalid word indices: start=${clip.start_word_index} end=${clip.end_word_index}`);
        }
        if (clip.start_word_index < 0 || clip.end_word_index >= words.length) {
          throw new Error(`Word index out of range: start=${clip.start_word_index} end=${clip.end_word_index} max=${words.length - 1}`);
        }
        const wordCount = clip.end_word_index - clip.start_word_index + 1;
        if (wordCount < 80) {
          throw new Error(`Clip too short: only ${wordCount} words (minimum 80)`);
        }
      }

      logger.info(`Gemini identified ${clipData.clips.length} clips (attempt ${attempt + 1})`);
      break;
    } catch (err) {
      logger.warn(`Gemini analysis attempt ${attempt + 1} failed: ${err.message}`);
      if (attempt === 1) throw err;
    }
  }

  return clipData.clips;
}

function buildPrompt({ words, videoDurationSeconds, script, targetClipCount }) {
  // Build indexed word list for the prompt
  const indexedWords = words.map((w, i) => ({
    index: i,
    word: w.word,
    start: parseFloat(w.start.toFixed(2)),
    end: parseFloat(w.end.toFixed(2)),
  }));

  return `You are a viral content strategist and editor. You are given a video (attached) and its word-level transcript below. Identify the ${targetClipCount} most engaging clips suitable for TikTok, Instagram Reels, and YouTube Shorts.

${script ? `ORIGINAL SCRIPT (creator's intended narrative):\n${script}\n\n` : ''}WORD-LEVEL TRANSCRIPT (with indices and timestamps):
${JSON.stringify(indexedWords)}

TOTAL VIDEO DURATION: ${videoDurationSeconds} seconds
TOTAL WORD COUNT: ${words.length}

For each clip, provide:
- start_word_index: index of the first word in the clip
- end_word_index: index of the last word in the clip (inclusive)
- title: short descriptive title for the clip (3-8 words)
- hook: the opening line or hook text of the clip
- hook_score: 1-10 rating for viral potential (10 = extremely viral)
- strategic_rank: posting order (1 = post first)
- rationale: one sentence explaining why this clip is valuable

CRITICAL RULES:
- Each clip MUST be a COMPLETE, SELF-CONTAINED segment — a full topic, story, argument, or bit from start to finish. Never cut in the middle of a thought or topic.
- Start each clip BEFORE the speaker introduces the topic (include the setup/transition) and end AFTER the speaker finishes the point (include the conclusion/punchline/reaction).
- The start_word_index should be a few words BEFORE the topic begins (capture the intro/transition).
- The end_word_index should be a few words AFTER the topic concludes (capture the ending beat).
- NOTE: The transcript may have gaps where speech wasn't recognized. Use the VIDEO to identify the true start/end of each segment, then find the closest word indices.
- Clip duration should be 30-90 seconds. Longer is better than cutting off early.
- Each clip MUST contain at least 80 words (end_word_index - start_word_index + 1 >= 80)
- Clips must not overlap
- Use the VIDEO to assess visual engagement, energy, pacing, and where topics naturally begin and end
- Use the TRANSCRIPT to identify compelling verbal content

PRIORITIZE moments with:
- Strong emotional language or reactions
- Surprising statements or revelations
- Questions that create curiosity gaps
- Key moments from the script's intended narrative
- High visual energy or dynamic scenes
- Complete stories, arguments, or bits that stand alone

Return ONLY a valid JSON object.`;
}

module.exports = { analyzeClips };
