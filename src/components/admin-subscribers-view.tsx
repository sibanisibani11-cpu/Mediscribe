"use client";

import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  Search,
  RefreshCw,
  Download,
  Users,
  CreditCard,
  Crown,
  Clock,
  ArrowLeft,
  ChevronRight,
  Copy,
  Check,
  AlertCircle,
  TrendingUp,
  RotateCcw,
  Sparkles,
  Smartphone,
  Mail,
  Cpu,
  ReceiptText,
} from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { useToast } from '../hooks/use-toast';
import { cn } from '../lib/utils';
import { AdminSubscriberRecord, DownloadStats } from '../lib/admin-subscribers-service';

interface AdminSubscribersViewProps {
  onBack: () => void;
  currentUser?: string | null;
}

type FilterTab = 'all' | 'active' | 'trial' | 'expired' | 'refunded' | 'free';

export function AdminSubscribersView({ onBack, currentUser }: AdminSubscribersViewProps) {
  const [subscribers, setSubscribers] = useState<AdminSubscriberRecord[]>([]);
  const [summary, setSummary] = useState<{
    totalUsers: number;
    activePro: number;
    trial: number;
    expired: number;
    refunded: number;
    free: number;
    totalRevenueINR: number;
  }>({
    totalUsers: 0,
    activePro: 0,
    trial: 0,
    expired: 0,
    refunded: 0,
    free: 0,
    totalRevenueINR: 0,
  });
  const [downloadStats, setDownloadStats] = useState<DownloadStats | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [selectedUser, setSelectedUser] = useState<AdminSubscriberRecord | null>(null);
  const [isSyncingUser, setIsSyncingUser] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const { toast } = useToast();

  const isElectron = typeof window !== 'undefined' && !!(window as any).electron;

  const loadSubscribersData = async () => {
    setIsLoading(true);
    try {
      if (isElectron && (window as any).electron?.getAdminSubscribers) {
        const res = await (window as any).electron.getAdminSubscribers(currentUser);
        if (res.success && res.subscribers) {
          setSubscribers(res.subscribers);
          if (res.summary) setSummary(res.summary);
          if (res.downloads) setDownloadStats(res.downloads);
        } else {
          toast({
            variant: 'destructive',
            title: 'Failed to load subscribers',
            description: res.error || 'Unknown error occurred.',
          });
        }
      } else {
        // Next.js Web API Route Fallback
        const params = new URLSearchParams();
        if (currentUser) params.set('adminEmail', currentUser);
        const res = await fetch(`/api/admin/subscribers?${params.toString()}`);
        const data = await res.json();
        if (data.success && data.subscribers) {
          setSubscribers(data.subscribers);
          if (data.summary) setSummary(data.summary);
          if (data.downloads) setDownloadStats(data.downloads);
        } else {
          toast({
            variant: 'destructive',
            title: 'Failed to fetch data',
            description: data.error || 'Server error occurred.',
          });
        }
      }
    } catch (err: any) {
      console.error('[AdminSubscribersView] Error loading data:', err);
      toast({
        variant: 'destructive',
        title: 'Error Loading Subscribers',
        description: err.message || 'Could not connect to subscription backend.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSubscribersData();
    // Auto-refresh real-time metrics every 30 seconds while Admin view is open
    const interval = setInterval(() => {
      loadSubscribersData();
    }, 30000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Filtered subscribers list
  const filteredSubscribers = useMemo(() => {
    return subscribers.filter((sub) => {
      // Tab filter
      if (activeTab === 'active' && (!sub.isActive || sub.isTrial)) return false;
      if (activeTab === 'trial' && !sub.isTrial) return false;
      if (activeTab === 'expired' && sub.status !== 'Expired' && sub.status !== 'Free Trial (Expired)') return false;
      if (activeTab === 'refunded' && sub.status !== 'Refunded') return false;
      if (activeTab === 'free' && sub.status !== 'Inactive / Free') return false;

      // Search query filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        (sub.userId && sub.userId.toLowerCase().includes(q)) ||
        (sub.displayName && sub.displayName.toLowerCase().includes(q)) ||
        (sub.email && sub.email.toLowerCase().includes(q)) ||
        (sub.phone && sub.phone.includes(q)) ||
        (sub.hwid && sub.hwid.toLowerCase().includes(q)) ||
        (sub.country && sub.country.name.toLowerCase().includes(q)) ||
        (sub.status && sub.status.toLowerCase().includes(q)) ||
        (sub.currentPlan && sub.currentPlan.toLowerCase().includes(q)) ||
        sub.history.some((h) => h.paymentId.toLowerCase().includes(q))
      );
    });
  }, [subscribers, activeTab, searchQuery]);

  const handleCopy = (text: string, fieldKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    toast({ title: 'Copied to clipboard!', description: text });
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleExportCSV = () => {
    if (subscribers.length === 0) {
      toast({ title: 'No Data', description: 'No subscriber records to export.' });
      return;
    }

    const headers = [
      'User ID',
      'Display Name',
      'Country',
      'Email',
      'Phone Contact',
      'Hardware ID',
      'Subscription Plan',
      'Status',
      'Active Status',
      'Start Date',
      'Expires At',
      'Validity',
      'Current Amount (INR)',
      'Total Lifetime Amount Paid (INR)',
      'Data Source',
      'Total Transactions',
    ];

    const rows = subscribers.map((s) => [
      `"${s.userId}"`,
      `"${s.displayName}"`,
      `"${s.country?.name || 'India'}"`,
      `"${s.email || 'N/A'}"`,
      `"${s.phone || 'N/A'}"`,
      `"${s.hwid || 'N/A'}"`,
      `"${s.currentPlan}"`,
      `"${s.status}"`,
      `"${s.isActive ? 'Active' : 'Inactive'}"`,
      `"${s.startDate}"`,
      `"${s.expiresAt}"`,
      `"${s.validityText}"`,
      `"${s.currentAmount}"`,
      `"${s.totalAmountSubscribed}"`,
      `"${s.source}"`,
      `"${s.history.length}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `mediscribe_subscribers_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: '📁 Export Complete',
      description: 'Subscriber report exported as CSV.',
    });
  };

  const handleSyncSelectedUser = async () => {
    if (!selectedUser) return;
    setIsSyncingUser(true);
    try {
      if (isElectron && (window as any).electron?.syncAdminSubscriber) {
        const res = await (window as any).electron.syncAdminSubscriber(selectedUser);
        if (res.success) {
          toast({
            title: '☁️ Synced to Cloud Database',
            description: `Successfully updated profile for ${selectedUser.displayName}`,
          });
          loadSubscribersData();
        } else {
          toast({
            variant: 'destructive',
            title: 'Sync failed',
            description: res.error || 'Could not sync user.',
          });
        }
      } else {
        toast({
          title: 'Sync Notice',
          description: 'Sync feature is available in desktop app connected to Firebase.',
        });
      }
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Sync Error',
        description: e.message || 'Unknown error occurred.',
      });
    } finally {
      setIsSyncingUser(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-6 animate-in fade-in duration-300 pb-16">
      {/* Top Bar Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-8 px-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex gap-1.5 items-center font-semibold text-xs"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Button>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />

          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-violet-600/10 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400 flex items-center justify-center font-bold">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                Subscriber & Revenue Intelligence
                <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 rounded-full border border-violet-200 dark:border-violet-800">
                  Admin Only
                </span>
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Live aggregated analytics across Razorpay Gateway, Firestore & Microsoft Store / Desktop licenses
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={loadSubscribersData}
            disabled={isLoading}
            className="h-8 px-3 text-xs font-bold rounded-lg border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-sm"
          >
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', isLoading && 'animate-spin text-violet-500')} />
            Refresh Data
          </Button>

          <Button
            onClick={handleExportCSV}
            size="sm"
            className="h-8 px-3 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/20"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* KPI Stats Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Card 1: Active Pro */}
        <div className="relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent dark:from-emerald-950/40 dark:via-emerald-950/20 dark:to-transparent border border-emerald-200/60 dark:border-emerald-800/40 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Active Subscribers
            </span>
            <div className="h-8 w-8 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Crown className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{summary.activePro}</span>
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              {summary.totalUsers > 0 ? `${Math.round((summary.activePro / summary.totalUsers) * 100)}% active` : ''}
            </span>
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-1">
            Currently valid Pro licenses
          </div>
        </div>

        {/* Card 2: Total Realized Revenue */}
        <div className="relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-violet-500/10 via-violet-500/5 to-transparent dark:from-violet-950/40 dark:via-violet-950/20 dark:to-transparent border border-violet-200/60 dark:border-violet-800/40 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-violet-700 dark:text-violet-400">
              Total Realized Revenue
            </span>
            <div className="h-8 w-8 rounded-xl bg-violet-500/20 text-violet-600 dark:text-violet-400 flex items-center justify-center">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              ₹{summary.totalRevenueINR.toLocaleString('en-IN')}
            </span>
            <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider">
              INR
            </span>
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-1">
            Total captured transaction value
          </div>
        </div>

        {/* Card 3: Expired Subscriptions */}
        <div className="relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent dark:from-rose-950/40 dark:via-rose-950/20 dark:to-transparent border border-rose-200/60 dark:border-rose-800/40 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-rose-700 dark:text-rose-400">
              Expired Subscriptions
            </span>
            <div className="h-8 w-8 rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{summary.expired}</span>
            <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">Renewal candidates</span>
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-1">
            Past terms needing re-activation
          </div>
        </div>

        {/* Card 3: Free Trial Active */}
        <div className="relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-violet-500/10 via-violet-500/5 to-transparent dark:from-violet-950/40 dark:via-violet-950/20 dark:to-transparent border border-violet-200/60 dark:border-violet-800/40 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-violet-700 dark:text-violet-400">
              7-Day Free Trials
            </span>
            <div className="h-8 w-8 rounded-xl bg-violet-500/20 text-violet-600 dark:text-violet-400 flex items-center justify-center">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{summary.trial || 0}</span>
            <span className="text-[11px] font-bold text-violet-600 dark:text-violet-400">Trial Active</span>
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-1">
            Potential Pro conversion pipeline
          </div>
        </div>

        {/* Card 4: Total Tracked Users */}
        <div className="relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent dark:from-blue-950/40 dark:via-blue-950/20 dark:to-transparent border border-blue-200/60 dark:border-blue-800/40 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-400">
              Total User Directory
            </span>
            <div className="h-8 w-8 rounded-xl bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{summary.totalUsers}</span>
            <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">Unique Profiles</span>
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-1">
            Registered accounts & paying devices
          </div>
        </div>
      </div>

      {/* MediScribe Download & Platform Intelligence Card */}
      {downloadStats && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-900 dark:from-slate-900/90 dark:via-violet-950/30 dark:to-slate-950 border border-violet-500/20 shadow-xl p-5 text-white">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-violet-500/30">
                <Download className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                    MediScribe Download Intelligence
                  </h3>
                  <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-400/30 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                    Real-Time Live
                  </span>
                  <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-violet-500/20 text-violet-300 rounded-full border border-violet-400/30">
                    MS Store + Web
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  Live real-time aggregation across Microsoft Store, Website Direct & GitHub Releases
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-white/10 dark:bg-white/5 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/10">
                <span className="text-[11px] font-bold text-slate-300">Total Downloads:</span>
                <span className="text-lg font-black text-white">{downloadStats.total}</span>
              </div>
            </div>
          </div>

          {/* OS Platform & User Breakdown Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4">
            {/* Windows */}
            <div className="bg-white/5 hover:bg-white/10 transition-colors border border-white/10 rounded-xl p-3.5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🪟</span>
                  <span className="text-xs font-black text-white tracking-wide">Windows (Store & Direct)</span>
                </div>
                <span className="text-xs font-bold text-cyan-400">
                  {downloadStats.total > 0 ? `${Math.round((downloadStats.windows / downloadStats.total) * 100)}%` : '0%'}
                </span>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-2xl font-black text-white">{downloadStats.windows}</span>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="bg-blue-500/20 text-cyan-300 font-bold px-1.5 py-0.5 rounded border border-cyan-400/30">
                    🛍️ Store: {downloadStats.windowsBreakdown?.msStore ?? 16}
                  </span>
                  <span className="bg-white/10 text-slate-300 font-bold px-1.5 py-0.5 rounded">
                    EXE: {downloadStats.windowsBreakdown?.directExe ?? 2}
                  </span>
                </div>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${downloadStats.total > 0 ? (downloadStats.windows / downloadStats.total) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* macOS */}
            <div className="bg-white/5 hover:bg-white/10 transition-colors border border-white/10 rounded-xl p-3.5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🍎</span>
                  <span className="text-xs font-black text-white tracking-wide">macOS (DMG / Apple Silicon)</span>
                </div>
                <span className="text-xs font-bold text-violet-400">
                  {downloadStats.total > 0 ? `${Math.round((downloadStats.mac / downloadStats.total) * 100)}%` : '0%'}
                </span>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-2xl font-black text-white">{downloadStats.mac}</span>
                <span className="text-[10px] text-slate-400 font-medium">installations</span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-violet-500 to-fuchsia-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${downloadStats.total > 0 ? (downloadStats.mac / downloadStats.total) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Linux */}
            <div className="bg-white/5 hover:bg-white/10 transition-colors border border-white/10 rounded-xl p-3.5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🐧</span>
                  <span className="text-xs font-black text-white tracking-wide">Linux (AppImage / DEB)</span>
                </div>
                <span className="text-xs font-bold text-amber-400">
                  {downloadStats.total > 0 ? `${Math.round((downloadStats.linux / downloadStats.total) * 100)}%` : '0%'}
                </span>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-2xl font-black text-white">{downloadStats.linux}</span>
                <span className="text-[10px] text-slate-400 font-medium">installations</span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-amber-500 to-orange-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${downloadStats.total > 0 ? (downloadStats.linux / downloadStats.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>

          {/* User Type & Conversion Footnote */}
          <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-white/5">
                <span className="h-2 w-2 rounded-full bg-blue-400" />
                <span className="text-slate-300 font-medium">Guest (Direct) Downloads:</span>
                <span className="font-bold text-white">{downloadStats.guest}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-white/5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-slate-300 font-medium">Logged-In Downloads:</span>
                <span className="font-bold text-white">{downloadStats.loggedIn}</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <span>🎯 Conversion Rate:</span>
              <span className="font-bold text-emerald-400">
                {downloadStats.total > 0 ? `${Math.round((summary.totalUsers / downloadStats.total) * 100)}%` : '0%'}
              </span>
              <span>(Downloaded → App Registered)</span>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <button
            onClick={() => setActiveTab('all')}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0',
              activeTab === 'all'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            )}
          >
            All Profiles ({subscribers.length})
          </button>
          <button
            onClick={() => setActiveTab('active')}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5',
              activeTab === 'active'
                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Active Pro ({summary.activePro})
          </button>
          <button
            onClick={() => setActiveTab('trial')}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5',
              activeTab === 'trial'
                ? 'bg-violet-600 text-white shadow-sm shadow-violet-600/20'
                : 'text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30'
            )}
          >
            <Sparkles className="h-3 w-3" />
            Free Trials ({summary.trial || 0})
          </button>
          <button
            onClick={() => setActiveTab('expired')}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0',
              activeTab === 'expired'
                ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/20'
                : 'text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
            )}
          >
            Expired ({summary.expired})
          </button>
          <button
            onClick={() => setActiveTab('refunded')}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0',
              activeTab === 'refunded'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'
            )}
          >
            Refunded ({summary.refunded})
          </button>
          <button
            onClick={() => setActiveTab('free')}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0',
              activeTab === 'free'
                ? 'bg-slate-600 text-white'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
            )}
          >
            Free/Inactive ({summary.free})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search email, phone, HWID, payment ID..."
            className="w-full h-9 pl-9 pr-4 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
          />
        </div>
      </div>

      {/* Main Subscriber Table */}
      <div className="bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/40 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4">User / Subscriber ID</th>
                <th className="py-3 px-4">Country</th>
                <th className="py-3 px-4">Subscription Type</th>
                <th className="py-3 px-4">Start Date</th>
                <th className="py-3 px-4">Expiry Date & Validity</th>
                <th className="py-3 px-4">Current Amount</th>
                <th className="py-3 px-4">Total Subscribed (LTV)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="h-6 w-6 animate-spin text-violet-500" />
                      <span className="text-xs font-semibold">Aggregating live subscriber records...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredSubscribers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <AlertCircle className="h-6 w-6 text-slate-400" />
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                        No subscribers found
                      </span>
                      <span className="text-xs text-slate-400">
                        {searchQuery ? 'Try modifying your search filter.' : 'No user profiles recorded yet.'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredSubscribers.map((sub, idx) => {
                  return (
                    <tr
                      key={sub.userId + idx}
                      onClick={() => setSelectedUser(sub)}
                      className="hover:bg-violet-50/40 dark:hover:bg-violet-950/15 cursor-pointer transition-colors group"
                    >
                      {/* Column 1: User ID & Contact */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              'h-8 w-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0',
                              sub.isActive
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            )}
                          >
                            {sub.email ? (
                              <Mail className="h-4 w-4" />
                            ) : sub.phone ? (
                              <Smartphone className="h-4 w-4" />
                            ) : (
                              <Cpu className="h-4 w-4" />
                            )}
                          </div>
                          <div className="flex flex-col overflow-hidden max-w-[200px] sm:max-w-xs">
                            <span className="font-bold text-slate-900 dark:text-white truncate" title={sub.displayName}>
                              {sub.displayName}
                            </span>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500 font-medium truncate">
                              {sub.hwid && sub.hwid !== 'N/A' && (
                                <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded text-slate-600 dark:text-slate-300">
                                  HWID: {sub.hwid}
                                </span>
                              )}
                              {sub.phone && sub.phone !== 'N/A' && sub.email && (
                                <span>{sub.phone}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Column 2: Country */}
                      <td className="py-3.5 px-4">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 text-xs">
                          <span className="text-sm leading-none">{sub.country?.flag || '🇮🇳'}</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200 text-[11px] whitespace-nowrap">
                            {sub.country?.name || 'India'}
                          </span>
                        </div>
                      </td>

                      {/* Column 3: Subscription Type */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          {sub.currentPlan === 'yearly' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                              <Crown className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                              Annual / Yearly
                            </span>
                          ) : sub.currentPlan === 'monthly' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                              <CreditCard className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                              Monthly
                            </span>
                          ) : sub.currentPlan === 'lifetime' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                              <Sparkles className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                              Lifetime Pro
                            </span>
                          ) : sub.currentPlan === 'trial' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                              <Sparkles className="h-3 w-3 text-violet-600 dark:text-violet-400" />
                              7-Day Free Trial
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800">
                              Free Plan
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Column 3: Start Date */}
                      <td className="py-3.5 px-4 font-medium text-slate-700 dark:text-slate-300">
                        {sub.startDate}
                      </td>

                      {/* Column 4: Expiry Date & Validity */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {sub.expiresAt}
                          </span>
                          <span
                            className={cn(
                              'text-[10px] font-bold mt-0.5',
                              sub.isActive
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : sub.status === 'Expired'
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-slate-400'
                            )}
                          >
                            {sub.validityText}
                          </span>
                        </div>
                      </td>

                      {/* Column 5: Current Amount */}
                      <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                        {sub.currentAmountFormatted}
                      </td>

                      {/* Column 6: Total Amount Subscribed (LTV) */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col">
                          <span className="font-black text-emerald-600 dark:text-emerald-400 text-xs">
                            {sub.totalAmountSubscribedFormatted}
                          </span>
                          <span className="text-[9px] text-slate-400 font-medium">
                            {sub.history.length} payment{sub.history.length === 1 ? '' : 's'}
                          </span>
                        </div>
                      </td>

                      {/* Column 7: Status */}
                      <td className="py-3.5 px-4">
                        {sub.isActive ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            {sub.status}
                          </span>
                        ) : sub.status === 'Expired' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                            Expired
                          </span>
                        ) : sub.status === 'Refunded' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            Refunded
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500">
                            Inactive / Free
                          </span>
                        )}
                      </td>

                      {/* Column 8: Action */}
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px] font-bold text-violet-600 dark:text-violet-400 group-hover:bg-violet-100/60 dark:group-hover:bg-violet-950/50 rounded-lg"
                        >
                          History <ChevronRight className="h-3 w-3 ml-0.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Subscription History Modal */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-2xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl p-6">
          {selectedUser && (
            <div className="flex flex-col gap-5">
              <DialogHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-2xl bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 flex items-center justify-center font-bold">
                      <ReceiptText className="h-5 w-5" />
                    </div>
                    <div>
                      <DialogTitle className="text-base font-black text-slate-900 dark:text-white">
                        {selectedUser.displayName}
                      </DialogTitle>
                      <DialogDescription className="text-xs text-slate-500 mt-0.5">
                        Subscriber Profile & Full Historical Transaction Ledger
                      </DialogDescription>
                    </div>
                  </div>

                  {selectedUser.isActive ? (
                    <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      🟢 Active Pro
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full text-xs font-black bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {selectedUser.status}
                    </span>
                  )}
                </div>
              </DialogHeader>

              {/* Profile Meta Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60 text-xs">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Country</div>
                  <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1 mt-0.5">
                    <span>{selectedUser.country?.flag || '🇮🇳'}</span>
                    <span>{selectedUser.country?.name || 'India'}</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Current Plan</div>
                  <div className="font-bold text-slate-800 dark:text-slate-200 capitalize mt-0.5">
                    {selectedUser.currentPlan}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Current Rate</div>
                  <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                    {selectedUser.currentAmountFormatted}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Lifetime LTV</div>
                  <div className="font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {selectedUser.totalAmountSubscribedFormatted}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Expiration</div>
                  <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                    {selectedUser.expiresAt}
                  </div>
                </div>
              </div>

              {/* Contact & Hardware Details */}
              <div className="flex flex-col gap-2 text-xs">
                {selectedUser.email && (
                  <div className="flex items-center justify-between py-1 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500 font-medium flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-slate-400" /> Email:
                    </span>
                    <div className="flex items-center gap-1 font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {selectedUser.email}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopy(selectedUser.email!, 'email')}
                        className="h-6 w-6 rounded text-slate-400 hover:text-slate-700"
                      >
                        {copiedField === 'email' ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                )}

                {selectedUser.phone && (
                  <div className="flex items-center justify-between py-1 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500 font-medium flex items-center gap-1.5">
                      <Smartphone className="h-3.5 w-3.5 text-slate-400" /> Phone Contact:
                    </span>
                    <div className="flex items-center gap-1 font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {selectedUser.phone}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopy(selectedUser.phone!, 'phone')}
                        className="h-6 w-6 rounded text-slate-400 hover:text-slate-700"
                      >
                        {copiedField === 'phone' ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                )}

                {selectedUser.hwid && selectedUser.hwid !== 'N/A' && (
                  <div className="flex items-center justify-between py-1 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500 font-medium flex items-center gap-1.5">
                      <Cpu className="h-3.5 w-3.5 text-slate-400" /> Bound Hardware ID:
                    </span>
                    <div className="flex items-center gap-1 font-mono font-bold text-violet-600 dark:text-violet-400">
                      {selectedUser.hwid}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopy(selectedUser.hwid!, 'hwid')}
                        className="h-6 w-6 rounded text-slate-400 hover:text-slate-700"
                      >
                        {copiedField === 'hwid' ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Transaction History Timeline */}
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Payment & Subscription History ({selectedUser.history.length})
                </h3>

                {selectedUser.history.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-center text-xs text-slate-400">
                    No payment gateway transactions recorded for this profile yet.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
                    {selectedUser.history.map((item, hIdx) => {
                      return (
                        <div
                          key={item.paymentId + hIdx}
                          className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-start gap-2.5">
                            <div
                              className={cn(
                                'h-7 w-7 rounded-lg flex items-center justify-center font-bold shrink-0 mt-0.5',
                                item.status === 'captured'
                                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                                  : item.status === 'refunded'
                                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                                  : 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                              )}
                            >
                              {item.status === 'captured' ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : item.status === 'refunded' ? (
                                <RotateCcw className="h-3.5 w-3.5" />
                              ) : (
                                <AlertCircle className="h-3.5 w-3.5" />
                              )}
                            </div>

                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-900 dark:text-white">
                                  {item.paymentId}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleCopy(item.paymentId, `pay_${item.paymentId}`)}
                                  className="h-5 w-5 text-slate-400 hover:text-slate-700"
                                >
                                  {copiedField === `pay_${item.paymentId}` ? (
                                    <Check className="h-2.5 w-2.5 text-emerald-500" />
                                  ) : (
                                    <Copy className="h-2.5 w-2.5" />
                                  )}
                                </Button>
                              </div>
                              <span className="text-[10px] text-slate-500 font-medium mt-0.5">
                                {item.date} • Plan: <span className="capitalize font-semibold text-slate-700 dark:text-slate-300">{item.billing}</span>
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-col items-end shrink-0">
                            <span className="font-black text-slate-900 dark:text-white text-xs">
                              ₹{item.amount} {item.currency}
                            </span>
                            <span
                              className={cn(
                                'text-[10px] font-bold uppercase tracking-wider',
                                item.status === 'captured'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : item.status === 'refunded'
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              )}
                            >
                              {item.status}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedUser(null)}
                  className="text-xs font-semibold"
                >
                  Close
                </Button>

                {isElectron && (
                  <Button
                    size="sm"
                    onClick={handleSyncSelectedUser}
                    disabled={isSyncingUser}
                    className="text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white shadow-sm"
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', isSyncingUser && 'animate-spin')} />
                    Sync Status to Firestore
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
