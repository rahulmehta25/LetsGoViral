import { useState, useCallback, useRef } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || '';

const SYSTEM_PROMPT = `You are a world-class scriptwriting assistant for viral social media content. Your name is "Viralizer". You help creators write compelling, human-sounding scripts using proven frameworks from top creators like MrBeast, Alex Hormozi, and popular TikTok trends.

Always start by asking the creator for their initial idea. Then guide them to structure the script with:
1. A STRONG HOOK in the first 3 seconds (question, shocking stat, or bold claim)
2. A COMPELLING STORY with pattern interrupts every 15-20 seconds
3. A CLEAR CALL TO ACTION at the end

Provide suggestions for visual gags, pattern interrupts, and on-screen text. Respond in short, easy-to-read paragraphs. Maintain a helpful and encouraging tone. When the creator seems ready, offer to output the final script in a clean, formatted version.`;

export interface Message {
  id: string;
  role: 'user' | 'ai';
  text: string;
}

interface GeminiMessage {
  role: 'user' | 'model';
  parts: [{ text: string }];
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'ai', text: "Hi! I'm your Script Co-Pilot. What kind of video are you planning today?" },
  ]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const historyRef = useRef<GeminiMessage[]>([]);

  const createId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userId = createId();
    const aiId = createId();

    setMessages(prev => [...prev, { id: userId, role: 'user', text: text.trim() }]);
    setIsStreaming(true);
    setError(null);

    setMessages(prev => [...prev, { id: aiId, role: 'ai', text: '' }]);

    try {
      const genAI = new GoogleGenerativeAI(API_KEY);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        systemInstruction: SYSTEM_PROMPT,
      });

      const chat = model.startChat({ history: historyRef.current });
      const result = await chat.sendMessageStream(text.trim());

      let fullResponse = '';
      for await (const chunk of result.stream) {
        const token = chunk.text();
        fullResponse += token;
        setMessages(prev =>
          prev.map(m => m.id === aiId ? { ...m, text: m.text + token } : m)
        );
      }

      historyRef.current = [
        ...historyRef.current,
        { role: 'user',  parts: [{ text: text.trim() }] },
        { role: 'model', parts: [{ text: fullResponse }] },
      ];
    } catch (err: any) {
      setError(err.message);
      setMessages(prev => prev.filter(m => m.id !== aiId));
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming]);

  return { messages, isStreaming, error, sendMessage };
}
