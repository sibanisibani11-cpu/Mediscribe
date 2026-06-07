"use client";

import { useState, useEffect, useRef } from "react";
import { FileText, Play, Minimize2, KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ToastAction } from "@/components/ui/toast";
import { TemplateManager } from "@/components/template-manager";

interface TemplateViewProps {
  isElectron: boolean;
  onBack: () => void;
  autoStart?: boolean;
  onAutoStartHandled?: () => void;
}

export function TemplateView({ isElectron, onBack, autoStart = false, onAutoStartHandled }: TemplateViewProps) {
  const [isListening, setIsListening] = useState(false);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [isPermissionRequested, setIsPermissionRequested] = useState(false);
  const { toast } = useToast();
  const accessibilityPromptKey = "mediscribe_accessibility_prompt_seen";
  const autoStartConsumedRef = useRef(false);

  useEffect(() => {
    if (isElectron && window.electron) {
      (window.electron as any).setTypingMode?.('template');
    }
    return () => {
      // Intentionally not stopping the listener on unmount 
      // so it can seamlessly transition between modes or stay active in background
    };
  }, [isElectron]);

  // Register toggle listener from bubble — mirrors KeywordView pattern
  useEffect(() => {
    if (!isElectron || !window.electron) return;
    const removeListener = (window.electron as any).onToggleRecording?.(() => {
      console.log('[TemplateView] toggle-recording signal received');
      if (isListening) {
        handleStop();
      } else {
        handleStart();
      }
    });
    return () => {
      if (typeof removeListener === 'function') removeListener();
    };
  }, [isElectron, isListening]);

  const doStartListener = async () => {
    if (!isElectron || !window.electron) return;
    try {
      const result = await (window.electron as any).startTemplateListener?.();
      if (result && result.success === false) {
        if (result.needsAccessibility) {
          toast({
            variant: "destructive",
            title: "Permission Needed",
            description: "Enable Accessibility for MediScribe under System Settings.",
            action: (
              <ToastAction
                altText="Open Settings"
                onClick={async () => {
                  await (window.electron as any).openAccessibilitySettings?.();
                  setIsPermissionRequested(true);
                  setShowPermissionDialog(true);
                }}
              >
                Open Settings
              </ToastAction>
            ),
          });
        } else {
          toast({
            variant: "destructive",
            title: "Template Mode could not start",
            description: result.error || "An unknown error occurred.",
          });
        }
        return;
      }
      setIsListening(true);
      (window.electron as any).setRecordingState?.(true);
      await (window.electron as any).showFloatingButton?.();
      toast({
        title: "Template Mode Active",
        description: "Type the first 3+ letters of a template name in any app, then press Tab to expand.",
      });
      setTimeout(() => {
        (window.electron as any).minimizeWindow?.();
      }, 500);
    } catch (error) {
      console.error("Failed to start template listener:", error);
    }
  };

  const handleStart = async () => {
    if (isElectron && (window.electron as any).checkAccessibilityPermission) {
      const alreadyGranted = await (window.electron as any).checkAccessibilityPermission();
      if (alreadyGranted) {
        localStorage.setItem(accessibilityPromptKey, 'true');
        await doStartListener();
        return;
      }
    }
    
    setIsPermissionRequested(false);
    setShowPermissionDialog(true);
  };

  const handlePermissionConfirm = async () => {
    const electron = (window as any)?.electron;

    if (!isPermissionRequested) {
      setIsPermissionRequested(true);
      // Trigger macOS default permission prompt (only pops up once if never allowed/denied)
      await electron?.requestAccessibilityPermission?.();
      // Directly open System Settings to Accessibility panel so user can turn on the switch
      await electron?.openAccessibilitySettings?.();
    } else {
      // Users clicked "Continue" after we opened Settings for them
      if (isElectron && electron?.checkAccessibilityPermission) {
        const isGranted = await electron.checkAccessibilityPermission();
        if (isGranted) {
          setShowPermissionDialog(false);
          localStorage.setItem(accessibilityPromptKey, 'true');
          toast({
            title: "Access Granted!",
            description: "Template Mode listener started successfully.",
          });
          await doStartListener();
        } else {
          toast({
            variant: "destructive",
            title: "Permission Not Detected Yet",
            description: "Make sure MediScribe is enabled in System Settings, then click Continue.",
          });
        }
      } else {
        setShowPermissionDialog(false);
        await doStartListener();
      }
    }
  };

  useEffect(() => {
    if (!autoStart || autoStartConsumedRef.current) return;
    autoStartConsumedRef.current = true;
    onAutoStartHandled?.();
    handleStart();
  }, [autoStart]);

  const handleStop = async () => {
    if (!isElectron || !window.electron) return;
    try {
      await (window.electron as any).stopTemplateListener?.();
      setIsListening(false);
      (window.electron as any).setRecordingState?.(false);
      toast({ title: "Template Mode Paused", description: "Auto-expansion is now disabled." });
    } catch (error) {
      console.error("Failed to stop template listener:", error);
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full max-w-4xl h-full animate-in fade-in slide-in-from-right-4 duration-300">

      {/* Controls bar */}
      <div className="flex items-center justify-between flex-wrap gap-2 bg-slate-50/50 dark:bg-slate-900/40 p-2 rounded-xl border border-slate-200/50 dark:border-slate-800/50">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-violet-600" />
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Template Mode</span>
          <span className="text-[10px] text-slate-400 font-medium">— type 3+ letters of a template name → press Tab</span>
        </div>
        <Button
          onClick={isListening ? handleStop : handleStart}
          className={`h-8 px-5 font-semibold flex items-center gap-2 shadow-sm shrink-0 transition-all ${
            isListening
              ? "bg-amber-500 hover:bg-amber-600 text-white"
              : "cobalt-gradient hover:opacity-90 text-white"
          }`}
        >
          {isListening ? (
            <><Minimize2 className="h-4 w-4" /> Pause</>
          ) : (
            <><Play className="h-4 w-4" /> Start & Minimize</>
          )}
        </Button>
      </div>

      {/* How it works tip */}
      <div className="p-3 rounded-lg bg-violet-50/50 dark:bg-blue-900/20 border border-blue-200/50 dark:border-blue-800/50">
        <p className="text-xs text-slate-700 dark:text-slate-300">
          💡 <strong>How it works:</strong> Click <strong>"Start & Minimize"</strong> to activate.
          Then in Word, Notes, or any app — type the <strong>first 3+ letters</strong> of a template name and press <strong>Tab</strong> to instantly expand the full report template.
        </p>
      </div>

      {/* Template Manager (create/edit/delete) */}
      <div className="flex-1 min-h-0">
        <TemplateManager onBack={onBack} embedded />
      </div>

      {/* Permission dialog */}
      <Dialog open={showPermissionDialog} onOpenChange={setShowPermissionDialog}>
        <DialogContent className="max-w-sm rounded-2xl p-6 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl">
          <DialogHeader className="items-center text-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mb-1">
              <KeyRound className="h-7 w-7 text-violet-600 dark:text-violet-400" />
            </div>
            <DialogTitle className="text-lg font-black text-slate-900 dark:text-white">
              Keyboard Detection Permission
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500 dark:text-slate-400 text-center leading-relaxed">
              MediScribe needs <strong className="text-slate-700 dark:text-slate-300">Accessibility Access</strong> to detect when you type a template name in any app — so it can expand it instantly.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3 flex flex-col gap-2.5">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800">
              <ShieldCheck className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
              <p className="text-xs text-emerald-800 dark:text-emerald-300 font-medium">
                <strong>Your privacy is safe.</strong> MediScribe only detects template name characters and never reads or transmits anything you type.
              </p>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center leading-relaxed">
              {!isPermissionRequested ? (
                <>
                  Clicking <strong>"Open Settings"</strong> will guide you to macOS <em>Privacy &amp; Security → Accessibility</em>. Please turn on the switch next to <strong>MediScribe</strong>.
                </>
              ) : (
                <span className="text-violet-600 dark:text-violet-400 font-bold block animate-pulse">
                  System Settings opened! Toggle the switch for MediScribe, then click "Continue" below.
                </span>
              )}
            </p>
            <div className="flex gap-2 mt-1">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowPermissionDialog(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 rounded-xl cobalt-gradient text-white font-bold"
                onClick={handlePermissionConfirm}
              >
                {!isPermissionRequested ? "Open Settings" : "Continue"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
