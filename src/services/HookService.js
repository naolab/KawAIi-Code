/**
 * Hook監視サービス
 * - Claude Code Hooks監視
 * - Hook音声再生管理
 * - Hook通知処理
 * - 外部ターミナル検知
 */

class HookService {
    constructor(terminalApp, vrmIntegrationService) {
        this.terminalApp = terminalApp;
        this.vrmIntegrationService = vrmIntegrationService;
        // Hook音声再生状態は統一管理システムを使用
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
            if (this.terminalApp.voicePlayingState.isPlayingHook) {
                this.debugLog('🎣 Hook音声停止通知を受信');
                this.terminalApp.voicePlayingState.isPlayingHook = false;
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
        // 音声無効時はHook音声再生もスキップ（パフォーマンス最適化）
        if (!this.terminalApp.voiceEnabled) {
            this.debugLog('🎣 音声無効のためHook音声再生をスキップ:', filepath);
            return;
        }
        
        const fs = require('fs');
        
        try {
            // Hook音声再生中の場合は待機
            while (this.terminalApp.voicePlayingState.isPlayingHook) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            this.terminalApp.voicePlayingState.isPlayingHook = true;
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
            
            // 統一感情処理メソッドを使用（既存の感情データがある場合はそれを使用、ない場合はテキストから分析）
            if (emotion) {
                // 既存の感情データを使用
                this.terminalApp.vrmIntegrationService.sendAudioToVRM(audioData.buffer);
                this.terminalApp.vrmIntegrationService.sendEmotionToVRM(emotion);
                this.debugLog('🎭 Hook既存感情データを使用:', emotion);
            } else {
                // 統一感情処理メソッドでテキストから感情分析
                await this.terminalApp.processEmotionForVRM(text, audioData.buffer);
            }
            
            // 音声再生開始をVRMに通知
            this.terminalApp.vrmIntegrationService.notifyAudioStateToVRM('playing');
            
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
                    this.terminalApp.voicePlayingState.isPlayingHook = false;
                    
                    // 音声終了をVRMに通知（表情リセット）
                    this.terminalApp.vrmIntegrationService.notifyAudioStateToVRM('ended');
                    
                    // 表情を中性に戻す（明示的リセット）
                    setTimeout(() => {
                        this.terminalApp.vrmIntegrationService.sendEmotionToVRM({ 
                            emotion: 'neutral', 
                            weight: 0 
                        });
                        this.debugLog('🎭 Hook表情を中性にリセット完了');
                    }, 100); // 100ms後にリセット
                    
                    // リソースをクリーンアップ
                    URL.revokeObjectURL(audioUrl);
                    
                    resolve();
                };
                
                audio.onerror = (error) => {
                    this.debugError('❌ Hook音声再生エラー:', error);
                    this.terminalApp.voicePlayingState.isPlayingHook = false;
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
            this.terminalApp.voicePlayingState.isPlayingHook = false;
        }
    }

    // Hook専用データ処理（音声再生あり）
    async processHookOnlyData(data, characterId = null) {
        // 音声無効時はHook処理もスキップ（パフォーマンス最適化）
        if (!this.terminalApp.voiceEnabled) {
            this.debugLog('🎣 音声無効のためHook処理をスキップ:', data.substring(0, 50) + '...');
            return;
        }
        
        this.debugLog('🎣 Hook専用データ処理開始:', {
            dataLength: data.length,
            dataPreview: data.substring(0, 300),
            fullData: data, // 全データも表示
            characterId
        });
        
        // ◆◇で囲まれたテキストを抽出
        const matches = data.match(/◆([^◇]+)◇/g);
        if (!matches || matches.length === 0) {
            this.debugLog('🎣 Hook: ◆◇で囲まれたテキストが見つかりません');
            this.debugLog('🎣 Hookデータ内容:', data);
            return;
        }
        
        // 各マッチを処理
        for (const match of matches) {
            const text = match.slice(1, -1); // ◆◇を除去
            this.debugLog('🎣 Hook音声合成開始:', text);
            
            try {
                // キャラクター設定の取得
                let speakerId = null;
                let volume = null;
                
                if (characterId && this.terminalApp.configManager) {
                    const char = this.terminalApp.configManager.getCharacterById(characterId);
                    if (char && char.voice) {
                        speakerId = char.voice.speakerId;
                        volume = char.voice.volume;
                    }
                }

                // 音声合成を実行
                const audioData = await this.terminalApp.audioService.synthesizeTextOnly(
                    text, 
                    speakerId, 
                    volume, 
                    null, // speed
                    null  // pitch
                );

                if (!audioData) {
                    this.debugLog('⚠️ Hook音声合成失敗');
                    continue;
                }
                
                // 統一感情処理メソッドを使用（二重処理を回避）
                await this.terminalApp.processEmotionForVRM(text, audioData);
                
                // 音声再生（AudioService経由）
                await this.terminalApp.audioService.playAudio(audioData, text);
                this.debugLog('🎣 Hook音声再生完了');
                
            } catch (error) {
                this.debugError('❌ Hook音声処理エラー:', error);
            }
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
            isPlayingHookAudio: this.terminalApp.voicePlayingState.isPlayingHook,
            hookWatcherIntervalMs: this.hookWatcherIntervalMs
        };
    }

    // Hook音声再生を停止
    stopHookAudio() {
        if (this.terminalApp.voicePlayingState.isPlayingHook) {
            this.terminalApp.voicePlayingState.isPlayingHook = false;
            this.debugLog('🎣 Hook音声再生を停止');
        }
    }

    // Hook経由の会話表示
    displayHookConversation(data) {
        try {
            
            // Hook音声処理（表示機能は削除済み）
            
        } catch (error) {
            this.debugError('Hook会話表示エラー:', error);
        }
    }

    // 音声再生完了を待機する関数
    async waitForAudioComplete() {
        return new Promise(resolve => {
            // Hook音声再生中かチェック
            if (!this.terminalApp.voicePlayingState.isPlayingHook) {
                resolve();
                return;
            }
            
            const checkComplete = () => {
                if (!this.terminalApp.voicePlayingState.isPlayingHook) {
                    this.debugLog('🎵 音声再生完了を確認');
                    resolve();
                } else {
                    setTimeout(checkComplete, 250);
                }
            };
            checkComplete();
        });
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