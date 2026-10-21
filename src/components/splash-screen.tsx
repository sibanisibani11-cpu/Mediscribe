'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Heart, Brain, Keyboard, CloudOff } from 'lucide-react';

interface SplashScreenProps {
  onComplete?: () => void;
}

// Display duration for the splash screen
const SPLASH_VISIBLE_MS = 1400;
const SPLASH_FADE_MS = 300;

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [fadeOut, setFadeOut] = useState(false);
  // Keep the latest callback in a ref so parent re-renders don't restart the timers
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const fadeTimer = setTimeout(() => {
      setFadeOut(true);
    }, SPLASH_VISIBLE_MS);

    // Call onComplete after fade out completes
    const completeTimer = setTimeout(() => {
      onCompleteRef.current?.();
    }, SPLASH_VISIBLE_MS + SPLASH_FADE_MS);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
  }, []);

  return (
    <div
      className={`min-h-screen w-full flex flex-col items-center justify-center transition-all duration-500 ${fadeOut ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
        }`}
      style={{
        background: 'linear-gradient(135deg, #fdfcfd 0%, #f5f3ff 50%, #ede9fe 100%)'
      }}
    >
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-violet-500/10 animate-pulse"
            style={{
              width: Math.random() * 100 + 20 + 'px',
              height: Math.random() * 100 + 20 + 'px',
              left: Math.random() * 100 + '%',
              top: Math.random() * 100 + '%',
              animationDelay: Math.random() * 3 + 's',
              animationDuration: (Math.random() * 3 + 2) + 's'
            }}
          />
        ))}
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center justify-center">
        {/* Animated logo */}
        <div className="relative mb-8">
          <div className="absolute inset-0 rounded-full bg-violet-400/20 animate-ping"></div>
          <div className="w-24 h-24 rounded-2xl cobalt-gradient flex items-center justify-center relative shadow-2xl overflow-hidden group">
            <div className="absolute inset-0 bg-white/20 animate-ping group-hover:bg-violet-400/20" />
            <Mic className="w-12 h-12 text-white z-10" />
          </div>
        </div>

        {/* App name with gradient text */}
        <h1 className="text-4xl font-bold cobalt-gradient-text drop-shadow-sm">
          MediScribe
        </h1>

        <p className="text-lg text-slate-600/80 mb-3 animate-fade-in font-medium">
          AI-Powered Medical Transcription
        </p>

        {/* Offline indicator badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-violet-600/10 border border-violet-500/25 text-violet-900 text-xs font-semibold shadow-sm mb-8 animate-fade-in backdrop-blur-sm">
          <CloudOff className="w-3.5 h-3.5 text-violet-700" />
          <span>Works Offline • No Internet Connection Required</span>
        </div>

        {/* Feature highlights */}
        <div className="flex gap-8 mb-12 animate-slide-up">
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center mb-2 border border-blue-100 shadow-sm">
              <Brain className="w-6 h-6 text-violet-600" />
            </div>
            <span className="text-sm text-slate-600 font-bold">Smart AI</span>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center mb-2 border border-blue-100 shadow-sm">
              <Heart className="w-6 h-6 text-violet-600" />
            </div>
            <span className="text-sm text-slate-600 font-bold">Healthcare</span>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center mb-2 border border-blue-100 shadow-sm">
              <Keyboard className="w-6 h-6 text-violet-600" />
            </div>
            <span className="text-sm text-slate-600 font-bold">Voice</span>
          </div>
        </div>

        {/* Loading indicator */}
        <div className="flex gap-2 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="w-2 h-2 rounded-full bg-violet-400" style={{ animationDelay: `${i * 0.2}s` }}></div>
          ))}
        </div>
      </div>

      {/* Custom animations */}
      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .animate-fade-in {
          animation: fade-in 1s ease-out forwards;
        }
        
        .animate-slide-up {
          animation: slide-up 1s ease-out 0.5s forwards;
          opacity: 0;
        }
      `}</style>
    </div>
  );
}
