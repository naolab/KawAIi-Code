const { contextBridge, ipcRenderer } = require('electron');

// ConversationLogger準備完了の通知機構
let loggerReadyCallbacks = [];
let isLoggerReady = false;
let loggerInitPromise = null;

// ログシステム準備完了の通知を受信
ipcRenderer.on('conversation-logger-ready', (event, data) => {
    isLoggerReady = true;
    console.log('💾 ConversationLogger準備完了:', data);
    loggerReadyCallbacks.forEach(callback => callback(data));
    loggerReadyCallbacks = [];
});

// 確実にログシステムの準備を待つ関数
async function ensureLoggerReady() {
    if (isLoggerReady) {
        console.log('💾 ログシステム: 既に初期化済み');
        return true;
    }
    
    if (!loggerInitPromise) {
        console.log('💾 ログシステム: 初期化待機開始');
        loggerInitPromise = new Promise(async (resolve) => {
            let resolved = false;
            
            // 1. 既に準備完了かチェック
            try {
                const status = await ipcRenderer.invoke('check-conversation-logger-ready');
                if (status?.isInitialized) {
                    isLoggerReady = true;
                    console.log('💾 ログシステム: 状態確認で初期化確認');
                    resolved = true;
                    resolve(true);
                    return;
                }
            } catch (error) {
                console.warn('💾 初期状態確認失敗:', error);
            }
            
            // 2. イベント待機
            const onReady = (event, data) => {
                if (!resolved) {
                    isLoggerReady = true;
                    console.log('💾 ログシステム: イベント経由で初期化確認');
                    resolved = true;
                    ipcRenderer.off('conversation-logger-ready', onReady);
                    resolve(true);
                }
            };
            
            ipcRenderer.on('conversation-logger-ready', onReady);
            
            // 3. タイムアウト (20秒) - dist版での初期化遅延に対応
            setTimeout(() => {
                if (!resolved) {
                    console.warn('💾 ログシステム初期化タイムアウト (20秒)');
                    resolved = true;
                    ipcRenderer.off('conversation-logger-ready', onReady);
                    resolve(false);
                }
            }, 20000);
        });
    }
    
    return await loggerInitPromise;
}

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
  getAppPath: () => ipcRenderer.invoke('get-app-path'),

  // 統一設定管理システム
  getAppConfig: () => ipcRenderer.invoke('get-app-config'),
  setAppConfig: (key, value) => ipcRenderer.invoke('set-app-config', key, value),
  removeAppConfig: (key) => ipcRenderer.invoke('remove-app-config', key),
  clearAppConfig: () => ipcRenderer.invoke('clear-app-config'),

  // 会話ログ読み込み・保存（確実性向上版）
  logs: {
    loadConversationLog: (count) => ipcRenderer.invoke('load-conversation-log', count),
    
    // より確実なログ保存API
    saveConversationLog: async (text, sessionId) => {
      try {
        // 確実にログシステムの準備を待つ
        const isReady = await ensureLoggerReady();
        if (!isReady) {
          throw new Error('ConversationLogger initialization timeout');
        }
        
        return await ipcRenderer.invoke('save-conversation-log', text, sessionId);
      } catch (error) {
        console.error('💾 ログ保存エラー:', error);
        return { success: false, error: error.message };
      }
    },
    
    getStats: () => ipcRenderer.invoke('get-conversation-log-stats'),
    clearLogs: () => ipcRenderer.invoke('clear-conversation-log')
  },

  // ログシステム準備完了の待機API
  onConversationLoggerReady: (callback) => {
    if (isLoggerReady) {
      callback({ success: true });
    } else {
      loggerReadyCallbacks.push(callback);
    }
  },
  
  checkConversationLoggerReady: () => ipcRenderer.invoke('check-conversation-logger-ready'),

  // Cloud API関連
  getCloudApiKey: () => ipcRenderer.invoke('get-cloud-api-key'),
  setCloudApiKey: (apiKey) => ipcRenderer.invoke('set-cloud-api-key', apiKey),
  getUseCloudApi: () => ipcRenderer.invoke('get-use-cloud-api'),
  setUseCloudApi: (useCloudAPI) => ipcRenderer.invoke('set-use-cloud-api', useCloudAPI),

  fs: require('fs'), // fsモジュールを公開
  path: require('path'), // pathモジュールを公開
  os: require('os') // osモジュールを公開
};