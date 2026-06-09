"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Book, Loader2, SortAsc, Check, X, Edit2, Cloud, RefreshCw, ChevronDown, CloudUpload, CloudDownload } from "lucide-react";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
// Types moved to inline or not used
import { useToast } from "../hooks/use-toast";
import { cn } from "../lib/utils";
import { SyncConfirmDialog } from "./common/sync-confirm-dialog";

export function DictionaryManager() {
    const [dictionary, setDictionary] = useState<string[]>([]);
    const [newWord, setNewWord] = useState("");
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [editingWord, setEditingWord] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");
    const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
    const [isSyncing, setIsSyncing] = useState(false);
    const [isDriveConnected, setIsDriveConnected] = useState(false);

    const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; action: "push" | "pull" }>({
        open: false,
        action: "push"
    });
    const { toast } = useToast();

    const isElectron = typeof window !== 'undefined' && !!window.electron;

    useEffect(() => {
        if (isElectron) {
            fetchDictionary();
            // Check drive status
            (window.electron as any).getGoogleStatus?.().then((res: any) => {
                setIsDriveConnected(res.connected);
            });

        } else {
            setLoading(false);
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
                    description: "Your dictionary is now syncing with the cloud.",
                });
                fetchDictionary();
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

            let msg = "Your dictionary is now in sync.";
            if (strategy === 'push') msg = "Local dictionary uploaded to Cloud.";
            if (strategy === 'pull') msg = "Cloud dictionary downloaded to device.";

            toast({
                title: strategy === 'merge' ? "Sync Complete" : (strategy === 'push' ? "Push Complete" : "Pull Complete"),
                description: msg,
            });
            // Reload local dictionary
            const dict = await (window.electron as any).getDictionary();
            setDictionary(dict);
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

    const fetchDictionary = async () => {
        try {
            const result = await (window.electron as any).getDictionary();
            if (Array.isArray(result)) {
                setDictionary(result);
            }
        } catch (error) {
            console.error("Failed to fetch dictionary:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddWord = async () => {
        const trimmedInput = newWord.trim();
        if (!trimmedInput) return;

        setIsAdding(true);
        try {
            const result = await (window.electron as any).addWord(trimmedInput);
            if (result.success) {
                setDictionary(result.dictionary);
                setNewWord("");
                const wordMsg = result.addedCount > 1
                    ? `${result.addedCount} words added`
                    : `"${trimmedInput}" added`;

                toast({
                    title: "Success",
                    description: `${wordMsg} to your custom dictionary.`,
                });
            } else {
                toast({
                    variant: "destructive",
                    title: "Info",
                    description: result.error || "No new words added.",
                });
            }
        } catch (error) {
            console.error("Add word error:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "An unexpected error occurred.",
            });
        } finally {
            setIsAdding(false);
        }
    };

    const handleRemoveWord = async (word: string) => {
        try {
            const result = await (window.electron as any).removeWord(word);
            if (result.success) {
                setDictionary(result.dictionary);
                setSelectedWords(prev => {
                    const next = new Set(prev);
                    next.delete(word);
                    return next;
                });
                toast({
                    title: "Word Removed",
                    description: `"${word}" removed from dictionary.`,
                });
            }
        } catch (error) {
            console.error("Remove word error:", error);
        }
    };

    const handleBulkRemoveWords = async () => {
        if (selectedWords.size === 0) return;

        try {
            const wordsToRemove = Array.from(selectedWords);
            const result = await (window.electron as any).removeWords(wordsToRemove);
            if (result.success) {
                setDictionary(result.dictionary);
                setSelectedWords(new Set());
                toast({
                    title: "Bulk Deletion Successful",
                    description: `${wordsToRemove.length} terms removed from dictionary.`,
                });
            }
        } catch (error) {
            console.error("Bulk remove error:", error);
        }
    };

    const toggleSelectWord = (word: string) => {
        setSelectedWords(prev => {
            const next = new Set(prev);
            if (next.has(word)) {
                next.delete(word);
            } else {
                next.add(word);
            }
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedWords.size === dictionary.length) {
            setSelectedWords(new Set());
        } else {
            setSelectedWords(new Set(dictionary));
        }
    };

    const handleStartEdit = (word: string) => {
        setEditingWord(word);
        setEditValue(word);
    };

    const handleCancelEdit = () => {
        setEditingWord(null);
        setEditValue("");
    };

    const handleSaveEdit = async () => {
        if (!editingWord || !editValue.trim() || editingWord === editValue.trim()) {
            handleCancelEdit();
            return;
        }

        try {
            const result = await (window.electron as any).updateWord(editingWord, editValue.trim());
            if (result.success) {
                setDictionary(result.dictionary);
                setEditingWord(null);
                toast({
                    title: "Word Updated",
                    description: `"${editingWord}" changed to "${editValue.trim()}".`,
                });
            } else {
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: result.error || "Failed to update word.",
                });
            }
        } catch (error) {
            console.error("Update word error:", error);
        }
    };

    const handleSort = async () => {
        try {
            const result = await (window.electron as any).sortDictionary();
            if (result.success) {
                setDictionary(result.dictionary);
                toast({
                    title: "Sorted",
                    description: "Dictionary sorted alphabetically.",
                });
            }
        } catch (error) {
            console.error("Sort error:", error);
        }
    };

    if (!isElectron) {
        return (
            <div className="p-4 text-center text-muted-foreground text-xs italic">
                Dictionary is only available in the desktop app.
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 p-1 h-full min-h-[500px]">
            {/* Add Section */}
            <div className="flex flex-col gap-3 glass-card p-4 rounded-xl border-blue-100/50 dark:border-blue-900/20">
                <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <Plus className="h-3 w-3 text-violet-500" />
                        Add Medical Terms
                    </label>
                    <span className="text-[10px] text-muted-foreground italic">Use commas to add multiple terms</span>
                </div>
                <div className="flex gap-3">
                    <div className="flex-1 group">
                        <textarea
                            value={newWord}
                            onChange={(e) => setNewWord(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    handleAddWord();
                                }
                            }}
                            placeholder="Type terms here... e.g. HbA1c, Nephropathy, Cardiomyopathy"
                            className="w-full min-h-[44px] max-h-[120px] px-4 py-3 bg-white dark:bg-black/40 border border-slate-200 dark:border-slate-800 rounded-lg text-sm transition-all focus:ring-2 focus:ring-violet-500 outline-none resize-none custom-scrollbar shadow-inner"
                        />
                    </div>
                    <Button
                        onClick={handleAddWord}
                        disabled={isAdding || !newWord.trim()}
                        className="h-[44px] px-6 glass-card border-blue-200 dark:border-blue-900 cobalt-gradient hover:opacity-90 font-bold shrink-0 self-end"
                    >
                        {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Terms"}
                    </Button>
                </div>
            </div>

            {/* List Section */}
            <div className="flex-1 flex flex-col gap-4">
                <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-2">
                        <Book className="h-4 w-4 text-violet-500" />
                        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Dictionary Explorer</h3>
                        <span className="text-[10px] bg-blue-100 dark:bg-blue-900/50 text-violet-600 dark:text-blue-300 px-2 py-0.5 rounded-full font-bold">
                            {dictionary.length} Terms
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                fetchDictionary();
                                toast({ description: "Data refreshed" });
                            }}
                            className="h-7 w-7 p-0 ml-1 text-slate-400 hover:text-violet-600 rounded-full"
                            title="Refresh Data"
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        {isDriveConnected ? (
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={isSyncing}
                                        className="h-7 px-2 text-[10px] font-bold border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 hover:bg-violet-50 dark:hover:bg-blue-900/20 text-violet-600 flex items-center gap-1.5 rounded-lg shadow-sm ml-2"
                                    >
                                        {isSyncing ? (
                                            <RefreshCw className="h-3 w-3 animate-spin" />
                                        ) : (
                                            <Cloud className="h-3 w-3" />
                                        )}
                                        {isSyncing ? "Syncing..." : "Cloud Sync"}
                                        <ChevronDown className="h-3 w-3 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-2 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-xl rounded-xl" align="start">
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
                                            className="flex items-center gap-3 w-full px-2 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-violet-50 dark:hover:bg-blue-900/20 hover:text-violet-600 rounded-lg transition-colors text-left"
                                        >
                                            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                                                <CloudDownload className="h-4 w-4 text-violet-600" />
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
                                className="h-7 px-2 text-[10px] font-bold border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center gap-1.5 rounded-lg shadow-sm ml-2 group"
                            >
                                {isSyncing ? (
                                    <RefreshCw className="h-3 w-3 animate-spin" />
                                ) : (
                                    <Cloud className="h-3 w-3 group-hover:text-violet-500 transition-colors" />
                                )}
                                {isSyncing ? "Connecting..." : "Connect Cloud"}
                            </Button>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleSort}
                            className="h-8 gap-2 text-xs text-slate-500 hover:text-violet-600 font-medium"
                        >
                            <SortAsc className="h-3.5 w-3.5" />
                            Sort A-Z
                        </Button>

                        {dictionary.length > 0 && (
                            <div className="flex items-center gap-2">
                                <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={toggleSelectAll}
                                    className="h-8 text-xs text-slate-500 hover:text-violet-600 font-medium"
                                >
                                    {selectedWords.size === dictionary.length ? "Deselect All" : "Select All"}
                                </Button>
                                {selectedWords.size > 0 && (
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={handleBulkRemoveWords}
                                        className="h-7 px-3 text-[10px] font-bold bg-red-500 hover:bg-red-600 text-white flex items-center gap-1.5 animate-in zoom-in duration-200"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                        Delete ({selectedWords.size})
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="glass-card flex-1 rounded-xl overflow-hidden border-slate-200/50 dark:border-white/5 shadow-inner flex flex-col min-h-0">
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
                                <Loader2 className="h-8 w-8 animate-spin mb-3 text-emerald-400" />
                                <p className="text-xs font-medium">Indexing your dictionary...</p>
                            </div>
                        ) : dictionary.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-60 py-12 text-center">
                                <div className="p-4 rounded-full bg-slate-100 dark:bg-slate-900 mb-4">
                                    <Book className="h-8 w-8 stroke-slate-300 dark:stroke-slate-700" />
                                </div>
                                <h4 className="text-sm font-bold mb-1">Your dictionary is empty</h4>
                                <p className="text-[11px] max-w-[200px] leading-relaxed">Add specialized medical terms, drug names, or clinical acronyms for better accuracy.</p>
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-2.5">
                                {dictionary.map((word: string) => (
                                    <div
                                        key={word}
                                        onClick={() => !editingWord && toggleSelectWord(word)}
                                        className={cn(
                                            "group flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all border cursor-pointer",
                                            editingWord === word
                                                ? "bg-violet-50 dark:bg-blue-900/30 border-blue-300 dark:border-violet-600 shadow-md ring-2 ring-violet-500/10 min-w-[200px]"
                                                : selectedWords.has(word)
                                                    ? "bg-violet-50/50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                                                    : "bg-white/80 dark:bg-black/30 border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm hover:translate-y-[-1px]"
                                        )}
                                    >
                                        {!editingWord && (
                                            <div
                                                className={cn(
                                                    "w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors shrink-0",
                                                    selectedWords.has(word)
                                                        ? "bg-violet-500 border-violet-500 text-white"
                                                        : "border-slate-300 dark:border-slate-600"
                                                )}
                                            >
                                                {selectedWords.has(word) && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                                            </div>
                                        )}
                                        {editingWord === word ? (
                                            <div className="flex items-center gap-1.5 w-full">
                                                <input
                                                    type="text"
                                                    value={editValue}
                                                    autoFocus
                                                    onChange={(e) => setEditValue(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") handleSaveEdit();
                                                        if (e.key === "Escape") handleCancelEdit();
                                                    }}
                                                    className="flex-1 h-6 bg-white dark:bg-black/40 border-none rounded px-1.5 text-xs outline-none font-medium"
                                                />
                                                <div className="flex gap-1 shrink-0">
                                                    <button
                                                        onClick={handleSaveEdit}
                                                        className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded"
                                                        title="Save"
                                                    >
                                                        <Check className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={handleCancelEdit}
                                                        className="p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                                                        title="Cancel"
                                                    >
                                                        <X className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <span
                                                    className="text-[13px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer hover:text-violet-600 transition-colors whitespace-nowrap"
                                                    onClick={() => handleStartEdit(word)}
                                                >
                                                    {word}
                                                </span>
                                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1 border-l border-slate-200 dark:border-slate-700 pl-1.5">
                                                    <button
                                                        onClick={() => handleStartEdit(word)}
                                                        className="p-1 text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-blue-900/30 rounded"
                                                        title="Edit"
                                                    >
                                                        <Edit2 className="h-3 w-3" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleRemoveWord(word)}
                                                        className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="bg-slate-50/80 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 px-4 py-2.5 flex items-center justify-between">
                        <p className="text-[10px] text-muted-foreground font-medium flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                            Active Dictionary Engine
                        </p>
                        <p className="text-[10px] text-slate-400 italic">
                            Used for Standard & Deep Transcription
                        </p>
                    </div>
                </div>
            </div>
            {isElectron && (
                <SyncConfirmDialog
                    open={confirmDialog.open}
                    onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}
                    onConfirm={() => executeSync(confirmDialog.action)}
                    action={confirmDialog.action}
                />
            )}
        </div>
    );
}

