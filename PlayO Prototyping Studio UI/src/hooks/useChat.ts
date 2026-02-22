import { useState, useCallback, useRef } from 'react';
import { webApi } from '../lib/api';

export interface Message {
  id: string;
  role: 'user' | 'ai';
  text: string;
}

export function useChat(projectId: string | null) {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'ai', text: "Hi! I'm your Script Co-Pilot. What kind of video are you planning today?" },
  ]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scriptIdRef = useRef<string | null>(null);

  const createId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const ensureScript = async (): Promise<string> => {
    if (scriptIdRef.current) return scriptIdRef.current;
    if (!projectId) throw new Error('No project selected');
    const script = await webApi.scripts.create(projectId);
    scriptIdRef.current = script.id;
    return script.id;
  };

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userId = createId();
    const aiId = createId();

    setMessages(prev => [...prev, { id: userId, role: 'user', text: text.trim() }]);
    setIsStreaming(true);
    setError(null);

    setMessages(prev => [...prev, { id: aiId, role: 'ai', text: '' }]);

    try {
      const scriptId = await ensureScript();

      await webApi.scripts.streamChat(scriptId, text.trim(), (token) => {
        setMessages(prev =>
          prev.map(m => m.id === aiId ? { ...m, text: m.text + token } : m)
        );
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Chat request failed';
      setError(message);
      setMessages(prev => prev.filter(m => m.id !== aiId));
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming, projectId]);

  return { messages, isStreaming, error, sendMessage };
}
