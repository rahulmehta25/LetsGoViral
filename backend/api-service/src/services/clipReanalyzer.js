'use strict';

const { VertexAI } = require('@google-cloud/vertexai');
const { logger } = require('../utils/logger');

const PROJECT  = process.env.GCP_PROJECT_ID;
const LOCATION = process.env.GCP_REGION || 'us-east1';
const REANALYZE_TIMEOUT_MS = 120_000;

let _proModel = null;
function getProModel() {
  if (!_proModel) {
    if (!PROJECT) throw new Error('GCP_PROJECT_ID is not set — cannot initialise VertexAI');
    const vertexAI = new VertexAI({ project: PROJECT, location: LOCATION });
    _proModel = vertexAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
  }
  return _proModel;
}

const CLIP_COUNT_FORMULA = (durationMinutes) =>
  Math.max(3, Math.min(15, Math.round(durationMinutes / 3)));

/**
 * Re-analyze a video with Gemini based on user feedback about current clips.
 * Returns timestamp-based clips (not word indices) since the words array isn't persisted.
 *
 * @param {object} opts
 * @param {string} opts.gcsUri               GCS URI of the video (gs://bucket/path.mp4)
 * @param {string} opts.transcription         Full transcription text
 * @param {number} opts.videoDurationSeconds  Total video duration
 * @param {Array}  opts.currentClips          Current clips with titles, times, hooks, rationale
 * @param {string} opts.userSuggestion        Creator's feedback on how to improve clips
 * @returns {Promise<Array>} Array of clip objects with start_time_seconds, end_time_seconds, title, hook, hook_score, strategic_rank, rationale
 */
async function reanalyzeClips({ gcsUri, transcription, videoDurationSeconds, currentClips, userSuggestion }) {
  const durationMinutes = videoDurationSeconds / 60;
  const targetClipCount = CLIP_COUNT_FORMULA(durationMinutes);

  const currentClipsJson = currentClips.map((c, i) => ({
    index: i + 1,
    title: c.title,
    start_time_seconds: c.start_time_seconds,
    end_time_seconds: c.end_time_seconds,
    hook: c.hook,
    hook_score: c.hook_score,
    rationale: c.rationale,
  }));

  const prompt = `You are a viral content strategist. You previously analyzed this video and identified clips.
The creator has given feedback on how to improve the clip selection.

TRANSCRIPT:
${transcription}

TOTAL VIDEO DURATION: ${videoDurationSeconds} seconds

CURRENT CLIPS:
${JSON.stringify(currentClipsJson, null, 2)}

CREATOR'S FEEDBACK: "${userSuggestion}"

Re-analyze the video and provide ${targetClipCount} improved clips based on the feedback.
Incorporate the creator's suggestions while maintaining high viral potential.

For each clip, provide:
- start_time_seconds: start time as a decimal number (e.g. 12.5)
- end_time_seconds: end time as a decimal number (e.g. 45.3)
- title: short descriptive title for the clip (3-8 words)
- hook: the opening line or hook text of the clip
- hook_score: 1-10 rating for viral potential (10 = extremely viral)
- strategic_rank: posting order (1 = post first)
- rationale: one sentence explaining why this clip is valuable

CRITICAL RULES:
- Each clip MUST be a COMPLETE, SELF-CONTAINED segment with a full topic, story, argument, or bit.
- Clip duration should be 30-90 seconds. Longer is better than cutting off early.
- Clips must not overlap.
- All timestamps must be within 0 and ${videoDurationSeconds}.
- start_time_seconds must be less than end_time_seconds for every clip.
- Use the VIDEO to assess visual engagement, energy, pacing, and where topics naturally begin and end.
- Use the TRANSCRIPT to identify compelling verbal content.
- Prioritize the creator's feedback while maintaining quality.

Return ONLY a valid JSON object.`;

  const schema = {
    type: 'OBJECT',
    properties: {
      clips: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            start_time_seconds: { type: 'NUMBER' },
            end_time_seconds:   { type: 'NUMBER' },
            title:              { type: 'STRING' },
            hook:               { type: 'STRING' },
            hook_score:         { type: 'NUMBER' },
            strategic_rank:     { type: 'INTEGER' },
            rationale:          { type: 'STRING' },
          },
          required: ['start_time_seconds', 'end_time_seconds', 'title', 'hook', 'hook_score', 'strategic_rank', 'rationale'],
        },
      },
    },
    required: ['clips'],
  };

  const parts = [
    { fileData: { fileUri: gcsUri, mimeType: 'video/mp4' } },
    { text: prompt },
  ];

  let clipData;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await Promise.race([
        getProModel().generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.3,
        },
      }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini re-analysis timed out')), REANALYZE_TIMEOUT_MS)),
      ]);

      const text = result.response.candidates[0].content.parts[0].text;
      clipData = JSON.parse(text);

      if (!Array.isArray(clipData.clips) || clipData.clips.length === 0) {
        throw new Error('Empty or invalid clips array');
      }

      // Validate each clip
      for (const clip of clipData.clips) {
        if (clip.start_time_seconds >= clip.end_time_seconds) {
          throw new Error(`Invalid timestamps: start=${clip.start_time_seconds} end=${clip.end_time_seconds}`);
        }
        if (clip.start_time_seconds < 0 || clip.end_time_seconds > videoDurationSeconds) {
          throw new Error(`Timestamp out of range: start=${clip.start_time_seconds} end=${clip.end_time_seconds} max=${videoDurationSeconds}`);
        }
        const duration = clip.end_time_seconds - clip.start_time_seconds;
        if (duration < 10) {
          throw new Error(`Clip too short: ${duration.toFixed(1)}s (minimum 10s)`);
        }
      }

      // Check for overlaps (sort by start time first)
      const sorted = [...clipData.clips].sort((a, b) => a.start_time_seconds - b.start_time_seconds);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].start_time_seconds < sorted[i - 1].end_time_seconds) {
          throw new Error(`Clips overlap: clip ending at ${sorted[i - 1].end_time_seconds} overlaps with clip starting at ${sorted[i].start_time_seconds}`);
        }
      }

      logger.info(`Gemini re-analysis identified ${clipData.clips.length} clips (attempt ${attempt + 1})`);
      break;
    } catch (err) {
      logger.warn(`Gemini re-analysis attempt ${attempt + 1} failed: ${err.message}`);
      if (attempt === 1) throw err;
    }
  }

  return clipData.clips;
}

module.exports = { reanalyzeClips };
