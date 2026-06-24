"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Download, Loader2, X } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "./ui/alert-dialog";
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

interface OllamaModel {
    name: string;
    size: string;
    description: string;
    downloaded: boolean;
    active: boolean;
    isDeletable?: boolean;
    installedName?: string;
}

interface OllamaSelectorProps {
    className?: string;
    enabled: boolean;
    onEnabledChange?: (enabled: boolean) => void;
}

export function OllamaSelector({ className, enabled, onEnabledChange }: OllamaSelectorProps) {
    const [open, setOpen] = React.useState(false);
    const [models, setModels] = React.useState<OllamaModel[]>([]);
    const [activeModel, setActiveModel] = React.useState<string>("");
    const [downloading, setDownloading] = React.useState<string | null>(null);
    const [downloadProgress, setDownloadProgress] = React.useState<Record<string, number>>({});
    const [loading, setLoading] = React.useState(true);
    const [ollamaStatus, setOllamaStatus] = React.useState<{ installed: boolean; running: boolean }>({
        installed: false,
        running: false
    });
    const [confirmDownload, setConfirmDownload] = React.useState<OllamaModel | null>(null);
    const { toast } = useToast();
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    const isElectron = typeof window !== 'undefined' && (window.electron?.isElectron === true || !!window.electron);

    const fetchModels = React.useCallback(async () => {
        if (!isElectron) {
            setLoading(false);
            return;
        }
        try {
            // Only set loading if it's the first load
            // setLoading(true); // Removed to prevent flicker on interval updates
            const status = await (window.electron as any).checkOllamaStatus();
            setOllamaStatus(status);

            if (status.running) {
                const modelList = await (window.electron as any).getOllamaModels();
                setModels(modelList);
                const active = modelList.find((m: OllamaModel) => m.active);
                if (active) setActiveModel(active.name);
                else setActiveModel("");
            }
            setLoading(false);
        } catch (error) {
            console.error("Failed to fetch Ollama models", error);
            setLoading(false);
        }
    }, [isElectron]);

    React.useEffect(() => {
        fetchModels();
        if (isElectron) {
            const interval = setInterval(fetchModels, 10000); // Check every 10s
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
            await fetchModels();
            toast({
                title: "Model Downloaded",
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

        (window.electron as any).onOllamaDownloadProgress(handleProgress);
        (window.electron as any).onOllamaDownloadComplete(handleComplete);
        (window.electron as any).onOllamaDownloadError(handleError);
    }, [isElectron, toast, fetchModels]);

    const handleCancel = async (modelName: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!isElectron) return;

        try {
            await (window.electron as any).cancelOllamaDownload(modelName);
            // State cleanup will happen via onDownloadError/Complete handlers usually
            // but we can optimistic update here too
            setDownloading(null);
            setDownloadProgress(prev => {
                const updated = { ...prev };
                delete updated[modelName];
                return updated;
            });
            toast({
                title: "Download Cancelled",
                description: `Cancelled download for ${modelName}`,
            });
        } catch (error) {
            console.error("Cancel error:", error);
        }
    };

    const handleDownload = async (modelName: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (downloading || !isElectron) return;

        setDownloading(modelName);
        setConfirmDownload(null);
        toast({
            title: "Downloading Model",
            description: `Starting download for ${modelName}... This may take several minutes.`,
        });

        try {
            await (window.electron as any).downloadOllamaModel(modelName);
        } catch (error) {
            console.error("Download error:", error);
            setDownloading(null);
        }
    };

    const handleDownloadRequest = (model: OllamaModel) => {
        setConfirmDownload(model);
    };

    const selectingRef = React.useRef(false);

    const handleSelect = async (modelName: string) => {
        if (!isElectron) return;
        if (selectingRef.current) return;

        const model = models.find(m => m.name === modelName);
        if (!model || !model.downloaded) {
            toast({
                variant: "destructive",
                title: "Model not downloaded",
                description: "Please download this model first.",
            });
            return;
        }

        selectingRef.current = true;
        try {
            await (window.electron as any).setOllamaModel(modelName);
            setActiveModel(modelName);
            setOpen(false);
            toast({
                title: "Model Changed",
                description: `Active Ollama model set to ${modelName}`,
            });
            await fetchModels();
        } catch (error) {
            console.error(error);
        } finally {
            selectingRef.current = false;
        }
    };

    const handleToggleLLM = async () => {
        const newState = !enabled;
        if (onEnabledChange) onEnabledChange(newState);
        if (isElectron) await (window.electron as any).toggleOllama(newState);

        toast({
            title: newState ? "LLM Enabled" : "LLM Disabled",
            description: newState ? "Medical formatting has been turned on" : "Medical formatting has been turned off",
        });

        setOpen(false);
    };

    const handleDelete = async (modelName: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!isElectron) return;

        try {
            const result = await (window.electron as any).deleteOllamaModel(modelName);
            if (result.success) {
                if (activeModel === modelName) {
                    setActiveModel("");
                }
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
        }
    };

    if (!mounted) {
        return (
            <Button
                variant="outline"
                size="sm"
                className="h-9 justify-start gap-2 border-yellow-200 bg-yellow-50/50 hover:bg-yellow-100 dark:bg-yellow-950/20 dark:border-yellow-900/50 dark:hover:bg-yellow-950/30 flex-1"
            >
                <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                <span className="text-xs font-medium whitespace-nowrap text-yellow-700 dark:text-yellow-400">
                    Ollama Starting...
                </span>
            </Button>
        );
    }

    if (!isElectron || !ollamaStatus.installed || !ollamaStatus.running) {
        // ... existing installation button ...\
        return (
            <Button
                variant="outline"
                size="sm"
                className="h-9 justify-start gap-2 border-yellow-200 bg-yellow-50/50 hover:bg-yellow-100 dark:bg-yellow-950/20 dark:border-yellow-900/50 dark:hover:bg-yellow-950/30 flex-1"
                onClick={() => {
                    toast({
                        title: !ollamaStatus.installed ? "Ollama Not Found" : "Start Ollama",
                        description: !ollamaStatus.installed
                            ? "Ollama should be bundled with the app. Check the console for errors or try restarting the app."
                            : "Ollama is installed but not running. Try restarting the app.",
                        duration: 8000,
                    });
                }}
            >
                <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                <span className="text-xs font-medium whitespace-nowrap text-yellow-700 dark:text-yellow-400">
                    {!ollamaStatus.installed ? "Ollama Starting..." : "Start Ollama"}
                </span>
            </Button>
        );
    }

    return (
        <>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className={cn(
                            "justify-between text-xs font-normal h-9 px-3",
                            !enabled && "border-slate-300 dark:border-slate-800",
                            className
                        )}
                    >
                        {loading ? (
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        ) : !enabled ? (
                            <div className="flex items-center gap-2 overflow-hidden">
                                <div className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                                <span className="truncate text-slate-500 dark:text-slate-400">Off (Disabled)</span>
                            </div>
                        ) : activeModel ? (
                            <div className="flex items-center gap-2 overflow-hidden">
                                <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                                <span className="truncate">{models.find((m) => m.name === activeModel)?.name || activeModel}</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 overflow-hidden">
                                <div className="w-2 h-2 rounded-full bg-orange-400 shrink-0 animate-pulse" />
                                <span className="truncate text-slate-700 dark:text-slate-300 font-medium">Select Model</span>
                            </div>
                        )}
                        <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[340px] p-0" align="start">
                    <Command shouldFilter={true} disablePointerSelection>
                        <CommandInput placeholder="Search models..." autoFocus />
                        <CommandList>
                            <CommandEmpty>No model found.</CommandEmpty>
                            <CommandGroup heading="LLM Options">
                                <CommandItem
                                    value="off-toggle"
                                    className={cn(
                                        "text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground outline-none transition-all duration-75 active:scale-[0.98] active:bg-accent/50 p-0",
                                        !enabled && "bg-purple-500/10 text-purple-700 dark:text-purple-400 font-bold border-l-2 border-purple-500 pl-1"
                                    )}
                                >
                                    <div
                                        className="flex items-center w-full gap-2 py-2.5 px-2 cursor-pointer"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleToggleLLM();
                                        }}
                                        onPointerUp={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleToggleLLM();
                                        }}
                                    >
                                        <Check
                                            className={cn(
                                                "h-4 w-4 shrink-0",
                                                !enabled ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        <span className="text-slate-900 dark:text-slate-100 font-bold flex-1">
                                            {!enabled ? "Turn LLM On" : "Turn LLM Off"}
                                        </span>
                                        {!enabled && (
                                            <span className="text-[10px] text-slate-500 font-normal italic mr-2 shrink-0">Click to activate</span>
                                        )}
                                    </div>
                                </CommandItem>
                            </CommandGroup>
                            <CommandGroup heading="Available LLM Models">
                                {models.length === 0 && (
                                    <CommandItem disabled>
                                        <span className="text-slate-500 dark:text-slate-400 text-xs italic">No models found. Please install Ollama or download models.</span>
                                    </CommandItem>
                                )}
                                {models.map((model) => {
                                    if (model.downloaded) {
                                        return (
                                            <div
                                                key={model.name}
                                                role="button"
                                                tabIndex={0}
                                                className={cn(
                                                    "relative flex flex-col items-start justify-start gap-1 px-0 py-0 text-xs hover:bg-accent hover:text-accent-foreground rounded-sm cursor-pointer outline-none transition-all duration-75 active:scale-[0.98] active:bg-accent/50 w-full text-left",
                                                    enabled && activeModel === model.name && "bg-purple-500/10 text-purple-700 dark:text-purple-400 font-bold border-l-2 border-purple-500 pl-1"
                                                )}
                                                onClick={async () => {
                                                    console.log("[OllamaSelector] downloaded click", model.name);
                                                    if (onEnabledChange) onEnabledChange(true);
                                                    if (isElectron) await (window.electron as any).toggleOllama(true);
                                                    await handleSelect(model.name);
                                                }}
                                                onKeyDown={async (e) => {
                                                    if (e.key === "Enter" || e.key === " ") {
                                                        e.preventDefault();
                                                        if (onEnabledChange) onEnabledChange(true);
                                                        if (isElectron) await (window.electron as any).toggleOllama(true);
                                                        await handleSelect(model.name);
                                                    }
                                                }}
                                            >
                                                <div className="flex flex-col items-start justify-start gap-1 w-full p-2 cursor-pointer">
                                                    <div className="flex items-center w-full">
                                                        <Check
                                                            className={cn(
                                                                "mr-2 h-4 w-4 shrink-0",
                                                                enabled && activeModel === model.name ? "opacity-100" : "opacity-0"
                                                            )}
                                                        />
                                                        <div className="flex-1">
                                                            <div className="flex items-center justify-between">
                                                                <span className="font-bold text-slate-900 dark:text-slate-100">{model.name}</span>
                                                                <span className="text-slate-500 dark:text-slate-400 text-[10px] font-medium">{model.size}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1 ml-2">
                                                            <div className="w-8 flex justify-center shrink-0">
                                                                <Check className="h-4 w-4 text-green-500" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 ml-6 line-clamp-1">{model.description}</p>
                                                </div>
                                            </div>
                                        );
                                    }

                                    const progress = downloadProgress[model.name];
                                    const isDownloading = progress !== undefined || downloading === model.name;
                                    const displayProgress = progress ?? 0;

                                    return (
                                        <div
                                            key={model.name}
                                            className="relative flex flex-col items-start justify-start gap-2 px-0 py-0 text-xs hover:bg-accent hover:text-accent-foreground rounded-sm cursor-pointer outline-none transition-all duration-75 active:scale-[0.98] active:bg-accent/50 w-full"
                                            onClick={() => {
                                                if (!isDownloading && downloading !== model.name) {
                                                    handleDownloadRequest(model);
                                                }
                                            }}
                                        >
                                            <div className="w-full p-2 cursor-pointer">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-4 h-4 mr-2 shrink-0" />
                                                    <div className="flex-1 flex flex-col gap-1">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-slate-900 dark:text-slate-100 font-bold hover:text-purple-600 dark:hover:text-purple-400 transition-colors cursor-pointer">{model.name}</span>
                                                            <span className="text-slate-500 dark:text-slate-400 text-[10px] font-medium">{model.size}</span>
                                                        </div>
                                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1">{model.description}</p>
                                                        {isDownloading && (
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                                                    <div
                                                                        className="h-full bg-purple-500 transition-all duration-300"
                                                                        style={{ width: `${displayProgress}%` }}
                                                                    />
                                                                </div>
                                                                <span className="text-[10px] text-purple-600 font-medium shrink-0">{displayProgress}%</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className={cn(
                                                            "ml-2 h-8 w-8 p-0 shrink-0",
                                                            isDownloading
                                                                ? "hover:bg-red-500/10 hover:text-red-600 text-slate-400"
                                                                : "hover:bg-purple-500/10 hover:text-purple-600"
                                                        )}
                                                        onMouseDown={(e) => {
                                                            e.stopPropagation();
                                                            e.preventDefault();
                                                            if (isDownloading) {
                                                                handleCancel(model.name, e);
                                                            } else {
                                                                handleDownload(model.name, e);
                                                            }
                                                        }}
                                                        onPointerDown={(e) => {
                                                            e.stopPropagation();
                                                            e.preventDefault();
                                                            if (isDownloading) {
                                                                handleCancel(model.name, e);
                                                            } else {
                                                                handleDownload(model.name, e);
                                                            }
                                                        }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            e.preventDefault();
                                                            if (isDownloading) {
                                                                handleCancel(model.name, e);
                                                            } else {
                                                                handleDownload(model.name, e);
                                                            }
                                                        }}
                                                        disabled={(!isDownloading && downloading !== null)} // Disable others while one is downloading? Or specific logic
                                                    >
                                                        {isDownloading ? (
                                                            <div className="relative flex items-center justify-center">
                                                                <Loader2 className="h-4 w-4 animate-spin absolute" />
                                                                <X className="h-4 w-4 opacity-0 hover:opacity-100 bg-background/80 absolute transition-opacity" />
                                                            </div>
                                                        ) : (
                                                            <Download className="h-4 w-4" />
                                                        )}
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                    {enabled && activeModel && (() => {
                        const active = models.find((m) => m.name === activeModel);
                        if (!active?.isDeletable) return null;
                        return (
                            <div className="border-t p-2 flex items-center justify-between bg-muted/20">
                                <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                                    Active: {active.installedName || active.name}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-[10px] text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 font-medium"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(active.name);
                                    }}
                                >
                                    Uninstall Model
                                </Button>
                            </div>
                        );
                    })()}
                </PopoverContent>
            </Popover>

            <AlertDialog open={!!confirmDownload} onOpenChange={(open) => !open && setConfirmDownload(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Download LLM Model?</AlertDialogTitle>
                        <AlertDialogDescription>
                            You are about to download <span className="font-bold text-slate-900 dark:text-slate-100">{confirmDownload?.name}</span> ({confirmDownload?.size}).
                            <br /><br />
                            This will download a large file and may take several minutes depending on your internet connection.
                            <br /><br />
                            {confirmDownload?.description}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => confirmDownload && handleDownload(confirmDownload.name)}>
                            Download
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
