const { contextBridge, ipcRenderer } = require('electron');

// contextIsolation: false なので、直接windowオブジェクトに設定
window.electronAPI = {
  terminal: {
    start: () => ipcRenderer.invoke('terminal-start'),
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
  voice: {
    checkConnection: () => ipcRenderer.invoke('voice-check-connection'),
    getSpeakers: () => ipcRenderer.invoke('voice-get-speakers'),
    synthesize: (text, speaker) => ipcRenderer.invoke('voice-synthesize', text, speaker),
    speak: (text, speaker) => ipcRenderer.invoke('voice-speak', text, speaker),
    stop: () => ipcRenderer.invoke('voice-stop'),
    onTextAvailable: (callback) => {
      ipcRenderer.on('voice-text-available', (event, text) => callback(text));
    },
    onPlayAudio: (callback) => {
      ipcRenderer.on('play-audio', (event, audioData) => callback(audioData));
    },
    onStopAudio: (callback) => {
      ipcRenderer.on('stop-audio', callback);
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('voice-text-available');
      ipcRenderer.removeAllListeners('play-audio');
      ipcRenderer.removeAllListeners('stop-audio');
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

  // Speech Recognition APIs (Google Cloud Speech用)
  startSpeechRecognitionStream: () => ipcRenderer.invoke("start-speech-recognition-stream"),
  sendAudioChunk: (chunk) => ipcRenderer.invoke("send-audio-chunk", chunk),
  stopSpeechRecognitionStream: () => ipcRenderer.invoke("stop-speech-recognition-stream"),
  onSpeechRecognitionResult: (callback) => ipcRenderer.on("speech-recognition-result", (event, data) => callback(data)),
  onSpeechRecognitionError: (callback) => ipcRenderer.on("speech-recognition-error", (event, errorMessage) => callback(errorMessage)),
  onSpeechRecognitionEnd: (callback) => ipcRenderer.on("speech-recognition-end", callback),
  fs: require('fs'), // fsモジュールを公開
  path: require('path') // pathモジュールを公開
};