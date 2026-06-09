"use client";

import { useState, useEffect } from "react";
import {
    X, Sparkles, Monitor,
    MousePointer2, Zap, ArrowRight
} from "lucide-react";
import {
    Dialog, DialogContent,
    DialogTitle, DialogDescription
} from "./ui/dialog";
import { Button } from "./ui/button";

interface WhatsNewModalProps {
    version: string;
}

export function WhatsNewModal({ version }: WhatsNewModalProps) {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        // Check if we've shown the update for this version
        if (!version) return;
        const lastShownVersion = localStorage.getItem("last_shown_update_version");
        if (lastShownVersion !== version) {
            setIsOpen(true);
        }
    }, [version]);

    const handleClose = () => {
        localStorage.setItem("last_shown_update_version", version);
        setIsOpen(false);
    };

    const updates = [
        {
            title: "Enhanced Bubble Stability",
            description: "Complete architectural rewrite of the floating bubble for 100% responsiveness and zero latency.",
            icon: <Monitor className="h-5 w-5 text-violet-600" />,
            tag: "CORE"
        },
        {
            title: "Cross-Platform Fixes",
            description: "Resolved erratic clicking behaviors on Windows. The bubble now works flawlessly on both Mac and PC.",
            icon: <MousePointer2 className="h-5 w-5 text-violet-600" />,
            tag: "FIX"
        },
        {
            title: "Unified Interaction",
            description: "You can now Pause and Resume both Dictation and Keyword modes directly from the bubble button.",
            icon: <Zap className="h-5 w-5 text-violet-500" />,
            tag: "NEW"
        },
        {
            title: "Smart Layouts",
            description: "Improved auto-minimization ensure your workspace stays clean while you focus on patient care.",
            icon: <Sparkles className="h-5 w-5 text-violet-600" />,
            tag: "UX"
        }
    ];

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden bg-white dark:bg-slate-950 border-none rounded-3xl shadow-2xl">
                <div className="cobalt-gradient p-8 text-white relative">
                    <button
                        onClick={handleClose}
                        className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>

                    <div className="flex items-center gap-3 mb-2">
                        <div className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-[10px] font-black uppercase tracking-widest border border-white/20">
                            Update v{version}
                        </div>
                        <div className="flex -space-x-1">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="w-1.5 h-1.5 rounded-full bg-white opacity-50 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
                            ))}
                        </div>
                    </div>

                    <DialogTitle className="text-3xl font-black italic tracking-tighter uppercase">
                        What's New
                    </DialogTitle>
                    <DialogDescription className="text-white/80 font-medium text-sm mt-1">
                        We've made MediScribe faster and more reliable for your clinical workflow.
                    </DialogDescription>
                </div>

                <div className="p-6 space-y-6 max-h-[400px] overflow-y-auto custom-scrollbar">
                    {updates.map((update, index) => (
                        <div key={index} className="flex gap-4 group animate-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: `${index * 100}s` }}>
                            <div className="mt-1 shrink-0 w-10 h-10 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                                {update.icon}
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight">
                                        {update.title}
                                    </h4>
                                    <span className="text-[9px] font-black text-violet-600 bg-violet-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                                        {update.tag}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                                    {update.description}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-6 pt-0">
                    <Button
                        onClick={handleClose}
                        className="w-full h-12 rounded-2xl bg-slate-900 dark:bg-white dark:text-slate-900 hover:opacity-90 font-bold transition-all flex items-center justify-center gap-2 shadow-xl group"
                    >
                        Got it, Let's go
                        <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                    <p className="text-center text-[10px] text-slate-400 font-bold mt-4 uppercase tracking-[0.2em]">
                        MediScribe Beta • Spring 2026 Edition
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
