"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { Moon, Sun, LogOut, User, Book, Home, ArrowLeft, Maximize2, Minimize2, Crown, LayoutTemplate, Sparkles, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { useToast } from "../hooks/use-toast";
import { cn } from "../lib/utils";
import { useTheme } from "next-themes";
import { SplashScreen } from './splash-screen';
import { AuthPage } from "./auth-page";
import { LandingPage } from "./landing-page";
import { db, isFirebaseConfigured } from "../lib/firebase";
import { doc, onSnapshot, getDoc } from "firebase/firestore";
const DictationView = dynamic(() => import("./dictation-view").then((mod) => mod.DictationView), { loading: () => <div className="w-full h-60 flex items-center justify-center text-sm text-slate-500">Loading dictation…</div> });
const KeywordView = dynamic(() => import("./keyword-view").then((mod) => mod.KeywordView), { loading: () => <div className="w-full h-60 flex items-center justify-center text-sm text-slate-500">Loading keyword tools…</div> });
const DictionaryManager = dynamic(() => import("./dictionary-manager").then((mod) => mod.DictionaryManager), { loading: () => <div className="w-full h-60 flex items-center justify-center text-sm text-slate-500">Loading dictionary manager…</div> });
const InstructionsView = dynamic(() => import("./instructions-view").then((mod) => mod.InstructionsView), { loading: () => <div className="w-full h-60 flex items-center justify-center text-sm text-slate-500">Loading instructions…</div> });
const PricingView = dynamic(() => import("./pricing-view").then((mod) => mod.PricingView), { loading: () => <div className="w-full h-60 flex items-center justify-center text-sm text-slate-500">Loading pricing…</div> });
const TemplateView = dynamic(() => import("./template-view").then((mod) => mod.TemplateView), { loading: () => <div className="w-full h-60 flex items-center justify-center text-sm text-slate-500">Loading report templates…</div> });

type AppView = 'landing' | 'dictation' | 'keyword' | 'dictionary' | 'instructions' | 'pricing' | 'templates';

export function MediScribeApp() {
  const { theme, setTheme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [currentUserUid, setCurrentUserUid] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<AppView>('landing');
  const [isActivated, setIsActivated] = useState<boolean | null>(null);
  const [licenseDetails, setLicenseDetails] = useState<any>(null);
  const [showPricingFromExpiration, setShowPricingFromExpiration] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [autoStartView, setAutoStartView] = useState<'keyword' | 'templates' | null>(null);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [updateState, setUpdateState] = useState<{
    status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error';
    version?: string;
    percent?: number;
    message?: string;
  }>({ status: 'idle' });

  const { toast } = useToast();

  const isElectron = typeof window !== 'undefined' && !!window.electron;

  // Whitelisted accounts that bypass subscription (admin + MS Store reviewer accounts only)
  const WHITELISTED_EMAILS = ['jeetumdc@gmail.com', 'test@mediapp.store', 'reviewer@mediapp.store'];
  const isLifetimeFree = currentUser !== null && WHITELISTED_EMAILS.includes(currentUser.toLowerCase().trim());

  useEffect(() => {
    if (isElectron) {
      const unsubscribe = (window.electron as any).onUpdateStatus?.((data: any) => {
        setUpdateState(data);
        if (data.status === 'downloaded') {
          toast({
            title: "Update Ready!",
            description: `Version ${data.version} has been downloaded. Click 'Update Now' in the header to apply.`,
          });
        }
      });

      // Check for updates
      (window.electron as any).checkForUpdates?.().catch(console.error);

      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
  }, [isElectron]);

  useEffect(() => {
    if (isElectron) {
      (window.electron as any).setActiveUserEmail?.(currentUser);
    }
  }, [currentUser, isElectron]);

  useEffect(() => {
    setIsMounted(true);

    if (typeof window !== 'undefined') {
      const hasSeenWhatsNew = localStorage.getItem('mediscribe_seen_v1.1.2_whatsnew');
      if (!hasSeenWhatsNew) {
        setShowWhatsNew(true);
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

      // Listen for background device eviction
      let cleanupEvicted: (() => void) | undefined;
      if ((window.electron as any).onGoogleDeviceEvicted) {
        cleanupEvicted = (window.electron as any).onGoogleDeviceEvicted((data: any) => {
          setIsAuthenticated(false);
          setCurrentUser(null);
          setCurrentView('landing');
          toast({
            variant: "destructive",
            title: "Logged Out",
            description: data?.message || "This device has been signed out because you logged in on another device.",
          });
        });
      }

      return () => {
        (window.electron as any).removeAllListeners?.('fullscreen-change');
        (window.electron as any).removeAllListeners?.('typing-mode-change');
        (window.electron as any).removeAllListeners?.('toggle-recording');
        if (cleanupEvicted) cleanupEvicted();
      };
    }
  }, [isElectron]);

  // Separate useEffect to handle activation whenever currentUser/isLifetimeFree changes
  useEffect(() => {
    if (!isMounted) return;

    if (isLifetimeFree) {
      setIsActivated(true);
      return;
    }

    let unsubscribeFirestore: (() => void) | null = null;

    if (isFirebaseConfigured && db && currentUser) {
      try {
        const userDocKey = currentUserUid || currentUser;
        
        unsubscribeFirestore = onSnapshot(doc(db, "users", userDocKey), (docSnap: any) => {
          let userData = docSnap.exists() ? docSnap.data() : null;
          
          const handleUserData = (data: any) => {
            const active = !!(data && data.isActivated);
            setIsActivated(active);
            
            if (data && data.licenseDetails) {
              setLicenseDetails(data.licenseDetails);
            } else {
              setLicenseDetails(null);
            }
          };

          if (!userData && currentUserUid && currentUserUid !== currentUser) {
            // Check legacy email document ID
            const emailDocRef = doc(db, "users", currentUser);
            getDoc(emailDocRef).then((emailSnap) => {
              if (emailSnap.exists()) {
                handleUserData(emailSnap.data());
              } else {
                handleUserData(null);
              }
            }).catch(() => {
              handleUserData(null);
            });
          } else {
            handleUserData(userData);
          }
        }, (error: any) => {
          console.error("Firestore sync error:", error);
        });
      } catch (err) {
        console.error("Failed to start Firestore subscription listener:", err);
      }
    } else {
      // Fallback: Check local activation status via Electron
      if (isElectron) {
        (window.electron as any).checkActivation?.().then((active: boolean) => {
          setIsActivated(active);
        }).catch(() => setIsActivated(false));

        (window.electron as any).getLicenseDetails?.().then((details: any) => {
          if (details) {
            setLicenseDetails(details);
          } else {
            setLicenseDetails(null);
          }
        }).catch(() => {});
      } else {
        setIsActivated(false); // Non-Electron (web) users must subscribe
      }
    }

    return () => {
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
      }
    };
  }, [isMounted, isElectron, currentUser, currentUserUid, isLifetimeFree]);

  const handleLogout = async () => {
    // Always call googleLogout via Electron — this removes the device from
    // the cloud device registry (device_registry.json on Google Drive) so
    // the slot is freed for all users, whether they signed in with Google
    // OAuth or email/password. If Drive is not connected it's a silent no-op.
    if (isElectron) {
      try {
        await (window.electron as any).googleLogout?.();
      } catch (e) {
        console.error('[MediScribe] Error during logout device cleanup:', e);
      }
    }
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
    if (isElectron && (view === 'dictation' || view === 'keyword' || view === 'templates')) {
      (window.electron as any).setTypingMode(view === 'templates' ? 'template' : view);
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
    return <AuthPage onLogin={(user, uid) => {
      setIsAuthenticated(true);
      setCurrentUser(user);
      setCurrentUserUid(uid || user);
    }} />;
  }

  // Show Pricing View even if expired or for subscription requirement
  if (!isActivated && !isLifetimeFree) {
    const isSubscriptionExpired = !!licenseDetails?.expiresAt && new Date() > new Date(licenseDetails.expiresAt);

    if (isSubscriptionExpired && !showPricingFromExpiration) {
      const planLabel = licenseDetails?.billing === 'yearly' ? 'Annual' : licenseDetails?.billing === 'monthly' ? 'Monthly' : 'Pro';
      const expiryDate = new Date(licenseDetails.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

      return (
        <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-950 font-sans">
          <div className="w-full max-w-md bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden p-10 flex flex-col items-center text-center animate-in fade-in zoom-in duration-700">
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
            <div className="flex flex-col gap-4 w-full">
              <Button
                onClick={() => setShowPricingFromExpiration(true)}
                className="w-full h-14 cobalt-gradient hover:opacity-90 text-white font-black text-lg rounded-2xl transition-all shadow-xl shadow-violet-500/20 active:scale-[0.98]"
              >
                🔄 Renew Subscription
              </Button>
              <Button
                onClick={handleLogout}
                variant="ghost"
                className="w-full h-10 text-slate-500 hover:text-slate-300 text-xs font-bold uppercase tracking-wider"
              >
                Log Out
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
        <main className="flex-1 flex flex-col items-center justify-center p-4 overflow-x-hidden w-full">
          <PricingView 
            isActivated={isActivated}
            currentUser={currentUser}
            onBack={isSubscriptionExpired ? () => setShowPricingFromExpiration(false) : handleLogout}
            backButtonText={isSubscriptionExpired ? "Back" : "Log Out"}
          />
        </main>
      </div>
    );
  }

  // Show Pricing View for activated users
  if (currentView === 'pricing') {
    return (
      <div className="min-h-screen w-full bg-background text-foreground flex flex-col">
        <main className="flex-1 flex flex-col items-center justify-center p-4 overflow-x-hidden w-full">
          <PricingView 
            isActivated={isActivated}
            currentUser={currentUser}
            onBack={() => setCurrentView('landing')} 
            backButtonText="Return to Dashboard"
          />
        </main>
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
                  {isLifetimeFree ? "Lifetime License" : "Pro License"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {updateState.status === 'downloaded' && (
              <Button
                onClick={() => (window as any).electron?.installUpdate?.()}
                className="h-7 text-[9px] font-black bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse rounded-full px-2.5 shadow-sm transition-all shrink-0 cursor-pointer"
              >
                ✨ Update Ready
              </Button>
            )}
            {updateState.status === 'downloading' && (
              <div className="h-7 flex items-center justify-center text-[9px] font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 rounded-full px-2.5 shrink-0">
                ⏳ Updating ({updateState.percent || 0}%)
              </div>
            )}
            {updateState.status === 'available' && (
              <div className="h-7 flex items-center justify-center text-[9px] font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 rounded-full px-2.5 shrink-0">
                ⏳ Downloading Update...
              </div>
            )}
            {currentUser && (
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer outline-none focus:ring-2 focus:ring-violet-500/50">
                    <User className="h-3 w-3 text-violet-600" />
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 max-w-[140px] truncate" title={currentUser}>
                      {currentUser}
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
                        <div className="text-[10px] text-slate-500 font-semibold mt-0.5 truncate" title={currentUser}>
                          <span className="text-slate-400 font-bold uppercase tracking-wider text-[8px] mr-1">Login ID:</span>{currentUser}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-1.5 bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Subscription Status</div>
                      <div className="flex items-center gap-2">
                        {isLifetimeFree ? (
                          <>
                            <Crown className="h-4 w-4 text-violet-500" />
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Lifetime License</span>
                          </>
                        ) : (
                          <>
                            <Crown className="h-4 w-4 text-emerald-500" />
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                              Pro Active {licenseDetails?.billing ? `(${licenseDetails.billing})` : ''}
                            </span>
                          </>
                        )}
                      </div>
                      
                      {!isLifetimeFree && licenseDetails?.expiresAt && (
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mt-1">
                          <span className="text-slate-400 font-bold uppercase tracking-wider text-[8px] mr-1">Expires:</span>
                          {new Date(licenseDetails.expiresAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </div>
                      )}
                    </div>

                    {isElectron && (
                      <div className="flex flex-col gap-1.5 bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Application Update</div>
                        {updateState.status === 'downloaded' ? (
                          <Button
                            onClick={() => (window as any).electron?.installUpdate?.()}
                            className="w-full h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm shadow-emerald-500/20"
                          >
                            ✨ Install Update & Restart
                          </Button>
                        ) : updateState.status === 'downloading' ? (
                          <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5 justify-center py-1">
                            <span>⏳ Downloading Update ({updateState.percent || 0}%)</span>
                          </div>
                        ) : updateState.status === 'available' ? (
                          <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5 justify-center py-1">
                            <span>⏳ Downloading Update...</span>
                          </div>
                        ) : updateState.status === 'checking' ? (
                          <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5 justify-center py-1">
                            <span>🔍 Checking for updates...</span>
                          </div>
                        ) : updateState.status === 'up-to-date' ? (
                          <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 justify-center py-1">
                            <span>✅ App is up to date</span>
                          </div>
                        ) : (
                          <Button
                            onClick={() => {
                              setUpdateState({ status: 'checking' });
                              (window.electron as any).checkForUpdates?.().then((res: any) => {
                                if (res && res.status === 'dev-mode') {
                                  setUpdateState({ status: 'error', message: 'Not available in dev mode' });
                                  toast({ title: "Dev Mode", description: "Auto-updater is disabled in dev mode." });
                                }
                              }).catch(() => {
                                setUpdateState({ status: 'error' });
                              });
                            }}
                            variant="outline"
                            className="w-full h-8 text-xs font-bold border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg shadow-sm"
                          >
                            {updateState.status === 'error' ? 'Check Again' : 'Check for Updates'}
                          </Button>
                        )}
                      </div>
                    )}
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
          localStorage.setItem('mediscribe_seen_v1.1.2_whatsnew', 'true');
          setShowWhatsNew(false);
        }
      }}>
        <DialogContent className="max-w-md rounded-2xl p-0 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl overflow-hidden gap-0">
          <div className="bg-gradient-to-r from-violet-600 to-indigo-600 p-6 flex flex-col items-center justify-center text-center">
            <div className="h-16 w-16 rounded-2xl bg-white/20 flex items-center justify-center mb-4 backdrop-blur-sm border border-white/30 shadow-lg">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <DialogTitle className="text-2xl font-black text-white tracking-tight">
              MediScribe v1.1.2 is Here!
            </DialogTitle>
          </div>
          
          <div className="p-6">
            <DialogDescription className="text-sm text-slate-600 dark:text-slate-300 mb-6 font-medium">
              We've been listening to your feedback. Here is what's new in the latest update:
            </DialogDescription>
            
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0 mt-0.5">
                  <LayoutTemplate className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Offline Model Manager</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">Easily download, configure, and switch offline Whisper ASR and Ollama LLM models directly from the UI.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0 mt-0.5">
                  <Maximize2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Auto-Minimize & view switches</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">Enjoy fluid transitions and auto-minimization behaviors when entering recording or dictation modes.</p>
                </div>
              </div>
            </div>
            
            <Button 
              className="w-full mt-8 h-12 rounded-xl cobalt-gradient text-white font-bold text-base shadow-lg shadow-violet-500/20 active:scale-[0.98] transition-all"
              onClick={() => {
                localStorage.setItem('mediscribe_seen_v1.1.2_whatsnew', 'true');
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
