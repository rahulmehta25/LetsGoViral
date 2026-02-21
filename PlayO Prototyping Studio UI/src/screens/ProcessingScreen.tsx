import React, { useEffect, useState } from 'react';
import { Card } from '../components/ui/Card';
import { Project, Clip } from '../App';
interface ProcessingScreenProps {
  onNavigate: (screen: string) => void;
  project: Project;
  onComplete: (clips: Clip[]) => void;
}
export function ProcessingScreen({
  onNavigate,
  project,
  onComplete
}: ProcessingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState(1);
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          // Generate mock clips
          const newClips: Clip[] = [
          {
            id: Date.now(),
            rank: 1,
            score: 9.5,
            duration: '0:32',
            status: 'pending',
            rationale: 'Perfect hook with high retention probability.',
            title: 'Viral Clip #1'
          },
          {
            id: Date.now() + 1,
            rank: 2,
            score: 8.8,
            duration: '0:45',
            status: 'pending',
            rationale: 'Strong emotional connection in middle segment.',
            title: 'Viral Clip #2'
          },
          {
            id: Date.now() + 2,
            rank: 3,
            score: 7.2,
            duration: '0:18',
            status: 'pending',
            rationale: 'Short and punchy, good for Stories.',
            title: 'Viral Clip #3'
          }];

          onComplete(newClips);
          setTimeout(() => onNavigate('detail'), 500);
          return 100;
        }
        return prev + 1;
      });
    }, 50); // Simulating 5 seconds processing
    return () => clearInterval(interval);
  }, [onNavigate, onComplete]);
  useEffect(() => {
    if (progress > 30) setStep(2);
    if (progress > 60) setStep(3);
    if (progress > 90) setStep(4);
  }, [progress]);
  const getStatusText = () => {
    if (progress < 30) return 'Uploading video...';
    if (progress < 60) return 'Transcribing audio...';
    if (progress < 90) return 'Finding viral moments...';
    return 'Finalizing clips...';
  };
  return (
    <div className="fixed inset-0 bg-[#F5F5F5] flex flex-col items-center justify-center p-6 animate-fade-in">
      <Card className="w-full max-w-sm bg-white shadow-xl rounded-[32px] overflow-hidden text-center">
        <div className="p-10 flex flex-col items-center gap-8">
          <h2 className="text-lg font-bold text-gray-900 truncate max-w-full px-4">
            {project.name}
          </h2>

          {/* Progress Circle */}
          <div className="relative w-32 h-32 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="64"
                cy="64"
                r="60"
                stroke="#f3f4f6"
                strokeWidth="8"
                fill="none" />

              <circle
                cx="64"
                cy="64"
                r="60"
                stroke="#00D4AA"
                strokeWidth="8"
                fill="none"
                strokeDasharray={2 * Math.PI * 60}
                strokeDashoffset={2 * Math.PI * 60 * (1 - progress / 100)}
                className="transition-all duration-200 ease-linear"
                strokeLinecap="round" />

            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold text-gray-900">
                {progress}%
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-bold text-gray-900 animate-pulse">
              {getStatusText()}
            </h3>
            <p className="text-sm text-gray-500 font-medium">
              Step {step} of 4
            </p>
          </div>
        </div>

        <div className="bg-gray-50 p-4 border-t border-gray-100">
          <button
            onClick={() => onNavigate('projects')}
            className="text-sm text-gray-400 hover:text-gray-600 font-medium transition-colors">

            Cancel Processing
          </button>
        </div>
      </Card>
    </div>);

}