import React, { useEffect } from 'react';
interface SplashScreenProps {
  onComplete: () => void;
}
export function SplashScreen({ onComplete }: SplashScreenProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 2500);
    return () => clearTimeout(timer);
  }, [onComplete]);
  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-50 animate-fade-in">
      <div className="flex-1 flex items-center justify-center">
        <h1 className="text-6xl font-bold text-white tracking-tighter animate-pulse-slow">
          ClipAI
        </h1>
      </div>
      <div className="pb-12 opacity-0 animate-fade-in-delayed">
        <p className="text-sm text-gray-500 font-medium tracking-widest uppercase">
          curated by Magic Patterns
        </p>
      </div>
    </div>);

}