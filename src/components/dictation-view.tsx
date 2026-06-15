import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Loader2, Settings, Copy, Share2 } from "lucide-react";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { useToast } from "../hooks/use-toast";
import { ModelSelector } from "./model-selector";
import { OllamaSelector } from "./ollama-selector";
import { WhisperServerStatus } from "./whisper-server-status";
import { isElectron, isMobile } from "../lib/platform";

type RecordingState = "idle" | "recording" | "transcribing" | "done";

interface DictationViewProps {
  isElectron: boolean;
}

export function DictationView({ isElectron: _isElectronProps }: DictationViewProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [ollamaEnabled, setOllamaEnabled] = useState(true);
  const [resultText, setResultText] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isStoppingRef = useRef(false);
  const isStartingRef = useRef(false);

  const { toast } = useToast();

  useEffect(() => {
    if (isElectron && window.electron) {
      (window.electron as any).setTypingMode?.('dictation');
      (window.electron as any).stopKeywordListener?.();
    }
  }, []);

  useEffect(() => {
    if (isElectron && window.electron) {
      (window.electron as any).getOllamaEnabled?.().then((res: any) => {
        if (res && typeof res.enabled === 'boolean') {
          setOllamaEnabled(res.enabled);
        }
      }).catch(console.error);
    }
  }, []);

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
    setResultText("");

    toast({
      title: "Recording Started",
      description: isElectron
        ? "Text will be typed into your most recent app when done."
        : "Text will be transcribed below. You can then copy or share it.",
      duration: 3000
    });

    if (isElectron) {
      if (window.electron) {
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

        console.log("[MediScribe] Updating Electron recording state to true");
        (window.electron as any).setRecordingState?.(true);
        await (window.electron as any).showFloatingButton?.();
        setTimeout(() => {
          console.log("[MediScribe] Minimizing main window");
          (window.electron as any).minimizeWindow?.();
        }, 500);

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
    } else {
      // Mobile / Web browser fallback: Web Speech API
      try {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-US';

          let accumulatedTranscript = "";

          recognition.onresult = (event: any) => {
            let interimTranscript = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                accumulatedTranscript += event.results[i][0].transcript + " ";
              } else {
                interimTranscript += event.results[i][0].transcript;
              }
            }
            setResultText((accumulatedTranscript + interimTranscript).trim());
          };

          recognition.onerror = (event: any) => {
            console.error("Speech recognition error:", event.error);
            if (event.error !== 'no-speech') {
              toast({
                variant: "destructive",
                title: "Speech Recognition Error",
                description: `Error: ${event.error}`
              });
            }
          };

          recognition.onend = () => {
            console.log("Speech recognition ended.");
            setRecordingState("done");
          };

          recognitionRef.current = recognition;
          recognition.start();
          playBeep(true);
          setRecordingState("recording");
        } else {
          // Fallback if no Web Speech API
          playBeep(true);
          setRecordingState("recording");
          const timer = setTimeout(() => {
            setResultText("Patient is a 45-year-old male presenting with complaints of chronic back pain. Plan: Recommend physical therapy and scheduling an MRI scan.");
            setRecordingState("done");
            toast({
              title: "Demo Transcription Loaded",
              description: "Web Speech API is not supported in this client. Loaded mock medical note."
            });
          }, 3000);
          (window as any)._mockTimer = timer;
        }
      } catch (err) {
        console.error("Speech recognition startup error:", err);
      } finally {
        isStartingRef.current = false;
      }
    }
  };

  const stopRecording = async () => {
    console.log("[DictationView] stopRecording requested. isStoppingRef:", isStoppingRef.current, "stateRef:", stateRef.current);
    if (isStoppingRef.current || stateRef.current === 'idle' || stateRef.current === 'done') {
      console.log("[DictationView] stopRecording ignored. State:", stateRef.current);
      return;
    }
    isStoppingRef.current = true;

    try {
      if (isElectron) {
        if (mediaRecorderRef.current) {
          console.log("[MediScribe] Stopping MediaRecorder. Current state:", mediaRecorderRef.current.state);
          playBeep(false);
          if (mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
          (window.electron as any).setRecordingState?.(false);
        }
      } else {
        playBeep(false);
        if (recognitionRef.current) {
          recognitionRef.current.stop();
          setRecordingState("transcribing");
        } else {
          if ((window as any)._mockTimer) {
            clearTimeout((window as any)._mockTimer);
            (window as any)._mockTimer = null;
          }
          setRecordingState("done");
        }
      }
    } catch (error) {
      console.error('[MediScribe] Error stopping recording:', error);
      if (isElectron) {
        (window.electron as any).setRecordingState?.(false);
      }
    } finally {
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
          if (result.error?.includes('too short') || result.error?.includes('empty')) {
            console.log("[DictationView] Ignoring empty/short recording.");
            finalState = "idle";
          } else {
            toast({
              variant: "destructive",
              title: "Transcription failed",
              description: result.error || "Unknown error occurred"
            });
            finalState = "done";
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
      finalState = "done";
    } finally {
      setRecordingState(finalState);
    }
  };

  const handleCopy = () => {
    if (!resultText) return;
    navigator.clipboard.writeText(resultText);
    toast({
      title: "Copied to Clipboard",
      description: "You can now paste the text into any application.",
    });
  };

  const handleShare = async () => {
    if (!resultText) return;
    if (navigator.share) {
      try {
        await navigator.share({
          text: resultText,
          title: "MediScribe Transcription"
        });
      } catch (err) {
        console.error("Sharing failed:", err);
      }
    } else {
      handleCopy();
    }
  };

  const stateRef = useRef(recordingState);
  stateRef.current = recordingState;

  const lastToggleTime = useRef(0);

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
  }, [recordingState]);

  useEffect(() => {
    if (!isElectron || !window.electron) return;

    console.log("[DictationView] Registering toggle-recording listener");

    const listener = () => {
      console.log("[DictationView] toggle-recording event received");
      handleToggle();
    };

    const removeListener = (window.electron as any).onToggleRecording?.(listener);

    return () => {
      console.log("[DictationView] Removing toggle-recording listener");
      if (typeof removeListener === 'function') {
        removeListener();
      } else {
        (window.electron as any).removeToggleRecordingListener?.(listener);
      }
    };
  }, [handleToggle]);

  useEffect(() => {
    if (!isElectron || !window.electron) return;

    const handleAppQuitting = () => {
      isStoppingRef.current = true;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch { }
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
  }, []);

  return (
    <div className="flex flex-col gap-6 w-full max-w-sm animate-in fade-in slide-in-from-right-4 duration-300">
      {isElectron && (
        <div className="glass-card rounded-xl p-4 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Settings className="h-4 w-4 text-violet-600" />
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
      )}

      <div className="glass-card rounded-xl p-6 w-full flex flex-col items-center justify-center text-center">
        {recordingState === 'recording' ? (
          <>
            <Button onClick={stopRecording} size="sm" className="rounded-full w-20 h-20 glossy-button bg-amber-500 hover:bg-amber-600 text-white">
              <div className="flex gap-1">
                <div className="w-2 h-8 bg-white rounded-full" />
                <div className="w-2 h-8 bg-white rounded-full" />
              </div>
            </Button>
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">Recording... Click to pause</p>
          </>
        ) : recordingState === 'transcribing' ? (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-sm text-slate-600 dark:text-slate-300">Processing audio...</p>
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
            <p className="mt-4 text-xs text-slate-500">{isElectron ? "Click to start & minimize" : "Click to speak"}</p>
          </>
        )}
      </div>

      {!isElectron && resultText && (
        <div className="glass-card rounded-xl p-5 space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Transcribed Output</h4>
            <span className="text-[10px] text-emerald-500 font-bold bg-emerald-100/30 px-2 py-0.5 rounded-full">Active</span>
          </div>
          
          <textarea
            value={resultText}
            onChange={(e) => setResultText(e.target.value)}
            className="w-full min-h-[120px] p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-black/20 text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500/30"
          />
          
          <div className="flex gap-3">
            <Button onClick={handleCopy} className="flex-1 text-xs gap-1.5 h-10 font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-xl shadow-sm">
              <Copy className="h-3.5 w-3.5" />
              Copy
            </Button>
            <Button onClick={handleShare} variant="outline" className="flex-1 text-xs gap-1.5 h-10 font-bold border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 hover:bg-slate-100 text-slate-700 dark:text-slate-300 rounded-xl">
              <Share2 className="h-3.5 w-3.5" />
              Share
            </Button>
          </div>
        </div>
      )}

      {isElectron && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Engine Status</p>
          <WhisperServerStatus />
        </div>
      )}
    </div>
  );
}
