"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, BookOpen, Loader2, SortAsc, Check, X, Edit2, Search } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { useToast } from "../hooks/use-toast";
import { cn } from "../lib/utils";
import { isElectron, isMobile } from "../lib/platform";

export interface KeywordEntry {
    id: string;
    keyword: string;
    description: string;
}

export function KeywordLibraryManager() {
    const [keywords, setKeywords] = useState<KeywordEntry[]>([]);
    const [newKeyword, setNewKeyword] = useState("");
    const [newDescription, setNewDescription] = useState("");
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editKeyword, setEditKeyword] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState("");

    const { toast } = useToast();

    const STORAGE_KEY = "mediscribe_keywords";

    const loadLocalKeywords = (): KeywordEntry[] => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch { return []; }
    };

    const saveLocalKeywords = (k: KeywordEntry[]) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(k));
    };

    useEffect(() => {
        if (isElectron) {
            fetchKeywords();
        } else {
            setKeywords(loadLocalKeywords());
            setLoading(false);
        }
    }, [isElectron]);

    const fetchKeywords = async () => {
        try {
            const result = await (window.electron as any).getKeywords();
            if (Array.isArray(result)) {
                setKeywords(result);
            }
        } catch (error) {
            console.error("Failed to fetch keywords:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddKeyword = async () => {
        if (!newKeyword.trim() || !newDescription.trim()) return;

        setIsAdding(true);
        try {
            if (isElectron) {
                const result = await (window.electron as any).addKeyword({
                    keyword: newKeyword.trim(),
                    description: newDescription.trim()
                });

                if (result.success) {
                    setKeywords(result.keywords);
                    setNewKeyword("");
                    setNewDescription("");
                    toast({
                        title: "Keyword Added",
                        description: `"${newKeyword}" added to your library.`,
                    });
                } else {
                    toast({
                        variant: "destructive",
                        title: "Error",
                        description: result.error || "Failed to add keyword.",
                    });
                }
            } else {
                const next = [
                    {
                        id: `kw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                        keyword: newKeyword.trim(),
                        description: newDescription.trim()
                    },
                    ...keywords
                ];
                setKeywords(next);
                saveLocalKeywords(next);
                setNewKeyword("");
                setNewDescription("");
                toast({
                    title: "Keyword Added",
                    description: `"${newKeyword}" added to your library.`,
                });
            }
        } catch (error) {
            console.error("Add keyword error:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "An unexpected error occurred.",
            });
        } finally {
            setIsAdding(false);
        }
    };

    const handleRemoveKeyword = async (id: string) => {
        try {
            if (isElectron) {
                const result = await (window.electron as any).removeKeyword(id);
                if (result.success) {
                    setKeywords(result.keywords);
                    setSelectedIds(prev => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                    });
                    toast({
                        title: "Keyword Removed",
                        description: "Keyword removed from library.",
                    });
                }
            } else {
                const next = keywords.filter(k => k.id !== id);
                setKeywords(next);
                saveLocalKeywords(next);
                setSelectedIds(prev => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                });
                toast({
                    title: "Keyword Removed",
                    description: "Keyword removed from library.",
                });
            }
        } catch (error) {
            console.error("Remove keyword error:", error);
        }
    };

    const handleBulkRemoveKeywords = async () => {
        if (selectedIds.size === 0) return;

        try {
            const idsToRemove = Array.from(selectedIds);
            if (isElectron) {
                const result = await (window.electron as any).removeKeywords(idsToRemove);
                if (result.success) {
                    setKeywords(result.keywords);
                    setSelectedIds(new Set());
                    toast({
                        title: "Bulk Deletion Successful",
                        description: `${idsToRemove.length} keywords removed from library.`,
                    });
                }
            } else {
                const next = keywords.filter(k => !selectedIds.has(k.id));
                setKeywords(next);
                saveLocalKeywords(next);
                setSelectedIds(new Set());
                toast({
                    title: "Bulk Deletion Successful",
                    description: `${idsToRemove.length} keywords removed from library.`,
                });
            }
        } catch (error) {
            console.error("Bulk remove keywords error:", error);
        }
    };

    const toggleSelectId = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredKeywords.length && filteredKeywords.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredKeywords.map(k => k.id)));
        }
    };

    const handleSort = async () => {
        try {
            if (isElectron) {
                const result = await (window.electron as any).sortKeywords();
                if (result.success) {
                    setKeywords(result.keywords);
                    toast({
                        title: "Sorted",
                        description: "Keywords sorted alphabetically.",
                    });
                }
            } else {
                const next = [...keywords].sort((a, b) => a.keyword.localeCompare(b.keyword));
                setKeywords(next);
                saveLocalKeywords(next);
                toast({
                    title: "Sorted",
                    description: "Keywords sorted alphabetically.",
                });
            }
        } catch (error) {
            console.error("Sort error:", error);
        }
    };

    const handleStartEdit = (entry: KeywordEntry) => {
        setEditingId(entry.id);
        setEditKeyword(entry.keyword);
        setEditDescription(entry.description);
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditKeyword("");
        setEditDescription("");
    };

    const handleSaveEdit = async () => {
        if (!editingId || !editKeyword.trim() || !editDescription.trim()) {
            handleCancelEdit();
            return;
        }

        try {
            if (isElectron) {
                const result = await (window.electron as any).updateKeyword({
                    id: editingId,
                    keyword: editKeyword.trim(),
                    description: editDescription.trim()
                });

                if (result.success) {
                    setKeywords(result.keywords);
                    setEditingId(null);
                    toast({
                        title: "Keyword Updated",
                        description: "Keyword entry updated successfully.",
                    });
                } else {
                    toast({
                        variant: "destructive",
                        title: "Error",
                        description: result.error || "Failed to update keyword.",
                    });
                }
            } else {
                const next = keywords.map(k => k.id === editingId ? { ...k, keyword: editKeyword.trim(), description: editDescription.trim() } : k);
                setKeywords(next);
                saveLocalKeywords(next);
                setEditingId(null);
                toast({
                    title: "Keyword Updated",
                    description: "Keyword entry updated successfully.",
                });
            }
        } catch (error) {
            console.error("Update keyword error:", error);
        }
    };

    const filteredKeywords = keywords.filter(k =>
        k.keyword.toLowerCase().includes(searchQuery.toLowerCase()) ||
        k.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (!isElectron && !isMobile) {
        return (
            <div className="p-4 text-center text-muted-foreground text-xs italic">
                Keyword Library is only available in the desktop app.
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 h-full">
            <div className="flex flex-col gap-3">
                <div className="flex gap-3 items-start">
                    <div className="flex-1 relative group min-w-0">
                        <input
                            type="text"
                            value={newKeyword}
                            onChange={(e) => setNewKeyword(e.target.value)}
                            placeholder="Keyword (e.g. 'htn')"
                            className="w-full h-10 px-4 bg-white/50 dark:bg-black/20 border border-slate-200 dark:border-slate-800 rounded-lg text-sm transition-all focus:ring-2 focus:ring-emerald-500 outline-none font-semibold"
                        />
                    </div>
                    <div className="flex-[3] relative group min-w-0">
                        <Textarea
                            value={newDescription}
                            onChange={(e) => setNewDescription(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    handleAddKeyword();
                                }
                            }}
                            rows={1}
                            placeholder="Expansion (e.g. 'Hypertension...')"
                            className="w-full min-h-[50px] px-4 py-2 bg-white/50 dark:bg-black/20 border border-slate-200 dark:border-slate-800 rounded-lg text-sm transition-all focus:ring-2 focus:ring-emerald-500 outline-none resize-none [field-sizing:content]"
                        />
                    </div>
                    <Button
                        size="sm"
                        onClick={handleAddKeyword}
                        disabled={isAdding || !newKeyword.trim() || !newDescription.trim()}
                        className="h-10 px-6 glass-card border-emerald-200 dark:border-emerald-900 emerald-gradient hover:opacity-90 shrink-0 font-semibold"
                        title="Add Keyword"
                    >
                        {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" /> Add</>}
                    </Button>
                </div>

                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search keywords..."
                            className="w-full h-10 pl-10 pr-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none"
                        />
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSort}
                        className="h-10 gap-2 text-xs text-slate-500 hover:text-emerald-600 font-medium bg-white/50 dark:bg-slate-900/50"
                    >
                        <SortAsc className="h-4 w-4" />
                        Sort A-Z
                    </Button>
                </div>
            </div>

            <div className="glass-card rounded-lg overflow-hidden border-slate-200/50 dark:border-white/5 shadow-inner flex-1 flex flex-col">
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
                            <Loader2 className="h-6 w-6 animate-spin mb-2 text-emerald-400" />
                            <p className="text-[10px]">Loading library...</p>
                        </div>
                    ) : keywords.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-8 text-muted-foreground opacity-60">
                            <BookOpen className="h-8 w-8 mb-2 stroke-slate-300 dark:stroke-slate-700" />
                            <p className="text-[10px] text-center max-w-[150px]">Your library is empty. Add keywords to quickly expand text.</p>
                        </div>
                    ) : filteredKeywords.length === 0 ? (
                        <div className="p-8 text-center text-sm text-muted-foreground">
                            No matching keywords found.
                        </div>
                    ) : (
                        <div className="flex flex-col">
                            {/* Table Header */}
                            <div className="sticky top-0 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center gap-4 font-semibold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wide z-10">
                                <div className="w-8 flex items-center justify-center">
                                    <div
                                        onClick={toggleSelectAll}
                                        className={cn(
                                            "w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer",
                                            selectedIds.size === filteredKeywords.length && filteredKeywords.length > 0
                                                ? "bg-emerald-500 border-emerald-500 text-white"
                                                : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950"
                                        )}
                                    >
                                        {selectedIds.size === filteredKeywords.length && filteredKeywords.length > 0 && <Check className="h-3 w-3 stroke-[3]" />}
                                        {selectedIds.size > 0 && selectedIds.size < filteredKeywords.length && <div className="w-2 h-0.5 bg-slate-400 dark:bg-slate-500" />}
                                    </div>
                                </div>
                                <div className="w-1/4 min-w-[120px]">Keyword</div>
                                <div className="flex-1">Expansion</div>
                                <div className="w-24 text-right flex items-center justify-end gap-2">
                                    {selectedIds.size > 0 && (
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={handleBulkRemoveKeywords}
                                            className="h-7 px-2 text-[10px] font-bold bg-red-500 hover:bg-red-600 text-white animate-in zoom-in duration-200"
                                        >
                                            Delete ({selectedIds.size})
                                        </Button>
                                    )}
                                    <span>Actions</span>
                                </div>
                            </div>

                            {/* Table Body */}
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {filteredKeywords.map((entry) => (
                                    <div
                                        key={entry.id}
                                        onClick={() => !editingId && toggleSelectId(entry.id)}
                                        className={cn(
                                            "group px-4 py-3 transition-all cursor-pointer",
                                            editingId === entry.id
                                                ? "bg-emerald-50 dark:bg-emerald-900/30"
                                                : selectedIds.has(entry.id)
                                                    ? "bg-emerald-50/30 dark:bg-emerald-900/10"
                                                    : "hover:bg-slate-50/50 dark:hover:bg-slate-800/50"
                                        )}
                                    >
                                        {editingId === entry.id ? (
                                            <div className="flex items-start gap-4 w-full pl-8">
                                                <div className="w-1/4 min-w-[120px]">
                                                    <input
                                                        type="text"
                                                        value={editKeyword}
                                                        onChange={(e) => setEditKeyword(e.target.value)}
                                                        className="w-full h-9 bg-white dark:bg-black/40 border border-emerald-300 dark:border-emerald-700 rounded-lg px-3 text-sm outline-none font-semibold focus:ring-2 focus:ring-emerald-500"
                                                        placeholder="Keyword"
                                                        autoFocus
                                                    />
                                                </div>
                                                <div className="flex-1">
                                                    <Textarea
                                                        value={editDescription}
                                                        onChange={(e) => setEditDescription(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                                                e.preventDefault();
                                                                handleSaveEdit();
                                                            }
                                                            if (e.key === "Escape") handleCancelEdit();
                                                        }}
                                                        rows={1}
                                                        className="w-full min-h-[60px] bg-white dark:bg-black/40 border border-blue-300 dark:border-blue-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500 resize-none [field-sizing:content]"
                                                        placeholder="Expansion"
                                                    />
                                                </div>
                                                <div className="flex items-center gap-2 w-20 justify-end shrink-0 pt-1">
                                                    <Button
                                                        size="sm"
                                                        onClick={handleSaveEdit}
                                                        className="h-8 w-8 p-0 bg-green-500 hover:bg-green-600 text-white"
                                                        title="Save (Enter)"
                                                    >
                                                        <Check className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={handleCancelEdit}
                                                        className="h-8 w-8 p-0 hover:bg-slate-100 dark:hover:bg-slate-800"
                                                        title="Cancel (Esc)"
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-start gap-4">
                                                <div className="w-8 flex items-center justify-center shrink-0 pt-1">
                                                    <div
                                                        className={cn(
                                                            "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                                                            selectedIds.has(entry.id)
                                                                ? "bg-violet-500 border-violet-500 text-white"
                                                                : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950"
                                                        )}
                                                    >
                                                        {selectedIds.has(entry.id) && <Check className="h-3 w-3 stroke-[3]" />}
                                                    </div>
                                                </div>
                                                <div className="w-1/4 min-w-[120px] text-sm font-bold text-violet-600 dark:text-violet-400 break-words py-1">
                                                    {entry.keyword}
                                                </div>
                                                <div className="flex-1 text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap overflow-hidden text-ellipsis py-1 leading-relaxed">
                                                    {entry.description}
                                                </div>
                                                <div className="flex items-center gap-1 w-20 justify-end opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pt-0.5">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleStartEdit(entry)}
                                                        className="h-8 w-8 text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-blue-900/30"
                                                        title="Edit"
                                                    >
                                                        <Edit2 className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleRemoveKeyword(entry.id)}
                                                        className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center justify-between px-2 py-2 bg-slate-50/50 dark:bg-slate-900/50 rounded-lg border border-slate-200/50 dark:border-slate-800/50">
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <BookOpen className="h-3.5 w-3.5" />
                    <span><strong>{keywords.length}</strong> keyword{keywords.length !== 1 ? 's' : ''} in library</span>
                </p>
                <p className="text-xs text-muted-foreground italic">
                    {isMobile ? "Abbreviations available for copy/view" : "Type keywords in Word to auto-expand"}
                </p>
            </div>
        </div>
    );
}
