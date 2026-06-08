"use client";

import { Mic, Keyboard, Upload, ArrowRight, Cloud, CheckCircle2, Loader2, Sparkles, BookOpen, Crown, LayoutTemplate } from "lucide-react";
import { openExternalUrl } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { WhatsNewModal } from "./whats-new-modal";

interface LandingPageProps {
  onSelectMode: (mode: 'dictation' | 'keyword' | 'upload' | 'templates') => void;
  onShowInstructions: () => void;
  onShowPricing: () => void;
}

export function LandingPage({ onSelectMode, onShowInstructions, onShowPricing }: LandingPageProps) {
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [appVersion, setAppVersion] = useState<string>("");
  const [latestVersion, setLatestVersion] = useState<string>("");
  const [updateUrl, setUpdateUrl] = useState<string>("");
  const { toast } = useToast();

  useEffect(() => {
    const electron = (window as any).electron;
    if (electron?.getGoogleStatus) {
      electron.getGoogleStatus().then((res: any) => {
        setIsDriveConnected(res.connected);
      });
    }
    if (electron?.getAppVersion) {
      electron.getAppVersion().then((v: string) => {
        setAppVersion(v);
        // also check for updates immediately
        if (electron?.checkForUpdates) {
          electron.checkForUpdates().then((res: any) => {
            if (res.success && res.isUpdateAvailable) {
              setLatestVersion(res.latestVersion);
              setUpdateUrl(res.url);
            }
          });
        }
      });
    }

    // Listen for manual update checks from tray
    const handleTriggerUpdate = () => {
      if (electron?.checkForUpdates) {
        electron.checkForUpdates().then((res: any) => {
          if (res.success && res.isUpdateAvailable) {
            setLatestVersion(res.latestVersion);
            setUpdateUrl(res.url);
          } else {
            toast({ title: "No Updates Found", description: "You are on the latest version of MediScribe." });
          }
        });
      }
    };

    if (electron?.on) {
      electron.on('trigger-update-check', handleTriggerUpdate);
    }

    return () => {
      if (electron?.removeListener) {
        electron.removeListener('trigger-update-check', handleTriggerUpdate);
      }
    };
  }, [toast]);

  const handleConnectDrive = async () => {
    if (!(window as any).electron?.googleLogin) return;

    setIsSyncing(true);
    try {
      const result = await (window as any).electron.googleLogin();
      if (result.success) {
        setIsDriveConnected(true);
        toast({
          title: "Cloud Sync Connected",
          description: "Your dictionary and keywords are now protected in Google Drive.",
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Connection Failed",
        description: "Failed to link Google Drive.",
      });
    } finally {
      setIsSyncing(false);
    }
  };
  const handleDisconnectDrive = async () => {
    if (!(window as any).electron?.googleLogout) return;

    const confirmed = window.confirm("Are you sure you want to disconnect Google Drive? Your data will remain locally but will no longer sync to the cloud.");
    if (!confirmed) return;

    const success = await (window as any).electron.googleLogout();
    if (success) {
      setIsDriveConnected(false);
      toast({
        title: "Cloud Sync Disconnected",
        description: "Your session has been cleared.",
      });
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-8 p-6 animate-in fade-in zoom-in duration-500">
      <WhatsNewModal version={appVersion} />

      <div className="text-center space-y-4 relative w-full max-w-2xl px-4">
        {latestVersion && appVersion !== latestVersion && (
          <div className="animate-in fade-in slide-in-from-top-4 duration-700 mb-6">
            <div className="relative overflow-hidden rounded-3xl p-px cobalt-gradient shadow-2xl group transition-all hover:scale-[1.01]">
              <div className="relative bg-white dark:bg-slate-950 rounded-[23px] p-6 flex flex-col md:flex-row items-center gap-6">
                {/* Visual Accent */}
                <div className="shrink-0 w-16 h-16 rounded-2xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center relative">
                  <Sparkles className="h-8 w-8 text-violet-600 animate-pulse" />
                  <div className="absolute -top-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-purple-500"></span>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 text-left space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-violet-600 bg-violet-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                      Update Available v{latestVersion}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                      Essential Improvements
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 italic uppercase tracking-tighter">
                    Upgrade to the latest version
                  </h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Bug Fixes</span>
                    <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> New Features</span>
                    <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Stability</span>
                  </div>
                </div>

                {/* CTA */}
                <Button
                  className="shrink-0 h-12 px-8 cobalt-gradient hover:opacity-90 text-white font-bold rounded-2xl shadow-xl transition-all flex items-center gap-2 group/btn"
                  onClick={() => openExternalUrl(updateUrl || 'https://mediapp.store')}
                >
                  Download Now
                  <ArrowRight className="h-4 w-4 group-hover/btn:translate-x-1 transition-transform" />
                </Button>
              </div>
            </div>
          </div>
        )}

        <h2 className="text-3xl md:text-4xl font-black cobalt-gradient-text uppercase italic tracking-tighter">
          Choose Your Mode
        </h2>

        {appVersion && (
          <div className="flex justify-center mt-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/5 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest">
              <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
              v{appVersion} {latestVersion === appVersion ? '(Latest)' : ''}
            </div>
          </div>
        )}

        {appVersion && (
          <div className="mt-4 p-3 rounded-xl bg-violet-500/5 border border-violet-500/20 max-w-md mx-auto animate-in fade-in slide-in-from-bottom-2 duration-1000">
            <div className="flex items-center justify-center gap-2">
              <div className="text-[10px] font-black text-white bg-violet-600 px-1.5 py-0.5 rounded italic uppercase leading-none">Pro Tip</div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">
                Click the floating bubble in <span className="text-violet-600">Keyword Mode</span> to pause expansion!
              </p>
            </div>
          </div>
        )}

        <p className="text-sm text-muted-foreground/80 max-w-xs mx-auto font-medium mt-4">
          Select how you want to input text today.
        </p>

        <div className="flex flex-col items-center gap-2 mt-2">
          <Button
            variant="outline"
            onClick={onShowInstructions}
            className="h-10 px-6 rounded-2xl bg-violet-600/10 border-violet-600/30 text-blue-700 dark:text-blue-300 hover:bg-violet-600 hover:text-white transition-all font-black text-xs flex gap-2 shadow-sm group animate-in slide-in-from-bottom-2 duration-1000"
          >
            <BookOpen className="h-4 w-4 group-hover:scale-110 transition-transform" />
            HOW TO USE MEDISCRIBE
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
            </span>
          </Button>
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Complete Guide for Beginners</span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <Button
            variant="ghost"
            onClick={onShowPricing}
            className="h-10 px-6 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500 hover:text-white transition-all font-black text-xs flex gap-2 shadow-sm group"
          >
            <Crown className="h-4 w-4 group-hover:scale-110 transition-transform" />
            VIEW PRICING & PLANS
          </Button>
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Monthly & Yearly Subscriptions</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl">
        {/* Dictation Card */}
        <button
          onClick={() => onSelectMode('dictation')}
          className="group relative flex flex-col items-center p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 hover:bg-violet-50 dark:hover:bg-blue-900/10 transition-all hover:scale-[1.02] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <div className="h-20 w-20 rounded-full cobalt-gradient flex items-center justify-center mb-4 shadow-lg group-hover:shadow-violet-500/25 transition-shadow">
            <Mic className="h-9 w-9 text-white" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">Dictation</h3>
          <p className="text-xs text-center text-slate-500/80 dark:text-slate-400 font-medium leading-relaxed">
            Record voice and transcribe into documents with AI.
          </p>
          <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0">
            <ArrowRight className="h-4 w-4 text-violet-600" />
          </div>
        </button>

        {/* Keyword Card */}
        <button
          onClick={() => onSelectMode('keyword')}
          className="group relative flex flex-col items-center p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 hover:bg-violet-50 dark:hover:bg-blue-900/10 transition-all hover:scale-[1.02] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <div className="h-20 w-20 rounded-full cobalt-gradient flex items-center justify-center mb-4 shadow-lg group-hover:shadow-violet-500/25 transition-shadow">
            <Keyboard className="h-9 w-9 text-white" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">Keyword</h3>
          <p className="text-xs text-center text-slate-500/80 dark:text-slate-400 font-medium leading-relaxed">
            Type shortcuts to insert full medical phrases instantly.
          </p>
          <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0">
            <ArrowRight className="h-4 w-4 text-violet-600" />
          </div>
        </button>

        {/* Upload Card */}
        <button
          onClick={() => onSelectMode('upload')}
          className="group relative flex flex-col items-center p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 hover:bg-violet-50 dark:hover:bg-blue-900/10 transition-all hover:scale-[1.02] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <div className="h-20 w-20 rounded-full cobalt-gradient flex items-center justify-center mb-4 shadow-lg group-hover:shadow-violet-500/25 transition-shadow">
            <Upload className="h-9 w-9 text-white" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">Upload</h3>
          <p className="text-xs text-center text-slate-500/80 dark:text-slate-400 font-medium leading-relaxed">
            Upload audio files and transcribe with AI recognition.
          </p>
          <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0">
            <ArrowRight className="h-4 w-4 text-violet-600" />
          </div>
        </button>

        {/* Template Card */}
        <button
          onClick={() => onSelectMode('templates')}
          className="group relative flex flex-col items-center p-6 rounded-2xl border border-violet-200 dark:border-violet-800/50 bg-violet-50/30 dark:bg-violet-900/10 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all hover:scale-[1.02] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <div className="h-20 w-20 rounded-full cobalt-gradient flex items-center justify-center mb-4 shadow-lg group-hover:shadow-violet-500/25 transition-shadow">
            <LayoutTemplate className="h-9 w-9 text-white" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">Templates</h3>
          <p className="text-xs text-center text-slate-500/80 dark:text-slate-400 font-medium leading-relaxed">
            Type 3 letters → Tab to expand full report templates.
          </p>
          <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0">
            <ArrowRight className="h-4 w-4 text-violet-600" />
          </div>
        </button>
      </div>

      {/* Cloud Sync Section - Centralized */}
      <div className="w-full max-w-2xl mt-8">
        <div className="glass-card rounded-2xl p-6 border border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-purple-100 dark:bg-sky-900/30 flex items-center justify-center text-purple-500">
                <Cloud className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">Cloud Storage Sync</h3>
                  {isDriveConnected && (
                    <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                      <CheckCircle2 className="h-3 w-3" />
                      Protected
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed max-w-sm">
                  {isDriveConnected
                    ? "Your dictionary and keywords are securely backed up to your personal Google Drive and available on all your devices."
                    : "Use Continue with Google to automatically sync your medical terms and keyword phrases across hospital and home computers."}
                </p>
              </div>
            </div>

            {isDriveConnected ? (
              <button
                onClick={handleDisconnectDrive}
                className="text-[10px] font-bold text-slate-400 hover:text-red-500 transition-colors uppercase tracking-widest"
              >
                Disconnect Drive
              </button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="whitespace-nowrap font-bold text-xs h-10 px-6 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all rounded-xl shadow-sm flex items-center gap-2"
                onClick={handleConnectDrive}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <svg className="h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
                    <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
                  </svg>
                )}
                Continue with Google
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
