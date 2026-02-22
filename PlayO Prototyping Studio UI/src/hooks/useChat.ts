import { useState, useCallback, useRef, useEffect } from 'react';
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
  const initingRef = useRef(false);

  const createId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Create a script session on mount (if projectId is available)
  useEffect(() => {
    if (!projectId || scriptIdRef.current || initingRef.current) return;
    initingRef.current = true;
    webApi.scripts.create(projectId).then((script) => {
      scriptIdRef.current = script.id;
    }).catch(() => {
      // Script creation failed — sendMessage will retry
    }).finally(() => {
      initingRef.current = false;
    });
  }, [projectId]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userId = createId();
    const aiId = createId();

    setMessages(prev => [...prev, { id: userId, role: 'user', text: text.trim() }]);
    setIsStreaming(true);
    setError(null);
    setMessages(prev => [...prev, { id: aiId, role: 'ai', text: '' }]);

    try {
      // Ensure we have a script session
      if (!scriptIdRef.current && projectId) {
        const script = await webApi.scripts.create(projectId);
        scriptIdRef.current = script.id;
      }
      if (!scriptIdRef.current) {
        throw new Error('No project selected — please select a project first.');
      }

      await webApi.scripts.streamChat(scriptIdRef.current, text.trim(), (chunk) => {
        setMessages(prev =>
          prev.map(m => m.id === aiId ? { ...m, text: m.text + chunk } : m)
        );
      });
    } catch (err: any) {
      setError(err.message);
      setMessages(prev => prev.filter(m => m.id !== aiId));
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming, projectId]);

  return { messages, isStreaming, error, sendMessage };
}
