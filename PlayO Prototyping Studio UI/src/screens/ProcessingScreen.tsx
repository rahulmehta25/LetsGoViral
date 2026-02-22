import React, { useEffect, useState } from 'react';
import { Card } from '../components/ui/Card';
import { webApi } from '../lib/api';
import { VideoDetails } from '../types';

interface ProcessingScreenProps {
  onNavigate: (screen: string) => void;
  videoId: string | null;
  projectName: string;
  onComplete: (video: VideoDetails) => Promise<void>;
  onError: (message: string) => void;
}

const STATUS_STEPS: Record<string, number> = {
  PENDING: 1,
  UPLOADED: 1,
  PROCESSING: 2,
  TRANSCRIBING: 3,
  ANALYZING: 3,
  COMPLETED: 4,
  FAILED: 4,
};

const STATUS_PROGRESS_RANGE: Record<string, [number, number]> = {
  PENDING: [5, 15],
  UPLOADED: [15, 25],
  PROCESSING: [25, 50],
  TRANSCRIBING: [50, 70],
  ANALYZING: [70, 90],
  COMPLETED: [100, 100],
  FAILED: [0, 0],
};

export function ProcessingScreen({
  onNavigate,
  videoId,
  projectName,
  onComplete,
  onError,
}: ProcessingScreenProps) {
  const [progress, setProgress] = useState(5);
  const [status, setStatus] = useState('PENDING');

  useEffect(() => {
    if (!videoId) return;

    const timer = setInterval(async () => {
      try {
        const video = await webApi.videos.get(videoId);
        setStatus(video.processing_status);

        if (video.processing_status === 'COMPLETED') {
          setProgress(100);
          clearInterval(timer);
          await onComplete(video);
          return;
        }

        if (video.processing_status === 'FAILED') {
          clearInterval(timer);
          onError('Video processing failed');
          return;
        }

        const [rangeMin, rangeMax] = STATUS_PROGRESS_RANGE[video.processing_status] || [5, 95];
        setProgress((prev) => {
          if (prev < rangeMin) return rangeMin;
          return Math.min(prev + 3, rangeMax);
        });
      } catch (error) {
        clearInterval(timer);
        onError(error instanceof Error ? error.message : 'Failed to poll processing status');
      }
    }, 2500);

    return () => clearInterval(timer);
  }, [videoId, onComplete, onError]);

  const step = STATUS_STEPS[status] || 1;

  const getStatusText = () => {
    switch (status) {
      case 'PENDING':
      case 'UPLOADED':
        return 'Uploading video...';
      case 'PROCESSING':
        return 'Processing scenes...';
      case 'TRANSCRIBING':
        return 'Transcribing audio...';
      case 'ANALYZING':
        return 'Finding viral moments...';
      case 'COMPLETED':
        return 'Finalized';
      case 'FAILED':
        return 'Processing failed';
      default:
        return 'Processing...';
    }
  };

  return (
    <div className="fixed inset-0 bg-[#F5F5F5] flex flex-col items-center justify-center p-6 animate-fade-in">
      <Card className="w-full max-w-sm bg-white shadow-xl rounded-[32px] overflow-hidden text-center">
        <div className="p-10 flex flex-col items-center gap-8">
          <h2 className="text-lg font-bold text-gray-900 truncate max-w-full px-4">{projectName}</h2>

          <div className="relative w-32 h-32 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
              <circle cx="64" cy="64" r="60" stroke="#f3f4f6" strokeWidth="8" fill="none" />
              <circle
                cx="64"
                cy="64"
                r="60"
                stroke="#00D4AA"
                strokeWidth="8"
                fill="none"
                strokeDasharray={2 * Math.PI * 60}
                strokeDashoffset={2 * Math.PI * 60 * (1 - progress / 100)}
                className="transition-all duration-700 ease-linear"
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold text-gray-900">{progress}%</span>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-bold text-gray-900">{getStatusText()}</h3>
            <p className="text-sm text-gray-500 font-medium">Step {step} of 4</p>
          </div>
        </div>

        <div className="bg-gray-50 p-4 border-t border-gray-100">
          <button onClick={() => onNavigate('projects')} className="text-sm text-gray-400 hover:text-gray-600 font-medium transition-colors">
            Back to Projects
          </button>
        </div>
      </Card>
    </div>
  );
}
