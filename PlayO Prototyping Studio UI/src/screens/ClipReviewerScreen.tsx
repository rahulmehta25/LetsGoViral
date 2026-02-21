import React, { useState } from 'react';
import {
  ArrowLeft,
  Check,
  X,
  Share2,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight } from
'lucide-react';
import { Project, Clip } from '../App';
interface ClipReviewerScreenProps {
  onNavigate: (screen: string) => void;
  project: Project;
  onUpdateClipStatus: (clipId: number, status: Clip['status']) => void;
}
export function ClipReviewerScreen({
  onNavigate,
  project,
  onUpdateClipStatus
}: ClipReviewerScreenProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [activeTab, setActiveTab] = useState('AI Rationale');
  const [currentClipIndex, setCurrentClipIndex] = useState(0);
  const clips = project.clips;
  const currentClip = clips[currentClipIndex];
  const handleNext = () => {
    if (currentClipIndex < clips.length - 1) {
      setCurrentClipIndex((prev) => prev + 1);
    }
  };
  const handlePrev = () => {
    if (currentClipIndex > 0) {
      setCurrentClipIndex((prev) => prev - 1);
    }
  };
  const handleAction = (status: Clip['status']) => {
    onUpdateClipStatus(currentClip.id, status);
    if (currentClipIndex < clips.length - 1) {
      handleNext();
    } else {
      onNavigate('detail');
    }
  };
  return (
    <div className="fixed inset-0 bg-black flex flex-col animate-fade-in">
      {/* Video Player Area */}
      <div
        className="flex-1 relative bg-gray-900 group cursor-pointer"
        onClick={() => setIsPlaying(!isPlaying)}>

        {/* Header Overlay */}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-20 bg-gradient-to-b from-black/60 to-transparent">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNavigate('detail');
            }}
            className="p-2 bg-black/20 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-colors">

            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="bg-black/20 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
            <span className="text-xs font-bold text-white">
              Clip #{currentClipIndex + 1} of {clips.length}
            </span>
          </div>
          <button className="p-2 bg-black/20 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-colors">
            <Share2 className="w-5 h-5" />
          </button>
        </div>

        {/* Play/Pause Indicator */}
        {!isPlaying &&
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
              <Play className="w-8 h-8 text-white fill-current ml-1" />
            </div>
          </div>
        }

        {/* Fake Video Content */}
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-white/10 font-bold text-6xl select-none">
            VIDEO
          </div>
        </div>
      </div>

      {/* Bottom Sheet */}
      <div className="bg-white rounded-t-[32px] shadow-[0_-10px_40px_rgba(0,0,0,0.3)] z-30 animate-slide-up">
        {/* Drag Handle */}
        <div className="w-full flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>

        <div className="px-6 pb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">
              {currentClip.title}
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500 uppercase">
                Hook Score
              </span>
              <div className="bg-[#00D4AA]/10 text-[#00D4AA] px-2 py-1 rounded-md font-bold text-sm">
                {currentClip.score}/10
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-100 mb-4">
            {['Details', 'AI Rationale'].map((tab) =>
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-2 px-4 text-sm font-medium transition-colors relative ${activeTab === tab ? 'text-gray-900' : 'text-gray-400'}`}>

                {tab}
                {activeTab === tab &&
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00D4AA] rounded-full" />
              }
              </button>
            )}
          </div>

          {/* Content */}
          <div className="mb-6 min-h-[80px]">
            <p className="text-sm text-gray-600 leading-relaxed animate-fade-in">
              {currentClip.rationale}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mb-4">
            <button
              onClick={() => handleAction('rejected')}
              className="flex-1 h-12 rounded-full border border-gray-200 font-bold text-gray-600 flex items-center justify-center gap-2 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all active:scale-95">

              <X size={18} /> Reject
            </button>
            <button
              onClick={() => handleAction('approved')}
              className="flex-1 h-12 rounded-full bg-[#00D4AA] font-bold text-white flex items-center justify-center gap-2 hover:bg-[#00B390] transition-all shadow-lg shadow-[#00D4AA]/20 active:scale-95">

              <Check size={18} /> Approve
            </button>
          </div>

          {/* Swipe Navigation */}
          <div className="flex justify-between items-center text-xs text-gray-400 px-2">
            <button
              onClick={handlePrev}
              disabled={currentClipIndex === 0}
              className="flex items-center hover:text-gray-600 disabled:opacity-30 transition-colors">

              <ChevronLeft size={14} /> Prev Clip
            </button>
            <span>Swipe for next</span>
            <button
              onClick={handleNext}
              disabled={currentClipIndex === clips.length - 1}
              className="flex items-center hover:text-gray-600 disabled:opacity-30 transition-colors">

              Next Clip <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>);

}