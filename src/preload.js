const { ipcRenderer } = require('electron');

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
  }
};