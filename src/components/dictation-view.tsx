"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Loader2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ModelSelector } from "@/components/model-selector";
import { OllamaSelector } from "@/components/ollama-selector";
import { WhisperServerStatus } from "@/components/whisper-server-status";

type RecordingState = "idle" | "recording" | "transcribing" | "done";

interface DictationViewProps {
  isElectron: boolean;
}

export function DictationView({ isElectron }: DictationViewProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [ollamaEnabled, setOllamaEnabled] = useState(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isStoppingRef = useRef(false);
  const isStartingRef = useRef(false);

  const { toast } = useToast();

  useEffect(() => {
    if (isElectron && window.electron) {
      (window.electron as any).setTypingMode?.('dictation');
      (window.electron as any).stopKeywordListener?.();
    }
  }, [isElectron]);

  useEffect(() => {
    if (isElectron && window.electron) {
      (window.electron as any).getOllamaEnabled?.().then((res: any) => {
        if (res && typeof res.enabled === 'boolean') {
          setOllamaEnabled(res.enabled);
        }
      }).catch(console.error);
    }
  }, [isElectron]);

  const stopTracks = (stream: MediaStream) => {
    stream.getTracks().forEach(track => track.stop());
  };

  const playBeep = (start = true) => {
    try {
      const win = window as any;
      const audioContext = new (win.AudioContext || win.webkitAudioContext)();
      if (!audioContext) return;

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(start ? 880 : 660, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.1);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
      console.error("Failed to play beep sound", error);
    }
  };

  const startRecording = async () => {
    if (isStartingRef.current || stateRef.current === 'recording') return;
    isStartingRef.current = true;
    isStoppingRef.current = false;
    audioChunksRef.current = [];

    toast({
      title: "Recording Started",
      description: "Text will be typed into your most recent app when done.",
      duration: 3000
    });

    if (isElectron && window.electron) {
      await (window.electron as any).stopKeywordListener?.();
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const chunksToProcess = [...audioChunksRef.current];
        audioChunksRef.current = [];

        if (chunksToProcess.length === 0) {
          setRecordingState("done");
          stopTracks(stream);
          return;
        }

        const audioBlob = new Blob(chunksToProcess, { type: mimeType });

        try {
          await processAudio(audioBlob);
        } catch (err) {
          console.error("[MediScribe] Error processing standard recording:", err);
          toast({
            variant: "destructive",
            title: "Processing Error",
            description: "Failed to process audio. Please try again."
          });
        }
        setRecordingState("done");
        stopTracks(stream);
      };

      console.log("[MediScribe] Starting MediaRecorder...");
      mediaRecorder.start();
      playBeep(true);
      setRecordingState("recording");

      if (isElectron) {
        console.log("[MediScribe] Updating Electron recording state to true");
        (window.electron as any).setRecordingState?.(true);
        await (window.electron as any).showFloatingButton?.();
        setTimeout(() => {
          console.log("[MediScribe] Minimizing main window");
          (window.electron as any).minimizeWindow?.();
        }, 500);
      }

    } catch (error) {
      console.error("Error accessing microphone:", error);
      toast({
        variant: "destructive",
        title: "Microphone Error",
        description: "Could not access microphone. Please check permissions.",
      });
    } finally {
      isStartingRef.current = false;
    }
  };

  const stopRecording = async () => {
    console.log("[DictationView] stopRecording requested. isStoppingRef:", isStoppingRef.current, "stateRef:", stateRef.current);
    // Allow stopping from 'recording' or 'transcribing' states
    if (isStoppingRef.current || stateRef.current === 'idle' || stateRef.current === 'done') {
      console.log("[DictationView] stopRecording ignored. State:", stateRef.current);
      return;
    }
    isStoppingRef.current = true;

    try {
      if (mediaRecorderRef.current) {
        console.log("[MediScribe] Stopping MediaRecorder. Current state:", mediaRecorderRef.current.state);
        playBeep(false);
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
        if (isElectron) {
          (window.electron as any).setRecordingState?.(false);
        }
      } else {
        console.warn("[MediScribe] mediaRecorderRef is null during stopRecording");
      }
    } catch (error) {
      console.error('[MediScribe] Error stopping recording:', error);
      if (isElectron) {
        (window.electron as any).setRecordingState?.(false);
      }
    } finally {
      // Small delay to ensure state transitions finish before permitting another toggle
      setTimeout(() => {
        isStoppingRef.current = false;
        console.log("[MediScribe] isStoppingRef reset to false");
      }, 300);
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    setRecordingState("transcribing");
    let finalState: RecordingState = "done";
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      if (isElectron) {
        const result = await (window.electron as any).transcribeAudio(Array.from(new Uint8Array(arrayBuffer)));
        if (result.success) {
          const text = result.text?.trim() || '';
          if (text) {
            await (window.electron as any).typeText?.(text, false);
            toast({ title: "Text typed successfully" });
          } else {
            finalState = "idle";
          }
        } else {
          // If the error is just that they didn't say anything, resolve silently
          if (result.error?.includes('too short') || result.error?.includes('empty')) {
            console.log("[DictationView] Ignoring empty/short recording.");
            finalState = "idle";
          } else {
            toast({
              variant: "destructive",
              title: "Transcription failed",
              description: result.error || "Unknown error occurred"
            });
            finalState = "done"; // Or "error" if we want a specific error state
          }
        }
      }
    } catch (error) {
      console.error("Transcription error:", error);
      toast({
        variant: "destructive",
        title: "Transcription error",
        description: error instanceof Error ? error.message : "Unknown error occurred"
      });
      finalState = "done"; // Or "error"
    } finally {
      setRecordingState(finalState);
    }
  };

  // Use a ref to always have the latest state immediately
  const stateRef = useRef(recordingState);
  stateRef.current = recordingState;

  // Debounce ref to prevent double-clicks
  const lastToggleTime = useRef(0);

  // Direct self-contained toggle logic - no parent communication needed
  const handleToggle = useCallback(() => {
    const now = Date.now();
    if (now - lastToggleTime.current < 500) {
      console.log("[DictationView] Toggle ignored - too fast (debounced)");
      return;
    }
    lastToggleTime.current = now;

    const currentState = stateRef.current;
    console.log("[DictationView] Toggle triggered. Current state:", currentState);

    if (currentState === 'recording' || currentState === 'transcribing') {
      console.log("[DictationView] Calling stopRecording");
      stopRecording();
    } else if (currentState === 'idle' || currentState === 'done') {
      console.log("[DictationView] Calling startRecording");
      startRecording();
    }
  }, []);

  // Direct listener - no parent/child communication
  useEffect(() => {
    if (!isElectron || !window.electron) return;

    console.log("[DictationView] Registering toggle-recording listener");

    const listener = () => {
      console.log("[DictationView] toggle-recording event received");
      handleToggle();
    };

    // Use onToggleRecording which handles the listener registration
    const removeListener = (window.electron as any).onToggleRecording?.(listener);

    return () => {
      console.log("[DictationView] Removing toggle-recording listener");
      if (typeof removeListener === 'function') {
        removeListener();
      } else {
        // Fallback for older versions if removeListener doesn't return a function
        (window.electron as any).removeToggleRecordingListener?.(listener);
      }
    };
  }, [isElectron, handleToggle]);

  useEffect(() => {
    if (!isElectron || !window.electron) return;

    const handleAppQuitting = () => {
      isStoppingRef.current = true;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (err) { }
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
        stopTracks(mediaRecorderRef.current.stream);
      }
      mediaRecorderRef.current = null;
      audioChunksRef.current = [];
    };

    (window.electron as any).onAppQuitting?.(handleAppQuitting);
    return () => {
      handleAppQuitting();
    };
  }, [isElectron]);

  return (
    <div className="flex flex-col gap-6 w-full max-w-sm animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="glass-card rounded-xl p-4 space-y-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Settings className="h-4 w-4 text-blue-600" />
          Dictation Settings
        </h2>

        <div className="flex items-center gap-2">
          <Label className="text-xs font-bold whitespace-nowrap w-12 text-slate-900 dark:text-slate-100">ASR:</Label>
          <ModelSelector className="flex-1" />
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs font-bold whitespace-nowrap w-12 text-slate-900 dark:text-slate-100">LLM:</Label>
          <OllamaSelector className="flex-1" enabled={ollamaEnabled} onEnabledChange={setOllamaEnabled} />
        </div>
      </div>

      <div className="glass-card rounded-xl p-6 w-full flex flex-col items-center justify-center text-center">
        {recordingState === 'recording' ? (
          <>
            <Button onClick={stopRecording} size="sm" className="rounded-full w-20 h-20 glossy-button bg-amber-500 hover:bg-amber-600 text-white">
              <div className="flex gap-1">
                <div className="w-2 h-8 bg-white rounded-full" />
                <div className="w-2 h-8 bg-white rounded-full" />
              </div>
            </Button>
            <p className="mt-4 text-sm text-muted-foreground">Recording... Click to pause</p>
          </>
        ) : recordingState === 'transcribing' ? (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-sm text-muted-foreground">Transcribing to Word...</p>
          </>
        ) : (
          <>
            <Button
              onClick={startRecording}
              variant="default"
              className="w-20 h-20 rounded-full glossy-button transition-transform cobalt-gradient hover:scale-105"
            >
              <Mic className="h-10 w-10 text-white" />
            </Button>
            <p className="mt-4 text-xs text-muted-foreground">Click to start & minimize</p>
          </>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Engine Status</p>
        <WhisperServerStatus />
      </div>
    </div>
  );
}
