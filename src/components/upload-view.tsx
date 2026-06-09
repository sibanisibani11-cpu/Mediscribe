"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, FileAudio, Loader2, CheckCircle2, XCircle, Settings } from "lucide-react";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { useToast } from "../hooks/use-toast";
import { ModelSelector } from "./model-selector";
import { OllamaSelector } from "./ollama-selector";

interface UploadViewProps {
  isElectron: boolean;
}

type TranscriptionState = "idle" | "transcribing" | "success" | "error";

export function UploadView({ isElectron }: UploadViewProps) {
  const [transcriptionState, setTranscriptionState] = useState<TranscriptionState>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [transcribedText, setTranscribedText] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [ollamaEnabled, setOllamaEnabled] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Sync Ollama enabled state
  useState(() => {
    if (isElectron && window.electron) {
      (window.electron as any).getOllamaEnabled?.().then((res: any) => {
        if (res && typeof res.enabled === 'boolean') {
          setOllamaEnabled(res.enabled);
        }
      }).catch(console.error);
    }
  });

  const handleFileSelect = useCallback((file: File) => {
    // Validate file type
    const validTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/m4a', 'audio/x-m4a'];
    const validExtensions = ['.wav', '.mp3', '.webm', '.ogg', '.m4a'];

    const isValidType = validTypes.includes(file.type) ||
      validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

    if (!isValidType) {
      toast({
        variant: "destructive",
        title: "Invalid File Type",
        description: "Please upload an audio file (WAV, MP3, WebM, OGG, M4A)",
      });
      return;
    }

    // Check file size (max 100MB)
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        variant: "destructive",
        title: "File Too Large",
        description: "Please upload a file smaller than 100MB",
      });
      return;
    }

    setSelectedFile(file);
    setTranscriptionState("idle");
    setTranscribedText("");
    setErrorMessage("");
  }, [toast]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleTranscribe = async () => {
    if (!selectedFile || !isElectron) return;

    setTranscriptionState("transcribing");
    setErrorMessage("");

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const result = await (window.electron as any).transcribeAudio(
        Array.from(new Uint8Array(arrayBuffer))
      );

      if (result.success) {
        const text = result.text?.trim() || '';
        setTranscribedText(text);
        setTranscriptionState("success");

        toast({
          title: "Transcription Complete",
          description: `Successfully transcribed ${selectedFile.name}`,
        });
      } else {
        setErrorMessage(result.error || "Transcription failed");
        setTranscriptionState("error");
        toast({
          variant: "destructive",
          title: "Transcription Failed",
          description: result.error || "Unknown error occurred",
        });
      }
    } catch (error) {
      console.error("Transcription error:", error);
      const errMsg = error instanceof Error ? error.message : "Unknown error occurred";
      setErrorMessage(errMsg);
      setTranscriptionState("error");
      toast({
        variant: "destructive",
        title: "Transcription Error",
        description: errMsg,
      });
    }
  };

  const handleTypeToWord = async () => {
    if (!transcribedText || !isElectron) return;

    try {
      await (window.electron as any).typeText?.(transcribedText, false);
      toast({
        title: "Text Typed Successfully",
        description: "Transcription has been typed to Word",
      });
    } catch (error) {
      console.error("Type to Word error:", error);
      toast({
        variant: "destructive",
        title: "Failed to Type Text",
        description: "Could not type text to Word",
      });
    }
  };

  const handleCopyText = async () => {
    if (!transcribedText) return;

    try {
      await navigator.clipboard.writeText(transcribedText);
      toast({
        title: "Copied to Clipboard",
        description: "Transcription text has been copied",
      });
    } catch (error) {
      console.error("Copy error:", error);
      toast({
        variant: "destructive",
        title: "Failed to Copy",
        description: "Could not copy text to clipboard",
      });
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-sm animate-in fade-in slide-in-from-right-4 duration-300">

      {/* Settings Section */}
      <div className="glass-card rounded-xl p-4 space-y-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Settings className="h-4 w-4 text-emerald-600" />
          Transcription Settings
        </h2>

        {/* Whisper Model Selector */}
        <div className="flex items-center gap-2">
          <Label className="text-xs font-bold whitespace-nowrap w-12 text-slate-900 dark:text-slate-100">ASR:</Label>
          <ModelSelector className="flex-1" />
        </div>

        {/* Ollama LLM Selector */}
        <div className="flex items-center gap-2">
          <Label className="text-xs font-bold whitespace-nowrap w-12 text-slate-900 dark:text-slate-100">LLM:</Label>
          <OllamaSelector className="flex-1" enabled={ollamaEnabled} onEnabledChange={setOllamaEnabled} />
        </div>
      </div>

      {/* Upload Section */}
      <div className="glass-card rounded-xl p-6 w-full">
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-all ${isDragging
            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20"
            : "border-slate-300 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-600"
            }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.wav,.mp3,.webm,.ogg,.m4a"
            onChange={handleFileInputChange}
            className="hidden"
          />

          <div className="flex flex-col items-center gap-4">
            {selectedFile ? (
              <>
                <FileAudio className="h-12 w-12 text-emerald-600" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <Button
                  onClick={handleBrowseClick}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                >
                  Choose Different File
                </Button>
              </>
            ) : (
              <>
                <Upload className="h-12 w-12 text-slate-400" />
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Drop audio file here
                  </p>
                  <p className="text-xs text-slate-500">
                    or click to browse
                  </p>
                </div>
                <Button
                  onClick={handleBrowseClick}
                  variant="default"
                  size="sm"
                  className="glossy-button emerald-gradient"
                >
                  Browse Files
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Transcribe Button */}
        {selectedFile && (
          <div className="mt-4">
            <Button
              onClick={handleTranscribe}
              disabled={transcriptionState === "transcribing"}
              className="w-full glossy-button emerald-gradient"
            >
              {transcriptionState === "transcribing" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Transcribing...
                </>
              ) : (
                <>
                  <FileAudio className="mr-2 h-4 w-4" />
                  Transcribe Audio
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Results Section */}
      {transcriptionState === "success" && transcribedText && (
        <div className="glass-card rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="h-5 w-5" />
            <h3 className="text-sm font-bold">Transcription Complete</h3>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 max-h-48 overflow-y-auto">
            <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
              {transcribedText}
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleTypeToWord}
              variant="default"
              size="sm"
              className="flex-1 glossy-button emerald-gradient"
            >
              Type to Word
            </Button>
            <Button
              onClick={handleCopyText}
              variant="outline"
              size="sm"
              className="flex-1"
            >
              Copy Text
            </Button>
          </div>
        </div>
      )}

      {transcriptionState === "error" && errorMessage && (
        <div className="glass-card rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-red-600">
            <XCircle className="h-5 w-5" />
            <h3 className="text-sm font-bold">Transcription Failed</h3>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {errorMessage}
          </p>
        </div>
      )}
    </div>
  );
}
