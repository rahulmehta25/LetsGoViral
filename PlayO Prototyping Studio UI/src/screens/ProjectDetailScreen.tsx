import React, { useState } from 'react';
import { ArrowLeft, Check, X, Play, Share2, Download } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Tabs } from '../components/ui/Tabs';
import { Badge } from '../components/ui/Badge';
import { Project, Clip } from '../App';
interface ProjectDetailScreenProps {
  onNavigate: (screen: string) => void;
  project: Project;
  onUpdateClipStatus: (clipId: number, status: Clip['status']) => void;
  onExport: () => void;
}
export function ProjectDetailScreen({
  onNavigate,
  project,
  onUpdateClipStatus,
  onExport
}: ProjectDetailScreenProps) {
  const [activeTab, setActiveTab] = useState('Clips');
  return (
    <div className="fixed inset-0 bg-[#F5F5F5] flex flex-col animate-slide-up">
      {/* Top Bar */}
      <header className="h-16 bg-white border-b border-gray-200 px-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('projects')}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors">

            <ArrowLeft className="w-6 h-6 text-gray-600" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 truncate max-w-[150px]">
            {project.name}
          </h1>
        </div>
        <Button
          size="sm"
          className="bg-[#00D4AA] hover:bg-[#00B390] text-white font-bold rounded-full px-6 shadow-md shadow-[#00D4AA]/20"
          onClick={onExport}>

          Export
        </Button>
      </header>

      {/* Tabs */}
      <div className="px-4 py-4">
        <Tabs
          tabs={['Script', 'Clips', 'Suggestions']}
          activeTab={activeTab}
          onTabChange={setActiveTab} />

      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-4 pb-24 space-y-4">
        {activeTab === 'Clips' &&
        <>
            <div className="flex justify-between items-center px-2">
              <span className="text-sm font-bold text-gray-500 uppercase tracking-wide">
                Generated Clips
              </span>
              <Badge variant="default">{project.clips.length}</Badge>
            </div>

            {project.clips.map((clip) =>
          <Card
            key={clip.id}
            noPadding
            className={`overflow-hidden border-2 transition-all cursor-pointer hover:shadow-md ${clip.status === 'approved' ? 'border-[#00D4AA]' : clip.status === 'rejected' ? 'border-gray-200 opacity-60' : 'border-transparent hover:border-[#FF00FF]'}`}
            onClick={() => onNavigate('reviewer')}>

                <div className="flex h-28">
                  {/* Thumbnail */}
                  <div className="w-28 bg-gray-900 relative flex-shrink-0 group">
                    <div className="absolute inset-0 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Play className="text-white w-8 h-8 opacity-80" />
                    </div>
                    <div className="absolute top-2 left-2 bg-[#00D4AA] text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                      #{clip.rank}
                    </div>
                    <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] font-mono px-1 rounded backdrop-blur-sm">
                      {clip.duration}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 p-3 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="font-bold text-gray-900 text-sm truncate pr-2">
                          {clip.title}
                        </h3>
                        <span className="text-xs font-bold text-[#00D4AA] bg-[#00D4AA]/10 px-1.5 py-0.5 rounded">
                          {clip.score}/10
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
                        {clip.rationale}
                      </p>
                    </div>

                    <div className="flex justify-end gap-2 mt-2">
                      <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateClipStatus(clip.id, 'rejected');
                    }}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${clip.status === 'rejected' ? 'bg-red-100 text-red-500' : 'bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-500'}`}>

                        <X size={16} />
                      </button>
                      <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateClipStatus(clip.id, 'approved');
                    }}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${clip.status === 'approved' ? 'bg-[#00D4AA] text-white shadow-md' : 'bg-[#00D4AA]/10 text-[#00D4AA] hover:bg-[#00D4AA] hover:text-white'}`}>

                        <Check size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
          )}
          </>
        }

        {activeTab === 'Script' &&
        <Card className="p-6 space-y-4">
            <h3 className="font-bold text-gray-900">Transcript</h3>
            <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
              <p className="p-3 bg-gray-50 rounded-lg border border-gray-100 hover:border-[#00D4AA] cursor-text transition-colors">
                <span className="font-bold text-gray-900 block mb-1">
                  00:00
                </span>
                Welcome back to the podcast. Today we're talking about the
                future of AI and how it's going to change everything we know
                about content creation.
              </p>
              <p className="p-3 bg-gray-50 rounded-lg border border-gray-100 hover:border-[#00D4AA] cursor-text transition-colors">
                <span className="font-bold text-gray-900 block mb-1">
                  00:15
                </span>
                I never thought I'd say this, but the tools we have now are
                actually scary good. Like, terrifyingly good.
              </p>
              <p className="p-3 bg-gray-50 rounded-lg border border-gray-100 hover:border-[#00D4AA] cursor-text transition-colors">
                <span className="font-bold text-gray-900 block mb-1">
                  00:32
                </span>
                If you're not using these tools, you're basically bringing a
                knife to a gunfight.
              </p>
            </div>
          </Card>
        }

        {activeTab === 'Suggestions' &&
        <div className="space-y-4">
            <Card className="p-4 border-l-4 border-l-[#00D4AA]">
              <h4 className="font-bold text-gray-900 mb-1">
                Add a CTA at 0:45
              </h4>
              <p className="text-sm text-gray-600">
                Engagement drops here. Consider adding a visual pop-up asking
                viewers to subscribe.
              </p>
            </Card>
            <Card className="p-4 border-l-4 border-l-amber-400">
              <h4 className="font-bold text-gray-900 mb-1">
                Pattern Interrupt needed
              </h4>
              <p className="text-sm text-gray-600">
                The segment from 0:15 to 0:30 is static. Add B-roll or a zoom
                cut.
              </p>
            </Card>
          </div>
        }
      </main>
    </div>);

}