'use strict';

const { VertexAI } = require('@google-cloud/vertexai');
const { logger }  = require('../utils/logger');

const PROJECT  = process.env.GCP_PROJECT_ID;
const LOCATION = process.env.GCP_REGION || 'us-east1';

const vertexAI = new VertexAI({ project: PROJECT, location: LOCATION });

// Pro model for highest quality script generation
const proModel = vertexAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

const SCRIPT_SYSTEM_PROMPT = `You are a world-class scriptwriting assistant for viral social media content. Your name is "Viralizer". You help creators write compelling, human-sounding scripts using proven frameworks from top creators like MrBeast, Alex Hormozi, and popular TikTok trends.

Always start by asking the creator for their initial idea. Then guide them to structure the script with:
1. A STRONG HOOK in the first 3 seconds (question, shocking stat, or bold claim)
2. A COMPELLING STORY with pattern interrupts every 15-20 seconds
3. A CLEAR CALL TO ACTION at the end

Provide suggestions for visual gags, pattern interrupts, and on-screen text. Respond in short, easy-to-read paragraphs. Maintain a helpful and encouraging tone. When the creator seems ready, offer to output the final script in a clean, formatted version.`;

/**
 * Stream a chat response from Gemini Pro.
 * history: Array of { role: 'user'|'assistant'|'system', content: string }
 */
async function streamChat(history) {
  // Convert history to Gemini format (skip system messages — injected as systemInstruction)
  const contents = history
    .filter(m => m.role !== 'system')
    .map(m => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const chat = proModel.startChat({
    systemInstruction: { parts: [{ text: SCRIPT_SYSTEM_PROMPT }] },
    history: contents.slice(0, -1), // All but the last (current) message
  });

  const lastMessage = contents.at(-1).parts[0].text;
  const result = await chat.sendMessageStream(lastMessage);

  return result.stream;
}

module.exports = { streamChat, SCRIPT_SYSTEM_PROMPT };
