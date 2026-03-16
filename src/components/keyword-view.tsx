"use client";

import { useState, useEffect } from "react";
import { Keyboard, BookOpen, ArrowLeft, Play, Minimize2, Cloud, RefreshCw, ChevronDown, CloudUpload, CloudDownload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { KeywordLibraryManager } from "@/components/keyword-library-manager";
import { useToast } from "@/hooks/use-toast";
import { SyncConfirmDialog } from "@/components/common/sync-confirm-dialog";

interface KeywordViewProps {
  isElectron: boolean;
  onBack: () => void;
  isListening?: boolean;
}

export function KeywordView({ isElectron, onBack }: KeywordViewProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDriveConnected, setIsDriveConnected] = useState(false);

  const [isListening, setIsListening] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0); // For forcing reload of child component
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; action: "push" | "pull" }>({
    open: false,
    action: "push"
  });
  const { toast } = useToast();

  // Set typing mode to keyword on mount
  useEffect(() => {
    if (isElectron && window.electron) {
      (window.electron as any).setTypingMode?.('keyword');

      // Auto-start listener on entry for better UX?
      // No, let user start manually or via bubble

      // Check drive status
      (window.electron as any).getGoogleStatus?.().then((res: any) => {
        setIsDriveConnected(res.connected);
      });

    }

    return () => {
      if (isElectron && window.electron) {
        (window.electron as any).stopKeyboardListener?.();
        (window.electron as any).setRecordingState?.(false);
      }
    }
  }, [isElectron]);

  const handleLogin = async () => {
    if (!isElectron || !(window as any).electron?.googleLogin) return;
    setIsSyncing(true);
    try {
      const result = await (window.electron as any).googleLogin();
      if (result.success) {
        setIsDriveConnected(true);
        toast({
          title: "Google Drive Connected",
          description: "Your keywords are now syncing with the cloud.",
        });
        // Optional: you could reload or just let the auto-sync handle it
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Login Failed",
        description: err.message || "Could not connect to Google Drive.",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const executeSync = async (strategy: 'merge' | 'push' | 'pull') => {
    setIsSyncing(true);
    setConfirmDialog(prev => ({ ...prev, open: false }));

    try {
      await (window as any).electron.syncCloud(strategy);

      let msg = "Your keywords are now in sync.";
      if (strategy === 'push') msg = "Local keywords uploaded to Cloud.";
      if (strategy === 'pull') msg = "Cloud keywords downloaded to device.";

      toast({
        title: strategy === 'merge' ? "Sync Complete" : (strategy === 'push' ? "Push Complete" : "Pull Complete"),
        description: msg,
      });

      if (strategy === 'pull') {
        setRefreshKey(prev => prev + 1);
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Sync Failed",
        description: err.message || "Could not sync with Google Drive.",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSync = async (strategy: 'merge' | 'push' | 'pull' = 'merge') => {
    if (!isElectron || !(window as any).electron?.syncCloud) return;

    if (strategy === 'push' || strategy === 'pull') {
      setConfirmDialog({ open: true, action: strategy });
      return;
    }

    executeSync(strategy);
  };

  const handleStart = async () => {
    if (isElectron && window.electron) {
      try {
        await (window.electron as any).startKeywordListener?.();
        setIsListening(true);
        (window.electron as any).setRecordingState?.(true); // Tell bubble to show "Pause"

        toast({
          title: "Keyword Mode Active",
          description: "Type keywords (3+ characters) in Word to auto-expand. App minimized.",
        });

        // Minimize window after starting
        setTimeout(() => {
          (window.electron as any).minimizeWindow?.();
        }, 500);
      } catch (error) {
        console.error("Failed to start keyword listener:", error);
      }
    }
  };

  const handleStop = async () => {
    if (isElectron && window.electron) {
      try {
        await (window.electron as any).stopKeywordListener?.();
        setIsListening(false);
        (window.electron as any).setRecordingState?.(false); // Tell bubble to show "Keyboard"

        toast({
          title: "Keyword Mode Paused",
          description: "Auto-expansion is now disabled.",
        });
      } catch (error) {
        console.error("Failed to stop keyword listener:", error);
      }
    }
  };

  const handleToggle = () => {
    if (isListening) {
      handleStop();
    } else {
      handleStart();
    }
  };

  // Register toggle listener from bubble
  useEffect(() => {
    if (!isElectron || !window.electron) return;

    const removeListener = (window.electron as any).onToggleRecording?.(() => {
      console.log("[KeywordView] toggle-recording signal received");
      handleToggle();
    });

    return () => {
      if (typeof removeListener === 'function') removeListener();
    };
  }, [isElectron, isListening]);

  return (
    <div className="flex flex-col gap-4 w-full h-full">
      <div className="flex flex-col gap-4 px-2">
        {/* Row 1: Back + Title */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-xs h-8 px-3 hover:bg-slate-100 dark:hover:bg-slate-800 flex gap-1 items-center"
          >
            <ArrowLeft className="h-3 w-3" /> Back
          </Button>
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-blue-600" />
            Keyword Library
          </h2>
        </div>

        {/* Row 2: Management Controls */}
        <div className="flex items-center justify-between flex-wrap gap-2 bg-slate-50/50 dark:bg-slate-900/40 p-2 rounded-xl border border-slate-200/50 dark:border-slate-800/50">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRefreshKey(prev => prev + 1);
                toast({ description: "Data refreshed" });
              }}
              className="h-8 w-8 p-0 text-slate-400 hover:text-blue-600 rounded-full bg-white dark:bg-slate-800 border border-slate-200/30 dark:border-slate-700/30 shadow-sm"
              title="Refresh Data"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>

            {isDriveConnected ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSyncing}
                    className="h-8 px-3 text-[11px] font-bold border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 flex items-center gap-2 rounded-lg shadow-sm"
                  >
                    {isSyncing ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Cloud className="h-3.5 w-3.5" />
                    )}
                    {isSyncing ? "Syncing..." : "Cloud Sync"}
                    <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-xl rounded-xl" align="start" side="bottom">
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 py-1">Sync Options</p>



                    <button
                      onClick={() => handleSync('push')}
                      className="flex items-center gap-3 w-full px-2 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-600 rounded-lg transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                        <CloudUpload className="h-4 w-4 text-amber-600" />
                      </div>
                      <div>
                        <div className="font-bold">Push to Cloud</div>
                        <div className="text-[10px] opacity-70">Overwrite cloud (Deletions)</div>
                      </div>
                    </button>

                    <button
                      onClick={() => handleSync('pull')}
                      className="flex items-center gap-3 w-full px-2 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 rounded-lg transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                        <CloudDownload className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <div className="font-bold">Pull from Cloud</div>
                        <div className="text-[10px] opacity-70">Overwrite local list</div>
                      </div>
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogin}
                disabled={isSyncing}
                className="h-8 px-3 text-[11px] font-bold border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center gap-2 rounded-lg shadow-sm group"
              >
                {isSyncing ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Cloud className="h-3.5 w-3.5 group-hover:text-blue-500 transition-colors" />
                )}
                {isSyncing ? "Connecting..." : "Connect Cloud"}
              </Button>
            )}
          </div>

          <Button
            onClick={handleToggle}
            className={`h-8 px-5 font-semibold flex items-center gap-2 shadow-sm shrink-0 transition-all ${isListening
              ? "bg-amber-500 hover:bg-amber-600 text-white"
              : "cobalt-gradient hover:opacity-90 text-white"
              }`}
          >
            {isListening ? (
              <><Minimize2 className="h-4 w-4" /> Pause Keywords</>
            ) : (
              <><Play className="h-4 w-4" /> Start & Minimize</>
            )}
          </Button>
        </div>
      </div>

      <div className="glass-card rounded-xl p-4 flex-1 overflow-hidden flex flex-col">
        <div className="mb-4 p-3 rounded-lg bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200/50 dark:border-blue-800/50">
          <p className="text-xs text-slate-700 dark:text-slate-300">
            💡 <strong>How it works:</strong> Click <strong>"Start & Minimize"</strong> to activate. Then type any keyword (3+ characters) directly in Microsoft Word, and it will automatically expand to its full text!
          </p>
        </div>
        <div className="flex-1 overflow-hidden">
          <KeywordLibraryManager key={refreshKey} />
        </div>
      </div>
      <SyncConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}
        onConfirm={() => executeSync(confirmDialog.action)}
        action={confirmDialog.action}
      />
    </div >
  );
}
