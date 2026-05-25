"use client";

import { useState, useEffect, useRef } from "react";
import { Moon, Sun, LogOut, User, Book, Home, ArrowLeft, Minus, X, Maximize2, Minimize2, Info, Crown, LayoutTemplate, Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
import { InstructionsView } from "@/components/instructions-view";
import { PricingView } from "@/components/pricing-view";
import { TemplateManager } from "@/components/template-manager";
import { TemplateView } from "@/components/template-view";

type AppView = 'landing' | 'dictation' | 'keyword' | 'dictionary' | 'upload' | 'instructions' | 'pricing' | 'templates';

export function MediScribeApp() {
  const { theme, setTheme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [hasSkippedTrialLock, setHasSkippedTrialLock] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<AppView>('landing');
  const [isActivated, setIsActivated] = useState<boolean | null>(null);
  const [licenseDetails, setLicenseDetails] = useState<any>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [autoStartView, setAutoStartView] = useState<'keyword' | 'templates' | null>(null);
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  const { toast } = useToast();
  const EXPIRATION_DATE = new Date('2026-04-01'); // Expires after 31st March (i.e., on April 1st)

  const isElectron = typeof window !== 'undefined' && !!window.electron;
  const isMac = isElectron && (window.electron as any).platform === 'darwin';

  const isLifetimeFree = process.env.NEXT_PUBLIC_PERSONAL_LIFETIME_FREE === 'true';

  useEffect(() => {
    setIsMounted(true);

    if (typeof window !== 'undefined') {
      const hasSeenWhatsNew = localStorage.getItem('mediscribe_seen_v1.1.0_whatsnew');
      if (!hasSeenWhatsNew) {
        setShowWhatsNew(true);
      }
    }

    // Check for trial expiration - skip if lifetime free
    if (!isLifetimeFree) {
      const now = new Date();
      if (now > EXPIRATION_DATE) {
        setIsExpired(true);
      }
    }

    // Auto-login if already connected to Google
    if (isElectron) {
      (window.electron as any).getGoogleStatus?.().then((res: any) => {
        if (res.connected) {
          setIsAuthenticated(true);
          setCurrentUser(res.userEmail || "Google User");
        }
      });
    }

    // Get initial states from Electron
    if (isElectron) {
      // Check Activation Status - always true if lifetime free
      if (isLifetimeFree) {
        setIsActivated(true);
      } else {
        (window.electron as any).checkActivation?.().then((active: boolean) => {
          setIsActivated(active);
        }).catch(() => setIsActivated(false));

        (window.electron as any).getLicenseDetails?.().then((details: any) => {
          if (details) setLicenseDetails(details);
        }).catch(() => {});
      }

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
        } else if (mode === 'template') {
          setCurrentView('templates');
        }
      });

      // Listen for toggle from bubble - only switch view if not in a typing mode
      (window.electron as any).onToggleRecording?.(() => {
        console.log('[MediScribeApp] toggle-recording signal received');
        setCurrentView((prev) => {
          // If in a mode that doesn't handle toggle locally, switch to dictation
          if (prev !== 'dictation' && prev !== 'keyword' && prev !== 'templates') {
            console.log('[MediScribeApp] Switching to dictation view for toggle');
            return 'dictation';
          }
          // DictationView, KeywordView, and TemplateView handle their own toggle when active
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
    if (isElectron && (view === 'keyword' || view === 'templates')) {
      setAutoStartView(view);
    }
    // Notify electron about view change if it relates to typing mode
    if (isElectron && (view === 'dictation' || view === 'keyword' || view === 'templates')) {
      (window.electron as any).setTypingMode(view === 'templates' ? 'template' : view);
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

  // Show Auth Page if not authenticated
  if (!isAuthenticated) {
    return <AuthPage onLogin={(user) => {
      setIsAuthenticated(true);
      setCurrentUser(user);
    }} />;
  }

  // Show Pricing View even if expired
  if (currentView === 'pricing') {
    return (
      <div className="min-h-screen w-full bg-background text-foreground flex flex-col">
        <main className="flex-1 flex flex-col items-center justify-center p-4 overflow-x-hidden w-full">
          <PricingView 
            isActivated={isActivated}
            onBack={() => {
              if (!isActivated && isExpired) {
                 // If expired, stay on pricing or back to landing which will show expiration
                 setCurrentView('landing');
              } else {
                 setCurrentView('landing');
              }
            }} 
          />
        </main>
      </div>
    );
  }

  if (!isActivated && isExpired && !hasSkippedTrialLock) {
    const hadPaidPlan = !!licenseDetails?.billing;
    const planLabel = licenseDetails?.billing === 'yearly' ? 'Annual' : licenseDetails?.billing === 'monthly' ? 'Monthly' : null;
    const expiryDate = licenseDetails?.expiresAt
      ? new Date(licenseDetails.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'March 31, 2026';

    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-950 font-sans">
        <div className="w-full max-w-md bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden p-10 flex flex-col items-center text-center animate-in fade-in zoom-in duration-700">

          {hadPaidPlan ? (
            // ── Paid Subscription Expired ──
            <>
              <div className="w-20 h-20 bg-amber-500/20 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
                <Crown className="h-10 w-10 text-amber-400" />
              </div>
              <div className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/30 mb-4">
                <span className="text-amber-400 text-[10px] font-black uppercase tracking-widest">{planLabel} Plan</span>
              </div>
              <h1 className="text-3xl font-black text-white mb-2 tracking-tighter uppercase italic">Subscription Expired</h1>
              <p className="text-slate-400 text-sm leading-relaxed mb-4 px-4">
                Your <span className="text-amber-400 font-bold">{planLabel} Pro subscription</span> expired on{' '}
                <span className="text-white font-bold">{expiryDate}</span>. Renew now to continue using MediScribe Pro without interruption.
              </p>
              <p className="text-slate-500 text-xs mb-8 px-4">
                All your keywords, dictionaries and settings are safely saved and will be restored instantly when you renew.
              </p>
            </>
          ) : (
            // ── Free Trial Ended ──
            <>
              <div className="w-20 h-20 bg-red-500/20 rounded-2xl flex items-center justify-center mb-8 rotate-3 shadow-inner">
                <X className="h-10 w-10 text-red-500" />
              </div>
              <h1 className="text-4xl font-black text-white mb-2 tracking-tighter uppercase italic">Trial Ended</h1>
              <p className="text-slate-400 text-sm leading-relaxed mb-10 px-4">
                The beta trial period for this version reached its end on <span className="text-violet-400 font-bold text-nowrap">March 31, 2026</span>. Please subscribe or download the latest update to continue.
              </p>
            </>
          )}

          <div className="flex flex-col gap-4 w-full">
            <Button
              onClick={() => setCurrentView('pricing')}
              className="w-full h-14 cobalt-gradient hover:opacity-90 text-white font-black text-lg rounded-2xl transition-all shadow-xl shadow-violet-500/20 active:scale-[0.98]"
            >
              {hadPaidPlan ? '🔄 Renew Subscription' : 'Subscribe Now'}
            </Button>

            <Button
              onClick={() => window.open('https://mediapp.store', '_blank')}
              variant="outline"
              className="w-full h-14 border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold text-lg rounded-2xl transition-all"
            >
              Get Latest Download
            </Button>

            <Button
              onClick={() => {
                setHasSkippedTrialLock(true);
                setCurrentView('landing');
              }}
              variant="ghost"
              className="w-full h-12 text-slate-400 hover:text-white hover:bg-white/5 font-bold rounded-2xl transition-all mt-2"
            >
              Skip for now
            </Button>
          </div>

          <div className="mt-8 text-[10px] text-slate-600 font-bold uppercase tracking-widest">
            MediScribe Pro
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex flex-col">

      <header className="p-4 flex flex-col gap-4">
        {/* Header Top: Title Left, Controls Right */}
        <div className="flex items-center justify-between min-h-[40px] gap-4">
          <div className="flex flex-col items-start justify-center min-w-0">
            <h1 className="text-xl font-bold cobalt-gradient-text tracking-tight h-8 flex items-center truncate w-full">MediScribe</h1>
            <div className="text-[10px] text-muted-foreground flex flex-col items-start leading-tight truncate w-full">
              <div className="flex items-center gap-2">
                <span className="font-medium text-violet-600 dark:text-violet-400 truncate">
                  {isLifetimeFree ? "Lifetime License" : (isActivated ? "Pro License" : "Trial Version")}
                </span>
                {!isActivated && !isLifetimeFree && (
                  <button 
                    onClick={() => setCurrentView('pricing')}
                    className="text-[9px] font-black bg-violet-600 text-white px-1.5 py-0.5 rounded italic uppercase leading-none hover:bg-violet-700 transition-colors shadow-sm"
                  >
                    Upgrade
                  </button>
                )}
              </div>
              {!isActivated && !isLifetimeFree && <span className="truncate">Valid until March 31, 2026</span>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentUser && (
              <Popover>
                <PopoverTrigger asChild>
                  <button className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer outline-none focus:ring-2 focus:ring-violet-500/50">
                    <User className="h-3 w-3 text-violet-600" />
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 max-w-[100px] truncate">
                      Profile
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-4 rounded-2xl animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="h-10 w-10 shrink-0 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                        <User className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                      </div>
                      <div className="flex flex-col overflow-hidden min-w-0">
                        <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">User Profile</span>
                        <span className="text-[10px] text-slate-500 font-medium truncate" title={currentUser}>{currentUser}</span>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-1.5 bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Subscription Status</div>
                      <div className="flex items-center gap-2">
                        {isActivated ? (
                          <>
                            <Crown className="h-4 w-4 text-emerald-500" />
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                              Pro Active {licenseDetails?.plan ? `(${licenseDetails.plan})` : ''}
                            </span>
                          </>
                        ) : isLifetimeFree ? (
                          <>
                            <Crown className="h-4 w-4 text-violet-500" />
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Lifetime License</span>
                          </>
                        ) : (
                          <>
                            <Info className="h-4 w-4 text-amber-500" />
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Trial Version</span>
                          </>
                        )}
                      </div>
                      {!isActivated && !isLifetimeFree && (
                        <Button 
                          onClick={() => setCurrentView('pricing')} 
                          className="w-full mt-2 h-8 text-xs font-bold bg-violet-600 hover:bg-violet-700 rounded-lg shadow-sm shadow-violet-500/20"
                        >
                          Upgrade Now
                        </Button>
                      )}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {currentView !== 'landing' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentView('landing')}
                className="h-7 w-7 rounded-full text-slate-500 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-blue-900/20 transition-colors"
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
                currentView === 'dictionary' ? "text-violet-600 bg-violet-50 dark:bg-blue-900/30" : "text-slate-500"
              )}
              title="Custom Dictionary"
            >
              <Book className="h-3.5 w-3.5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (currentView === 'templates') {
                  setCurrentView('landing');
                } else {
                  handleViewChange('templates');
                }
              }}
              className={cn(
                "h-7 w-7 rounded-full transition-colors",
                currentView === 'templates' ? "text-violet-600 bg-violet-50 dark:bg-blue-900/30" : "text-slate-500"
              )}
              title="Report Templates"
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentView(currentView === 'instructions' ? 'landing' : 'instructions')}
              className={cn(
                "h-7 w-7 rounded-full transition-colors",
                currentView === 'instructions' ? "text-violet-600 bg-violet-50 dark:bg-blue-900/30" : "text-slate-500"
              )}
              title="Help / Instructions"
            >
              <Info className="h-3.5 w-3.5" />
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
                className="h-7 w-7 rounded-full text-slate-500 hover:text-violet-600 transition-colors"
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
          <LandingPage 
            onSelectMode={(mode) => handleViewChange(mode)} 
            onShowInstructions={() => setCurrentView('instructions')}
            onShowPricing={() => setCurrentView('pricing')}
          />
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
              autoStart={autoStartView === 'keyword'}
              onAutoStartHandled={() => setAutoStartView(null)}
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
                <Book className="h-4 w-4 text-violet-600" />
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

        {currentView === 'instructions' && (
          <InstructionsView onBack={() => setCurrentView('landing')} />
        )}

        {currentView === 'templates' && (
          <div className="w-full max-w-4xl flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300 h-full">
            <TemplateView
              isElectron={isElectron}
              onBack={() => setCurrentView('landing')}
              autoStart={autoStartView === 'templates'}
              onAutoStartHandled={() => setAutoStartView(null)}
            />
          </div>
        )}
      </main>

      <Dialog open={showWhatsNew} onOpenChange={(open) => {
        if (!open) {
          localStorage.setItem('mediscribe_seen_v1.1.0_whatsnew', 'true');
          setShowWhatsNew(false);
        }
      }}>
        <DialogContent className="max-w-md rounded-2xl p-0 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl overflow-hidden gap-0">
          <div className="bg-gradient-to-r from-violet-600 to-indigo-600 p-6 flex flex-col items-center justify-center text-center">
            <div className="h-16 w-16 rounded-2xl bg-white/20 flex items-center justify-center mb-4 backdrop-blur-sm border border-white/30 shadow-lg">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <DialogTitle className="text-2xl font-black text-white tracking-tight">
              MediScribe v1.1.0 is Here!
            </DialogTitle>
          </div>
          
          <div className="p-6">
            <DialogDescription className="text-sm text-slate-600 dark:text-slate-300 mb-6 font-medium">
              We've been listening to your feedback. Here is what's new in the Midnight Cobalt update:
            </DialogDescription>
            
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0 mt-0.5">
                  <LayoutTemplate className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Seamless Transitions</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">Template mode now flawlessly continues listening when you switch over from Keyword mode. No more interruptions!</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0 mt-0.5">
                  <Maximize2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Full-Screen Compatibility</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">Keyword and Template popups now reliably appear on top of all full-screen apps, including MS Word.</p>
                </div>
              </div>
            </div>
            
            <Button 
              className="w-full mt-8 h-12 rounded-xl cobalt-gradient text-white font-bold text-base shadow-lg shadow-violet-500/20 active:scale-[0.98] transition-all"
              onClick={() => {
                localStorage.setItem('mediscribe_seen_v1.1.0_whatsnew', 'true');
                setShowWhatsNew(false);
              }}
            >
              Awesome, let's go!
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
