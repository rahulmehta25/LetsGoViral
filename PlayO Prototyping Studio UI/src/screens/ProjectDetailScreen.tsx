import React, { useState } from 'react';
import { ArrowLeft, Check, X, Play, Download } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Tabs } from '../components/ui/Tabs';
import { Badge } from '../components/ui/Badge';
import { Clip, VideoDetails } from '../types';

interface ProjectDetailScreenProps {
  onNavigate: (screen: string) => void;
  projectName: string;
  video: VideoDetails | null;
  onOpenReviewer: (clip: Clip) => void;
  onUpdateClipStatus: (clipId: string, approved: boolean) => Promise<void>;
}

export function ProjectDetailScreen({
  onNavigate,
  projectName,
  video,
  onOpenReviewer,
  onUpdateClipStatus,
}: ProjectDetailScreenProps) {
  const [activeTab, setActiveTab] = useState('Clips');
  const clips = video?.clips || [];

  return (
    <div className="fixed inset-0 bg-[#F5F5F5] flex flex-col animate-slide-up">
      <header className="h-16 bg-white border-b border-gray-200 px-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('projects')} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6 text-gray-600" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 truncate max-w-[180px]">{projectName}</h1>
        </div>
        <Button size="sm" className="bg-[#00D4AA] hover:bg-[#00B390] text-white font-bold rounded-full px-6" onClick={() => onNavigate('reviewer')}>
          Review
        </Button>
      </header>

      <div className="px-4 py-4">
        <Tabs tabs={['Script', 'Clips', 'Suggestions']} activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      <main className="flex-1 overflow-y-auto px-4 pb-24 space-y-4">
        {activeTab === 'Clips' && (
          <>
            <div className="flex justify-between items-center px-2">
              <span className="text-sm font-bold text-gray-500 uppercase tracking-wide">Generated Clips</span>
              <Badge variant="default">{clips.length}</Badge>
            </div>

            {clips.map((clip) => {
              const status =
                clip.user_approved === true ? 'approved' : clip.user_approved === false ? 'rejected' : 'pending';

              return (
                <Card
                  key={clip.id}
                  noPadding
                  className={`overflow-hidden border-2 transition-all cursor-pointer hover:shadow-md ${
                    status === 'approved'
                      ? 'border-[#00D4AA]'
                      : status === 'rejected'
                        ? 'border-gray-200 opacity-60'
                        : 'border-transparent hover:border-[#FF00FF]'
                  }`}
                  onClick={() => onOpenReviewer(clip)}
                >
                  <div className="flex h-28">
                    <div className="w-28 bg-gray-900 relative flex-shrink-0 group overflow-hidden">
                      {clip.cdn_url ? (
                        <video
                          src={clip.cdn_url}
                          className="absolute inset-0 w-full h-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                          onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
                          onMouseLeave={(e) => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                        />
                      ) : null}
                      <div className="absolute inset-0 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Play className="text-white w-8 h-8 opacity-80 drop-shadow-lg" />
                      </div>
                      <div className="absolute top-2 left-2 bg-[#00D4AA] text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                        #{clip.strategic_rank ?? '-'}
                      </div>
                      <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] font-mono px-1 rounded backdrop-blur-sm">
                        {(clip.duration_seconds ?? 0).toFixed(1)}s
                      </div>
                    </div>

                    <div className="flex-1 p-3 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-1">
                          <h3 className="font-bold text-gray-900 text-sm truncate pr-2">{clip.title || `Clip #${clip.strategic_rank ?? '-'}`}</h3>
                          <span className="text-xs font-bold text-[#00D4AA] bg-[#00D4AA]/10 px-1.5 py-0.5 rounded">
                            {(clip.hook_score ?? 0).toFixed(1)}/10
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{clip.rationale || 'No rationale provided.'}</p>
                      </div>

                      <div className="flex justify-end gap-2 mt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void onUpdateClipStatus(clip.id, false);
                          }}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                            status === 'rejected'
                              ? 'bg-red-100 text-red-500'
                              : 'bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-500'
                          }`}
                        >
                          <X size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void onUpdateClipStatus(clip.id, true);
                          }}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                            status === 'approved'
                              ? 'bg-[#00D4AA] text-white shadow-md'
                              : 'bg-[#00D4AA]/10 text-[#00D4AA] hover:bg-[#00D4AA] hover:text-white'
                          }`}
                        >
                          <Check size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}

            {clips.length === 0 && <Card className="p-6 text-sm text-gray-500">No clips yet. Wait for processing to complete.</Card>}
          </>
        )}

        {activeTab === 'Script' && (
          <Card className="p-6 space-y-3">
            <h3 className="font-bold text-gray-900">Video Status</h3>
            <p className="text-sm text-gray-600">Current processing status: {video?.processing_status || 'No video'}</p>
          </Card>
        )}

        {activeTab === 'Suggestions' && (
          <div className="space-y-4">
            {(video?.edit_guidance?.suggestions || []).map((suggestion, index) => (
              <Card key={`${suggestion.type}-${index}`} className="p-4 border-l-4 border-l-[#00D4AA]">
                <h4 className="font-bold text-gray-900 mb-1">{suggestion.type.replace(/_/g, ' ')}</h4>
                <p className="text-sm text-gray-600">{suggestion.suggestion}</p>
              </Card>
            ))}

            {!video?.edit_guidance?.suggestions?.length && (
              <Card className="p-4">
                <p className="text-sm text-gray-600">No edit suggestions available yet.</p>
              </Card>
            )}
          </div>
        )}

        <div className="pt-4">
          <Button fullWidth className="bg-black text-white hover:bg-gray-900">
            <Download size={16} className="mr-2" /> Export Selected Clips
          </Button>
        </div>
      </main>
    </div>
  );
}
