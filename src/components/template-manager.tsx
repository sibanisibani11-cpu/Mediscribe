"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import {
  Plus, Trash2, Edit3, Check, X, FileText, Search,
  Tag, ChevronDown, Upload, FolderOpen, FileIcon, Type
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Template {
  id: string;
  name: string;
  category: string;
  type: "file" | "text";
  content?: string;       // for text templates
  filePath?: string;      // for file templates
  originalFilename?: string;
  ext?: string;           // e.g. DOCX, TXT, PDF
  createdAt: number;
  updatedAt: number;
}

const DEFAULT_CATEGORIES = [
  "General", "OPD Note", "Discharge Summary", "Prescription",
  "Radiology", "Lab Report", "Referral Letter", "Certificate", "Surgery Note",
];

const STORAGE_KEY = "mediscribe_templates";

function loadLocalTemplates(): Template[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveLocalTemplates(t: Template[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
}
function generateId() {
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const EXT_COLORS: Record<string, string> = {
  DOCX: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  DOC:  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  TXT:  "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  PDF:  "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300",
  RTF:  "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300",
  ODT:  "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

interface TemplateManagerProps {
  onBack: () => void;
  embedded?: boolean;
}

export function TemplateManager({ onBack, embedded = false }: TemplateManagerProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [editing, setEditing] = useState<Template | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  // Draft state
  const [draftName, setDraftName] = useState("");
  const [draftCategory, setDraftCategory] = useState("General");
  const [draftContent, setDraftContent] = useState("");
  const [draftType, setDraftType] = useState<"file" | "text">("file");
  const [draftFilePath, setDraftFilePath] = useState<string | undefined>(undefined);
  const [draftExt, setDraftExt] = useState<string | undefined>(undefined);
  const [draftOriginalFilename, setDraftOriginalFilename] = useState<string | undefined>(undefined);
  const [showCatDropdown, setShowCatDropdown] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const electron = useMemo(() => typeof window !== "undefined" ? (window as any).electron : null, []);

  useEffect(() => {
    if (electron?.getTemplates) {
      electron.getTemplates().then((tpls: Template[]) => {
        setTemplates(tpls?.length ? tpls : loadLocalTemplates());
      }).catch(() => setTemplates(loadLocalTemplates()));
    } else {
      setTemplates(loadLocalTemplates());
    }
  }, [electron]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowCatDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const persist = async (next: Template[]) => {
    setTemplates(next);
    saveLocalTemplates(next);
  };

  const resetDraft = () => {
    setDraftName(""); setDraftCategory("General"); setDraftContent("");
    setDraftType("file"); setDraftFilePath(undefined); setDraftExt(undefined);
    setDraftOriginalFilename(undefined);
  };

  const openCreate = () => { resetDraft(); setEditing(null); setIsCreating(true); };

  const openEdit = (t: Template) => {
    setIsCreating(false);
    setEditing(t);
    setDraftName(t.name);
    setDraftCategory(t.category);
    setDraftType(t.type || "file");
    setDraftContent(t.content || "");
    setDraftFilePath(t.filePath);
    setDraftExt(t.ext);
    setDraftOriginalFilename(t.originalFilename);
  };

  const closeEditor = () => { setEditing(null); setIsCreating(false); };

  // ── Import file via native <input type="file"> ──
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = ""; // reset so same file can be picked again
    if (!file) return;

    setIsImporting(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const originalName = file.name.replace(/\.[^.]+$/, "");

      if (electron?.saveTemplateFile) {
        // Electron: read as ArrayBuffer and send to main process to write to disk
        const buffer = await file.arrayBuffer();
        const res = await electron.saveTemplateFile({ buffer, originalName, ext });
        if (!res.success) throw new Error(res.error);
        setDraftFilePath(res.savedPath);
        setDraftExt(res.ext);
        setDraftOriginalFilename(originalName);
      } else {
        // Web fallback: store as base64 in state (no disk persistence)
        setDraftFilePath(`__web__:${file.name}`);
        setDraftExt(ext.toUpperCase());
        setDraftOriginalFilename(originalName);
      }

      setDraftType("file");
      if (!draftName) setDraftName(originalName);
      toast({ title: "File ready", description: `${file.name} — give it a name and save.` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Upload failed", description: err.message });
    } finally {
      setIsImporting(false);
    }
  };

  // ── Save template ──
  const handleSave = async () => {
    if (!draftName.trim()) {
      toast({ variant: "destructive", title: "Name required", description: "Give this template a name." });
      return;
    }
    if (draftType === "file" && !draftFilePath) {
      toast({ variant: "destructive", title: "No file", description: "Please import a file first." });
      return;
    }
    if (draftType === "text" && !draftContent.trim()) {
      toast({ variant: "destructive", title: "Content required", description: "Template body cannot be empty." });
      return;
    }

    const now = Date.now();
    const payload = {
      name: draftName.trim(),
      category: draftCategory,
      type: draftType,
      content: draftType === "text" ? draftContent.trim() : "",
      filePath: draftFilePath,
      ext: draftExt,
      originalFilename: draftOriginalFilename,
    };

    if (isCreating) {
      if (electron?.addTemplate) {
        const res = await electron.addTemplate(payload);
        if (res.success) { setTemplates(res.templates); saveLocalTemplates(res.templates); }
      } else {
        await persist([{ id: generateId(), ...payload, createdAt: now, updatedAt: now }, ...templates]);
      }
      toast({ title: "Template saved", description: `"${payload.name}" saved as ${draftType === "file" ? draftExt + " template" : "text template"}.` });
    } else if (editing) {
      if (electron?.updateTemplate) {
        const res = await electron.updateTemplate({ id: editing.id, ...payload });
        if (res.success) { setTemplates(res.templates); saveLocalTemplates(res.templates); }
      } else {
        await persist(templates.map(t => t.id === editing.id ? { ...t, ...payload, updatedAt: now } : t));
      }
      toast({ title: "Template updated" });
    }
    closeEditor();
  };

  // ── Delete ──
  const handleDelete = async (id: string) => {
    const tpl = templates.find(t => t.id === id);
    if (electron?.removeTemplate) {
      const res = await electron.removeTemplate(id);
      if (res.success) { setTemplates(res.templates); saveLocalTemplates(res.templates); }
      // Also delete the file from disk
      if (tpl?.filePath && electron?.deleteTemplateFile) {
        await electron.deleteTemplateFile(tpl.filePath);
      }
    } else {
      await persist(templates.filter(t => t.id !== id));
    }
    setDeletingId(null);
    toast({ title: "Template deleted" });
  };

  const allCategories = ["All", ...Array.from(new Set([...DEFAULT_CATEGORIES, ...templates.map(t => t.category)]))];
  const filtered = templates.filter(t => {
    const matchCat = selectedCategory === "All" || t.category === selectedCategory;
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });
  const isEditorOpen = isCreating || !!editing;

  return (
    <div className="w-full flex flex-col gap-4 h-full">

      {/* Header */}
      {!embedded ? (
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FileText className="h-4 w-4 text-violet-600" /> Report Templates
          </h2>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={openCreate}
              className="h-7 px-3 text-[11px] font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-xl gap-1.5 shadow-sm">
              <Plus className="h-3 w-3" /> New Template
            </Button>
            <Button variant="ghost" size="sm" onClick={onBack}
              className="text-[10px] h-7 px-2 hover:bg-slate-100 dark:hover:bg-slate-800">← Back</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-end px-1">
          <Button size="sm" onClick={openCreate}
            className="h-7 px-3 text-[11px] font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-xl gap-1.5 shadow-sm">
            <Plus className="h-3 w-3" /> New Template
          </Button>
        </div>
      )}

      <div className="flex gap-4 flex-1 min-h-0">

        {/* Left: list */}
        <div className={cn("flex flex-col gap-3 transition-all duration-300", isEditorOpen ? "w-[42%]" : "w-full")}>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates…"
              className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition" />
          </div>

          {/* Category pills */}
          <div className="flex gap-1.5 flex-wrap">
            {allCategories.map(cat => (
              <button key={cat} onClick={() => setSelectedCategory(cat)}
                className={cn("text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors",
                  selectedCategory === cat
                    ? "bg-violet-600 border-violet-600 text-white"
                    : "bg-transparent border-slate-200 dark:border-slate-700 text-slate-500 hover:border-violet-400"
                )}>
                {cat}
              </button>
            ))}
          </div>

          {/* Template list */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <FolderOpen className="h-7 w-7 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-500">No templates yet</p>
                <p className="text-xs text-slate-400 max-w-[200px]">
                  Click <strong>New Template</strong> and import a .docx, .txt, or any file.
                </p>
              </div>
            ) : (
              filtered.map(t => (
                <div key={t.id} onClick={() => openEdit(t)}
                  className={cn(
                    "group relative flex flex-col gap-1.5 p-3.5 rounded-xl border cursor-pointer transition-all",
                    editing?.id === t.id
                      ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20"
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-violet-400 hover:shadow-sm"
                  )}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {t.type === "file" ? (
                        <FileIcon className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                      ) : (
                        <Type className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      )}
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{t.name}</p>
                      {t.ext && (
                        <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0", EXT_COLORS[t.ext] || "bg-slate-100 text-slate-500")}>
                          {t.ext}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
                      {deletingId === t.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleDelete(t.id)}
                            className="h-6 w-6 flex items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30 text-red-500 hover:bg-red-200 transition-colors" title="Confirm delete">
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setDeletingId(null)}
                            className="h-6 w-6 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setDeletingId(t.id)}
                          className="h-6 w-6 flex items-center justify-center rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-600 dark:text-violet-400">
                      <Tag className="h-2.5 w-2.5" />{t.category}
                    </span>
                    {t.type === "file" && t.originalFilename && (
                      <span className="text-[10px] text-slate-400 truncate">{t.originalFilename}</span>
                    )}
                    {t.type === "text" && t.content && (
                      <span className="text-[10px] text-slate-400 truncate">{t.content.slice(0, 60)}…</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Editor panel */}
        {isEditorOpen && (
          <div className="flex-1 flex flex-col gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 animate-in fade-in slide-in-from-right-4 duration-200 min-h-0 overflow-y-auto">

            {/* Editor header */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Edit3 className="h-3.5 w-3.5 text-violet-600" />
                {isCreating ? "New Template" : "Edit Template"}
              </h3>
              <button onClick={closeEditor}
                className="h-6 w-6 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Type switcher */}
            <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <button onClick={() => setDraftType("file")}
                className={cn("flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-colors",
                  draftType === "file" ? "bg-white dark:bg-slate-700 text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                <FolderOpen className="h-3 w-3" /> Import File
              </button>
              <button onClick={() => setDraftType("text")}
                className={cn("flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-colors",
                  draftType === "text" ? "bg-white dark:bg-slate-700 text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                <Type className="h-3 w-3" /> Type Text
              </button>
            </div>

            {/* File import area */}
            {draftType === "file" && (
              <div className="flex flex-col gap-2">
                {/* Hidden native file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx,.doc,.txt,.rtf,.pdf,.odt,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {draftFilePath ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20">
                    <div className={cn("text-[10px] font-black px-2 py-1 rounded-lg shrink-0", EXT_COLORS[draftExt || ""] || "bg-slate-100 text-slate-500")}>
                      {draftExt || "FILE"}
                    </div>
                    <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 truncate flex-1">
                      {draftOriginalFilename}
                    </p>
                    <button
                      onClick={() => { setDraftFilePath(undefined); setDraftExt(undefined); setDraftOriginalFilename(undefined); }}
                      className="h-5 w-5 flex items-center justify-center rounded text-emerald-600 hover:text-red-500 transition-colors shrink-0">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isImporting}
                    className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/10 transition-all cursor-pointer group w-full">
                    <div className="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Upload className="h-5 w-5 text-violet-600" />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        {isImporting ? "Saving…" : "Click to upload file"}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">.docx · .doc · .txt · .pdf · .rtf · .odt</p>
                    </div>
                  </button>
                )}
              </div>
            )}

            {/* Text content */}
            {draftType === "text" && (
              <div className="flex flex-col gap-1 flex-1 min-h-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Template Body</label>
                <textarea value={draftContent} onChange={e => setDraftContent(e.target.value)}
                  placeholder={"Patient Name: [NAME]\nAge: [AGE] | Sex: [SEX]\nComplaint: [COMPLAINT]\n\nExamination: ...\nDiagnosis: ...\nPlan: ..."}
                  className="flex-1 min-h-[140px] px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none transition font-mono leading-relaxed" />
              </div>
            )}

            {/* Template Name */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Template Name <span className="text-violet-500">(first 3 letters trigger expansion)</span>
              </label>
              <input value={draftName} onChange={e => setDraftName(e.target.value)}
                placeholder="e.g. Normal Thyroid Scan"
                className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition" />
              {draftName.length >= 3 && (
                <p className="text-[10px] text-violet-500 font-semibold">
                  Trigger: type "<strong>{draftName.slice(0, 3).toLowerCase()}</strong>" + Tab
                </p>
              )}
            </div>

            {/* Category */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Category</label>
              <div className="relative" ref={dropdownRef}>
                <button onClick={() => setShowCatDropdown(v => !v)}
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition">
                  <span className="flex items-center gap-2"><Tag className="h-3 w-3 text-violet-500" />{draftCategory}</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", showCatDropdown && "rotate-180")} />
                </button>
                {showCatDropdown && (
                  <div className="absolute z-50 top-full mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                    <div className="max-h-44 overflow-y-auto p-1">
                      {DEFAULT_CATEGORIES.map(cat => (
                        <button key={cat} onClick={() => { setDraftCategory(cat); setShowCatDropdown(false); }}
                          className={cn("w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
                            draftCategory === cat ? "bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300" : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                          )}>{cat}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <Button onClick={handleSave}
                className="flex-1 h-9 text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-xl shadow-sm">
                <Check className="h-3.5 w-3.5 mr-1.5" />
                {isCreating ? "Save Template" : "Update Template"}
              </Button>
              <Button variant="ghost" onClick={closeEditor}
                className="h-9 px-4 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-xl">
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
