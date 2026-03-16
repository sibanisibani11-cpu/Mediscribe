"use client";

import { useState, useEffect, useRef } from "react";
import { Moon, Sun, LogOut, User, Book, Home, ArrowLeft, Minus, X, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { SplashScreen } from '@/components/splash-screen';
import { AuthPage } from "@/components/auth-page";
import { ActivationPage } from "@/components/activation-page";
import { LandingPage } from "@/components/landing-page";
import { DictationView } from "@/components/dictation-view";
import { KeywordView } from "@/components/keyword-view";
import { DictionaryManager } from "@/components/dictionary-manager";
import { UploadView } from "@/components/upload-view";

type AppView = 'landing' | 'dictation' | 'keyword' | 'dictionary' | 'upload';

export function MediScribeApp() {
  const { theme, setTheme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<AppView>('landing');
  const [isActivated, setIsActivated] = useState<boolean | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const { toast } = useToast();
  const EXPIRATION_DATE = new Date('2026-04-01'); // Expires after 31st March (i.e., on April 1st)

  const isElectron = typeof window !== 'undefined' && !!window.electron;
  const isMac = isElectron && (window.electron as any).platform === 'darwin';

  useEffect(() => {
    setIsMounted(true);

    // Check for trial expiration
    const now = new Date();
    if (now > EXPIRATION_DATE) {
      setIsExpired(true);
    }

    // Auto-login if already connected to Google
    if (isElectron) {
      (window.electron as any).getGoogleStatus?.().then((res: any) => {
        if (res.connected) {
          setIsAuthenticated(true);
          setCurrentUser("Google User");
        }
      });
    }

    // Get initial states from Electron
    if (isElectron) {
      // Check Activation Status
      (window.electron as any).checkActivation?.().then((active: boolean) => {
        setIsActivated(active);
      }).catch(() => setIsActivated(false));

      // Check Full Screen Status
      (window.electron as any).isFullScreen?.().then((fs: boolean) => {
        setIsFullScreen(fs);
      });

      // Listen for Full Screen changes
      (window.electron as any).onFullScreenChange?.((fs: boolean) => {
        setIsFullScreen(fs);
      });

      // Listen for typing mode changes from bubble/main process
      (window.electron as any).onTypingModeChange?.((mode: string) => {
        console.log('[MediScribe] Mode change received from Electron:', mode);
        if (mode === 'dictation' || mode === 'keyword') {
          setCurrentView(mode as AppView);
        }
      });

      // Listen for toggle from bubble - only switch view if not in a typing mode
      (window.electron as any).onToggleRecording?.(() => {
        console.log('[MediScribeApp] toggle-recording signal received');
        setCurrentView((prev) => {
          // If in a mode that doesn't handle toggle locally, switch to dictation
          if (prev !== 'dictation' && prev !== 'keyword') {
            console.log('[MediScribeApp] Switching to dictation view for toggle');
            return 'dictation';
          }
          // DictationView and KeywordView handle their own toggle when active
          return prev;
        });
      });

      return () => {
        (window.electron as any).removeAllListeners?.('fullscreen-change');
        (window.electron as any).removeAllListeners?.('typing-mode-change');
        (window.electron as any).removeAllListeners?.('toggle-recording');
      };
    } else {
      setIsActivated(true); // Default to true if not in Electron (for web dev)
    }
  }, [isElectron]);

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setCurrentView('landing');
    toast({
      title: "Logged Out",
      description: "You have been successfully logged out.",
    });
  };

  const handleViewChange = (view: AppView) => {
    setCurrentView(view);
    // Notify electron about view change if it relates to typing mode
    if (isElectron && (view === 'dictation' || view === 'keyword')) {
      (window.electron as any).setTypingMode(view);
    }
  };

  const handleMinimize = () => {
    if (isElectron) {
      (window.electron as any).minimizeWindow();
    }
  };

  const handleQuit = () => {
    if (isElectron) {
      (window.electron as any).quitApp();
    }
  };

  const handleToggleFullScreen = async () => {
    if (isElectron) {
      const result = await (window.electron as any).toggleFullScreen();
      if (result.success) {
        setIsFullScreen(result.isFullScreen);
      }
    }
  };

  if (!isMounted) {
    return null;
  }

  // Show splash screen initially
  if (isActivated === null) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  if (!isActivated && isExpired) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-950 font-sans">
        <div className="w-full max-w-md bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden p-10 flex flex-col items-center text-center animate-in fade-in zoom-in duration-700">
          <div className="w-20 h-20 bg-red-500/20 rounded-2xl flex items-center justify-center mb-8 rotate-3 shadow-inner">
            <X className="h-10 w-10 text-red-500" />
          </div>

          <h1 className="text-4xl font-black text-white mb-2 tracking-tighter uppercase italic">Trial Ended</h1>
          <p className="text-slate-400 text-sm leading-relaxed mb-10 px-4">
            The beta trial period for this version reached its end on <span className="text-blue-400 font-bold text-nowrap">March 31, 2026</span>. Please subscribe or download the latest update to continue.
          </p>

          <div className="flex flex-col gap-4 w-full">
            <Button
              onClick={() => window.open('https://mediapp.store/pricing', '_blank')}
              className="w-full h-14 cobalt-gradient hover:opacity-90 text-white font-black text-lg rounded-2xl transition-all shadow-xl shadow-blue-500/20 active:scale-[0.98]"
            >
              Subscribe Now
            </Button>

            <Button
              onClick={() => window.open('https://mediapp.store', '_blank')}
              variant="outline"
              className="w-full h-14 border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold text-lg rounded-2xl transition-all"
            >
              Get Latest Download
            </Button>
          </div>

          <div className="mt-8 text-[10px] text-slate-600 font-bold uppercase tracking-widest">
            MediScribe Beta Program
          </div>
        </div>
      </div>
    );
  }

  // Show Auth Page if not authenticated
  if (!isAuthenticated) {
    return <AuthPage onLogin={(user) => {
      setIsAuthenticated(true);
      setCurrentUser(user);
    }} />;
  }

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex flex-col">

      <header className="p-4 flex flex-col gap-4">
        {/* Header Top: Title Left, Controls Right */}
        <div className="flex items-center justify-between min-h-[40px] gap-4">
          <div className="flex flex-col items-start justify-center min-w-0">
            <h1 className="text-xl font-bold cobalt-gradient-text tracking-tight h-8 flex items-center truncate w-full">MediScribe</h1>
            <div className="text-[10px] text-muted-foreground flex flex-col items-start leading-tight truncate w-full">
              <span className="font-medium text-blue-600 dark:text-blue-400 truncate">
                {isActivated ? "Pro License" : "Trial Version"}
              </span>
              {!isActivated && <span className="truncate">Valid until March 31, 2026</span>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentUser && (
              <div className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <User className="h-3 w-3 text-blue-600" />
                <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 max-w-[100px] truncate">
                  {currentUser}
                </span>
              </div>
            )}

            {currentView !== 'landing' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentView('landing')}
                className="h-7 w-7 rounded-full text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                title="Home / Switch Mode"
              >
                <Home className="h-3.5 w-3.5" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="h-7 w-7 rounded-full text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              title="Log Out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentView(currentView === 'dictionary' ? 'landing' : 'dictionary')}
              className={cn(
                "h-7 w-7 rounded-full transition-colors",
                currentView === 'dictionary' ? "text-blue-600 bg-blue-50 dark:bg-blue-900/30" : "text-slate-500"
              )}
              title="Custom Dictionary"
            >
              <Book className="h-3.5 w-3.5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="h-7 w-7 rounded-full"
            >
              {theme === 'dark' ? (
                <Moon className="h-3.5 w-3.5" />
              ) : (
                <Sun className="h-3.5 w-3.5" />
              )}
            </Button>

            {isElectron && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleToggleFullScreen}
                className="h-7 w-7 rounded-full text-slate-500 hover:text-blue-600 transition-colors"
                title={isFullScreen ? "Exit Full Screen" : "Enter Full Screen"}
              >
                {isFullScreen ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 overflow-x-hidden w-full">
        {currentView === 'landing' && (
          <LandingPage onSelectMode={(mode) => handleViewChange(mode)} />
        )}

        {currentView === 'dictation' && (
          <div className="w-full max-w-sm flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex items-center justify-between px-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentView('landing')}
                className="text-[10px] h-7 px-2 hover:bg-slate-100 dark:hover:bg-slate-800 flex gap-1 items-center"
              >
                <ArrowLeft className="h-3 w-3" /> Back
              </Button>
            </div>
            <DictationView isElectron={isElectron} />
          </div>
        )}

        {currentView === 'keyword' && (
          <div className="w-full max-w-6xl flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300 h-full">
            <KeywordView
              isElectron={isElectron}
              onBack={() => setCurrentView('landing')}
            />
          </div>
        )}

        {currentView === 'upload' && (
          <div className="w-full max-w-sm flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex items-center justify-between px-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentView('landing')}
                className="text-[10px] h-7 px-2 hover:bg-slate-100 dark:hover:bg-slate-800 flex gap-1 items-center"
              >
                <ArrowLeft className="h-3 w-3" /> Back
              </Button>
            </div>
            <UploadView isElectron={isElectron} />
          </div>
        )}

        {currentView === 'dictionary' && (
          <div className="w-full max-w-4xl flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Book className="h-4 w-4 text-blue-600" />
                Custom Dictionary
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentView('landing')}
                className="text-[10px] h-7 px-2 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                ← Back
              </Button>
            </div>
            <DictionaryManager />
          </div>
        )}
      </main>

    </div>
  );
}
