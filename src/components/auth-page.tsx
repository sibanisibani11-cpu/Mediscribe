"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Eye, EyeOff, Loader2, Mail, Lock } from "lucide-react";
import { useToast } from "../hooks/use-toast";
import { auth, isFirebaseConfigured } from "../lib/firebase";
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    GoogleAuthProvider, 
    signInWithCredential, signInWithPopup, sendPasswordResetEmail
} from "firebase/auth";


interface AuthPageProps {
    onLogin: (user: string, uid?: string) => void;
}

export function AuthPage({ onLogin }: AuthPageProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [isLogin, setIsLogin] = useState(true);
    const [showPassword, setShowPassword] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const { toast } = useToast();

    const requireAuth = () => {
        if (!isFirebaseConfigured || !auth) throw new Error('Sign-in is unavailable. Please contact support@mediapp.store.');
        return auth;
    };
    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault(); setIsLoading(true);
        try {
            const provider = requireAuth();
            const credential = await (isLogin ? signInWithEmailAndPassword : createUserWithEmailAndPassword)(provider, email.trim(), password);
            onLogin(credential.user.email || email.trim(), credential.user.uid);
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Authentication Failed', description: error.code?.includes('credential') ? 'Invalid email or password.' : error.message });
        } finally { setIsLoading(false); }
    };
    const handleSocialLogin = async (_provider: 'Google') => {
        setIsLoading(true);
        try {
            const provider = requireAuth();
            let credential;
            if ((window as any).electron?.googleLogin) {
                const result = await (window as any).electron.googleLogin();
                if (!result.success || !result.idToken) throw new Error('Google sign-in did not complete.');
                credential = await signInWithCredential(provider, GoogleAuthProvider.credential(result.idToken));
            } else {
                credential = await signInWithPopup(provider, new GoogleAuthProvider());
            }
            onLogin(credential.user.email || '', credential.user.uid);
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Authentication Failed', description: error.message });
        } finally { setIsLoading(false); }
    };
    const handleForgotPassword = async () => {
        if (!email.trim()) { toast({ variant: 'destructive', title: 'Email Required', description: 'Enter your email address first.' }); return; }
        setIsLoading(true);
        try {
            await sendPasswordResetEmail(requireAuth(), email.trim());
            toast({ title: 'Reset Requested', description: 'If this address has an account, you will receive a password reset email.' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Reset Failed', description: error.message || 'Please try again.' });
        } finally { setIsLoading(false); }
    };

    return (
        <div
            className="h-screen w-full relative overflow-hidden transition-all duration-500 font-sans"
            style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 25%, #312e81 50%, #1e1b4b 75%, #0f172a 100%)'
            }}
        >
            {/* Animated background particles - Fixed position */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {[...Array(20)].map((_, i) => (
                    <div
                        key={i}
                        className="absolute rounded-full bg-white/40 animate-pulse"
                        style={{
                            width: Math.random() * 100 + 20 + 'px',
                            height: Math.random() * 100 + 20 + 'px',
                            left: Math.random() * 100 + '%',
                            top: Math.random() * 100 + '%',
                            animationDelay: Math.random() * 3 + 's',
                            animationDuration: (Math.random() * 3 + 2) + 's'
                        }}
                    />
                ))}
            </div>

            {/* Scrollable Content Wrapper */}
            <div className="absolute inset-0 overflow-y-auto">
                <div className="min-h-full flex flex-col items-center justify-center p-4">
                    <h1 className="text-4xl font-bold text-white mb-8 drop-shadow-md animate-slide-up">
                        MediScribe
                    </h1>

                    <div className="w-full max-w-[400px] bg-slate-950/90 dark:bg-slate-950/95 backdrop-blur-2xl border border-slate-800/70 shadow-2xl rounded-3xl overflow-hidden z-10 transition-all duration-300 animate-slide-up my-auto">
                        {/* 7-Day Free Trial Callout */}
                        <div className="bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 p-3 text-center text-white border-b border-violet-400/20">
                            <div className="flex items-center justify-center gap-1.5 text-xs font-black tracking-wide">
                                <span>✨</span>
                                <span>Includes 7-Day Free Trial</span>
                            </div>
                            <div className="text-[10px] text-violet-100/90 font-medium">
                                Full Pro AI transcription • No credit card required
                            </div>
                        </div>

                        <div className="p-6 md:p-8">
                            <form onSubmit={handleAuth} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-slate-300">
                                        Email Address
                                    </Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                        <input
                                            id="email"
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="doctor@example.com"
                                            className="flex h-10 w-full rounded-md border border-slate-200/60 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 px-3 py-2 pl-10 text-sm placeholder:text-slate-50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all disabled:opacity-50 shadow-sm"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="password" className="text-xs font-bold uppercase tracking-wider text-slate-300">
                                            Password
                                        </Label>
                                        {isLogin && (
                                            <button
                                                type="button"
                                                onClick={handleForgotPassword}
                                                className="text-xs text-purple-700 dark:text-purple-400 hover:text-purple-600 hover:underline font-bold"
                                            >
                                                Forgot password?
                                            </button>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                        <input
                                            id="password"
                                            type={showPassword ? "text" : "password"}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="flex h-10 w-full rounded-md border border-slate-200/60 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 px-3 py-2 pl-10 pr-10 text-sm placeholder:text-slate-50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all disabled:opacity-50 shadow-sm"
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                                        >
                                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    className="w-full h-11 mt-6 cobalt-gradient hover:opacity-90 text-white font-bold transition-all shadow-lg hover:shadow-violet-500/25 disabled:opacity-70 disabled:cursor-not-allowed"
                                    disabled={isLoading}
                                >
                                    {isLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : null}
                                    {isLogin ? "Sign In" : "Create Account"}
                                </Button>
                            </form>

                            <div className="relative my-6">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t border-slate-700/70" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-slate-950/90 px-3 py-1 text-slate-200 font-semibold rounded-full shadow-sm shadow-slate-950/40">
                                        Or continue with
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                <Button
                                    variant="outline"
                                    type="button"
                                    disabled={isLoading}
                                    onClick={() => handleSocialLogin("Google")}
                                    className="h-11 flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950/95 text-white hover:bg-slate-800 transition-all text-[11px] font-bold shadow-lg shadow-slate-950/20"
                                >
                                    <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
                                        <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
                                    </svg>
                                    Continue with Google
                                </Button>
                            </div>
                        </div>

                        <div className="p-4 bg-slate-900/80 border-t border-slate-800/70 text-center">
                            <p className="text-sm text-slate-300">
                                {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
                                <button
                                    onClick={() => setIsLogin(!isLogin)}
                                    className="text-violet-300 hover:text-violet-100 font-bold hover:underline transition-all"
                                >
                                    {isLogin ? "Sign up" : "Log in"}
                                </button>
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Custom animations styles - Same as Splash Screen */}
            <style jsx>{`
                @keyframes slide-up {
                from { opacity: 0; transform: translateY(40px); }
                to { opacity: 1; transform: translateY(0); }
                }
                
                .animate-slide-up {
                animation: slide-up 0.8s ease-out forwards;
                }
            `}</style>
        </div>
    );
}
