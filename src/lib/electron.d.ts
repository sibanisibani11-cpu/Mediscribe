export { };

declare global {
    interface Window {
        electron: {
            // Text typing
            typeText: (text: string, restoreWindow?: boolean) => Promise<{ success: boolean; error?: string }>;
            getAppVersion: () => Promise<string>;

            // File operations
            showSaveDialog: () => Promise<any>;
            writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;

            // Transcription
            transcribeAudio: (audioBuffer: any, mode?: string) => Promise<any>;
            checkWhisperStatus: () => Promise<any>;
            restartWhisperServer: () => Promise<any>;

            // Models
            getModels: () => Promise<any[]>;
            downloadModel: (modelName: string) => Promise<any>;
            setModel: (modelName: string) => Promise<any>;

            // Recording state
            setRecordingState: (recording: boolean) => void;
            onStartRecording: (callback: () => void) => void;
            onStopRecording: (callback: () => void) => void;
            onToggleRecording: (callback: () => void) => void;
            onTriggerStopRecording: (callback: () => void) => void;
            triggerToggleRecording: () => void;
            onRecStateChange: (callback: (state: boolean) => void) => void;

            // Dictionary
            getDictionary: () => Promise<string[]>;
            addWord: (word: string) => Promise<{ success: boolean; dictionary: string[]; error?: string }>;
            removeWord: (word: string) => Promise<{ success: boolean; dictionary: string[]; error?: string }>;
            updateWord: (oldWord: string, newWord: string) => Promise<{ success: boolean; dictionary: string[]; error?: string }>;
            sortDictionary: () => Promise<{ success: boolean; dictionary: string[]; error?: string }>;

            // Ollama
            checkOllamaStatus: () => Promise<any>;
            getOllamaModels: () => Promise<any[]>;
            downloadOllamaModel: (modelName: string) => Promise<any>;
            setOllamaModel: (modelName: string) => Promise<any>;
            toggleOllama: (enabled: boolean) => Promise<any>;
            getOllamaEnabled: () => Promise<boolean>;
            formatWithOllama: (text: string, formatType: string) => Promise<string>;

            // Utility
            removeAllListeners: (channel: string) => void;
            platform: string;
            isElectron: boolean;
            minimizeWindow: () => Promise<{ success: boolean }>;
        };
    }
}
