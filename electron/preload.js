const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  startOAuth: (provider) => ipcRenderer.send('start-oauth', provider),
  onOAuthCode: (callback) => ipcRenderer.on('oauth-code', (event, ...args) => callback(...args)),
  // Text typing functionality
  typeText: (text, restoreWindow) => ipcRenderer.invoke('type-text', text, restoreWindow),

  // App information
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // File operations
  showSaveDialog: () => ipcRenderer.invoke('show-save-dialog'),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),

  // Audio transcription using whisper.cpp
  transcribeAudio: (audioBuffer) => ipcRenderer.invoke('transcribe-audio', audioBuffer),

  // Model Management
  getModels: () => ipcRenderer.invoke('get-models'),
  downloadModel: (modelName) => ipcRenderer.invoke('download-model', modelName),
  setModel: (modelName) => ipcRenderer.invoke('set-model', modelName),
  deleteModel: (modelName) => ipcRenderer.invoke('delete-model', modelName),

  // Check whisper status
  checkWhisperStatus: () => ipcRenderer.invoke('check-whisper-status'),
  restartWhisperServer: () => ipcRenderer.invoke('restart-whisper-server'),
  getWhisperServerStatus: () => ipcRenderer.invoke('get-whisper-server-status'),
  onWhisperServerStatus: (callback) => {
    const subscription = (event, status) => callback(status);
    ipcRenderer.on('whisper-server-status', subscription);
    return () => ipcRenderer.removeListener('whisper-server-status', subscription);
  },

  // Recording state management
  setRecordingState: (recording) => ipcRenderer.send('recording-state-changed', recording),

  // Listen for shortcuts from main process
  onStartRecording: (callback) => ipcRenderer.on('start-recording', callback),
  onStopRecording: (callback) => ipcRenderer.on('stop-recording', callback),
  onToggleRecording: (callback) => {
    ipcRenderer.on('toggle-recording', callback);
    return () => ipcRenderer.removeListener('toggle-recording', callback);
  },
  removeToggleRecordingListener: (callback) => ipcRenderer.removeListener('toggle-recording', callback),
  onTriggerStopRecording: (callback) => ipcRenderer.on('trigger-stop-recording', callback),

  // Download progress listeners
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (event, data) => callback(data)),
  onDownloadComplete: (callback) => ipcRenderer.on('download-complete', (event, data) => callback(data)),
  onDownloadError: (callback) => ipcRenderer.on('download-error', (event, data) => callback(data)),

  // Ollama functionality
  checkOllamaStatus: () => ipcRenderer.invoke('check-ollama-status'),
  getOllamaModels: () => ipcRenderer.invoke('get-ollama-models'),
  downloadOllamaModel: (modelName) => ipcRenderer.invoke('download-ollama-model', modelName),
  cancelOllamaDownload: (modelName) => ipcRenderer.invoke('cancel-ollama-download', modelName),
  setOllamaModel: (modelName) => ipcRenderer.invoke('set-ollama-model', modelName),
  deleteOllamaModel: (modelName) => ipcRenderer.invoke('delete-ollama-model', modelName),
  toggleOllama: (enabled) => ipcRenderer.invoke('toggle-ollama', enabled),
  getOllamaEnabled: () => ipcRenderer.invoke('get-ollama-enabled'),
  formatWithOllama: (text, formatType) => ipcRenderer.invoke('format-with-ollama', text, formatType),

  // Ollama progress listeners
  onOllamaDownloadProgress: (callback) => ipcRenderer.on('ollama-download-progress', (event, data) => callback(data)),
  onOllamaDownloadComplete: (callback) => ipcRenderer.on('ollama-download-complete', (event, data) => callback(data)),
  onOllamaDownloadError: (callback) => ipcRenderer.on('ollama-download-error', (event, data) => callback(data)),

  // Floating button controls
  showFloatingButton: () => ipcRenderer.invoke('show-floating-button'),
  hideFloatingButton: () => ipcRenderer.invoke('hide-floating-button'),
  stopRecording: () => ipcRenderer.send('stop-recording'),
  triggerToggleRecording: () => ipcRenderer.send('trigger-toggle-recording'),
  onRecStateChange: (callback) => ipcRenderer.on('rec-state-change', (event, state) => callback(state)),

  // Activation & Licensing
  checkActivation: () => ipcRenderer.invoke('check-activation'),
  getLicenseDetails: () => ipcRenderer.invoke('get-license-details'),
  activateApp: (code) => ipcRenderer.invoke('activate-app', code),
  getActivationId: () => ipcRenderer.invoke('get-activation-id'),
  activateAfterPayment: (paymentData) => ipcRenderer.invoke('activate-after-payment', paymentData),
  markLicenseMigrated: (claim) => ipcRenderer.invoke('mark-license-migrated', claim),

  // Auto-Updater
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onUpdateStatus: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  },

  // Dictionary
  getDictionary: () => ipcRenderer.invoke('get-dictionary'),
  addWord: (word) => ipcRenderer.invoke('add-word', word),
  removeWord: (word) => ipcRenderer.invoke('remove-word', word),
  removeWords: (words) => ipcRenderer.invoke('remove-words', words),
  updateWord: (oldWord, newWord) => ipcRenderer.invoke('update-word', oldWord, newWord),
  sortDictionary: () => ipcRenderer.invoke('sort-dictionary'),

  // Keyword Library
  getKeywords: () => ipcRenderer.invoke('get-keywords'),
  addKeyword: (data) => ipcRenderer.invoke('add-keyword', data),
  removeKeyword: (id) => ipcRenderer.invoke('remove-keyword', id),
  removeKeywords: (ids) => ipcRenderer.invoke('remove-keywords', ids),
  updateKeyword: (data) => ipcRenderer.invoke('update-keyword', data),
  sortKeywords: () => ipcRenderer.invoke('sort-keywords'),

  // Keyword Floating Window
  showKeywordWindow: () => ipcRenderer.invoke('show-keyword-window'),
  hideKeywordWindow: () => ipcRenderer.invoke('hide-keyword-window'),
  onShowKeywordWindow: (callback) => ipcRenderer.on('show-keyword-window', callback),

  // Keyword Listener (automatic expansion in Word)
  startKeywordListener: () => ipcRenderer.invoke('start-keyword-listener'),
  stopKeywordListener: () => ipcRenderer.invoke('stop-keyword-listener'),
  checkAccessibilityPermission: () => ipcRenderer.invoke('check-accessibility-permission'),
  requestAccessibilityPermission: () => ipcRenderer.invoke('request-accessibility-permission'),
  openAccessibilitySettings: () => ipcRenderer.invoke('open-accessibility-settings'),

  // Template Library
  getTemplates: () => ipcRenderer.invoke('get-templates'),
  addTemplate: (data) => ipcRenderer.invoke('add-template', data),
  removeTemplate: (id) => ipcRenderer.invoke('remove-template', id),
  updateTemplate: (data) => ipcRenderer.invoke('update-template', data),
  saveTemplateFile: (data) => ipcRenderer.invoke('save-template-file', data),
  deleteTemplateFile: (filePath) => ipcRenderer.invoke('delete-template-file', filePath),

  // Template Listener (automatic template expansion)
  startTemplateListener: () => ipcRenderer.invoke('start-template-listener'),
  stopTemplateListener: () => ipcRenderer.invoke('stop-template-listener'),

  // Typing Mode Management
  getTypingMode: () => ipcRenderer.invoke('get-typing-mode'),
  setTypingMode: (mode) => ipcRenderer.invoke('set-typing-mode', mode),
  onTypingModeChange: (callback) => ipcRenderer.on('typing-mode-change', (event, mode) => callback(mode)),

  // Floating Button Position
  getFloatingButtonPosition: () => ipcRenderer.invoke('get-floating-button-position'),
  setFloatingButtonPosition: (x, y) => ipcRenderer.invoke('set-floating-button-position', x, y),
  saveFloatingButtonPosition: () => ipcRenderer.invoke('save-floating-button-position'),

  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),

  // Platform information
  platform: process.platform,

  // Window Management
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  toggleFullScreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  isFullScreen: () => ipcRenderer.invoke('is-fullscreen'),
  onFullScreenChange: (callback) => ipcRenderer.on('fullscreen-change', (event, isFS) => callback(isFS)),
  onAppQuitting: (callback) => ipcRenderer.on('app-quitting', callback),

  // Authentications
  googleLogin: () => ipcRenderer.invoke('google-login'),
  googleLogout: () => ipcRenderer.invoke('google-logout'),
  getGoogleStatus: () => ipcRenderer.invoke('get-google-status'),
  syncCloud: (strategy) => ipcRenderer.invoke('sync-cloud', strategy),
  getAutoSyncStatus: () => ipcRenderer.invoke('get-auto-sync-status'),
  toggleAutoSync: (enabled) => ipcRenderer.invoke('toggle-auto-sync', enabled),
  onGoogleDeviceEvicted: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('google-device-evicted', handler);
    return () => ipcRenderer.removeListener('google-device-evicted', handler);
  },

  // Check if running in Electron
  isElectron: true,
  checkLocalVerifiedUser: (email) => ipcRenderer.invoke('check-local-verified-user', email),
  addLocalVerifiedUser: (email) => ipcRenderer.invoke('add-local-verified-user', email),
  localSimSignin: (email, password) => ipcRenderer.invoke('local-sim-signin', email, password),
  localSimSignup: (email, password) => ipcRenderer.invoke('local-sim-signup', email, password),
  setActiveUserEmail: (email) => ipcRenderer.invoke('set-active-user-email', email)
});
