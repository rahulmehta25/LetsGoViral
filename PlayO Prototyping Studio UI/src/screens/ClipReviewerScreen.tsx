import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, X, Share2, Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { Clip } from '../types';

interface ClipReviewerScreenProps {
  onNavigate: (screen: string) => void;
  clips: Clip[];
  startIndex: number;
  onUpdateClipStatus: (clipId: string, approved: boolean) => Promise<void>;
}

export function ClipReviewerScreen({
  onNavigate,
  clips,
  startIndex,
  onUpdateClipStatus,
}: ClipReviewerScreenProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentClipIndex, setCurrentClipIndex] = useState(startIndex);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setCurrentClipIndex(startIndex);
  }, [startIndex]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (isPlaying) {
      vid.play().catch(() => {});
    } else {
      vid.pause();
    }
  }, [isPlaying, currentClipIndex]);

  const currentClip = clips[currentClipIndex];

  const handleNext = () => {
    if (currentClipIndex < clips.length - 1) setCurrentClipIndex((prev) => prev + 1);
  };

  const handlePrev = () => {
    if (currentClipIndex > 0) setCurrentClipIndex((prev) => prev - 1);
  };

  const handleAction = async (approved: boolean) => {
    if (!currentClip) return;
    await onUpdateClipStatus(currentClip.id, approved);
    if (currentClipIndex < clips.length - 1) handleNext();
  };

  if (!currentClip) {
    return (
      <div className="fixed inset-0 bg-[#F5F5F5] flex items-center justify-center">
        <button onClick={() => onNavigate('detail')} className="px-6 py-3 bg-black text-white rounded-full">
          Back to project
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black flex flex-col animate-fade-in">
      <div className="flex-1 relative bg-gray-900 group cursor-pointer" onClick={() => setIsPlaying(!isPlaying)}>
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-20 bg-gradient-to-b from-black/60 to-transparent">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNavigate('detail');
            }}
            className="p-2 bg-black/20 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-colors"
          >
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

        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
              <Play className="w-8 h-8 text-white fill-current ml-1" />
            </div>
          </div>
        )}

        {currentClip.cdn_url ? (
          <video
            ref={videoRef}
            key={currentClip.id}
            src={currentClip.cdn_url}
            className="w-full h-full object-contain"
            autoPlay
            loop
            playsInline
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-white/10 font-bold text-6xl select-none">NO VIDEO</div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-t-[32px] shadow-[0_-10px_40px_rgba(0,0,0,0.3)] z-30 animate-slide-up">
        <div className="w-full flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>

        <div className="px-6 pb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900 truncate">{currentClip.title || `Clip #${currentClip.strategic_rank ?? '-'}`}</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500 uppercase">Hook Score</span>
              <div className="bg-[#00D4AA]/10 text-[#00D4AA] px-2 py-1 rounded-md font-bold text-sm">
                {(currentClip.hook_score ?? 0).toFixed(1)}/10
              </div>
            </div>
          </div>

          <div className="mb-6 min-h-[80px]">
            <p className="text-sm text-gray-600 leading-relaxed animate-fade-in">
              {currentClip.rationale || 'No AI rationale available.'}
            </p>
          </div>

          <div className="flex gap-3 mb-4">
            <button
              onClick={() => void handleAction(false)}
              className="flex-1 h-12 rounded-full border border-gray-200 font-bold text-gray-600 flex items-center justify-center gap-2 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all active:scale-95"
            >
              <X size={18} /> Reject
            </button>
            <button
              onClick={() => void handleAction(true)}
              className="flex-1 h-12 rounded-full bg-[#00D4AA] font-bold text-white flex items-center justify-center gap-2 hover:bg-[#00B390] transition-all"
            >
              <Check size={18} /> Approve
            </button>
          </div>

          <div className="flex justify-between items-center text-xs text-gray-400 px-2">
            <button
              onClick={handlePrev}
              disabled={currentClipIndex === 0}
              className="flex items-center hover:text-gray-600 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={14} /> Prev Clip
            </button>
            <span>Navigate clips</span>
            <button
              onClick={handleNext}
              disabled={currentClipIndex === clips.length - 1}
              className="flex items-center hover:text-gray-600 disabled:opacity-30 transition-colors"
            >
              Next Clip <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
