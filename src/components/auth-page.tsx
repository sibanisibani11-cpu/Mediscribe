"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, Mail, Lock, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface AuthPageProps {
    onLogin: (user: string) => void;
}

export function AuthPage({ onLogin }: AuthPageProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [isLogin, setIsLogin] = useState(true);
    const [showPassword, setShowPassword] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const { toast } = useToast();

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email || !password) {
            toast({
                variant: "destructive",
                title: "Validation Error",
                description: "Please enter both email and password.",
            });
            return;
        }

        setIsLoading(true);

        // Simulate API call with a promise for better async handling
        try {
            await new Promise(resolve => setTimeout(resolve, 1200));

            toast({
                title: isLogin ? "Welcome back!" : "Account created",
                description: isLogin ? "You have successfully logged in." : "Your account has been created successfully.",
            });

            onLogin(email);
        } catch (error) {
            toast({
                variant: "destructive",
                title: "Auth Error",
                description: "Something went wrong. Please try again.",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSocialLogin = async (provider: "Google" | "Apple") => {
        setIsLoading(true);

        try {
            if (provider === "Google" && (window as any).electron?.googleLogin) {
                const result = await (window as any).electron.googleLogin();
                if (result.success) {
                    toast({
                        title: `Connected with ${provider}`,
                        description: "Successfully authenticated via secure redirect.",
                    });
                    onLogin(result.user || `${provider} User`);
                } else {
                    throw new Error(result.error || "Login cancelled or failed.");
                }
            } else if (provider === "Apple" && (window as any).electron?.appleLogin) {
                const result = await (window as any).electron.appleLogin();
                if (result.success) {
                    toast({
                        title: `Connected with ${provider}`,
                        description: "Successfully authenticated via Apple Secure ID.",
                    });
                    onLogin(result.user || `${provider} User`);
                } else {
                    throw new Error("Login cancelled or failed.");
                }
            } else {
                // Fallback for simulation or Apple (if context bridge not implemented for Apple yet)
                setTimeout(() => {
                    setIsLoading(false);
                    toast({
                        title: `Connected with ${provider}`,
                        description: "Successfully authenticated.",
                    });
                    onLogin(`${provider} User`);
                }, 1500);
            }
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Authentication Failed",
                description: error.message || "The authentication window was closed or failed to connect.",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleForgotPassword = () => {
        if (!email) {
            toast({
                variant: "destructive",
                title: "Email Required",
                description: "Please enter your email address to reset your password.",
            });
            return;
        }
        toast({
            title: "Reset Link Sent",
            description: `A password reset link has been sent to ${email}`,
        });
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

                    <div className="w-full max-w-[400px] bg-slate-50/60 dark:bg-slate-950/40 backdrop-blur-xl border border-slate-100/50 dark:border-slate-800/50 shadow-2xl rounded-2xl overflow-hidden z-10 transition-all duration-300 animate-slide-up my-auto">
                        <div className="p-6 md:p-8">
                            <form onSubmit={handleAuth} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
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
                                            className="flex h-10 w-full rounded-md border border-slate-200/60 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 px-3 py-2 pl-10 text-sm placeholder:text-slate-50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all disabled:opacity-50 shadow-sm"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="password" className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
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
                                    className="w-full h-11 mt-6 cobalt-gradient hover:opacity-90 text-white font-bold transition-all shadow-lg hover:shadow-blue-500/25 disabled:opacity-70 disabled:cursor-not-allowed"
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
                                    <span className="w-full border-t border-slate-300 dark:border-slate-700" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-transparent px-2 text-slate-600 dark:text-slate-400 font-semibold backdrop-blur-sm rounded-full">
                                        Or continue with
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <Button
                                    variant="outline"
                                    type="button"
                                    disabled={isLoading}
                                    onClick={() => handleSocialLogin("Google")}
                                    className="h-11 border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 hover:bg-white/80 dark:hover:bg-slate-900 hover:text-blue-700 transition-all text-[11px] font-bold"
                                >
                                    <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
                                        <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
                                    </svg>
                                    Continue with Google
                                </Button>
                                <Button
                                    variant="outline"
                                    type="button"
                                    disabled={isLoading}
                                    onClick={() => handleSocialLogin("Apple")}
                                    className="h-11 border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 hover:bg-white/80 dark:hover:bg-slate-900 hover:text-blue-700 transition-all text-[11px] font-bold"
                                >
                                    <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="apple" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512">
                                        <path fill="currentColor" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 52.3-11.4 69.5-34.3z"></path>
                                    </svg>
                                    Continue with Apple
                                </Button>
                            </div>
                        </div>

                        <div className="p-4 bg-white/30 dark:bg-slate-900/40 border-t border-slate-200/50 dark:border-slate-700/50 text-center">
                            <p className="text-sm text-slate-700 dark:text-slate-300">
                                {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
                                <button
                                    onClick={() => setIsLogin(!isLogin)}
                                    className="text-purple-700 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 font-bold hover:underline transition-all"
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
