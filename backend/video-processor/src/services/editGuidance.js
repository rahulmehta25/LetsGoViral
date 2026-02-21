'use strict';

const { VertexAI } = require('@google-cloud/vertexai');
const { logger } = require('../utils/logger');

const PROJECT  = process.env.GCP_PROJECT_ID;
const LOCATION = process.env.GCP_REGION || 'us-east1';

const vertexAI   = new VertexAI({ project: PROJECT, location: LOCATION });
const flashModel = vertexAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

/**
 * Generate long-form edit guidance by comparing the script to the transcription.
 * Returns a JSON object with overall_feedback and timestamped suggestions.
 */
async function generateEditGuidance(script, transcription) {
  const prompt = `Analyze the provided script and the final video transcription. Identify discrepancies and suggest edits for the long-form video to improve pacing and engagement. Provide a list of timestamps where a pattern interrupt, B-roll, or on-screen graphic should be added to maintain viewer attention. Output the suggestions as a JSON object with the following structure:
  {
    "overall_feedback": "string",
    "suggestions": [
      {
        "timestamp_seconds": number,
        "type": "pattern_interrupt" | "b_roll" | "on_screen_graphic" | "pacing_edit",
        "suggestion": "string"
      }
    ]
  }

SCRIPT:
${script}

TRANSCRIPTION:
${transcription}`;

  const result = await flashModel.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json' },
  });

  try {
    const text = result.response.candidates[0].content.parts[0].text;
    return JSON.parse(text);
  } catch (err) {
    logger.error(`Failed to parse edit guidance response: ${err.message}`);
    return null;
  }
}

module.exports = { generateEditGuidance };
