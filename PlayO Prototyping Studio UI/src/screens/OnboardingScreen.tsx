import React from 'react';
import { Card } from '../components/ui/Card';
import {
  Play,
  MessageSquare,
  Sparkles,
  Apple,
  Mail,
  Chrome } from
'lucide-react';
interface OnboardingScreenProps {
  onContinue: () => void;
}
export function OnboardingScreen({ onContinue }: OnboardingScreenProps) {
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-black to-gray-900 overflow-hidden flex flex-col items-center justify-end">
      {/* Floating Background Elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-20 left-10 transform -rotate-12 opacity-30 blur-sm animate-float-slow">
          <div className="bg-gray-800/50 backdrop-blur-md w-32 h-48 rounded-xl border border-white/10 flex items-center justify-center">
            <Play className="text-white/50 w-12 h-12 fill-current" />
          </div>
        </div>
        <div className="absolute top-40 right-12 transform rotate-6 opacity-40 blur-md animate-float-medium">
          <div className="bg-gray-800/50 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/10 flex items-center gap-3 max-w-[200px]">
            <div className="w-8 h-8 rounded-full bg-[#00D4AA] flex items-center justify-center flex-shrink-0">
              <Sparkles className="text-white w-4 h-4" />
            </div>
            <div className="h-2 w-24 bg-white/20 rounded-full" />
          </div>
        </div>
        <div className="absolute bottom-1/2 left-1/4 transform -rotate-6 opacity-20 blur-lg animate-float-fast">
          <div className="bg-gray-800/50 backdrop-blur-md px-4 py-3 rounded-tr-2xl rounded-tl-2xl rounded-br-2xl border border-white/10">
            <MessageSquare className="text-white/50 w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Award Badge */}
      <div className="absolute top-12 right-6 z-10">
        <div className="bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2">
          <div className="w-2 h-2 bg-[#00D4AA] rounded-full animate-pulse" />
          <span className="text-xs font-medium text-white/80">
            #1 Product of the Week
          </span>
        </div>
      </div>

      {/* Auth Card */}
      <div className="w-full p-4 z-20 animate-slide-up">
        <Card className="bg-white border-none shadow-2xl rounded-[32px] overflow-hidden">
          <div className="p-8 space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold text-gray-900 tracking-tight">
                Create viral clips <br />
                <span className="text-[#00D4AA]">in seconds</span>
              </h2>
              <p className="text-gray-500">
                AI-powered editing for content creators.
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={onContinue}
                className="w-full h-14 rounded-full font-semibold flex items-center justify-center bg-black text-white hover:bg-gray-900 transition-colors">

                <Apple className="mr-2 h-5 w-5" /> Continue with Apple
              </button>

              <button
                onClick={onContinue}
                className="w-full h-14 rounded-full font-semibold flex items-center justify-center bg-white text-gray-900 border border-gray-200 hover:bg-gray-50 transition-colors">

                <Chrome className="mr-2 h-5 w-5" /> Continue with Google
              </button>

              <button
                onClick={onContinue}
                className="w-full h-14 rounded-full font-semibold flex items-center justify-center bg-white text-gray-900 border border-gray-200 hover:bg-gray-50 transition-colors">

                <Mail className="mr-2 h-5 w-5" /> Continue with Email
              </button>
            </div>

            <p className="text-center text-xs text-gray-400">
              By continuing, you agree to our Terms & Privacy Policy.
            </p>
          </div>
        </Card>
      </div>
    </div>);

}