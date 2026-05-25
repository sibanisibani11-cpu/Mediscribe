import { BookOpen, Download, MousePointer, Keyboard, Mic, Settings, Play, Info, CheckCircle2, AlertCircle, Cloud, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface InstructionsViewProps {
  onBack: () => void;
}

export function InstructionsView({ onBack }: InstructionsViewProps) {
  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl cobalt-gradient flex items-center justify-center shadow-lg">
            <BookOpen className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tighter uppercase italic">User Guide</h1>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Master MediScribe in minutes</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack} className="font-bold text-xs uppercase tracking-widest text-slate-500 hover:text-violet-600 transition-colors">
          ← Back to Home
        </Button>
      </div>

      <Tabs defaultValue="getting-started" className="w-full">
        <TabsList className="grid w-full grid-cols-5 h-12 bg-slate-100 dark:bg-slate-900 rounded-xl p-1">
          <TabsTrigger value="getting-started" className="rounded-lg font-bold text-[10px] uppercase tracking-wider">
            <Download className="h-3.5 w-3.5 mr-2" />
            Setup
          </TabsTrigger>
          <TabsTrigger value="dictation" className="rounded-lg font-bold text-[10px] uppercase tracking-wider">
            <Mic className="h-3.5 w-3.5 mr-2" />
            Dictation
          </TabsTrigger>
          <TabsTrigger value="keywords" className="rounded-lg font-bold text-[10px] uppercase tracking-wider">
            <Keyboard className="h-3.5 w-3.5 mr-2" />
            Keywords
          </TabsTrigger>
          <TabsTrigger value="cloud" className="rounded-lg font-bold text-[10px] uppercase tracking-wider">
            <Cloud className="h-3.5 w-3.5 mr-2" />
            Cloud Sync
          </TabsTrigger>
          <TabsTrigger value="tips" className="rounded-lg font-bold text-[10px] uppercase tracking-wider">
            <Zap className="h-3.5 w-3.5 mr-2" />
            Shortcuts
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="getting-started">
            <Card className="border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm overflow-hidden">
              <div className="h-1 w-full cobalt-gradient" />
              <CardHeader>
                <CardTitle className="text-xl font-black italic tracking-tighter uppercase">First-Time Setup</CardTitle>
                <CardDescription className="text-xs font-bold uppercase tracking-widest text-violet-600">Prepare your offline AI environment</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="h-8 w-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                      <span className="text-sm font-black text-violet-600">1</span>
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100">AI Models Download</h4>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Go to <strong>Dictation Mode</strong>. If you haven't downloaded a model yet, clinical voice recognition won't work. Select a model (e.g., <span className="text-violet-600">base.en</span> for speed) and click Download.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="h-8 w-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                      <span className="text-sm font-black text-violet-600">2</span>
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100">Ollama Setup (Optional)</h4>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        For advanced medical auto-correction (Stage 3), ensure the <strong>Ollama Engine</strong> is enabled in settings. This runs large medical LLMs locally on your computer.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="h-8 w-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                      <span className="text-sm font-black text-violet-600">3</span>
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100">Permissions Required</h4>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Grant <strong>Microphone</strong> access for Dictation Mode. For Keyword Mode, macOS will also ask for <strong>Accessibility Access</strong> — this lets MediScribe detect your typed keyword shortcuts in any app. <span className="text-violet-600 font-semibold">Your keystrokes are never recorded or shared.</span> You only need to approve this once in <em>System Settings → Privacy &amp; Security → Accessibility</em>.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 flex gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                  <p className="text-[11px] text-amber-800 dark:text-amber-400 font-bold leading-relaxed">
                    MediScribe works 100% OFFLINE. Once the models are downloaded, you can disconnect from the internet entirely for maximum patient data privacy.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="dictation">
            <Card className="border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm overflow-hidden">
              <div className="h-1 w-full cobalt-gradient" />
              <CardHeader>
                <CardTitle className="text-xl font-black italic tracking-tighter uppercase">Clinical Dictation</CardTitle>
                <CardDescription className="text-xs font-bold uppercase tracking-widest text-emerald-600">Talk, We Type</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 flex flex-col items-center text-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-violet-600 flex items-center justify-center shadow-lg animate-pulse">
                      <Mic className="h-5 w-5 text-white" />
                    </div>
                    <h5 className="font-bold text-sm">Real-time Recording</h5>
                    <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                      Press <strong>START</strong> and begin speaking. Focus your cursor in any EMR, Word, or Email.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 flex flex-col items-center text-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg">
                      <CheckCircle2 className="h-5 w-5 text-white" />
                    </div>
                    <h5 className="font-bold text-sm">3-Stage Verification</h5>
                    <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                      Transcripts go through <strong>ASR</strong>, <strong>NSpell detection</strong>, and <strong>LLM polish</strong> for clinical accuracy.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                    <MousePointer className="h-4 w-4 text-violet-600" />
                    Floating Bubble Controls
                  </h4>
                  <ul className="text-xs space-y-2 text-slate-600 dark:text-slate-400 font-bold">
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-violet-600" /> Single Click: Start/Stop toggle</li>
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-violet-600" /> Double Click: Restore main app window</li>
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-violet-600" /> Dragging: Reposition anywhere on screen</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="keywords">
            <Card className="border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm overflow-hidden">
              <div className="h-1 w-full cobalt-gradient" />
              <CardHeader>
                <CardTitle className="text-xl font-black italic tracking-tighter uppercase">Keyword Expansion</CardTitle>
                <CardDescription className="text-xs font-bold uppercase tracking-widest text-indigo-600">Instantly Insert Bulk Text</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 leading-relaxed">
                   <p className="text-sm font-bold text-indigo-900 dark:text-indigo-300 italic mb-2">Example: Type ";hpi" and it instantly expands to a full "History of Present Illness" template.</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
                      <Play className="h-4 w-4 text-emerald-500 fill-emerald-500" />
                      How to use
                    </h4>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed">
                      Enter <strong>Keyword Mode</strong> from the home screen. Ensure your bubble is active. Type your trigger keyword (we recommend starting with a semicolon like <span className="text-violet-600 text-[10px] font-black">;diag</span>) in any clinical document.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
                      <Info className="h-4 w-4 text-violet-500" />
                      Automatic Detection
                    </h4>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed">
                      If you have multiple expansions for one keyword, a choice-dialog will pop up near your cursor. Use <kbd className="bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded text-[10px] uppercase font-black">TAB</kbd> or <kbd className="bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded text-[10px] uppercase font-black">ENTER</kbd> to select the correct one.
                    </p>
                  </div>

                  {/* Accessibility Permission Note */}
                  <div className="p-4 rounded-2xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 flex gap-3">
                    <Info className="h-4 w-4 text-violet-600 shrink-0 mt-0.5" />
                    <div className="space-y-1.5">
                      <p className="text-xs font-black text-violet-800 dark:text-violet-300 uppercase tracking-wide">About the macOS Accessibility Permission</p>
                      <p className="text-xs text-violet-700 dark:text-violet-400 leading-relaxed">
                        When you click <strong>&quot;Start &amp; Minimize&quot;</strong> for the first time, macOS shows a system dialog: <em>&quot;MediScribe would like to control this computer using accessibility features.&quot;</em> <strong>This is completely normal</strong> and is required by any app that detects keyboard shortcuts system-wide (e.g. TextExpander, Raycast, Alfred).
                      </p>
                      <p className="text-xs text-violet-700 dark:text-violet-400 leading-relaxed">
                        ✅ Click <strong>&quot;Open System Settings&quot;</strong> &rarr; enable <strong>MediScribe</strong> under <em>Privacy &amp; Security &rarr; Accessibility</em>. You only need to do this once. MediScribe uses this solely to detect your defined keyword shortcuts — it never reads, stores, or uploads what you type.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cloud">
            <Card className="border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm overflow-hidden">
              <div className="h-1 w-full cobalt-gradient" />
              <CardHeader>
                <CardTitle className="text-xl font-black italic tracking-tighter uppercase">Cloud Connection</CardTitle>
                <CardDescription className="text-xs font-bold uppercase tracking-widest text-sky-600">Sync Across Hospital & Home</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-sky-50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/30">
                  <div className="h-12 w-12 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm">
                    <Cloud className="h-6 w-6 text-sky-500" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">Zero-Config Sync</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Connect your <strong>Google Drive</strong> on the home screen to protect your data.
                    </p>
                  </div>
                </div>

                <div className="space-y-4 px-2">
                  <div className="flex gap-4">
                    <div className="h-6 w-6 rounded flex items-center justify-center shrink-0">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium pt-0.5">
                      <strong>Multi-Device Access:</strong> Your custom medical terms and expansion shortcuts follow you wherever you log in.
                    </p>
                  </div>
                  <div className="flex gap-4">
                    <div className="h-6 w-6 rounded flex items-center justify-center shrink-0">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium pt-0.5">
                      <strong>Automatic Backups:</strong> Never lose your dictionary if you change your computer or reinstall the app.
                    </p>
                  </div>
                  <div className="flex gap-4">
                    <div className="h-6 w-6 rounded flex items-center justify-center shrink-0">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium pt-0.5">
                      <strong>Privacy First:</strong> Data is stored in your OWN Google Drive, not on our servers.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tips">
            <Card className="border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm overflow-hidden">
              <div className="h-1 w-full cobalt-gradient" />
              <CardHeader>
                <CardTitle className="text-xl font-black italic tracking-tighter uppercase">Pro Shortcuts</CardTitle>
                <CardDescription className="text-xs font-bold uppercase tracking-widest text-purple-600">Efficiency for the power user</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6">
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Global Mouse & Keyboard</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-500">Quick Record Toggle</span>
                        <kbd className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 font-black text-[10px]">CTRL+SHIFT+R</kbd>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-500">Minimize Window</span>
                        <kbd className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 font-black text-[10px]">CTRL+SHIFT+M</kbd>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bubble Mouse Tricks</h4>
                    <div className="text-[11px] text-slate-500 font-medium leading-relaxed space-y-1">
                      <p><strong>Double Click Bubble</strong>: Restore Main App</p>
                      <p><strong>Right Click Bubble</strong>: Show Context Menu</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-6 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
                  <div className="text-[10px] text-slate-500 font-black uppercase italic tracking-tighter">MediScribe v1.0.4</div>
                  <Button variant="link" onClick={() => window.open('https://mediapp.store/help', '_blank')} className="text-[10px] p-0 font-black uppercase tracking-widest text-violet-600">
                    Visit Online Help Center
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
