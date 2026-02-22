import React, { useEffect, useState, useRef } from 'react';
import {
  ArrowLeft,
  Sparkles,
  Send,
  User,
  Bot } from
'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useChat } from '../hooks/useChat';
interface ChatScreenProps {
  onNavigate: (screen: string) => void;
}
export function ChatScreen({ onNavigate }: ChatScreenProps) {
  const { messages, isStreaming, error, sendMessage } = useChat();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth'
    });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);
  const handleSend = (text: string = input) => {
    if (!text.trim()) return;
    sendMessage(text.trim());
    setInput('');
  };
  return (
    <div className="fixed inset-0 bg-[#F5F5F5] flex flex-col animate-slide-up">
      {/* Top Bar */}
      <header className="h-16 bg-white border-b border-gray-200 px-4 flex items-center justify-between z-20 shrink-0">
        <button
          onClick={() => onNavigate('projects')}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors">

          <ArrowLeft className="w-6 h-6 text-gray-600" />
        </button>
        <div className="flex flex-col items-center">
          <h1 className="text-sm font-bold text-gray-900">Script Co-Pilot</h1>
          <span className="text-[10px] text-[#00D4AA] font-bold uppercase tracking-wider flex items-center gap-1">
            <div className="w-1.5 h-1.5 bg-[#00D4AA] rounded-full animate-pulse" />{' '}
            Online
          </span>
        </div>
        <button className="p-2 bg-[#00D4AA]/10 rounded-full text-[#00D4AA] hover:bg-[#00D4AA]/20 transition-colors">
          <Sparkles className="w-5 h-5" />
        </button>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full p-4 space-y-4">
        {messages.map((msg) => {
          // Skip empty AI bubbles while streaming — the typing indicator covers this
          if (msg.role === 'ai' && msg.text === '' && isStreaming) return null;
          return (
          <div
          key={msg.id}
          className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''} animate-fade-in-up`}>

            <div
            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'ai' ? 'bg-white border border-gray-200 text-[#00D4AA]' : 'bg-gray-200 text-gray-600'}`}>

              {msg.role === 'ai' ? <Bot size={16} /> : <User size={16} />}
            </div>
            <div
            className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-[#00D4AA] text-white rounded-tr-none' : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'}`}>

              {msg.role === 'ai' ? (
                <div className="prose prose-sm prose-p:my-1 prose-ul:my-1 prose-li:my-0 max-w-none [&_strong]:font-semibold [&_*]:text-inherit">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.text}</p>
              )}
            </div>
          </div>
          );
        })}

        {isStreaming && messages[messages.length - 1]?.text === '' &&
        <div className="flex gap-3 animate-fade-in">
            <div className="w-8 h-8 rounded-full bg-white border border-gray-200 text-[#00D4AA] flex items-center justify-center flex-shrink-0">
              <Bot size={16} />
            </div>
            <div className="bg-white border border-gray-100 p-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-1">
              <div
              className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
              style={{
                animationDelay: '0ms'
              }} />

              <div
              className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
              style={{
                animationDelay: '150ms'
              }} />

              <div
              className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
              style={{
                animationDelay: '300ms'
              }} />

            </div>
          </div>
        }
        {error &&
        <div className="flex gap-3 animate-fade-in">
            <div className="w-8 h-8 rounded-full bg-red-100 text-red-500 flex items-center justify-center flex-shrink-0">
              <Bot size={16} />
            </div>
            <div className="max-w-[80%] p-4 rounded-2xl rounded-tl-none text-sm bg-red-50 border border-red-200 text-red-700">
              <p className="font-semibold mb-1">Connection error</p>
              <p className="font-mono text-xs">{error}</p>
              <p className="mt-2 text-xs text-red-500">Check that VITE_GEMINI_API_KEY is set in your .env file and restart the dev server.</p>
            </div>
          </div>
        }
        <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <div className="shrink-0 border-t border-gray-200 bg-white/95 backdrop-blur-md">
        <div className="max-w-3xl mx-auto w-full p-4 pb-24">
        {/* Quick Chips */}
        <div className="flex gap-2 overflow-x-auto pb-3 no-scrollbar">
          {['Hook ideas', 'Add CTA', 'Viral frameworks', 'Tone check'].map(
            (chip) =>
            <button
              key={chip}
              onClick={() => handleSend(chip)}
              disabled={isStreaming}
              className="px-4 py-2 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-600 shadow-sm hover:border-[#00D4AA] hover:text-[#00D4AA] transition-all hover:-translate-y-0.5 whitespace-nowrap">

                {chip}
              </button>

          )}
        </div>

        <div className="flex items-center gap-2 p-2 rounded-full shadow-lg border border-gray-100 bg-white">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask for script ideas..."
            className="flex-1 min-w-0 bg-transparent border-none focus:ring-0 px-4 text-sm outline-none" />

          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isStreaming}
            className="shrink-0 w-10 h-10 bg-[#00D4AA] rounded-full flex items-center justify-center text-white hover:bg-[#00B390] transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed active:scale-95">
            <Send size={18} className="ml-0.5" />
          </button>
        </div>
        </div>
      </div>
    </div>);

}
