const { contextBridge, ipcRenderer } = require('electron');

// contextIsolation: false なので、直接windowオブジェクトに設定
window.electronAPI = {
  terminal: {
    start: (aiType) => ipcRenderer.invoke('terminal-start', aiType),
    write: (data) => ipcRenderer.invoke('terminal-write', data),
    resize: (cols, rows) => ipcRenderer.invoke('terminal-resize', cols, rows),
    stop: () => ipcRenderer.invoke('terminal-stop'),
    onData: (callback) => {
      ipcRenderer.on('terminal-data', (event, data) => callback(data));
    },
    onExit: (callback) => {
      ipcRenderer.on('terminal-exit', (event, exitCode) => callback(exitCode));
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('terminal-data');
      ipcRenderer.removeAllListeners('terminal-exit');
    }
  },
  tab: {
    create: (tabId, aiType) => ipcRenderer.invoke('tab-create', tabId, aiType),
    delete: (tabId) => ipcRenderer.invoke('tab-delete', tabId),
    write: (tabId, data) => ipcRenderer.invoke('tab-write', tabId, data),
    resize: (tabId, cols, rows) => ipcRenderer.invoke('tab-resize', tabId, cols, rows),
    setParent: (tabId) => ipcRenderer.invoke('set-parent-tab', tabId),
    onData: (callback) => {
      ipcRenderer.on('tab-data', (event, tabId, data) => callback(tabId, data));
    },
    onExit: (callback) => {
      ipcRenderer.on('tab-exit', (event, tabId, exitCode) => callback(tabId, exitCode));
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('tab-data');
      ipcRenderer.removeAllListeners('tab-exit');
    }
  },
  voice: {
    checkConnection: () => ipcRenderer.invoke('voice-check-connection'),
    getSpeakers: () => ipcRenderer.invoke('voice-get-speakers'),
    synthesize: (text, speaker) => ipcRenderer.invoke('voice-synthesize', text, speaker),
    speak: (text, speaker) => ipcRenderer.invoke('voice-speak', text, speaker),
    stop: () => ipcRenderer.invoke('voice-stop'),
    getEmotion: (text) => ipcRenderer.invoke('voice-get-emotion', text),
    onTextAvailable: (callback) => {
      ipcRenderer.on('voice-text-available', (event, text) => callback(text));
    },
    onPlayAudio: (callback) => {
      ipcRenderer.on('play-audio', (event, audioData) => callback(audioData));
    },
    onStopAudio: (callback) => {
      ipcRenderer.on('stop-audio', callback);
    },
    onShowHookConversation: (callback) => {
      ipcRenderer.on('show-hook-conversation', (event, data) => callback(data));
    },
    onEmotionData: (callback) => {
      ipcRenderer.on('emotion-data', (event, emotionData) => callback(emotionData));
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('voice-text-available');
      ipcRenderer.removeAllListeners('play-audio');
      ipcRenderer.removeAllListeners('stop-audio');
      ipcRenderer.removeAllListeners('show-hook-conversation');
      ipcRenderer.removeAllListeners('emotion-data');
    }
  },
  vrm: {
    loadFile: (filename) => ipcRenderer.invoke('load-vrm-file', filename)
  },
  wallpaper: {
    getWallpaperList: () => ipcRenderer.invoke('wallpaper-get-list'),
    getWallpapers: () => ipcRenderer.invoke('wallpaper-get-all'),
    uploadWallpaper: (filePath) => ipcRenderer.invoke('wallpaper-upload', filePath),
    deleteWallpaper: (filename) => ipcRenderer.invoke('wallpaper-delete', filename)
  },
  minimizeWindow: () => ipcRenderer.send("minimize-window"),
  maximizeWindow: () => ipcRenderer.send("maximize-window"),
  closeWindow: () => ipcRenderer.send("close-window"),
  setAppConfig: (config) => ipcRenderer.invoke("set-app-config", config),
  getAppConfig: () => ipcRenderer.invoke("get-app-config"),
  sendTerminalInput: (data) => ipcRenderer.send("terminal-input", data),
  sendChatMessage: (message) => ipcRenderer.send("chat-message", message),
  onTerminalOutput: (callback) => ipcRenderer.on("terminal-output", callback),
  onVoiceMessage: (callback) => ipcRenderer.on("voice-message", callback),
  onClaudeStatus: (callback) => ipcRenderer.on("claude-status", callback),
  updateConnectionStatus: (callback) =>
    ipcRenderer.on("update-connection-status", callback),
  openDirectoryDialog: () => ipcRenderer.invoke("open-directory-dialog"),
  getClaudeCwd: () => ipcRenderer.invoke("get-claude-cwd"),
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),

  // 統一設定管理システム
  getAppConfig: () => ipcRenderer.invoke('get-app-config'),
  setAppConfig: (key, value) => ipcRenderer.invoke('set-app-config', key, value),
  removeAppConfig: (key) => ipcRenderer.invoke('remove-app-config', key),
  clearAppConfig: () => ipcRenderer.invoke('clear-app-config'),

  fs: require('fs'), // fsモジュールを公開
  path: require('path'), // pathモジュールを公開
  os: require('os') // osモジュールを公開
};