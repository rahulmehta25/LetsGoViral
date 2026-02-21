import React, { useEffect, useState, useRef } from 'react';
import {
  ArrowLeft,
  Sparkles,
  Send,
  User,
  Bot,
  MoreHorizontal } from
'lucide-react';
import { Card } from '../components/ui/Card';
interface ChatScreenProps {
  onNavigate: (screen: string) => void;
}
export function ChatScreen({ onNavigate }: ChatScreenProps) {
  const [messages, setMessages] = useState([
  {
    id: 1,
    role: 'ai',
    text: "Hi! I'm your Script Co-Pilot. What kind of video are you planning today?"
  }]
  );
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth'
    });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);
  const getAIResponse = (userInput: string) => {
    const lowerInput = userInput.toLowerCase();
    if (lowerInput.includes('hook')) {
      return "Here are 3 viral hook templates:\n\n1. 'Stop doing [X] if you want [Y]...'\n2. 'I tried [X] for 30 days and...'\n3. 'The secret tool nobody is talking about...'";
    }
    if (lowerInput.includes('cta')) {
      return "Try these high-converting CTAs:\n\n• 'Save this for later so you don't forget'\n• 'Comment [WORD] and I'll send you the link'\n• 'Share this with a friend who needs to hear it'";
    }
    if (lowerInput.includes('framework')) {
      return 'The classic viral framework:\n\n1. Hook (0-3s): Pattern interrupt\n2. Re-hook (3-10s): State the problem\n3. Value (10-40s): The solution/story\n4. CTA (40-60s): Tell them what to do next';
    }
    if (lowerInput.includes('tone')) {
      return 'Your tone sounds authoritative but friendly. To make it more viral, try adding more urgency in the first sentence and using simpler language.';
    }
    return "That's an interesting angle! I'd suggest focusing on the emotional transformation. How will the viewer feel after watching this?";
  };
  const handleSend = (text: string = input) => {
    if (!text.trim()) return;
    setMessages((prev) => [
    ...prev,
    {
      id: Date.now(),
      role: 'user',
      text
    }]
    );
    setInput('');
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) => [
      ...prev,
      {
        id: Date.now() + 1,
        role: 'ai',
        text: getAIResponse(text)
      }]
      );
    }, 1500);
  };
  return (
    <div className="fixed inset-0 bg-[#F5F5F5] flex flex-col animate-slide-up">
      {/* Top Bar */}
      <header className="h-16 bg-white border-b border-gray-200 px-4 flex items-center justify-between z-20">
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
      <main className="flex-1 overflow-y-auto p-4 space-y-4 pb-32">
        {messages.map((msg) =>
        <div
          key={msg.id}
          className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''} animate-fade-in-up`}>

            <div
            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'ai' ? 'bg-white border border-gray-200 text-[#00D4AA]' : 'bg-gray-200 text-gray-600'}`}>

              {msg.role === 'ai' ? <Bot size={16} /> : <User size={16} />}
            </div>
            <div
            className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-[#00D4AA] text-white rounded-tr-none' : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'}`}>

              <p className="whitespace-pre-wrap">{msg.text}</p>
            </div>
          </div>
        )}

        {isTyping &&
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
        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      <div className="absolute bottom-20 left-0 right-0 p-4 bg-gradient-to-t from-[#F5F5F5] via-[#F5F5F5] to-transparent">
        {/* Quick Chips */}
        <div className="flex gap-2 overflow-x-auto pb-3 no-scrollbar">
          {['Hook ideas', 'Add CTA', 'Viral frameworks', 'Tone check'].map(
            (chip) =>
            <button
              key={chip}
              onClick={() => handleSend(chip)}
              className="px-4 py-2 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-600 shadow-sm hover:border-[#00D4AA] hover:text-[#00D4AA] transition-all hover:-translate-y-0.5 whitespace-nowrap">

                {chip}
              </button>

          )}
        </div>

        <Card
          className="flex items-center gap-2 p-2 rounded-full shadow-lg border-gray-100 bg-white"
          noPadding>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask for script ideas..."
            className="flex-1 bg-transparent border-none focus:ring-0 px-4 text-sm outline-none" />

          <button
            onClick={() => handleSend()}
            disabled={!input.trim()}
            className="w-10 h-10 bg-[#00D4AA] rounded-full flex items-center justify-center text-white hover:bg-[#00B390] transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed active:scale-95">

            <Send size={18} className="ml-0.5" />
          </button>
        </Card>
      </div>
    </div>);

}