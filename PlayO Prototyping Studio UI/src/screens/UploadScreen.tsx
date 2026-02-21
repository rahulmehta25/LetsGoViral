import React, { useRef, useState } from 'react';
import { UploadCloud, FileVideo, X, ArrowLeft } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { webApi } from '../lib/api';

interface UploadScreenProps {
  onNavigate: (screen: string) => void;
  onComplete: (projectId: string, videoId: string | null) => Promise<void>;
  defaultName?: string;
}

export function UploadScreen({ onNavigate, onComplete, defaultName = '' }: UploadScreenProps) {
  const [projectName, setProjectName] = useState(defaultName);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handlePickFile = () => inputRef.current?.click();

  const handleStart = async () => {
    if (!projectName.trim() || !selectedFile) return;

    setIsSubmitting(true);
    try {
      const project = await webApi.projects.create({ name: projectName.trim() });

      const upload = await webApi.videos.getUploadUrl({
        project_id: project.id,
        filename: selectedFile.name,
        content_type: selectedFile.type || 'video/mp4',
        file_size_mb: selectedFile.size / (1024 * 1024),
      });

      const uploadResponse = await fetch(upload.signed_url, {
        method: 'PUT',
        headers: { 'Content-Type': selectedFile.type || 'video/mp4' },
        body: selectedFile,
      });

      if (!uploadResponse.ok) {
        throw new Error(`File upload failed (${uploadResponse.status})`);
      }

      await onComplete(project.id, upload.video.id);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#F5F5F5] flex flex-col animate-slide-up">
      <header className="h-16 bg-white border-b border-gray-200 px-4 flex items-center gap-4 z-20">
        <button onClick={() => onNavigate('projects')} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <ArrowLeft className="w-6 h-6 text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">New Project</h1>
      </header>

      <main className="flex-1 p-6 flex flex-col justify-center max-w-md mx-auto w-full gap-6">
        <Input
          label="Project Name"
          placeholder="e.g. Podcast Interview with Jane"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className="focus:border-[#00D4AA] focus:ring-[#00D4AA]"
        />

        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0] || null;
            setSelectedFile(file);
          }}
        />

        {!selectedFile ? (
          <div
            className="bg-white rounded-[24px] border-2 border-dashed border-[#FF00FF]/30 hover:border-[#FF00FF] transition-colors cursor-pointer p-10 flex flex-col items-center justify-center text-center gap-4 group h-64"
            onClick={handlePickFile}
          >
            <div className="w-20 h-20 rounded-full bg-[#FF00FF]/5 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <UploadCloud className="w-10 h-10 text-[#FF00FF]" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">Tap to upload</h3>
              <p className="text-gray-500">Select a video from your computer</p>
            </div>
            <div className="text-xs text-gray-400 font-medium bg-gray-50 px-3 py-1 rounded-full">Max 30 min • Under 2 GB</div>
          </div>
        ) : (
          <Card className="border-[#FF00FF] border-2 shadow-xl overflow-hidden relative animate-scale-in" noPadding>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedFile(null);
              }}
              className="absolute top-2 right-2 p-1 bg-black/50 hover:bg-black/70 rounded-full text-white z-10 transition-colors"
            >
              <X size={16} />
            </button>
            <div className="aspect-video bg-gray-900 flex items-center justify-center relative">
              <FileVideo className="text-white/50 w-16 h-16" />
            </div>
            <div className="p-4">
              <h3 className="font-bold text-gray-900 truncate mb-1">{selectedFile.name}</h3>
              <p className="text-sm text-gray-500">{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB</p>
            </div>
          </Card>
        )}

        <Button
          fullWidth
          size="lg"
          className="bg-[#00D4AA] hover:bg-[#00B390] text-white font-bold h-14 rounded-full text-lg shadow-lg shadow-[#00D4AA]/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          onClick={() => void handleStart()}
          disabled={!selectedFile || !projectName.trim() || isSubmitting}
        >
          {isSubmitting ? 'Uploading...' : 'Start Processing'}
        </Button>
      </main>
    </div>
  );
}
