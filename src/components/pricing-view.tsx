"use client";

import { Check, Zap, Shield, Star, Crown, ArrowRight, ArrowLeft, Loader2, Globe, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { cn, openExternalUrl } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface PricingViewProps {
  onBack: () => void;
  isActivated?: boolean | null;
}

type Currency = {
  code: string;
  symbol: string;
  monthly: number;
  yearly: number;
  label: string;
};

const CURRENCIES: Currency[] = [
  { code: "INR", symbol: "₹", monthly: 149, yearly: 1490, label: "India" },
  { code: "USD", symbol: "$", monthly: 19, yearly: 190, label: "United States" },
  { code: "EUR", symbol: "€", monthly: 19, yearly: 190, label: "Europe" },
  { code: "GBP", symbol: "£", monthly: 15, yearly: 150, label: "United Kingdom" },
];

// Promo codes: code => discount percentage (0-100)
const PROMO_CODES: Record<string, { discount: number; label: string }> = {
  "MEDI50":    { discount: 50, label: "50% Launch Discount" },
  "DOCTOR20":  { discount: 20, label: "20% Doctor Discount" },
  "WELCOME10": { discount: 10, label: "10% Welcome Offer" },
  "CLINIC30":  { discount: 30, label: "30% Clinic Discount" },
};

const RAZORPAY_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    // Already loaded
    if ((window as any).Razorpay) {
      resolve(true);
      return;
    }

    // Script already injected — wait for it
    const existing = document.querySelector(`script[src="${RAZORPAY_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(!!(window as any).Razorpay));
      existing.addEventListener('error', () => resolve(false));
      // Timeout fallback
      setTimeout(() => resolve(false), 10000);
      return;
    }

    // Inject the script fresh
    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve(!!(window as any).Razorpay);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
    // Timeout fallback for fresh load
    setTimeout(() => resolve(false), 10000);
  });
}

export function PricingView({ onBack, isActivated }: PricingViewProps) {
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [currency, setCurrency] = useState<Currency>(CURRENCIES[0]);
  const [activationId, setActivationID] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discount: number; label: string } | null>(null);
  const [promoError, setPromoError] = useState("");
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const { toast } = useToast();

  const applyPromoCode = () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) { setPromoError("Please enter a promo code."); return; }
    const promo = PROMO_CODES[code];
    if (promo) {
      setAppliedPromo({ code, ...promo });
      setPromoError("");
      toast({ title: "🎉 Promo Applied!", description: `${promo.label} has been applied.` });
    } else {
      setPromoError("Invalid promo code. Please try again.");
      setAppliedPromo(null);
    }
  };

  const removePromo = () => { setAppliedPromo(null); setPromoCode(""); setPromoError(""); };

  const getDiscountedPrice = (base: number) =>
    appliedPromo ? Math.round(base * (1 - appliedPromo.discount / 100)) : base;

  useEffect(() => {
    // Pre-load Razorpay script as soon as Pricing view mounts
    loadRazorpay();

    // Get Hardware ID for payment linking
    if (typeof window !== 'undefined' && (window as any).electron) {
        (window as any).electron.getActivationId().then(setActivationID);
        (window as any).electron.getLicenseDetails?.().then((details: any) => {
            if (details && details.billing) setCurrentPlan(details.billing);
            if (details && details.expiresAt) {
                const diff = new Date(details.expiresAt).getTime() - new Date().getTime();
                setDaysRemaining(Math.ceil(diff / (1000 * 3600 * 24)));
            }
        });
    }

    // Auto-detect currency
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone.includes('America')) {
      setCurrency(CURRENCIES.find(c => c.code === 'USD') || CURRENCIES[0]);
    } else if (timezone.includes('Europe')) {
      if (timezone.includes('London')) {
        setCurrency(CURRENCIES.find(c => c.code === 'GBP') || CURRENCIES[0]);
      } else {
        setCurrency(CURRENCIES.find(c => c.code === 'EUR') || CURRENCIES[0]);
      }
    } else if (timezone.includes('Calcutta') || timezone.includes('Asia/Kolkata')) {
      setCurrency(CURRENCIES.find(c => c.code === 'INR') || CURRENCIES[0]);
    }
  }, []);


  const handleRazorpayPayment = async (planId: string) => {
    setIsLoading(planId);
    
    try {
        // Prevent duplicate subscriptions if already activated
        if (typeof window !== 'undefined' && (window as any).electron) {
            try {
                if ((window as any).electron.getLicenseDetails) {
                    const licenseDetails = await (window as any).electron.getLicenseDetails();
                    if (licenseDetails) {
                        const currentBilling = licenseDetails.billing || 'monthly';
                        const targetBilling = planId === 'yearly' ? 'yearly' : 'monthly';
                        
                        if (currentBilling === targetBilling) {
                            if (daysRemaining !== null && daysRemaining <= 7) {
                                // Allow renewal! Proceed to Razorpay.
                            } else {
                                toast({
                                    title: "Already Subscribed",
                                    description: `You are already subscribed to the ${targetBilling} plan. You can renew when less than 7 days remain.`,
                                });
                                setIsLoading(null);
                                return;
                            }
                        }
                    } else if (isActivated) {
                        // Fallback: If getLicenseDetails returns null but isActivated is true
                        toast({
                            title: "Already Subscribed",
                            description: "You have an active subscription. Please manage it from your account.",
                        });
                        setIsLoading(null);
                        return;
                    }
                } else if (isActivated) {
                    toast({
                        title: "Already Subscribed",
                        description: "You have an active subscription.",
                    });
                    setIsLoading(null);
                    return;
                }
            } catch (e) {
                console.error("[MediScribe] Error checking license details", e);
                if (isActivated) {
                    toast({
                        title: "Already Subscribed",
                        description: "You already have an active subscription.",
                    });
                    setIsLoading(null);
                    return;
                }
            }
        } else if (isActivated) {
            toast({
                title: "Already Subscribed",
                description: "You already have an active subscription.",
            });
            setIsLoading(null);
            return;
        }

        const baseAmount = planId === 'yearly' ? currency.yearly : currency.monthly;
        const amount = getDiscountedPrice(baseAmount);

        // Dynamically load Razorpay SDK if not already present
        const razorpayReady = await loadRazorpay();
        if (!razorpayReady) {
            toast({
                variant: "destructive",
                title: "Payment Gateway Not Ready",
                description: "Could not load payment gateway. Please check your internet connection and try again.",
            });
            setIsLoading(null);
            return;
        }

        const options = {
            key: "rzp_live_SiXmXO4YoPaPyF",
            amount: amount * 100, // Amount in paise / cents
            currency: currency.code,
            name: "MediScribe Pro",
            description: `${planId === 'yearly' ? 'Annual' : 'Monthly'} Subscription`,
            image: "https://mediapp.store/logo.png",
            handler: async function (response: any) {
                // Payment captured by Razorpay — now activate the license via Electron
                console.log("[MediScribe] Razorpay payment captured:", response.razorpay_payment_id);
                
                setIsLoading('activating');
                toast({
                    title: "Payment Received!",
                    description: "Activating your Pro license...",
                });

                try {
                    const result = await (window as any).electron?.activateAfterPayment?.({
                        payment_id: response.razorpay_payment_id,
                        plan_id: planId,
                        billing: planId === 'yearly' ? 'yearly' : 'monthly',
                        currency: currency.code,
                        amount: amount,
                        activation_id: activationId,
                    });

                    if (result?.success) {
                        toast({
                            title: "🎉 Pro License Activated!",
                            description: "Welcome to MediScribe Pro. Reloading now...",
                        });
                        // Reload so the app re-checks activation status
                        setTimeout(() => window.location.reload(), 1500);
                    } else {
                        toast({
                            variant: "destructive",
                            title: "Activation Issue",
                            description: result?.error || "Payment was successful but license activation failed. Please contact support@mediapp.store with your Transaction ID: " + response.razorpay_payment_id,
                        });
                        setIsLoading(null);
                    }
                } catch (err) {
                    console.error("[MediScribe] Activation error:", err);
                    toast({
                        variant: "destructive",
                        title: "Activation Error",
                        description: `Payment successful (ID: ${response.razorpay_payment_id}). Please email support@mediapp.store to manually activate your license.`,
                    });
                    setIsLoading(null);
                }
            },
            prefill: {
                name: "Doctor",
                email: "",
            },
            notes: {
                activation_id: activationId,
                plan_id: planId,
                billing: planId === 'yearly' ? 'yearly' : 'monthly',
                app: 'MediScribe',
            },
            theme: {
                color: "#7c3aed",
            },
            modal: {
                ondismiss: function() {
                    setIsLoading(null);
                }
            }
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.open();
    } catch (error: any) {
        console.error("[MediScribe] Payment Error:", error?.message || error);
        toast({
            variant: "destructive",
            title: "Payment Failed",
            description: error?.message
                ? `Error: ${error.message}. Please try again.`
                : "Unable to open checkout. Please check your internet connection.",
        });
        setIsLoading(null);
    }
  };

  const plans = [
    {
      name: "Monthly",
      basePrice: currency.monthly,
      price: getDiscountedPrice(currency.monthly).toString(),
      originalPrice: appliedPromo ? currency.monthly.toString() : null,
      period: "/month",
      description: "Perfect for testing the waters of AI-powered medical transcription.",
      features: [
        "Unlimited Dictation Mode",
        "Full Keyword Library Expansion",
        "Secure Cloud Sync (Google Drive)",
        "Advanced Medical AI Models",
        "Email Support",
        "Offline Capabilities"
      ],
      cta: "Start Monthly",
      popular: false,
      id: "monthly"
    },
    {
      name: "Yearly",
      basePrice: currency.yearly,
      price: getDiscountedPrice(currency.yearly).toString(),
      originalPrice: appliedPromo ? currency.yearly.toString() : null,
      period: "/year",
      description: "The best value for individual practitioners and small clinics.",
      features: [
        "Everything in Monthly",
        `2 Months Free (${currency.symbol}${currency.monthly * 2} Savings)`,
        "Priority AI Processing",
        "Early Access to New Features",
        "Priority Support",
        "Custom Dictionary Backup"
      ],
      cta: "Save with Yearly",
      popular: true,
      id: "yearly"
    }
  ];

  return (
    <div className="w-full max-w-4xl flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12 relative pt-4">
      <div className="w-full flex justify-start -mb-2">
        <Button 
          variant="ghost" 
          onClick={onBack}
          className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 px-0"
        >
          <ArrowLeft className="h-4 w-4" /> Return to Dashboard
        </Button>
      </div>
      <div className="flex flex-col items-center text-center space-y-4">
        {/* Currency Switcher */}
        <div className="flex justify-center mb-2">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-all">
                <div className="px-2 flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest border-r border-slate-200 dark:border-slate-800 pr-3 mr-1">
                    <Globe className="h-3 w-3" />
                    Region
                </div>
                {CURRENCIES.map((c) => (
                    <button
                        key={c.code}
                        onClick={() => setCurrency(c)}
                        className={cn(
                            "px-3 py-1.5 rounded-lg text-[10px] font-black transition-all",
                            currency.code === c.code 
                                ? "bg-white dark:bg-slate-800 text-violet-600 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700" 
                                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                        )}
                        title={c.label}
                    >
                        {c.code} ({c.symbol})
                    </button>
                ))}
            </div>
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-600 dark:text-violet-400 text-[10px] font-black uppercase tracking-widest">
          <Star className="h-3 w-3 fill-current" />
          Pricing Plans
        </div>
        <h2 className="text-3xl md:text-5xl font-black cobalt-gradient-text uppercase italic tracking-tighter italic">
          Upgrade to MediScribe <span className="text-violet-600">Pro</span>
        </h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-lg text-sm font-medium">
          Choose the plan that fits your clinical workflow. Save more with an annual subscription.
        </p>


        {/* Promo Code Input */}
        <div className="flex flex-col items-center gap-2 mt-2">
          {appliedPromo ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
              <Tag className="h-3.5 w-3.5" />
              <span>{appliedPromo.code} — {appliedPromo.label}</span>
              <button onClick={removePromo} className="ml-1 hover:text-red-500 transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Have a promo code?"
                value={promoCode}
                onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoError(""); }}
                onKeyDown={(e) => e.key === 'Enter' && applyPromoCode()}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 w-44 transition-all"
              />
              <button
                onClick={applyPromoCode}
                className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-black transition-all"
              >
                Apply
              </button>
            </div>
          )}
          {promoError && (
            <p className="text-red-500 text-[10px] font-bold">{promoError}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={cn(
              "relative group flex flex-col p-8 rounded-3xl border transition-all duration-300",
              plan.popular 
                ? "bg-white dark:bg-slate-950 border-violet-500 shadow-2xl scale-[1.02] z-10" 
                : "bg-white/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 hover:border-violet-300 dark:hover:border-violet-900"
            )}
          >
            {plan.popular && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-violet-600 text-white text-[10px] font-black px-4 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 uppercase tracking-widest">
                <Crown className="h-3 w-3 fill-current" />
                Most Popular
              </div>
            )}

            <div className="mb-8">
              <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight italic mb-2">
                {plan.name} Plan
              </h3>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-4xl font-black text-slate-900 dark:text-white">
                  {currency.symbol}{plan.price}
                </span>
                <span className="text-slate-500 font-bold">{plan.period}</span>
              </div>
              {plan.originalPrice && (
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm line-through text-slate-400 font-medium">{currency.symbol}{plan.originalPrice}</span>
                  <span className="text-xs font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">{appliedPromo?.discount}% OFF</span>
                </div>
              )}
              <p className="text-slate-500 dark:text-slate-400 text-sm font-medium leading-relaxed">
                {plan.description}
              </p>
            </div>

            <div className="space-y-4 mb-10 flex-1">
              {plan.features.map((feature, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={cn(
                    "shrink-0 h-5 w-5 rounded-full flex items-center justify-center",
                    plan.popular ? "bg-violet-100 dark:bg-violet-900/30 text-violet-600" : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600"
                  )}>
                    <Check className="h-3 w-3 stroke-[3]" />
                  </div>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {feature}
                  </span>
                </div>
              ))}
            </div>

            <Button
              onClick={() => handleRazorpayPayment(plan.id)}
              disabled={isLoading !== null || (!((daysRemaining !== null && daysRemaining <= 7)) && currentPlan === plan.id) || (!!isActivated && !currentPlan)}
              className={cn(
                "w-full h-14 rounded-2xl font-black text-lg transition-all shadow-xl flex items-center justify-center gap-2",
                plan.popular 
                  ? "cobalt-gradient hover:opacity-90 text-white shadow-violet-500/20" 
                  : "bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 shadow-slate-500/10",
                currentPlan === plan.id && !(daysRemaining !== null && daysRemaining <= 7) ? "opacity-50 cursor-not-allowed !bg-slate-200 dark:!bg-slate-800 !text-slate-500 dark:!text-slate-400 !shadow-none !bg-none hover:opacity-50" : ""
              )}
            >
              {isLoading === 'activating' ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Activating...
                </>
              ) : isLoading === plan.id ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : currentPlan === plan.id ? (
                (daysRemaining !== null && daysRemaining <= 7) ? `Renew ${plan.name}` : "Current Plan"
              ) : (
                <>
                  {plan.cta}
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </Button>
            
            {plan.id === 'monthly' && (
              <p className="text-center mt-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Cancel anytime, no commitment
              </p>
            )}
            {plan.id === 'yearly' && (
              <p className="text-center mt-4 text-[10px] font-bold text-violet-500 uppercase tracking-widest">
                Best value for long-term use
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 p-6 rounded-3xl bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4 text-left">
          <div className="h-12 w-12 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm">
            <Shield className="h-6 w-6 text-emerald-500" />
          </div>
          <div>
            <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Enterprise solutions?</h4>
            <p className="text-[11px] text-slate-500 font-bold">Contact us for multi-user licenses and hospital-wide deployment.</p>
          </div>
        </div>
        <Button 
          variant="outline" 
          className="rounded-xl font-bold text-xs h-11 px-6 border-slate-300 dark:border-slate-700"
          onClick={() => openExternalUrl('mailto:sales@mediapp.store')}
        >
          Contact Sales
        </Button>
      </div>

      <div className="flex flex-col items-center gap-4 mt-4">
        <Button 
          variant="ghost" 
          onClick={onBack}
          className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 text-[10px] font-black uppercase tracking-[0.2em]"
        >
          ← Return to Dashboard
        </Button>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 w-full max-w-xs flex flex-col items-center gap-2">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Already Paid?</p>
            <Button
                variant="outline"
                size="sm"
                className="h-9 px-4 rounded-xl text-[10px] font-black uppercase tracking-wider border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                onClick={async () => {
                    const result = await (window as any).electron?.checkActivation?.();
                    if (result) {
                        toast({
                            title: "Pro License Active",
                            description: "Your license has been successfully verified! Enjoy MediScribe Pro.",
                        });
                        window.location.reload(); // Refresh to update all views
                    } else {
                        toast({
                            variant: "destructive",
                            title: "Wait a moment",
                            description: "License not found yet. It may take a minute to sync after payment.",
                        });
                    }
                }}
            >
                Check Payment Status
            </Button>
        </div>
      </div>
    </div>
  );
}
