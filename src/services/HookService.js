/**
 * Hook監視サービス
 * - Claude Code Hooks監視
 * - Hook音声再生管理
 * - Hook通知処理
 * - 外部ターミナル検知
 */

class HookService {
    constructor(terminalApp) {
        this.terminalApp = terminalApp;
        this.isPlayingHookAudio = false; // Hook音声再生中フラグ
        this.hookWatcherInterval = null;
        this.debugLog = debugLog;
        this.debugError = debugError;
        
        // Hook監視設定
        this.hookWatcherEnabled = false;
        this.hookWatcherIntervalMs = 500; // 0.5秒間隔
    }

    // Hook監視システムを開始
    async startHookWatcher() {
        if (this.hookWatcherInterval) {
            this.stopHookWatcher();
        }
        
        this.hookWatcherEnabled = true;
        this.debugLog('🎣 Hook監視システムを開始');
        
        // Claude Code Hooks用ファイル監視を開始
        this.startHookFileWatcher();
        
        // IPCからのHook通知受信設定
        this.setupHookIPCListeners();
    }

    // Hook監視システムを停止
    stopHookWatcher() {
        if (this.hookWatcherInterval) {
            clearInterval(this.hookWatcherInterval);
            this.hookWatcherInterval = null;
        }
        this.hookWatcherEnabled = false;
        this.debugLog('🎣 Hook監視システムを停止');
    }

    // IPCからのHook通知受信を設定
    setupHookIPCListeners() {
        const { ipcRenderer } = require('electron');
        
        // Hook音声再生通知を受信
        ipcRenderer.on('hook-audio-play', (event, data) => {
            this.playHookVoiceFile(data.filepath, data.text, data.emotion);
        });
        
        // Hook音声停止通知を受信
        ipcRenderer.on('hook-audio-stop', () => {
            // Hook音声停止処理（必要に応じて実装）
            if (this.isPlayingHookAudio) {
                this.debugLog('🎣 Hook音声停止通知を受信');
                this.isPlayingHookAudio = false;
            }
        });
    }

    // Claude Code Hooks用ファイル監視を開始
    startHookFileWatcher() {
        const path = require('path');
        const os = require('os');
        
        const tempDir = os.tmpdir();
        this.debugLog('🎣 Hook監視ディレクトリ:', tempDir);
        
        this.hookWatcherInterval = setInterval(async () => {
            if (!this.hookWatcherEnabled) return;
            
            try {
                await this.checkForHookNotifications(tempDir);
            } catch (error) {
                this.debugError('🎣 Hook監視エラー:', error);
            }
        }, this.hookWatcherIntervalMs);
    }

    // Hook通知ファイルをチェック
    async checkForHookNotifications(tempDir) {
        const fs = require('fs');
        const path = require('path');
        
        // Hook機能が有効かチェック
        const unifiedConfig = getSafeUnifiedConfig();
        const useHooks = await unifiedConfig.get('useHooks', false);
        
        if (!useHooks) {
            return; // Hook機能が無効の場合は処理しない
        }
        
        try {
            // Hook通知ファイルのパターン
            const notificationPattern = /^claude-hook-notification-\d+\.json$/;
            
            const files = fs.readdirSync(tempDir);
            const hookFiles = files.filter(file => notificationPattern.test(file));
            
            for (const file of hookFiles) {
                const filePath = path.join(tempDir, file);
                
                try {
                    // ファイルを読み込み
                    const content = fs.readFileSync(filePath, 'utf8');
                    const notification = JSON.parse(content);
                    
                    this.debugLog('🎣 Hook通知を検出:', {
                        file,
                        hasAudio: !!notification.filepath,
                        hasText: !!notification.text,
                        hasEmotion: !!notification.emotion
                    });
                    
                    // 音声ファイルが存在する場合は再生
                    if (notification.filepath && notification.text) {
                        await this.playHookVoiceFile(notification.filepath, notification.text);
                        
                        // 感情データが含まれている場合はIPCで送信
                        if (notification.emotion) {
                            this.debugLog('😊 感情データをIPCで送信:', notification.emotion);
                            // IPCを使って感情データを送信
                            this.terminalApp.sendEmotionToVRM(notification.emotion);
                        }
                    }
                    
                    // 処理後にファイルを削除
                    fs.unlinkSync(filePath);
                    
                } catch (error) {
                    this.debugError('🎣 Hook通知ファイル処理エラー:', error);
                    // エラーの場合もファイルを削除
                    try {
                        fs.unlinkSync(filePath);
                    } catch (unlinkError) {
                        this.debugError('🎣 Hook通知ファイル削除エラー:', unlinkError);
                    }
                }
            }
            
        } catch (error) {
            this.debugError('🎣 Hook通知ディレクトリ読み取りエラー:', error);
        }
    }

    // Hook音声ファイルを再生
    async playHookVoiceFile(filepath, text, emotion) {
        const fs = require('fs');
        
        try {
            // Hook音声再生中の場合は待機
            while (this.isPlayingHookAudio) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            this.isPlayingHookAudio = true;
            this.debugLog('🎣 Hook音声再生開始:', {
                filepath,
                text: text?.substring(0, 50) + '...',
                emotion
            });
            
            // 音声ファイルが存在するかチェック
            if (!fs.existsSync(filepath)) {
                this.debugLog('❌ Hook音声ファイルが見つかりません:', filepath);
                return;
            }
            
            // 音声ファイルを読み込み
            const audioData = fs.readFileSync(filepath);
            
            // VRMに音声データを送信（リップシンク用）
            try {
                this.terminalApp.sendAudioToVRM(audioData.buffer);
                this.debugLog('🎭 Hook音声データをVRMに送信完了');
            } catch (vrmError) {
                this.debugError('❌ VRM音声データ送信エラー:', vrmError);
            }
            
            // 感情データをVRMに送信
            if (emotion) {
                try {
                    this.terminalApp.sendEmotionToVRM(emotion);
                    this.debugLog('😊 Hook感情データをVRMに送信完了:', emotion);
                } catch (emotionError) {
                    this.debugError('❌ Hook感情データ送信エラー:', emotionError);
                }
            }
            
            // 音声再生開始をVRMに通知
            this.terminalApp.notifyAudioStateToVRM('playing');
            
            // 音声をAudioオブジェクトで再生
            const audioBlob = new Blob([audioData], { type: 'audio/wav' });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            
            // 音量設定
            const unifiedConfig = getSafeUnifiedConfig();
            const volume = await unifiedConfig.get('voiceVolume', 50);
            audio.volume = Math.max(0, Math.min(1, volume / 100));
            
            // 再生完了を待機
            await new Promise((resolve, reject) => {
                audio.onended = () => {
                    this.debugLog('🎣 Hook音声再生完了');
                    this.isPlayingHookAudio = false;
                    
                    // 音声終了をVRMに通知
                    this.terminalApp.notifyAudioStateToVRM('ended');
                    
                    // リソースをクリーンアップ
                    URL.revokeObjectURL(audioUrl);
                    
                    resolve();
                };
                
                audio.onerror = (error) => {
                    this.debugError('❌ Hook音声再生エラー:', error);
                    this.isPlayingHookAudio = false;
                    URL.revokeObjectURL(audioUrl);
                    reject(error);
                };
                
                audio.play().catch(reject);
            });
            
            // 音声ファイルを削除
            try {
                fs.unlinkSync(filepath);
                this.debugLog('🎣 Hook音声ファイルを削除:', filepath);
            } catch (unlinkError) {
                this.debugError('❌ Hook音声ファイル削除エラー:', unlinkError);
            }
            
        } catch (error) {
            this.debugError('❌ Hook音声再生エラー:', error);
            this.isPlayingHookAudio = false;
        }
    }

    // Hook専用データ処理（音声再生なし）
    async processHookOnlyData(data) {
        this.debugLog('🎣 Hook専用データ処理開始:', {
            dataLength: data.length,
            dataPreview: data.substring(0, 100)
        });
        
        // 感情分析を実行
        try {
            const emotionResult = await window.electronAPI.voice.getEmotion(data);
            if (emotionResult.success && emotionResult.emotion) {
                this.debugLog('😊 Hook感情分析成功:', emotionResult.emotion);
                
                // 感情データをVRMに送信
                this.terminalApp.sendEmotionToVRM(emotionResult.emotion);
            }
        } catch (error) {
            this.debugError('❌ Hook感情分析エラー:', error);
        }
        
        this.debugLog('🎣 Hook専用データ処理完了');
    }

    // アプリターミナルのデータかどうかを判定
    isAppTerminalData(data) {
        // アプリ内ターミナルの特徴的なパターンをチェック
        const appTerminalPatterns = [
            /^\[\d{2}:\d{2}:\d{2}\]/,  // タイムスタンプ
            /^Tab tab-\d+/,           // タブ情報
            /^sysctlbyname/,          // システムコール
            /^AppConfig:/,            // アプリ設定
            /^Claude working directory/,  // Claude作業ディレクトリ
            /^\[NextJS Console\]/,    // NextJSコンソール
            /^\[TerminalApp\]/,       // TerminalApp
            /^\[ConfigManager\]/,     // ConfigManager
            /^\[AudioCleanup\]/       // AudioCleanup
        ];
        
        return appTerminalPatterns.some(pattern => pattern.test(data));
    }

    // Hook監視状態を取得
    getStatus() {
        return {
            hookWatcherEnabled: this.hookWatcherEnabled,
            isPlayingHookAudio: this.isPlayingHookAudio,
            hookWatcherIntervalMs: this.hookWatcherIntervalMs
        };
    }

    // Hook音声再生を停止
    stopHookAudio() {
        if (this.isPlayingHookAudio) {
            this.isPlayingHookAudio = false;
            this.debugLog('🎣 Hook音声再生を停止');
        }
    }
}

// ブラウザ環境での利用
if (typeof window !== 'undefined') {
    window.HookService = HookService;
}

// Node.js環境での利用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HookService;
}