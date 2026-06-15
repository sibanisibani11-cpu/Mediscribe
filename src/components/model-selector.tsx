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
      const result = await (window.electron as any).downloadModel(modelName);
      if (result.success) {
        toast({
          title: "Download Complete",
          description: `${modelName} is now available.`,
        });
        await fetchModels();
      } else {
        toast({
          variant: "destructive",
          title: "Download Failed",
          description: result.error || "Unknown error occurred",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Download Error",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setDownloading(null);
    }
  };

  const handleSelect = async (modelName: string) => {
    if (!isElectron) return;

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
    }
  };

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
        >
          <CommandInput placeholder="Search models..." autoFocus />
          <CommandList>
            <CommandEmpty>No model found.</CommandEmpty>
            <CommandGroup heading="Available Models">
              {models.map((model) => {
                // If model is downloaded, render as selectable CommandItem
                if (model.downloaded) {
                  return (
                    <CommandItem
                      key={model.name}
                      value={model.name.toLowerCase()}
                      onSelect={() => handleSelect(model.name)}
                      className={cn(
                        "text-xs cursor-pointer outline-none transition-all duration-75 flex items-center justify-start w-full text-left gap-2 py-2.5",
                        "hover:bg-accent hover:text-accent-foreground active:scale-[0.98] active:bg-accent/50",
                        activeModel === model.name && "bg-purple-500/10 text-purple-700 dark:text-purple-400 font-semibold border-l-2 border-purple-500 pl-1"
                      )}
                    >
                      <Check
                        className={cn(
                          "h-4 w-4 shrink-0",
                          activeModel === model.name ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="font-semibold text-slate-900 dark:text-slate-100 flex-1 truncate">{model.name}</span>
                      <span className="text-slate-500 dark:text-slate-400 text-[10px] font-medium whitespace-nowrap ml-auto">{model.size}</span>
                      <div className="w-8 flex justify-center shrink-0">
                        <Check className="h-4 w-4 text-green-500" />
                      </div>
                    </CommandItem>
                  );
                }

                // If not downloaded, render as a regular div with download action
                const progress = downloadProgress[model.name];
                const isDownloading = progress !== undefined;

                return (
                  <CommandItem
                    key={model.name}
                    value={model.name.toLowerCase()}
                    onSelect={() => {
                      if (!isDownloading) {
                        handleDownload(model.name);
                      }
                    }}
                    className="relative flex items-center justify-start gap-2 px-2 py-2.5 text-xs hover:bg-accent hover:text-accent-foreground rounded-sm cursor-pointer outline-none transition-all duration-75 active:scale-[0.98] active:bg-accent/50 w-full text-left"
                  >
                    <div className="h-4 w-4 shrink-0" /> {/* Spacer for alignment */}
                    <div className="flex-1 flex flex-col min-w-0">
                      <div className="flex items-center justify-between w-full">
                        <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">{model.name}</span>
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
                      onPointerDown={(e) => {
                        e.stopPropagation();
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
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
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
