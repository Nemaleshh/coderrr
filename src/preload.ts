import { contextBridge, ipcRenderer } from 'electron';

// Helper: safely register a single listener (removes old ones first to avoid leaks)
function safeOn(channel: string, callback: (...args: any[]) => void) {
  ipcRenderer.removeAllListeners(channel);
  ipcRenderer.on(channel, callback);
}

contextBridge.exposeInMainWorld('electron', {
  minimize: () => ipcRenderer.send('minimize-window'),
  maximize: () => ipcRenderer.send('maximize-window'),
  close: () => ipcRenderer.send('close-window'),
  quit: () => ipcRenderer.send('quit-app'),

  takeScreenshot: () => ipcRenderer.invoke('take-screenshot'),
  processScreenshots: (complexity?: string) => ipcRenderer.invoke('process-screenshots', complexity),
  processVoice: (data: { text?: string; audioBase64?: string; mimeType?: string; complexity?: string }) =>
    ipcRenderer.invoke('process-voice', data),
  resetQueue: () => ipcRenderer.invoke('reset-queue'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config: any) => ipcRenderer.invoke('save-config', config),

  toggleVisibility: () => ipcRenderer.send('toggle-visibility'),

  // ── Event subscriptions (each removes old listeners first to prevent accumulation) ──

  onProcessingComplete: (callback: (result: string) => void) => {
    safeOn('processing-complete', (_, result) => callback(result));
  },

  onScreenshotTaken: (callback: (data: any) => void) => {
    safeOn('screenshot-taken', (_, data) => callback(data));
  },

  onProcessingStarted: (callback: () => void) => {
    safeOn('processing-started', () => callback());
  },

  onQueueReset: (callback: () => void) => {
    safeOn('queue-reset', () => callback());
  },

  onShowConfig: (callback: () => void) => {
    safeOn('show-config', () => callback());
  },

  onToggleVoiceRecording: (callback: () => void) => {
    safeOn('toggle-voice-recording', () => callback());
  },

  // ── Cleanup helpers for React useEffect returns ──
  removeListener: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
});