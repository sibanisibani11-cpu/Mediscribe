"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Download, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import { useToast } from "../hooks/use-toast";

interface Model {
  name: string;
  size: string;
  url: string;
  downloaded: boolean;
  active: boolean;
  path: string;
  isDeletable?: boolean;
}

interface ModelSelectorProps {
  className?: string;
}

export function ModelSelector({ className }: ModelSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [models, setModels] = React.useState<Model[]>([]);
  const [activeModel, setActiveModel] = React.useState<string>("");
  const [downloading, setDownloading] = React.useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = React.useState<Record<string, number>>({});
  const [loading, setLoading] = React.useState(true);
  const [serverStatus, setServerStatus] = React.useState<string>("stopped");
  const { toast } = useToast();
  const [mounted, setMounted] = React.useState(false);
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const deletingRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Robust check for Electron
  const isElectron = typeof window !== 'undefined' && (window.electron?.isElectron === true || !!window.electron);
  const [restarting, setRestarting] = React.useState(false);

  const fetchModels = React.useCallback(async () => {
    if (!isElectron) {
      setLoading(false);
      return;
    }
    try {
      // Only set loading if it's the first load
      // setLoading(true); // Removed to prevent flicker on periodic updates
      const modelList = await (window.electron as any).getModels();
      setModels(modelList);
      const active = modelList.find((m: Model) => m.active);
      if (active) setActiveModel(active.name);
      else setActiveModel("");
      setLoading(false);
    } catch (error) {
      console.error("Failed to fetch models", error);
      setLoading(false);
    }
  }, [isElectron]);

  const handleRestart = async () => {
    if (!isElectron) return;
    setRestarting(true);
    toast({
      title: "Restarting Whisper Server",
      description: "Please wait while the AI server initializes...",
    });
    try {
      await (window.electron as any).restartWhisperServer();
      await fetchModels();
      toast({
        title: "Server Ready",
        description: "Whisper server has been restarted successfully.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Restart Failed",
        description: "Could not start the whisper server process.",
      });
    } finally {
      setRestarting(false);
    }
  };

  React.useEffect(() => {
    fetchModels();
    // Poll for status updates periodically
    if (isElectron) {
      const interval = setInterval(fetchModels, 5000);
      return () => clearInterval(interval);
    }
  }, [fetchModels, isElectron]);

  // Listen for download progress events
  React.useEffect(() => {
    if (!isElectron || !window.electron) return;

    const handleProgress = (data: { modelName: string; progress: number }) => {
      setDownloadProgress(prev => ({ ...prev, [data.modelName]: data.progress }));
    };

    const handleComplete = async (data: { modelName: string }) => {
      setDownloadProgress(prev => {
        const updated = { ...prev };
        delete updated[data.modelName];
        return updated;
      });
      setDownloading(null);
      await fetchModels(); // Refresh to show "Ready" badge
      toast({
        title: "Download Complete",
        description: `${data.modelName} is now ready to use.`,
      });
    };

    const handleError = (data: { modelName: string; error: string }) => {
      setDownloadProgress(prev => {
        const updated = { ...prev };
        delete updated[data.modelName];
        return updated;
      });
      setDownloading(null);
      toast({
        variant: "destructive",
        title: "Download Failed",
        description: data.error,
      });
    };

    (window.electron as any).onDownloadProgress(handleProgress);
    (window.electron as any).onDownloadComplete(handleComplete);
    (window.electron as any).onDownloadError(handleError);

    // Listen for server status updates
    const getInitialStatus = async () => {
      const result = await (window.electron as any).getWhisperServerStatus();
      setServerStatus(result.status);
    };
    getInitialStatus();

    const removeStatusListener = (window.electron as any).onWhisperServerStatus((status: string) => {
      setServerStatus(status);
    });

    return () => {
      if (typeof removeStatusListener === 'function') removeStatusListener();
    };
  }, [isElectron, toast, fetchModels]);

  const handleDownload = async (modelName: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (downloading || !isElectron) return;

    setDownloading(modelName);
    toast({
      title: "Downloading Model",
      description: `Starting download for ${modelName}... This may take a while.`,
    });

    try {
      await (window.electron as any).downloadModel(modelName);
      // Progress, completion, and errors are handled by event listeners
    } catch (error) {
      setDownloading(null);
      toast({
        variant: "destructive",
        title: "Download Error",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const selectingRef = React.useRef(false);

  const handleSelect = async (modelName: string) => {
    if (!isElectron) return;
    if (selectingRef.current) return;

    const model = models.find(m => m.name === modelName);
    if (!model) return;

    if (!model.downloaded) {
      toast({
        variant: "destructive",
        title: "Model not downloaded",
        description: "Please download this model first.",
      });
      return;
    }

    selectingRef.current = true;
    try {
      const result = await (window.electron as any).setModel(modelName);
      if (result.success) {
        setActiveModel(modelName);
        setOpen(false);
        toast({
          title: "Model Changed",
          description: `Active model set to ${modelName}`,
        });
        await fetchModels();
      } else {
        toast({
          variant: "destructive",
          title: "Failed to switch model",
          description: result.error,
        });
      }
    } catch (error) {
      console.error(error);
    } finally {
      selectingRef.current = false;
    }
  };

  const handleDelete = React.useCallback(async (modelName: string) => {
    // Use ref to avoid stale closure — works correctly from capture listener
    if (!isElectron || deletingRef.current) return;

    deletingRef.current = modelName;
    setDeleting(modelName);
    try {
      const result = await (window.electron as any).deleteModel(modelName);
      if (result.success) {
        toast({
          title: "Model Deleted",
          description: `${modelName} has been removed from your system.`,
        });
        await fetchModels();
      } else {
        toast({
          variant: "destructive",
          title: "Delete Failed",
          description: result.error || "Could not delete the model",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Delete Error",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      deletingRef.current = null;
      setDeleting(null);
    }
  }, [isElectron, fetchModels, toast]);

  const handleDeleteRef = React.useRef(handleDelete);
  React.useEffect(() => {
    handleDeleteRef.current = handleDelete;
  }, [handleDelete]);

  React.useEffect(() => {
    const handleGlobalCapture = (e: Event) => {
      const target = e.target as HTMLElement;
      const deleteBtn = target.closest('[data-delete-btn]');
      if (deleteBtn) {
        // Prevent event from bubble/capture propagation so parent CommandItems are isolated
        e.stopPropagation();
        
        if (e.type === 'click' || e.type === 'keydown') {
          e.preventDefault();
        }

        if (e.type === 'click') {
          const modelName = deleteBtn.getAttribute('data-model-name');
          if (modelName) {
            handleDeleteRef.current(modelName);
          }
        }
      }
    };

    const events = [
      'click',
      'mousedown',
      'mouseup',
      'pointerdown',
      'pointerup',
      'touchstart',
      'touchend',
      'keydown'
    ];

    events.forEach(evt => {
      document.addEventListener(evt, handleGlobalCapture, { capture: true });
    });

    return () => {
      events.forEach(evt => {
        document.removeEventListener(evt, handleGlobalCapture, { capture: true });
      });
    };
  }, []);

  if (isElectron && models.length === 0 && !loading) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-9 justify-start gap-2 border-red-200 bg-red-50/50 hover:bg-red-100 dark:bg-red-950/20 dark:border-red-900/50 flex-1"
        onClick={handleRestart}
        disabled={restarting}
      >
        {restarting ? (
          <Loader2 className="h-3 w-3 animate-spin text-red-500" />
        ) : (
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        )}
        <span className="text-xs font-medium text-red-600 dark:text-red-400">
          {restarting ? "Restarting..." : "Restart Server"}
        </span>
      </Button>
    );
  }

  if (!mounted) {
    return (
      <div className="h-9 flex items-center gap-2 px-3 rounded-md bg-muted/30 border text-muted-foreground cursor-not-allowed flex-1">
        <div className="w-2 h-2 rounded-full bg-gray-400" />
        <span className="text-xs font-medium whitespace-nowrap">Service Offline</span>
      </div>
    );
  }

  if (!isElectron) {
    return (
      <div className="h-9 flex items-center gap-2 px-3 rounded-md bg-muted/30 border text-muted-foreground cursor-not-allowed flex-1">
        <div className="w-2 h-2 rounded-full bg-gray-400" />
        <span className="text-xs font-medium whitespace-nowrap">Service Offline</span>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between text-xs font-normal h-9 px-3", className)}
        >
          {loading ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : activeModel ? (
            <div className="flex items-center gap-2 overflow-hidden">
              <div
                className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  serverStatus === 'ready' ? "bg-green-500" :
                    serverStatus === 'starting' ? "bg-yellow-500 animate-pulse" :
                      serverStatus === 'error' ? "bg-red-500" : "bg-slate-400"
                )}
                title={`Status: ${serverStatus}`}
              />
              <span className="truncate">{models.find((m) => m.name === activeModel)?.name}</span>
            </div>
          ) : (
            "Select model..."
          )}
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command
          shouldFilter={true}
          disablePointerSelection
        >
          <CommandInput placeholder="Search models..." autoFocus />
          <CommandList>
            <CommandEmpty>No model found.</CommandEmpty>
            <CommandGroup heading="Available Models">
              {models.map((model) => {
                // If model is downloaded, render as selectable CommandItem (same style as Ollama)
                if (model.downloaded) {
                  return (
                    <div
                      key={model.name}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        "relative flex items-center justify-start gap-2 px-2 py-2.5 text-xs hover:bg-accent hover:text-accent-foreground rounded-sm cursor-pointer outline-none transition-all duration-75 active:scale-[0.98] active:bg-accent/50 w-full text-left",
                        activeModel === model.name && "bg-purple-500/10 text-purple-700 dark:text-purple-400 font-semibold border-l-2 border-purple-500 pl-1"
                      )}
                      onClick={() => {
                        console.log("[ModelSelector] downloaded click", model.name);
                        handleSelect(model.name);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSelect(model.name);
                        }
                      }}
                    >
                      <Check
                        className={cn(
                          "h-4 w-4 shrink-0",
                          activeModel === model.name ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="font-semibold text-slate-900 dark:text-slate-100 flex-1 truncate">{model.name}</span>
                      <span className="text-slate-500 dark:text-slate-400 text-[10px] font-medium whitespace-nowrap ml-auto">{model.size}</span>
                      <div className="w-6 flex justify-center shrink-0">
                        <Check className="h-4 w-4 text-green-500" />
                      </div>
                    </div>
                  );
                }

                // If not downloaded, render as a regular div with download action
                const progress = downloadProgress[model.name];
                const isDownloading = progress !== undefined;

                return (
                  <div
                    key={model.name}
                    className="relative flex items-center justify-start gap-2 px-2 py-2.5 text-xs hover:bg-accent hover:text-accent-foreground rounded-sm cursor-pointer outline-none transition-all duration-75 active:scale-[0.98] active:bg-accent/50 w-full text-left"
                    onClick={() => {
                      if (!isDownloading && downloading !== model.name) {
                        handleDownload(model.name);
                      }
                    }}
                  >
                    <div className="h-4 w-4 shrink-0" /> {/* Spacer for alignment */}
                    <div className="flex-1 flex flex-col min-w-0">
                      <div className="flex items-center justify-between w-full">
                        <span className="font-semibold text-slate-900 dark:text-slate-100 truncate hover:text-primary transition-colors">{model.name}</span>
                        <span className="text-slate-500 dark:text-slate-400 text-[10px] font-medium ml-auto whitespace-nowrap px-2">{model.size}</span>
                      </div>
                      {isDownloading && (
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all duration-300"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-[8px] text-primary font-bold shrink-0">{progress}%</span>
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary shrink-0"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (!isDownloading && downloading !== model.name) {
                          handleDownload(model.name);
                        }
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (!isDownloading && downloading !== model.name) {
                          handleDownload(model.name);
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (!isDownloading && downloading !== model.name) {
                          handleDownload(model.name);
                        }
                      }}
                      disabled={isDownloading || downloading === model.name}
                    >
                      {isDownloading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : (
                        <Download className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        {models.some((m) => m.isDeletable) && (
          <div className="border-t bg-muted/10">
            <div className="px-2 pt-2 pb-0.5">
              <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Installed Models</span>
            </div>
            {models.filter((m) => m.isDeletable).map((m) => (
              <div key={m.name} className="flex items-center justify-between px-2 py-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    activeModel === m.name && serverStatus === 'ready' ? "bg-green-500" :
                    activeModel === m.name && serverStatus === 'starting' ? "bg-yellow-500 animate-pulse" :
                    activeModel === m.name ? "bg-slate-400" : "bg-slate-600"
                  )} />
                  <span className={cn(
                    "text-[10px] truncate",
                    activeModel === m.name ? "text-purple-600 dark:text-purple-400 font-semibold" : "text-muted-foreground"
                  )}>{m.name}</span>
                  <span className="text-[9px] text-muted-foreground/60 shrink-0">{m.size}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={deleting === m.name}
                  className="h-6 px-2 text-[10px] text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 font-medium shrink-0 ml-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(m.name);
                  }}
                >
                  {deleting === m.name ? <Loader2 className="h-3 w-3 animate-spin" /> : "Uninstall"}
                </Button>
              </div>
            ))}
            <div className="pb-1" />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
