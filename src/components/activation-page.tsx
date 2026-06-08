"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ActivationPageProps {
    onActivated: () => void;
}

export function ActivationPage({ onActivated }: ActivationPageProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [activationKey, setActivationKey] = useState("");
    const [, setActivationID] = useState("");
    const { toast } = useToast();

    useEffect(() => {
        if (typeof window !== 'undefined' && window.electron) {
            (window.electron as any).getActivationId().then(setActivationID);
        }
    }, []);

    const handleActivate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activationKey.trim()) return;

        setIsLoading(true);
        try {
            const result = await (window.electron as any).activateApp(activationKey.trim());
            if (result.success) {
                toast({
                    title: "Success",
                    description: "MediScribe has been successfully activated on this machine.",
                });
                onActivated();
            } else {
                toast({
                    variant: "destructive",
                    title: "Activation Failed",
                    description: result.error || "Invalid key for this hardware ID.",
                });
            }
        } catch (error) {
            console.error("Activation error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div
            className="min-h-screen w-full flex items-center justify-center p-4"
            style={{
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)'
            }}
        >
            <div className="w-full max-w-md bg-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-500">
                <div className="p-8 flex flex-col items-center">
                    <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mb-6 ring-4 ring-purple-500/10">
                        <ShieldCheck className="h-8 w-8 text-purple-400" />
                    </div>

                    <h1 className="text-2xl font-bold text-white mb-8">Initialize License</h1>

                    <div className="w-full space-y-6">


                        <form onSubmit={handleActivate} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="key" className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Activation Key</Label>
                                <input
                                    id="key"
                                    type="text"
                                    value={activationKey}
                                    onChange={(e) => setActivationKey(e.target.value)}
                                    placeholder="XXXX-XXXX-XXXX-XXXX"
                                    className="w-full h-11 bg-white/10 border border-white/10 rounded-lg px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all placeholder:text-slate-600 uppercase font-mono tracking-widest"
                                    required
                                />
                            </div>

                            <Button
                                type="submit"
                                disabled={isLoading}
                                className="w-full h-11 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg shadow-lg shadow-purple-900/20 transition-all flex items-center justify-center gap-2"
                            >
                                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify Installation"}
                            </Button>
                        </form>
                    </div>

                    <div className="mt-8 pt-6 border-t border-white/5 w-full text-center">
                        <p className="text-[10px] text-slate-500">
                            Support: support@mediscribe.ai | Version 2.1.0
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
