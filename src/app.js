// xtermライブラリはCDNから読み込み

// デバッグログ制御（デバッグ用に一時的に有効化）
const isDev = true; // デバッグログを有効化
const debugLog = console.log; // デバッグログを表示
const debugTrace = console.trace; // トレースを表示
const debugError = console.error; // エラーは引き続き表示

// 統一設定管理システム（グローバル参照）
// unifiedConfigはunified-config-manager.jsで既にグローバルに定義済み

// 統一設定システムへの安全なアクセス関数
function getSafeUnifiedConfig() {
    if (window.unifiedConfig) {
        return window.unifiedConfig;
    }
    
    // フォールバック: 統一設定システムが利用できない場合の簡易実装
    console.warn('⚠️ 統一設定システムが利用できません - フォールバック機能を使用');
    return {
        async get(key, defaultValue) {
            try {
                const value = localStorage.getItem(key);
                return value !== null ? JSON.parse(value) : defaultValue;
            } catch (error) {
                console.error('LocalStorage読み込みエラー:', error);
                return defaultValue;
            }
        },
        async set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (error) {
                console.error('LocalStorage保存エラー:', error);
            }
        },
        // マイグレーション機能は削除済み
    };
}

// 読み上げ履歴管理クラス - modules/speech-history-manager.js に移動済み

// メッセージチャンク結合クラス
class MessageAccumulator {
    constructor() {
        this.pendingMessage = '';
        this.lastChunkTime = 0;
        this.completionTimeout = AppConstants.MESSAGE.COMPLETION_TIMEOUT;
        this.completionTimer = null;
        this.isAccumulating = false;
        this.processCallback = null;
    }
    
    setProcessCallback(callback) {
        debugLog(`🔧 setProcessCallback呼び出し - コールバックタイプ:`, typeof callback);
        debugLog(`🔧 コールバック関数:`, callback);
        this.processCallback = callback;
        debugLog(`🔧 コールバック設定完了 - 現在のコールバック:`, this.processCallback);
    }
    
    addChunk(data) {
        const hasMarker = data.includes('⏺') || data.includes('✦');
        const hasQuotes = data.includes('『') && data.includes('』');
        
        // debugLog(`📝 MessageAccumulator.addChunk - マーカー: ${hasMarker}, 括弧: ${hasQuotes}, データ長: ${data.length}`);
        
        if (hasMarker) {
            // 新しいメッセージ開始
            if (this.isAccumulating) {
                debugLog(`🔄 既存メッセージを強制完了してから新メッセージ開始`);
                this.forceComplete();
            }
            
            this.pendingMessage = data;
            this.lastChunkTime = Date.now();
            this.isAccumulating = true;
            debugLog(`🆕 新しいメッセージ蓄積開始 - 長さ: ${data.length}`);
            this.scheduleCompletion();
            
        } else if (this.isAccumulating) {
            // 既存メッセージに追加（蓄積中は全てのチャンクを統合）
            this.pendingMessage += '\n' + data;
            this.lastChunkTime = Date.now();
            debugLog(`➕ メッセージに追加 - 現在の総長: ${this.pendingMessage.length}`);
            this.scheduleCompletion();
            
        } else {
            // debugLog(`⏭️ チャンクをスキップ - 条件に合致せず`);
        }
    }
    
    // より賢い完了判定
    isMessageComplete(data) {
        // 1. 明確な終了マーカーがある（ユーザー入力プロンプト）
        const hasEndMarker = data.includes('\n> ') || data.includes('╭─') || data.includes('│ ');
        
        // 2. カギカッコが閉じられている
        const openQuotes = (data.match(/『/g) || []).length;
        const closeQuotes = (data.match(/』/g) || []).length;
        const quotesBalanced = openQuotes === closeQuotes && openQuotes > 0;
        
        // 3. 文章が完結している
        const endsWithPunctuation = /[。！？][\s\n]*$/.test(data.trim());
        
        debugLog(`🔍 完了判定チェック:`, {
            hasEndMarker,
            quotesBalanced: `${openQuotes}/${closeQuotes}`,
            endsWithPunctuation,
            dataEnd: data.trim().slice(-20)
        });
        
        return hasEndMarker || (quotesBalanced && endsWithPunctuation);
    }
    
    scheduleCompletion() {
        // 即座に完了判定をチェック
        if (this.isMessageComplete(this.pendingMessage)) {
            debugLog(`✅ 即座に完了 - 完了条件を満たしています`);
            clearTimeout(this.completionTimer);
            this.complete();
            return;
        }
        
        clearTimeout(this.completionTimer);
        this.completionTimer = setTimeout(() => {
            this.complete();
        }, this.completionTimeout);
        
        debugLog(`⏰ 完了タイマーを${this.completionTimeout}ms後に設定`);
    }
    
    forceComplete() {
        clearTimeout(this.completionTimer);
        this.complete();
    }
    
    complete() {
        if (!this.isAccumulating || !this.pendingMessage) {
            debugLog(`❌ 完了処理スキップ - 蓄積中でないかメッセージが空`);
            debugLog(`❌ デバッグ情報:`, {
                isAccumulating: this.isAccumulating,
                messageLength: this.pendingMessage ? this.pendingMessage.length : 0,
                hasCallback: !!this.processCallback
            });
            return;
        }
        
        debugLog(`✅ メッセージ蓄積完了 - 最終長: ${this.pendingMessage.length}`);
        debugLog(`✅ 蓄積時間: ${Date.now() - this.lastChunkTime + this.completionTimeout}ms`);
        debugLog(`🔔 complete()呼び出し - コールバック有無:`, !!this.processCallback);
        debugLog(`🔔 コールバック関数:`, this.processCallback);
        
        const completeMessage = this.pendingMessage;
        this.pendingMessage = '';
        this.isAccumulating = false;
        this.completionTimer = null;
        
        if (this.processCallback) {
            debugLog(`📞 コールバック実行開始 - メッセージ長: ${completeMessage.length}`);
            debugLog(`📞 メッセージサンプル:`, completeMessage.substring(0, 100) + '...');
            
            try {
                this.processCallback(completeMessage);
                debugLog(`📞 コールバック実行完了`);
            } catch (error) {
                this.errorHandler.handle(error, {
                    severity: ErrorHandler.SEVERITY.MEDIUM,
                    category: ErrorHandler.CATEGORY.PROCESS,
                    operation: 'message-callback-execution',
                    userMessage: 'メッセージ処理中にエラーが発生しました'
                });
            }
        } else {
            debugError(`❌ コールバックが設定されていません！`);
            debugError(`❌ メッセージが破棄されました:`, completeMessage.substring(0, 100) + '...');
        }
    }
    
    // 現在の蓄積状態を取得（デバッグ用）
    getStatus() {
        return {
            isAccumulating: this.isAccumulating,
            messageLength: this.pendingMessage.length,
            timeSinceLastChunk: Date.now() - this.lastChunkTime,
            hasTimer: !!this.completionTimer
        };
    }
}

class TerminalApp {
    constructor() {
        this.terminal = null;
        this.fitAddon = null;
        this.isTerminalRunning = false;
        
        // リソース管理システム
        this.resourceManager = new ResourceManager('TerminalApp');
        
        // 処理最適化システム
        this.processingCache = new ProcessingCache({
            maxCacheSize: 50,
            maxAge: 300000, // 5分
            maxPoolSize: 5
        });
        
        // タブ管理システム
        this.tabManager = null;
        this.voiceEnabled = true; // デフォルトで有効に
        this.selectedSpeaker = 0;
        this.connectionStatus = 'disconnected';
        this.isPlayingHookAudio = false; // Hook音声再生中フラグ
        this.isResizing = false; // リサイズ中フラグ（音声処理制御用）
        this.resizeTimer = null; // リサイズタイマー（デバウンス処理用）
        
        // 音声再生状態の統一管理
        this.voicePlayingState = {
            isPlaying: false,
            currentAudio: null,
            queue: []
        };
        
        this.speakers = [];
        // 従来音声システムは削除（Hook音声のみ使用）
        // this.audioContext = null; // 削除
        // this.currentAudio = null; // 削除
        // this.isPlaying = false; // 削除（Hook用のisPlayingHookAudioのみ使用）
        this.voiceIntervalSeconds = AppConstants.AUDIO.DEFAULT_INTERVAL_SECONDS;
        this.voiceVolume = 50; // デフォルト音量50%
        // this.audioQueue = []; // 削除
        // this.maxAudioAge = AppConstants.AUDIO.MAX_AGE; // 削除
        
        // this.maxQueueSize = AppConstants.AUDIO.MAX_QUEUE_SIZE; // 削除
        this.chatMessages = [];
        this.lastChatMessage = '';
        this.lastChatTime = 0;
        this.currentRunningAI = null; // 現在起動しているAIの種類を保持
        
        // VRM口パク用通信（postMessage使用）
        
        // パフォーマンス最適化用（チャンク結合方式に変更）
        this.messageAccumulator = new MessageAccumulator();
        this.claudeWorkingDir = ''; // Claude Code作業ディレクトリの初期値
        this.speakerInitialized = false; // 話者選択初期化フラグ
        
        // 読み上げ履歴管理
        this.speechHistory = new SpeechHistoryManager(200);
        
        // 音声キューイングシステム
        this.voiceQueue = new VoiceQueue(this);
        
        // モジュールインスタンス
        this.wallpaperSystem = new WallpaperSystem();
        this.configManager = new ConfigManager();
        
        this.init();
    }

    async init() {
        // xtermライブラリが読み込まれるまで待機
        if (typeof Terminal === 'undefined') {
            debugLog('xterm.jsを読み込み中...');
            setTimeout(() => this.init(), 100);
            return;
        }
        
        // ErrorHandlerを初期化
        this.errorHandler = new ErrorHandler('TerminalApp');
        
        // Claude Codeの作業ディレクトリを初期化時に取得
        try {
            const result = await window.electronAPI.getClaudeCwd();
            if (result.success) {
                this.claudeWorkingDir = result.cwd;
                debugLog('Initial Claude CWD set to:', this.claudeWorkingDir);
                // ConfigManagerにも作業ディレクトリを同期
                this.configManager.setWorkingDirectory(this.claudeWorkingDir);
            } else {
                debugError('Failed to get initial Claude CWD:', result.error);
            }
        } catch (error) {
            debugError('Error calling getClaudeCwd during init:', error);
        }

        this.setupTerminal();
        this.initializeTabManager(); // タブ管理システム初期化
        this.initializeUIEventManager(); // UI制御初期化
        this.setupChatInterface();
        await this.initializeModules(); // モジュール初期化をawait
        await this.loadInitialSettings(); // 初期設定の読み込み
        await this.initializeVoiceMode(); // 音声モード初期化を追加
        
        // アプリ起動時に両方のAI.mdファイルを生成
        await this.generateAiMdFiles();
        
        this.updateStatus('Ready');
        this.checkVoiceConnection();
        
        // リソース管理：定期クリーンアップ開始
        this.resourceManager.startPeriodicCleanup(AppConstants.AUDIO.DEFAULT_INTERVAL * 20); // 60秒間隔
        
        // 処理キャッシュ：定期クリーンアップ開始
        this.resourceManager.setInterval(() => {
            this.processingCache.cleanupExpiredEntries();
        }, 120000); // 2分間隔
        
        // Claude Code Hooks監視を開始
        this.startHookFileWatcher();
        debugLog('🚀 init()メソッド完了');
    }

    // モジュール初期化
    async initializeModules() {
        // MessageAccumulatorのコールバック設定（統一処理システム）
        this.messageAccumulator.setProcessCallback(async (data) => {
            await this.processTerminalData(data);
        });
        
        // 壁紙システムの初期化
        this.wallpaperSystem.setMessageCallback((character, message) => {
            this.addVoiceMessage(character, message);
        });
        this.wallpaperSystem.setupWallpaperSystem();
        
        // 設定管理の初期化
        // configManagerに現在のclaudeWorkingDirを渡す
        await this.configManager.initialize(this.claudeWorkingDir);
        
        // IPCからのHook通知受信設定
        this.setupHookIPCListeners();
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
                // 現在の音声を停止する処理をここに追加
            }
        });
        
        // アプリ内音声再生通知を受信（現在は使用しない - VoiceQueueシステムを使用）
        // ipcRenderer.on('play-audio', (event, data) => {
        //     this.playAppInternalAudio(data.audioData, data.text);
        // });
        
    }



    // Claude Code Hooks用ファイル監視を開始
    startHookFileWatcher() {
        debugLog('🚀 claudeWorkingDir:', this.claudeWorkingDir);
        
        const fs = require('fs');
        const path = require('path');
        const tempDir = path.join(this.claudeWorkingDir, 'temp');
        
        
        // tempディレクトリが存在しない場合は作成
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // 定期的にnotificationファイルをチェック（IPCがメインなので頻度を下げる）
        this.resourceManager.setInterval(() => {
            this.checkForHookNotifications(tempDir);
        }, 500); // 0.5秒間隔に変更（Hook応答性向上）
    }

    // Hook通知ファイルをチェック
    async checkForHookNotifications(tempDir) {
        const fs = require('fs');
        const path = require('path');
        
        // Hook機能が有効かチェック
        const unifiedConfig = getSafeUnifiedConfig();
        const useHooks = await unifiedConfig.get('useHooks', false);
        
        if (!useHooks) {
            // Hookモードが無効の場合は処理をスキップ
            return;
        }
        
        try {
            const files = fs.readdirSync(tempDir);
            const notificationFiles = files.filter(file => file.startsWith('notification_') && file.endsWith('.json'));
            
            if (notificationFiles.length > 0) {
            }
            
            for (const file of notificationFiles) {
                const filePath = path.join(tempDir, file);
                try {
                    const notification = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    await this.processHookNotification(notification);
                    
                    // 処理済みの通知ファイルを削除
                    fs.unlinkSync(filePath);
                } catch (error) {
                    // エラーが発生したファイルも削除（破損ファイル対策）
                    try {
                        fs.unlinkSync(filePath);
                    } catch (deleteError) {
                        debugLog('❌ 破損ファイル削除エラー:', deleteError);
                    }
                }
            }
        } catch (error) {
            // tempディレクトリが存在しない場合は何もしない
        }
    }

    // Hook通知を処理
    async processHookNotification(notification) {
        
        if (notification.type === 'voice-synthesis-hook' && notification.filepath) {
            // 音声ファイルを再生
            await this.playHookVoiceFile(notification.filepath, notification.text);
            
            // 感情データが含まれている場合はIPCで送信
            if (notification.emotion) {
                debugLog('😊 感情データをIPCで送信:', notification.emotion);
                // IPCを使って感情データを送信
                const { ipcRenderer } = require('electron');
                ipcRenderer.send('emotion-data', notification.emotion);
            }
        }
        
        // 音声停止通知の処理
        if (notification.type === 'stop-audio') {
            debugLog('🛑 音声停止通知受信:', notification);
            this.stopAudio();
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
            
            if (!fs.existsSync(filepath)) {
                return;
            }
            
            // Hook音声再生開始フラグ
            this.isPlayingHookAudio = true;
            
            
            // 音声ファイルを読み込んでVRMリップシンク用に送信
            try {
                const audioBuffer = fs.readFileSync(filepath);
                this.sendAudioToVRM(audioBuffer);
            } catch (vrmError) {
                debugLog('❌ VRM音声データ送信エラー:', vrmError);
                // エラーが発生しても音声再生は続行
            }

            // 感情データをVRMに送信
            if (emotion) {
                this.sendEmotionToVRM(emotion);
            }
            
            // 音声ファイルを再生
            const audio = new Audio(filepath);
            const volumeValue = await getSafeUnifiedConfig().get('voiceVolume', 50);
            const safeVolume = isNaN(volumeValue) ? 50 : volumeValue;
            audio.volume = Math.max(0, Math.min(1, safeVolume / 100));
            
            debugLog('🔊 音量設定:', { volumeValue, safeVolume, finalVolume: audio.volume });
            
            audio.onended = () => {
                
                // Hook音声再生終了フラグ
                this.isPlayingHookAudio = false;
                
                // 音声終了をVRMビューワーに通知（表情リセットのため）
                this.notifyAudioStateToVRM('ended');
                
                // 再生完了後に音声ファイルを削除
                try {
                    const fs = require('fs');
                    if (fs.existsSync(filepath)) {
                        fs.unlinkSync(filepath);
                    }
                } catch (error) {
                }
            };
            
            audio.onerror = (error) => {
                // エラー時もフラグをリセット
                this.isPlayingHookAudio = false;
            };
            
            await audio.play();
            
            // チャットにテキストを表示
            if (text) {
                this.addVoiceMessage('shy', text);
            }
            
        } catch (error) {
            // エラー時もフラグをリセット
            this.isPlayingHookAudio = false;
        }
    }

    // アプリ内音声再生（VoiceQueue用）
    async playAppInternalAudio(audioData, text) {
        
        try {
            debugLog('🎵 アプリ内音声再生開始:', text?.substring(0, 30) + '...');
            
            // audioDataをArrayBufferに変換
            let arrayBuffer;
            if (audioData.buffer) {
                arrayBuffer = audioData.buffer;
            } else {
                arrayBuffer = audioData;
            }
            
            // VRMリップシンク用に音声データを送信
            try {
                this.sendAudioToVRM(arrayBuffer);
                debugLog('🎭 アプリ内音声データをVRMに送信完了');
            } catch (vrmError) {
                debugLog('❌ VRM音声データ送信エラー:', vrmError);
                // エラーが発生しても音声再生は続行
            }
            
            // 感情データを抽出・送信（Hook処理と同じ）
            try {
                if (text) {
                    const emotionResult = await window.electronAPI.voice.getEmotion(text);
                    if (emotionResult.success && emotionResult.emotion) {
                        this.sendEmotionToVRM(emotionResult.emotion);
                        debugLog('😊 アプリ内音声感情データをVRMに送信完了:', emotionResult.emotion);
                    }
                }
            } catch (emotionError) {
                debugLog('❌ 感情データ送信エラー:', emotionError);
                // エラーが発生しても音声再生は続行
            }
            
            // Blobを作成して音声ファイルとして再生
            const audioBlob = new Blob([arrayBuffer], { type: 'audio/wav' });
            const audioUrl = URL.createObjectURL(audioBlob);
            
            const audio = new Audio(audioUrl);
            const volumeValue = await getSafeUnifiedConfig().get('voiceVolume', 50);
            const safeVolume = isNaN(volumeValue) ? 50 : volumeValue;
            audio.volume = Math.max(0, Math.min(1, safeVolume / 100));
            
            // 音声再生完了時の処理
            audio.onended = () => {
                debugLog('🎵 アプリ内音声再生完了:', text?.substring(0, 30) + '...');
                // VoiceQueueの完了待機用に状態を更新
                this.voicePlayingState.isPlaying = false;
                // 音声終了をVRMビューワーに通知（表情リセットのため）
                this.notifyAudioStateToVRM('ended');
                URL.revokeObjectURL(audioUrl);
            };
            
            audio.onerror = (error) => {
                debugLog('❌ アプリ内音声再生エラー:', error);
                this.voicePlayingState.isPlaying = false;
                URL.revokeObjectURL(audioUrl);
            };
            
            // 音声再生開始をVRMビューワーに通知
            this.notifyAudioStateToVRM('playing');
            
            await audio.play();
            
        } catch (error) {
            debugLog('❌ アプリ内音声再生処理エラー:', error);
            this.voicePlayingState.isPlaying = false;
        }
    }

    // アプリ内監視モード用の音声再生メソッド
    async playAudio(audioData) {
        try {
            debugLog('🎵 アプリ内監視モード音声再生開始');
            
            // 音声データの形式を検証
            if (!audioData || audioData.length === 0) {
                debugLog('❌ 音声データが無効です');
                return;
            }
            
            // Bufferから音声データを再生するためBlobを作成
            // ArrayBufferに変換してから処理
            const arrayBuffer = audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength);
            
            // 音声データの形式を検証
            const audioBlob = new Blob([arrayBuffer], { type: 'audio/wav' });
            if (audioBlob.size === 0) {
                debugLog('❌ 音声Blobが空です');
                return;
            }
            
            const audioUrl = URL.createObjectURL(audioBlob);
            
            debugLog('🎵 音声Blob作成完了:', {
                bufferSize: audioData.length,
                blobSize: audioBlob.size,
                blobType: audioBlob.type
            });
            
            // VRMリップシンク用に音声データを送信
            try {
                this.sendAudioToVRM(audioData);
                debugLog('🎭 アプリ内監視音声データをVRMに送信完了');
            } catch (vrmError) {
                debugLog('❌ VRM音声データ送信エラー:', vrmError);
                // エラーが発生しても音声再生は続行
            }
            
            // 音声再生
            const audio = new Audio();
            const volumeValue = await getSafeUnifiedConfig().get('voiceVolume', 50);
            const safeVolume = isNaN(volumeValue) ? 50 : volumeValue;
            audio.volume = Math.max(0, Math.min(1, safeVolume / 100));
            
            debugLog('🔊 音量設定:', { volumeValue, safeVolume, finalVolume: audio.volume });
            
            // イベントハンドラーを先に設定
            audio.onended = () => {
                debugLog('🔊 アプリ内監視音声再生完了');
                
                // 音声終了をVRMビューワーに通知
                this.notifyAudioStateToVRM('ended');
                
                // URLオブジェクトを解放
                URL.revokeObjectURL(audioUrl);
            };
            
            audio.onerror = (error) => {
                debugLog('❌ アプリ内監視音声再生エラー:', error);
                debugLog('❌ エラー詳細:', {
                    error: error,
                    audioSrc: audio.src,
                    audioReadyState: audio.readyState,
                    audioNetworkState: audio.networkState
                });
                URL.revokeObjectURL(audioUrl);
                
                // フォールバック処理: 音声再生に失敗した場合でもVRMには通知
                this.notifyAudioStateToVRM('error');
            };
            
            audio.onloadeddata = () => {
                debugLog('🎵 音声データロード完了');
            };
            
            audio.oncanplay = () => {
                debugLog('🎵 音声再生準備完了');
            };
            
            // 音声データを設定
            audio.src = audioUrl;
            
            debugLog('🎵 音声再生開始:', {
                src: audioUrl,
                volume: audio.volume,
                duration: audio.duration
            });
            
            // 音声再生を試行し、失敗した場合はフォールバック処理
            try {
                await audio.play();
            } catch (playError) {
                debugLog('❌ 音声再生play()エラー:', playError);
                URL.revokeObjectURL(audioUrl);
                this.notifyAudioStateToVRM('error');
                
                // 再試行機能: 一度だけ再試行
                setTimeout(async () => {
                    try {
                        debugLog('🔄 音声再生再試行');
                        const retryAudio = new Audio(audioUrl);
                        retryAudio.volume = audio.volume;
                        retryAudio.onended = audio.onended;
                        retryAudio.onerror = audio.onerror;
                        await retryAudio.play();
                    } catch (retryError) {
                        debugLog('❌ 音声再生再試行も失敗:', retryError);
                        URL.revokeObjectURL(audioUrl);
                    }
                }, 500);
            }
            
        } catch (error) {
            debugLog('❌ アプリ内監視音声再生処理エラー:', error);
            // エラー発生時もVRMに通知
            this.notifyAudioStateToVRM('error');
        }
    }

    // アプリ内監視モード専用: テキストを表示しながら音声を再生
    async playAudioWithText(audioData, text) {
        try {
            // 音声再生を実行
            await this.playAudio(audioData);
            
            // チャットにテキストを表示
            if (text) {
                this.addVoiceMessage('shy', text);
                debugLog('💬 アプリ内監視モードテキスト表示:', text);
            }
            
        } catch (error) {
            debugLog('❌ アプリ内監視音声+テキスト再生エラー:', error);
        }
    }

    // 起動時音声ファイルクリーンアップ
    cleanupStartupAudioFiles() {
        try {
            const AudioFileCleanup = require('./modules/audio-file-cleanup');
            const cleanup = new AudioFileCleanup();
            const result = cleanup.cleanupAllFiles();
            
            if (result.filesRemoved > 0) {
                debugLog(`🧹 起動時音声ファイルクリーンアップ完了: ${result.filesRemoved}個のファイル削除`);
            }
            
            if (!result.success && result.error) {
                debugLog('❌ 起動時クリーンアップエラー:', result.error);
            }
            
            return result;
        } catch (error) {
            debugLog('❌ 起動時音声ファイルクリーンアップエラー:', error);
            return { success: false, error: error.message };
        }
    }

    // 初期設定の読み込み（起動時のみ）
    async loadInitialSettings() {
        // 起動時音声ファイルクリーンアップを実行
        this.cleanupStartupAudioFiles();
        
        // 統一設定システムから設定を読み込み（起動時のみ）
        const config = getSafeUnifiedConfig();
        this.voiceEnabled = await config.get('voiceEnabled', this.voiceEnabled);
        this.selectedSpeaker = await config.get('selectedSpeaker', this.selectedSpeaker);
        this.voiceIntervalSeconds = await config.get('voiceIntervalSeconds', this.voiceIntervalSeconds);
        this.voiceVolume = await config.get('voiceVolume', this.voiceVolume);
        
        debugLog('Initial settings loaded:', {
            voiceEnabled: this.voiceEnabled,
            selectedSpeaker: this.selectedSpeaker,
            voiceIntervalSeconds: this.voiceIntervalSeconds,
            voiceVolume: this.voiceVolume
        });
    }

    // タブ管理システム初期化
    initializeTabManager() {
        this.tabManager = new TabManager(this);
        this.tabManager.initialize();
    }

    // UIEventManager初期化
    initializeUIEventManager() {
        this.uiEventManager = new UIEventManager(this);
        this.uiEventManager.setupEventListeners();
    }

    setupTerminal() {
        this.terminal = new Terminal(TerminalFactory.createConfig());
        
        // ErrorHandlerはすでにinitで初期化済み

        this.fitAddon = new FitAddon.FitAddon();
        this.terminal.loadAddon(this.fitAddon);
        this.terminal.loadAddon(new WebLinksAddon.WebLinksAddon());

        const terminalElement = document.getElementById('terminal');
        if (terminalElement) {
            this.terminal.open(terminalElement);
        }
        
        this.fitAddon.fit();

        // Handle terminal input
        this.terminal.onData((data) => {
            if (this.isTerminalRunning) {
                window.electronAPI.terminal.write(data);
            }
        });

        // Handle window resize (ResourceManager経由)
        this.resourceManager.addEventListener(window, 'resize', () => {
            // デバウンス処理付きリサイズ制御
            this.handleResize();
            
            if (this.fitAddon) {
                this.fitAddon.fit();
                if (this.isTerminalRunning) {
                    window.electronAPI.terminal.resize(
                        this.terminal.cols,
                        this.terminal.rows
                    );
                }
            }
        });

        // Handle terminal data from backend
        if (window.electronAPI && window.electronAPI.terminal) {
            window.electronAPI.terminal.onData((data) => {
                debugLog('📡 ターミナルデータ受信:', {
                    dataLength: data.length,
                    hasTerminal: !!this.terminal,
                    dataPreview: data.substring(0, 50)
                });
                
                if (this.terminal) {
                    this.terminal.write(data);
                }
                // MessageAccumulatorに送信（二重処理を防ぐため、直接processTerminalDataは呼び出さない）
                this.messageAccumulator.addChunk(data);
            });

            // Handle Claude Code exit
            window.electronAPI.terminal.onExit((exitCode) => {
                this.terminal.write(`\r\n\x1b[91mClaude Code exited with code: ${exitCode}\x1b[0m\r\n`);
                this.isTerminalRunning = false;
                this.updateStatus('Claude Code stopped');
                this.updateButtons();
            });
        } else {
            debugError('electronAPI not available');
            this.updateStatus('ElectronAPI not available');
        }


        // Handle voice text available - DISABLED for bracket-only mode
        if (window.electronAPI && window.electronAPI.voice) {
            // window.electronAPI.voice.onTextAvailable((text) => {
            //     if (this.voiceEnabled) {
            //         this.speakText(text);
            //     }
            // });

            // Handle audio playback - VoiceQueueシステムを使用するため無効化
            // window.electronAPI.voice.onPlayAudio((data) => {
            //     if (data.audioData) {
            //         // 新しい形式: { audioData: Buffer, text: string }
            //         this.playAudioWithText(data.audioData, data.text);
            //     } else {
            //         // 旧形式: 直接Buffer
            //         this.playAudio(data);
            //     }
            // });

            // Handle audio stop - Hook機能常時有効のため無効化
            // window.electronAPI.voice.onStopAudio(() => {
            //     this.stopAudio();
            // });

            // Handle Hook conversation display
            window.electronAPI.voice.onShowHookConversation((data) => {
                this.displayHookConversation(data);
            });
        }
    }

    // setupEventListeners() - modules/ui-event-manager.js に移動済み

    setupChatInterface() {
        // チャット入力エリアは削除済み

        // 初期メッセージを追加（音声読み上げ用）
        this.addVoiceMessage('ニコ', 'こんにちは〜！何をお手伝いしましょうか？');
    }


    // 🗑️ 旧バッチ処理システムは削除し、MessageAccumulatorで置き換え
    // 以下の関数は互換性のため残してありますが、使用されません
    
    // デバッグ用: MessageAccumulatorの状態を取得
    getMessageAccumulatorStatus() {
        return this.messageAccumulator.getStatus();
    }

    // 新しい統一処理システム: アプリ内監視モードとHookモードを統合
    async processTerminalData(data) {
        try {
            // 統一設定から現在のモードを取得
            const unifiedConfig = getSafeUnifiedConfig();
            const useHooks = await unifiedConfig.get('useHooks', false);
            
            if (useHooks) {
                // Hookモード: 外部ターミナルの音声処理はHook側で処理されるため、ここでは何もしない
                return;
            }
            
            // アプリ内監視モード: ターミナルデータから音声を抽出して処理
            debugLog('🔍 アプリ内監視モード - ターミナルデータ処理開始');
            
            // ProcessingCacheによる最適化されたテキストクリーニング
            const cleanData = this.processingCache.optimizedTextCleaning(data);
            
            // Claude Code (⏺) のマーカーを検索
            let markerIndex = cleanData.indexOf('⏺');
            
            if (markerIndex === -1) {
                return;
            }
            
            let afterMarker = cleanData.substring(markerIndex + 1).trim();
            
            // カッコ内のテキストを抽出（キャッシュ化された正規表現処理）
            const quotedTextMatches = this.processingCache.cachedRegexProcess(
                afterMarker, 
                /『([^』]+)』/gs
            );
            
            if (quotedTextMatches && quotedTextMatches.length > 0) {
                // カギカッコ内のテキストを一個ずつ処理
                await this.processQuotedTexts(quotedTextMatches);
            }
            
        } catch (error) {
            this.errorHandler.handle(error, {
                severity: ErrorHandler.SEVERITY.LOW,
                category: ErrorHandler.CATEGORY.PROCESS,
                operation: 'process-terminal-data',
                userMessage: 'ターミナルデータの処理中にエラーが発生しました'
            });
        }
    }
    
    // 旧処理: 互換性のために残す
    async parseTerminalDataForChat(data) {
        debugLog('⚠️ 旧処理parseTerminalDataForChatが呼ばれました - processTerminalDataに委譲');
        return await this.processTerminalData(data);
        
        // 以下は無効化済み
        /*
        try {
            // Hook機能が常時有効なため、従来の音声合成処理は完全に無効化
            return;
            
            // ProcessingCacheによる最適化されたテキストクリーニング
            const cleanData = this.processingCache.optimizedTextCleaning(data);
            
            // Claude Code (⏺) のマーカーを検索
            let markerIndex = cleanData.indexOf('⏺');
            
            if (markerIndex === -1) {
                return;
            }
            
            let afterMarker = cleanData.substring(markerIndex + 1).trim();
            
            // カッコ内のテキストを抽出（キャッシュ化された正規表現処理）
            const quotedTextMatches = this.processingCache.cachedRegexProcess(
                afterMarker, 
                /『([^』]+)』/gs
            );
            
            if (quotedTextMatches && quotedTextMatches.length > 0) {
                // カギカッコ内のテキストを一個ずつ処理
                this.processQuotedTexts(quotedTextMatches);
                return; // カギカッコ処理の場合は通常の処理をスキップ
            } else {
                // カギカッコがない場合は読み上げをスキップ
                return; // 読み上げをスキップ
            }

        } catch (error) {
            this.errorHandler.handle(error, {
                severity: ErrorHandler.SEVERITY.LOW,
                category: ErrorHandler.CATEGORY.PROCESS,
                operation: 'parse-terminal-data',
                userMessage: 'チャットデータの解析中にエラーが発生しました'
            });
        }
        */
    }

    // 音声再生完了を待機する関数
    async waitForAudioComplete() {
        return new Promise(resolve => {
            // Hook音声再生中かチェック
            if (!this.isPlayingHookAudio) {
                resolve();
                return;
            }
            
            const checkComplete = () => {
                if (!this.isPlayingHookAudio) {
                    debugLog('🎵 音声再生完了を確認');
                    resolve();
                } else {
                    setTimeout(checkComplete, 100);
                }
            };
            checkComplete();
        });
    }

    // カッコ内のテキストを一個ずつ順次処理（音声キューイングシステム使用）
    async processQuotedTexts(quotedTextMatches) {
        debugLog('🎵 processQuotedTexts開始:', { matchCount: quotedTextMatches.length });
        
        // 既存の音声キューをクリア（新しい音声セッション開始）
        this.voiceQueue.clear();
        
        for (let i = 0; i < quotedTextMatches.length; i++) {
            let quotedText = quotedTextMatches[i].replace(/[『』]/g, '').trim();
            
            // 改行と余分な空白を除去
            quotedText = quotedText.replace(/\r?\n\s*/g, '').replace(/\s+/g, ' ').trim();
            
            // 空のテキストはスキップ
            if (quotedText.length === 0) {
                continue;
            }
            
            // 音声キューに追加（順次処理）
            await this.voiceQueue.addToQueue(quotedText);
        }
        
        // キャラクターの気分をリセット（音声キュー処理完了後）
        setTimeout(() => {
            this.updateCharacterMood('待機中💕');
        }, AppConstants.MESSAGE.COMPLETION_TIMEOUT);
        
        debugLog('🎵 processQuotedTexts完了');
    }

    // Hook経由の会話表示
    displayHookConversation(data) {
        try {
            
            // チャット画面に表示
            this.addVoiceMessage('ニコ', data.text);
            
            // キャラクターの気分更新
            this.updateCharacterMood('おしゃべり中✨');
            
            // 一定時間後に気分をリセット
            setTimeout(() => {
                this.updateCharacterMood('待機中💕');
            }, 3000);
            
        } catch (error) {
            debugError('Hook会話表示エラー:', error);
        }
    }

    // sendChatMessage は削除済み（チャット入力エリア削除に伴い）

    // sendQuickMessage は削除済み

    addChatMessage(type, sender, text) {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = type === 'assistant' ? 'こ' : 'あ';

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';

        const messageText = document.createElement('p');
        messageText.className = 'message-text';
        messageText.textContent = text;

        const timeSpan = document.createElement('div');
        timeSpan.className = 'message-time';
        timeSpan.textContent = new Date().toLocaleTimeString('ja-JP', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        bubble.appendChild(messageText);
        bubble.appendChild(timeSpan);
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(bubble);

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // メッセージ履歴に追加
        this.chatMessages.push({ type, sender, text, timestamp: new Date() });
    }

    addVoiceMessage(speaker, text) {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;

        // DOMUpdaterを使用してセキュアで高速な更新
        DOMUpdater.addVoiceMessage(speaker, text, chatMessages);
        
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // メモリ最適化：履歴を制限
        this.chatMessages.push({ type: 'voice', speaker, text, timestamp: Date.now() });
        if (this.chatMessages.length > 50) {
            this.chatMessages.shift();
        }
    }

    updateCharacterMood(mood) {
        const moodElement = document.querySelector('.character-mood');
        if (moodElement && moodElement.textContent !== mood) {
            moodElement.textContent = mood;
        }
    }

    // デバウンス処理付きリサイズ制御メソッド
    handleResize() {
        // 既存のリサイズタイマーをクリア
        if (this.resizeTimer) {
            clearTimeout(this.resizeTimer);
        }
        
        // リサイズ中フラグを設定
        this.isResizing = true;
        debugLog('🔄 リサイズ開始 - 音声処理を一時停止（デバウンス処理）');
        
        // 新しいタイマーを設定（最後のリサイズから300ms後に解除）
        this.resizeTimer = setTimeout(() => {
            this.isResizing = false;
            this.resizeTimer = null;
            debugLog('🔄 リサイズ完了 - 音声処理を再開（デバウンス処理）');
        }, 300);
    }

    async processTerminalData(data) {
        // リサイズ中は音声処理をスキップ（但し、新しいコンテンツは処理）
        if (this.isResizing) {
            debugLog('🔄 リサイズ中のため音声処理をスキップ:', {
                dataLength: data.length,
                dataPreview: data.substring(0, 50)
            });
            return;
        }
        
        const unifiedConfig = getSafeUnifiedConfig();
        const useHooks = await unifiedConfig.get('useHooks', false);
        
        debugLog('🔄 processTerminalData呼び出し:', {
            useHooks,
            dataLength: data.length,
            dataPreview: data.substring(0, 100),
            isResizing: this.isResizing
        });
        
        if (useHooks) {
            // Hookモード: 外部ターミナルのみ処理、アプリ内ターミナルは音声処理なし
            if (!this.isAppTerminalData(data)) {
                debugLog('📡 外部ターミナル（Hookモード）: Hook専用処理');
                await this.processHookOnlyData(data);
            } else {
                debugLog('📱 アプリ内ターミナル（Hookモード）: 音声処理スキップ');
                // アプリ内ターミナルでは音声処理を行わない
            }
        } else {
            // フックモードOFF: 全てのターミナルをアプリ内で処理
            debugLog('📱 アプリ内監視モード: processAppInternalMode呼び出し');
            this.processAppInternalMode(data);
        }
    }

    // Hook専用データ処理（音声再生なし）
    async processHookOnlyData(data) {
        debugLog('🎣 Hook専用データ処理開始:', {
            dataLength: data.length,
            dataPreview: data.substring(0, 100)
        });
        
        // 『』で囲まれたテキストを抽出
        const quotedTextRegex = /『([^』]+)』/g;
        const matches = [];
        let match;
        
        while ((match = quotedTextRegex.exec(data)) !== null) {
            matches.push(match[1]);
        }
        
        if (matches.length > 0) {
            debugLog('🎣 Hook専用: テキスト検出 - Hook音声処理待機中:', matches);
            // Hook処理は外部のHook通知システムに委ねる
            // ここでは音声処理は実行しない
        } else {
            debugLog('🎣 Hook専用: 『』テキストなし');
        }
    }

    // アプリ内ターミナルのデータかどうかを判定
    isAppTerminalData(data) {
        // フリーズ問題を回避するため、当面は以下の戦略を取る：
        // 1. Hookモードでアプリ内ターミナルを使用する場合は直接処理
        // 2. Hook通知ファイルが存在する場合は外部ターミナルと判定
        
        try {
            const fs = require('fs');
            const path = require('path');
            
            // Hook通知ファイルの存在確認
            const tempDir = path.join(this.claudeWorkingDir, 'temp');
            if (fs.existsSync(tempDir)) {
                const files = fs.readdirSync(tempDir);
                const hasHookNotification = files.some(file => 
                    file.startsWith('notification_') && file.endsWith('.json')
                );
                
                if (hasHookNotification) {
                    // Hook通知ファイルがある = 外部ターミナル
                    debugLog('🔍 Hook通知ファイル検出 - 外部ターミナルと判定');
                    return false;
                }
            }
            
            // Hook通知ファイルがない = アプリ内ターミナル
            debugLog('🔍 Hook通知ファイルなし - アプリ内ターミナルと判定');
            return true;
            
        } catch (error) {
            // エラー時は安全のためアプリ内ターミナルとして扱う
            debugLog('🔍 データソース判定エラー - アプリ内ターミナルとして処理:', error);
            return true;
        }
    }

    processAppInternalMode(data) {
        debugLog('🔍 processAppInternalMode開始 - VoiceQueue使用版:', {
            dataLength: data.length,
            dataContent: data.substring(0, 100) + '...'
        });
        
        // 『』で囲まれたテキストを全て抽出
        const quotedTextMatches = [];
        const quotedTextRegex = /『([^』]+)』/g;
        let match;
        
        while ((match = quotedTextRegex.exec(data)) !== null) {
            quotedTextMatches.push(match[0]); // 『』付きで保存
            debugLog('✨ 『』テキスト検出:', {
                matchNumber: quotedTextMatches.length,
                fullMatch: match[0],
                textContent: match[1]
            });
        }
        
        if (quotedTextMatches.length > 0) {
            debugLog('✅ アプリ内モード: VoiceQueueで順次処理開始:', {
                totalMatches: quotedTextMatches.length,
                texts: quotedTextMatches
            });
            // 既存のprocessQuotedTexts（VoiceQueue使用）を使用
            this.processQuotedTexts(quotedTextMatches);
        } else {
            debugLog('❌ 『』テキストが見つかりませんでした');
        }
    }

    // 旧処理: アプリ内モード個別音声実行（VoiceQueue使用のため無効化）
    /*
    async executeSpeechForAppMode(text) {
        debugLog('🎤 executeSpeechForAppMode開始:', {
            text: text,
            textLength: text.length,
            voiceEnabled: this.voiceEnabled,
            selectedSpeaker: this.selectedSpeaker
        });
        
        try {
            // 音声合成が有効かチェック
            if (!this.voiceEnabled) {
                debugLog('🔇 音声読み上げが無効のため、処理をスキップ');
                return;
            }

            // ElectronAPI経由で音声読み上げ実行
            if (window.electronAPI && window.electronAPI.voice) {
                debugLog('📞 ElectronAPI.voice.speak呼び出し開始');
                await window.electronAPI.voice.speak(text, this.selectedSpeaker);
                debugLog('📞 ElectronAPI.voice.speak呼び出し完了');
                
                // 音声履歴に追加
                if (this.speechHistory) {
                    this.speechHistory.addToHistory(text);
                    debugLog('📝 音声履歴に追加完了');
                }
                
                debugLog('🎵 アプリ内監視モード音声読み上げ完了:', text);
            } else {
                debugLog('❌ ElectronAPI.voice が利用できません:', {
                    hasElectronAPI: !!window.electronAPI,
                    hasVoice: !!(window.electronAPI && window.electronAPI.voice)
                });
            }
        } catch (error) {
            debugError('❌ アプリ内監視モード音声処理エラー:', error);
        }
    }
    */

    async initializeVoiceMode() {
        const unifiedConfig = getSafeUnifiedConfig();
        const useHooks = await unifiedConfig.get('useHooks', false);
        
        // 設定に応じて初期化処理を実行
        if (useHooks) {
            // Hook音声モードで初期化完了
        } else {
            debugLog('🔄 アプリ内監視モードで初期化完了');
        }
    }

    switchVoiceMode(useHooks) {
        debugLog('🔄 switchVoiceMode呼び出し:', {
            useHooks: useHooks,
            voiceEnabled: this.voiceEnabled,
            selectedSpeaker: this.selectedSpeaker
        });
        
        if (useHooks) {
        } else {
            debugLog('🔄 アプリ内監視モードに切り替え');
        }
    }

    async startTerminal(aiType) {
        // タブシステムが有効な場合はアクティブタブでAIを起動
        if (this.tabManager && this.tabManager.activeTabId) {
            return await this.startTerminalForActiveTab(aiType);
        }
        
        // 従来のメインターミナル起動（後方互換性）
        try {
            if (!window.electronAPI || !window.electronAPI.terminal) {
                this.updateStatus('ElectronAPI not available');
                return;
            }

            const aiName = aiType === 'claude' ? 'Claude Code' : 'Claude Code (Dangerous)';
            
            this.updateStatus(`Starting ${aiName}...`);
            const result = await window.electronAPI.terminal.start(aiType);
            
            if (result.success) {
                this.isTerminalRunning = true;
                this.currentRunningAI = aiType; // 起動したAIの種類を保存
                this.updateStatus(`${aiName} running - Type your message and press Enter`);
                this.terminal.focus();
                
                this.terminal.writeln(`\x1b[90m🎀 KawAIi Code Integration Started! 🎀\x1b[0m`);
                this.terminal.writeln(`\x1b[90m${aiName} is starting up...\x1b[0m`);
                
                this.addVoiceMessage('ニコ', `${aiName}が起動したよ〜！`);

                setTimeout(() => {
                    this.fitAddon.fit();
                    window.electronAPI.terminal.resize(
                        this.terminal.cols,
                        this.terminal.rows
                    );
                }, 100);
            } else {
                // 失敗した場合、メインプロセスからの詳細なエラーメッセージを表示
                const errorMessage = result.error || `Failed to start ${aiName}`;
                this.updateStatus(errorMessage);
                debugError(`Failed to start ${aiName}:`, errorMessage);
            }
        } catch (error) {
            const aiName = aiType === 'claude' ? 'Claude Code' : 'Claude Code (Dangerous)';
            debugError(`Error starting ${aiName}:`, error);
            this.updateStatus(`Error starting ${aiName}: ${error.message}`);
        }
        
        this.updateButtons();
    }
    
    async startTerminalForActiveTab(aiType) {
        if (!this.tabManager || !this.tabManager.activeTabId) {
            debugError('No active tab available');
            return;
        }
        
        const activeTab = this.tabManager.tabs[this.tabManager.activeTabId];
        if (!activeTab) {
            debugError('Active tab not found');
            return;
        }
        
        // 既にAIが起動している場合は停止してから新しいAIを起動
        if (activeTab.isRunning) {
            await this.tabManager.stopAIForTab(this.tabManager.activeTabId);
        }
        
        const aiName = aiType === 'claude' ? 'Claude Code' : 'Claude Code (Dangerous)';
        this.updateStatus(`Starting ${aiName} in active tab...`);
        
        try {
            const success = await this.tabManager.startAIForTab(this.tabManager.activeTabId, aiType);
            if (success) {
                // タブ情報を更新
                activeTab.aiType = aiType;
                activeTab.isRunning = true;
                activeTab.name = `${aiType === 'claude' ? 'Claude' : 'Claude-D'} #${activeTab.id.split('-')[1]}`;
                
                this.updateStatus(`${aiName} running in tab - Type your message and press Enter`);
                this.addVoiceMessage('ニコ', `${aiName}をタブで起動したよ〜！`);
                
                // タブUIを更新
                this.tabManager.renderTabs();
            } else {
                this.updateStatus(`Failed to start ${aiName} in tab`);
            }
        } catch (error) {
            debugError(`Error starting ${aiName} in tab:`, error);
            this.updateStatus(`Error starting ${aiName} in tab: ${error.message}`);
        }
        
        this.updateButtons();
    }

    async stopTerminal() {
        try {
            if (!window.electronAPI || !window.electronAPI.terminal) {
                this.updateStatus('ElectronAPI not available');
                return;
            }
            
            this.updateStatus('Stopping AI assistant...');
            const result = await window.electronAPI.terminal.stop();
            
            if (result.success) {
                this.isTerminalRunning = false;
                this.updateStatus('AI assistant stopped');
                this.terminal.clear();

                // CLAUDE.mdファイルを削除
                if (this.currentRunningAI) { // 念のためnullチェック
                    const deleteResult = await this.configManager.deleteAiMdFromHomeDir(this.currentRunningAI);
                    
                    if (deleteResult.success) {
                        this.addVoiceMessage('ニコ', `CLAUDE.mdを削除したよ！`);
                    } else {
                        this.addVoiceMessage('ニコ', `CLAUDE.mdの処理に失敗しちゃった...`);
                    }
                }
                this.currentRunningAI = null; // 停止したのでクリア
            } else {
                this.updateStatus(`Failed to stop AI assistant: ${result.error || 'Unknown error'}`);
            }
        } catch (error) {
            debugError('Error stopping AI assistant:', error);
            this.updateStatus(`Error stopping AI assistant: ${error.message}`);
        }
        
        this.updateButtons();
    }

    updateStatus(message) {
        const statusElement = document.getElementById('status');
        if (statusElement) {
            statusElement.textContent = message;
        }
    }

    // 両方のAI.mdファイルを生成
    async generateAiMdFiles() {
        try {
            const result = await this.configManager.generateBothAiMdFiles();
            if (result.success) {
                this.addVoiceMessage('ニコ', 'CLAUDE.mdを準備したよ！');
                debugLog('AI MD files generated successfully');
            } else {
                this.addVoiceMessage('ニコ', 'AI設定ファイルの生成に失敗しちゃった...');
                debugError('Failed to generate AI MD files:', result);
            }
            return result;
        } catch (error) {
            debugError('Error generating AI MD files:', error);
            this.addVoiceMessage('ニコ', 'AI設定ファイルの生成でエラーが発生したよ...');
            return { success: false, error: error.message };
        }
    }

    // アプリ終了時にAI.mdファイルを削除
    async cleanupAiMdFiles() {
        try {
            const result = await this.configManager.deleteBothAiMdFiles();
            debugLog('AI MD files cleanup result:', result);
            return result;
        } catch (error) {
            debugError('Error during AI MD files cleanup:', error);
            return { success: false, error: error.message };
        }
    }

    // updateButtons() と updateVoiceControls() - UIEventManagerで処理
    updateButtons() {
        if (this.uiEventManager) {
            this.uiEventManager.updateButtons();
        }
    }

    updateVoiceControls() {
        if (this.uiEventManager) {
            this.uiEventManager.updateVoiceControls();
        }
    }
    
    async syncSettingsToModal() {
        // 音声読み上げ設定の同期
        const voiceToggleModal = document.getElementById('voice-toggle-modal');
        const speakerSelectModal = document.getElementById('speaker-select-modal');
        const cooldownInputModal = document.getElementById('voice-cooldown-modal');
        const connectionStatusModal = document.getElementById('connection-status-modal');

        if (voiceToggleModal) voiceToggleModal.checked = this.voiceEnabled;
        
        
        await this.updateSpeakerSelect();
        this.updateConnectionStatus(this.connectionStatus === 'connected' ? '接続済み' : '未接続', this.connectionStatus);

        // 壁紙設定の同期は WallpaperSystem モジュールで処理

        // Claude Code 作業ディレクトリ設定の同期
        const claudeCwdDisplay = document.getElementById('claude-cwd-display');
        const claudeCwdMessage = document.getElementById('claude-cwd-message');

        try {
            const result = await window.electronAPI.getClaudeCwd();
            if (result.success) {
                this.claudeWorkingDir = result.cwd; // クラス変数に保存
                if (claudeCwdDisplay) claudeCwdDisplay.textContent = this.claudeWorkingDir;
            } else {
                console.error('現在の作業ディレクトリの取得に失敗しました:', result.error);
                if (claudeCwdDisplay) claudeCwdDisplay.textContent = '取得失敗';
                if (claudeCwdMessage) {
                    claudeCwdMessage.textContent = `エラー: ${result.error}`;
                    claudeCwdMessage.style.color = 'red';
                }
            }
        } catch (error) {
            console.error('Electron APIの呼び出し中にエラーが発生しました:', error);
            if (claudeCwdDisplay) claudeCwdDisplay.textContent = 'エラー';
            if (claudeCwdMessage) {
                claudeCwdMessage.textContent = '作業ディレクトリの取得中にエラーが発生しました。';
                claudeCwdMessage.style.color = 'red';
            }
        }

        // マイグレーション機能は削除済み

        // 現在の設定を統一設定システムに保存（読み込みは初期化時のみ）
        const unifiedConfig = getSafeUnifiedConfig();
        await unifiedConfig.set('voiceEnabled', this.voiceEnabled);
        await unifiedConfig.set('selectedSpeaker', this.selectedSpeaker);

        // 壁紙設定の復元は WallpaperSystem モジュールで処理

        if (this.claudeWorkingDir) {
            await unifiedConfig.set('claudeWorkingDir', this.claudeWorkingDir);
        }
    }

    async handleSelectClaudeCwd() {
        const claudeCwdDisplay = document.getElementById('claude-cwd-display');
        const claudeCwdMessage = document.getElementById('claude-cwd-message');

        if (claudeCwdMessage) {
            claudeCwdMessage.textContent = ''; // 古いメッセージをクリア
            claudeCwdMessage.style.color = '';
        }

        try {
            const result = await window.electronAPI.openDirectoryDialog();
            if (result.success && result.path) {
                this.claudeWorkingDir = result.path; // クラス変数を更新
                if (claudeCwdDisplay) claudeCwdDisplay.textContent = this.claudeWorkingDir;
                if (claudeCwdMessage) {
                    claudeCwdMessage.textContent = `作業ディレクトリを\'${result.path}\'に設定しました。`;
                    claudeCwdMessage.style.color = 'green';
                }
                
                // ConfigManagerにも作業ディレクトリを同期
                this.configManager.setWorkingDirectory(this.claudeWorkingDir);
                
                // 作業ディレクトリ設定時に両方のAI.mdファイルを再生成
                await this.generateAiMdFiles();

            } else if (result.success && !result.path) {
                if (claudeCwdMessage) {
                    claudeCwdMessage.textContent = '作業ディレクトリの選択がキャンセルされました。';
                    claudeCwdMessage.style.color = 'orange';
                }
            } else {
                if (claudeCwdMessage) {
                    claudeCwdMessage.textContent = `エラー: ${result.error}`;
                    claudeCwdMessage.style.color = 'red';
                }
            }
        } catch (error) {
            console.error('Electron APIの呼び出し中にエラーが発生しました:', error);
            if (claudeCwdMessage) {
                claudeCwdMessage.textContent = '作業ディレクトリの設定中にエラーが発生しました。';
                claudeCwdMessage.style.color = 'red';
            }
        }
    }

    async checkVoiceConnection() {
        if (window.electronAPI && window.electronAPI.voice) {
            try {
                const result = await window.electronAPI.voice.checkConnection();
                if (result.success) {
                    this.connectionStatus = 'connected';
                    this.updateConnectionStatus('接続済み', 'connected');
                    await this.loadSpeakers();
                } else {
                    this.connectionStatus = 'disconnected';
                    this.updateConnectionStatus('未接続', 'disconnected');
                }
            } catch (error) {
                this.connectionStatus = 'error';
                this.updateConnectionStatus('エラー', 'error');
                debugError('Voice connection check failed:', error);
            }
            this.updateVoiceControls();
        }
    }

    async loadSpeakers() {
        if (window.electronAPI && window.electronAPI.voice) {
            try {
                const result = await window.electronAPI.voice.getSpeakers();
                if (result.success) {
                    this.speakers = result.speakers;
                    debugLog('Loaded speakers:', this.speakers);
                    await this.updateSpeakerSelect();
                }
            } catch (error) {
                debugError('Failed to load speakers:', error);
            }
        }
    }

    async updateSpeakerSelect() {
        const speakerSelectModal = document.getElementById('speaker-select-modal');
        if (speakerSelectModal && this.speakers.length > 0) {
            // DOMUpdaterを使用して差分更新
            DOMUpdater.updateSpeakerOptions(speakerSelectModal, this.speakers, this.selectedSpeaker);
            
            // 現在選択中の話者IDを保持（リセットしない）
            let targetSpeakerId = this.selectedSpeaker;
            
            // 初回起動時など、まだ話者が選択されていない場合のみデフォルト設定を読み込み
            if (!targetSpeakerId || (targetSpeakerId === 0 && !this.speakerInitialized)) {
                if (window.electronAPI && window.electronAPI.config) {
                    try {
                        targetSpeakerId = await window.electronAPI.config.get('defaultSpeakerId');
                        this.speakerInitialized = true; // 初期化フラグを設定
                    } catch (error) {
                        debugError('保存済み話者ID取得エラー:', error);
                    }
                }
            }
            
            // 対象の話者IDが有効な場合はそれを選択、そうでなければ最初の話者を選択
            if (targetSpeakerId !== null && targetSpeakerId !== undefined && targetSpeakerId !== 0) {
                // 対象IDが話者リストに存在するかチェック
                const validOption = Array.from(speakerSelectModal.options).find(option => 
                    parseInt(option.value) === targetSpeakerId
                );
                if (validOption) {
                    this.selectedSpeaker = targetSpeakerId;
                    speakerSelectModal.value = targetSpeakerId;
                    debugLog('話者IDを復元:', targetSpeakerId);
                } else {
                    // 対象IDが無効な場合は最初の話者を選択
                    this.selectedSpeaker = this.speakers[0].styles[0].id;
                    speakerSelectModal.value = this.selectedSpeaker;
                    debugLog('話者IDが無効、デフォルトに設定:', this.selectedSpeaker);
                }
            } else {
                // 対象IDがない場合は最初の話者を選択
                this.selectedSpeaker = this.speakers[0].styles[0].id;
                speakerSelectModal.value = this.selectedSpeaker;
                debugLog('話者IDが未設定、デフォルトに設定:', this.selectedSpeaker);
            }
        }
    }

    updateConnectionStatus(text, status) {
        const statusElementModal = document.getElementById('connection-status-modal');
        if (statusElementModal) {
            statusElementModal.textContent = text;
            statusElementModal.className = `status-${status}`;
        }
    }

    async speakText(text) {
        
        // 前提条件チェック
        if (!window.electronAPI || !window.electronAPI.voice) {
            debugLog('⚠️ electronAPIまたはvoice APIが利用不可');
            return;
        }
        
        if (!this.voiceEnabled) {
            debugLog('🔇 音声機能が無効のためスキップ');
            return;
        }
        
        if (this.connectionStatus !== 'connected') {
            debugLog(`⚠️ 音声エンジン未接続のためスキップ (現在のステータス: ${this.connectionStatus})`);
            return;
        }

        // 重複チェックを実行
        if (this.speechHistory.isDuplicate(text)) {
            debugLog('🔄 重複テキストをスキップ:', text.substring(0, 30) + '...');
            // 重複スキップ時も間隔制御のためlastSpeechTimeを更新
            this.lastSpeechTime = Date.now();
            return;
        }

        try {
            // 読み上げ履歴に追加
            this.speechHistory.addToHistory(text);
            
            await window.electronAPI.voice.speak(text, this.selectedSpeaker);
            
        } catch (error) {
            debugError(`❌ 音声合成エラー:`, {
                message: error.message,
                textLength: text.length,
                speaker: this.selectedSpeaker,
                connectionStatus: this.connectionStatus,
                voiceEnabled: this.voiceEnabled
            });
            
            // エラー通知をユーザーに表示
            this.showVoiceError(error);
        }
    }
    
    // 音声合成のみ（再生なし）- VoiceQueue用
    async synthesizeTextOnly(text) {
        
        // 前提条件チェック
        if (!window.electronAPI || !window.electronAPI.voice) {
            debugLog('⚠️ electronAPIまたはvoice APIが利用不可');
            return null;
        }
        
        if (!this.voiceEnabled) {
            debugLog('🔇 音声機能が無効のためスキップ');
            return null;
        }
        
        if (this.connectionStatus !== 'connected') {
            debugLog(`⚠️ 音声エンジン未接続のためスキップ (現在のステータス: ${this.connectionStatus})`);
            return null;
        }

        try {
            // 音声合成（再生なし）
            const result = await window.electronAPI.voice.synthesize(text, this.selectedSpeaker);
            if (result.success) {
                debugLog('🎵 音声合成のみ完了:', text.substring(0, 30) + '...');
                return result.audioData;
            } else {
                debugLog('❌ 音声合成失敗:', result.error);
                return null;
            }
        } catch (error) {
            debugLog('❌ 音声合成エラー:', error);
            return null;
        }
    }
    
    // ユーザー向けエラー通知
    showVoiceError(error) {
        const errorMessage = this.getVoiceErrorMessage(error);
        
        // エラー通知を画面に表示
        this.showNotification(errorMessage, 'error');
        
        // 音声関連のUIを更新
        this.updateVoiceErrorIndicator(error);
    }
    
    // エラーメッセージの生成
    getVoiceErrorMessage(error) {
        if (error.errorType) {
            switch (error.errorType) {
                case 'network':
                    return '音声エンジンに接続できません。AivisSpeechが起動しているか確認してください。';
                case 'timeout':
                    return '音声生成に時間がかかりすぎています。しばらく待ってから再試行してください。';
                case 'server':
                    return '音声エンジンでエラーが発生しました。エンジンの再起動を試してください。';
                case 'synthesis':
                    return 'テキストの音声変換に失敗しました。内容を確認してください。';
                default:
                    return '音声読み上げエラーが発生しました。';
            }
        }
        
        return `音声読み上げエラー: ${error.message || 'Unknown error'}`;
    }
    
    // 通知の表示
    showNotification(message, type = 'info') {
        // 既存の通知を削除
        const existingNotification = document.querySelector('.voice-notification');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        // 新しい通知を作成
        const notification = document.createElement('div');
        notification.className = `voice-notification voice-notification-${type}`;
        notification.textContent = message;
        
        // 通知のスタイルを設定
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#ff4444' : '#4CAF50'};
            color: white;
            padding: 12px 16px;
            border-radius: 8px;
            font-size: 14px;
            z-index: ${AppConstants.UI.Z_INDEX_HIGH};
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            max-width: 300px;
            word-wrap: break-word;
        `;
        
        document.body.appendChild(notification);
        
        // 5秒後に自動削除
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }
    
    // 音声エラーインジケーターの更新
    updateVoiceErrorIndicator(error) {
        const statusElement = document.getElementById('connection-status-modal');
        if (statusElement) {
            statusElement.textContent = 'エラー発生';
            statusElement.className = 'status-error';
            
            // 10秒後にステータスを復元
            setTimeout(() => {
                this.checkVoiceConnection();
            }, AppConstants.UI.CLEANUP_DELAY);
        }
    }


    // VRMビューワーに音声データを送信
    sendAudioToVRM(audioData) {
        try {
            const iframe = document.getElementById('vrm-iframe');
            if (!iframe || !iframe.contentWindow) {
                debugLog('🎭 VRM iframe未発見');
                return;
            }
            
            // audioDataの形式を検証
            if (!audioData || audioData.length === 0) {
                debugLog('🎭 音声データが無効です');
                return;
            }
            
            // ArrayBufferを直接Arrayに変換（すでにコピー済み）
            let audioArray;
            try {
                audioArray = Array.from(new Uint8Array(audioData));
            } catch (conversionError) {
                debugLog('🎭 音声データ変換エラー:', conversionError);
                return;
            }
            
            // 音声データの妥当性チェック
            if (audioArray.length === 0) {
                debugLog('🎭 変換後の音声データが空です');
                return;
            }
            
            // VRMViewerに音声データを送信
            iframe.contentWindow.postMessage({
                type: 'lipSync',
                audioData: audioArray,
                format: 'wav',
                timestamp: Date.now()
            }, '*');
            
            debugLog('🎭 iframeにpostMessage送信, サイズ:', audioArray.length);
            
        } catch (error) {
            debugError('🎭 VRM音声データ送信エラー:', error);
        }
    }

    // 感情データをVRMビューワーに送信
    sendEmotionToVRM(emotion) {
        try {
            const iframe = document.getElementById('vrm-iframe');
            if (!iframe || !iframe.contentWindow) {
                debugLog('🎭 VRM iframe未発見');
                return;
            }
            
            // 感情データの妥当性チェック
            if (!emotion) {
                debugLog('🎭 感情データが無効です');
                return;
            }
            
            // VRMViewerに感情データを送信
            iframe.contentWindow.postMessage({
                type: 'emotion',
                emotion: emotion,
                timestamp: Date.now()
            }, '*');
            
            debugLog('🎭 感情データをVRMに送信:', emotion);
            
        } catch (error) {
            debugError('🎭 VRM感情データ送信エラー:', error);
        }
    }

    // 音声状態をVRMビューワーに通知
    notifyAudioStateToVRM(state) {
        try {
            const iframe = document.getElementById('vrm-iframe');
            if (!iframe || !iframe.contentWindow) {
                debugLog('🎭 VRM iframe未発見');
                return;
            }
            
            // 有効な状態かチェック
            const validStates = ['started', 'ended', 'error', 'paused', 'resumed'];
            if (!validStates.includes(state)) {
                debugLog('🎭 無効な音声状態:', state);
                return;
            }
            
            iframe.contentWindow.postMessage({
                type: 'audioState',
                state: state,
                timestamp: Date.now()
            }, '*');
            
            debugLog(`🎭 Audio state "${state}" sent to VRM`);
            
        } catch (error) {
            debugError('🎭 VRM音声状態送信エラー:', error);
        }
    }






    async stopVoice() {
        if (window.electronAPI && window.electronAPI.voice) {
            try {
                await window.electronAPI.voice.stop();
            } catch (error) {
                debugError('Failed to stop voice:', error);
            }
        }
    }


}

// 音声キューイングシステム
class VoiceQueue {
    constructor(terminalApp) {
        this.terminalApp = terminalApp;
        this.queue = [];
        this.isProcessing = false;
        this.debugLog = debugLog;
    }
    
    // キューに音声テキストを追加
    async addToQueue(text) {
        this.queue.push(text);
        this.debugLog('🎵 音声キューに追加:', { text: text.substring(0, 30) + '...', queueLength: this.queue.length });
        
        if (!this.isProcessing) {
            await this.processQueue();
        }
    }
    
    // キューを順次処理
    async processQueue() {
        this.isProcessing = true;
        this.debugLog('🎵 音声キュー処理開始:', { queueLength: this.queue.length });
        
        while (this.queue.length > 0) {
            const text = this.queue.shift();
            await this.speakTextSequentially(text);
        }
        
        this.isProcessing = false;
        this.debugLog('🎵 音声キュー処理完了');
    }
    
    // 順次音声再生
    async speakTextSequentially(text) {
        try {
            this.debugLog('🎵 順次音声再生開始:', text.substring(0, 30) + '...');
            
            // DOM操作（チャット表示とキャラクター気分更新）
            requestAnimationFrame(() => {
                this.terminalApp.addVoiceMessage('ニコ', text);
                this.terminalApp.updateCharacterMood('おしゃべり中✨');
            });
            
            // 音声読み上げ実行（ハイブリッドシステム）
            if (this.terminalApp.voiceEnabled) {
                // 音声再生状態を設定
                this.terminalApp.voicePlayingState.isPlaying = true;
                
                // 音声合成のみ（再生なし）
                const audioData = await this.terminalApp.synthesizeTextOnly(text);
                
                if (audioData) {
                    // 合成した音声をplayAppInternalAudioで再生
                    await this.terminalApp.playAppInternalAudio(audioData, text);
                    
                    // 音声再生完了まで待機
                    await this.waitForVoiceComplete();
                    
                    // 読み上げ間隔制御
                    const intervalSeconds = await getSafeUnifiedConfig().get('voiceIntervalSeconds', 1);
                    const intervalMs = intervalSeconds * 1000;
                    
                    if (intervalMs > 0) {
                        this.debugLog(`⏱️ 読み上げ間隔待機: ${intervalSeconds}秒`);
                        await new Promise(resolve => setTimeout(resolve, intervalMs));
                    }
                } else {
                    this.debugLog('❌ 音声合成に失敗しました');
                }
            }
            
            this.debugLog('🎵 順次音声再生完了:', text.substring(0, 30) + '...');
            
        } catch (error) {
            this.debugLog('❌ 順次音声再生エラー:', error);
        } finally {
            // 音声再生状態をリセット
            this.terminalApp.voicePlayingState.isPlaying = false;
        }
    }
    
    // 音声完了待機（統一管理版）
    async waitForVoiceComplete() {
        return new Promise(resolve => {
            const checkComplete = () => {
                // Hook音声とアプリ内監視音声の両方をチェック
                const isHookPlaying = this.terminalApp.isPlayingHookAudio;
                const isAppInternalPlaying = this.terminalApp.voicePlayingState.isPlaying;
                
                if (!isHookPlaying && !isAppInternalPlaying) {
                    this.debugLog('🎵 音声再生完了を確認');
                    resolve();
                } else {
                    setTimeout(checkComplete, 100);
                }
            };
            checkComplete();
        });
    }
    
    // キューをクリア
    clear() {
        this.queue = [];
        this.isProcessing = false;
        this.debugLog('🎵 音声キューをクリア');
    }
    
    // キューの状態を取得
    getStatus() {
        return {
            queueLength: this.queue.length,
            isProcessing: this.isProcessing,
            voicePlayingState: this.terminalApp.voicePlayingState
        };
    }
}

// タブ管理クラス
class TabManager {
    constructor(terminalApp) {
        this.terminalApp = terminalApp;
        this.tabs = {};
        this.activeTabId = null;
        this.parentTabId = null;
        this.nextTabNumber = 1;
        this.draggedTabId = null; // ドラッグ中のタブID
        this.tabOrder = []; // タブの順序を管理する配列
    }

    initialize() {
        this.setupEventListeners();
        
        // 初期タブを作成
        if (Object.keys(this.tabs).length === 0) {
            this.createInitialTab();
        }
    }

    setupEventListeners() {
        // 新規タブボタン
        const newTabButton = document.getElementById('new-tab-button');
        if (newTabButton) {
            newTabButton.addEventListener('click', () => {
                this.createEmptyTab();
            });
        }
        
        // タブ別データ受信処理
        if (window.electronAPI && window.electronAPI.tab) {
            window.electronAPI.tab.onData((tabId, data) => {
                this.handleTabData(tabId, data);
            });
            
            window.electronAPI.tab.onExit((tabId, exitCode) => {
                this.handleTabExit(tabId, exitCode);
            });
        }
    }
    
    handleTabData(tabId, data) {
        const tab = this.tabs[tabId];
        if (!tab) {
            debugLog(`Received data for unknown tab: ${tabId}`);
            return;
        }
        
        // ターミナルに出力
        if (tab.terminal) {
            tab.terminal.write(data);
        }
        
        // 親タブの場合のみ音声処理
        if (tab.isParent && this.terminalApp.messageAccumulator) {
            this.terminalApp.messageAccumulator.addChunk(data);
        }
    }
    
    handleTabExit(tabId, exitCode) {
        const tab = this.tabs[tabId];
        if (!tab) {
            debugLog(`Tab exit event for unknown tab: ${tabId}`);
            return;
        }
        
        debugLog(`Tab ${tabId} process exited with code: ${exitCode}`);
        
        if (tab.terminal) {
            if (exitCode === 0) {
                tab.terminal.writeln('\r\n\x1b[90m[プロセス正常終了] 新しいタブを作成してください\x1b[0m');
            } else {
                tab.terminal.writeln(`\r\n\x1b[31m[プロセス異常終了: ${exitCode}] 新しいタブを作成してください\x1b[0m`);
            }
        }
    }

    createInitialTab() {
        // 既存のターミナルを最初のタブとして登録
        const tabId = `tab-${this.nextTabNumber++}`;
        
        // 既存の#terminal要素をリネームして統一化
        const existingTerminal = document.getElementById('terminal');
        const newTerminalId = `terminal-${tabId}`;
        if (existingTerminal) {
            existingTerminal.id = newTerminalId;
            existingTerminal.className = 'terminal-wrapper active';
        }
        
        this.tabs[tabId] = {
            id: tabId,
            name: 'Main',
            aiType: null,
            isParent: true,
            isActive: true,
            isRunning: false, // 初期状態はAI未起動
            terminal: this.terminalApp.terminal,
            fitAddon: this.terminalApp.fitAddon,
            element: existingTerminal, // リネーム後の要素を参照
            createdAt: Date.now()
        };
        
        this.activeTabId = tabId;
        this.parentTabId = tabId;
        
        // タブ順序配列に追加
        this.tabOrder.push(tabId);
        
        this.renderTabs();
    }

    createEmptyTab() {
        const tabId = `tab-${this.nextTabNumber++}`;
        const tabName = `Tab #${this.nextTabNumber - 1}`;
        
        // 新しいターミナル要素を作成
        const terminalElement = document.createElement('div');
        terminalElement.id = `terminal-${tabId}`;
        terminalElement.className = 'terminal-wrapper';
        terminalElement.style.display = 'none'; // 初期状態は非表示
        
        const terminalContainer = document.getElementById('terminal-container');
        if (terminalContainer) {
            terminalContainer.appendChild(terminalElement);
        }
        
        // 新しいTerminalインスタンスを作成
        const terminal = new Terminal(TerminalFactory.createConfig());
        const fitAddon = new FitAddon.FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(new WebLinksAddon.WebLinksAddon());
        terminal.open(terminalElement);
        
        // ターミナルサイズ調整を遅延実行（確実にDOM要素が準備されてから）
        setTimeout(() => {
            fitAddon.fit();
        }, 50);
        
        // 初期メッセージを表示（アプリ起動時と同じ状態）
        terminal.writeln(`\x1b[90m🎀 KawAIi Code - New Tab 🎀\x1b[0m`);
        
        // タブデータを作成（AIは未起動状態）
        this.tabs[tabId] = {
            id: tabId,
            name: tabName,
            aiType: null, // AI未起動
            isParent: false,
            isActive: false,
            isRunning: false, // AI起動状態フラグ追加
            terminal: terminal,
            fitAddon: fitAddon,
            element: terminalElement,
            createdAt: Date.now()
        };
        
        // タブ順序配列に追加
        this.tabOrder.push(tabId);
        
        this.renderTabs();
        this.switchTab(tabId);
        
        return tabId;
    }



    async startAIForTab(tabId, aiType) {
        try {
            if (!window.electronAPI || !window.electronAPI.tab) {
                debugError('ElectronAPI.tab not available');
                return false;
            }

            const tab = this.tabs[tabId];
            if (!tab) {
                debugError(`Tab ${tabId} not found`);
                return false;
            }

            const aiName = aiType === 'claude' ? 'Claude Code' : 'Claude Code (Dangerous)';
            debugLog(`Starting ${aiName} for tab ${tabId}`);
            
            // 既存のイベントリスナーをクリーンアップ（重複防止）
            if (tab.eventListeners) {
                tab.eventListeners.forEach(disposable => {
                    if (disposable && typeof disposable.dispose === 'function') {
                        disposable.dispose();
                    }
                });
                tab.eventListeners = [];
            } else {
                tab.eventListeners = [];
            }
            
            // バックエンドでPTYプロセス作成
            const result = await window.electronAPI.tab.create(tabId, aiType);
            if (!result.success) {
                debugError(`Failed to create tab process: ${result.error}`);
                tab.terminal.writeln(`\x1b[31mError: ${result.error}\x1b[0m`);
                return false;
            }
            
            // ターミナルをプロセスに接続
            const terminal = tab.terminal;
            
            // 初期化メッセージ
            terminal.writeln(`\x1b[90m🎀 KawAIi Code Tab Integration Started! 🎀\x1b[0m`);
            terminal.writeln(`\x1b[90m${aiName} is starting up...\x1b[0m`);
            
            // ユーザー入力をプロセスに送信（重複防止）
            const onDataListener = terminal.onData((data) => {
                window.electronAPI.tab.write(tabId, data);
            });
            tab.eventListeners.push(onDataListener);
            
            // リサイズ処理（重複防止）
            const onResizeListener = terminal.onResize(({ cols, rows }) => {
                window.electronAPI.tab.resize(tabId, cols, rows);
            });
            tab.eventListeners.push(onResizeListener);
            
            // ターミナルサイズを適切に調整（AI起動後に実行）
            setTimeout(() => {
                // デバウンス処理付きリサイズ制御
                this.terminalApp.handleResize();
                
                if (tab.fitAddon && tab.terminal) {
                    tab.fitAddon.fit();
                    // バックエンドプロセスにも新しいサイズを通知
                    window.electronAPI.tab.resize(tabId, tab.terminal.cols, tab.terminal.rows);
                    debugLog(`Tab ${tabId} resized to ${tab.terminal.cols}x${tab.terminal.rows}`);
                }
            }, 200); // Claude Codeの初期化完了を待つ
            
            // UI状態を更新
            this.updateTabUI();
            if (this.terminalApp && this.terminalApp.updateButtons) {
                this.terminalApp.updateButtons();
            }
            
            debugLog(`Tab ${tabId} AI startup completed`);
            return true;
        } catch (error) {
            debugError(`Error starting AI for tab ${tabId}:`, error);
            if (this.tabs[tabId]) {
                this.tabs[tabId].terminal.writeln(`\x1b[31mError: ${error.message}\x1b[0m`);
            }
            return false;
        }
    }

    async stopAIForTab(tabId) {
        try {
            const tab = this.tabs[tabId];
            if (!tab) {
                debugError(`Tab ${tabId} not found`);
                return false;
            }

            // イベントリスナーをクリーンアップ
            if (tab.eventListeners) {
                tab.eventListeners.forEach(disposable => {
                    if (disposable && typeof disposable.dispose === 'function') {
                        disposable.dispose();
                    }
                });
                tab.eventListeners = [];
            }

            if (window.electronAPI && window.electronAPI.tab) {
                await window.electronAPI.tab.delete(tabId);
                debugLog(`AI stopped for tab ${tabId}`);
            }

            // タブ状態を更新
            tab.aiType = null;
            tab.isRunning = false;
            tab.name = `Tab #${tabId.split('-')[1]}`;

            // ターミナルをクリア
            if (tab.terminal) {
                tab.terminal.clear();
                tab.terminal.writeln(`\x1b[90m🎀 KawAIi Code - Tab Ready 🎀\x1b[0m`);
            }
            
            // UI状態を更新
            this.updateTabUI();
            if (this.terminalApp && this.terminalApp.updateButtons) {
                this.terminalApp.updateButtons();
            }

            return true;
        } catch (error) {
            debugError(`Error stopping AI for tab ${tabId}:`, error);
            return false;
        }
    }

    switchTab(tabId) {
        if (!this.tabs[tabId]) return;
        
        // 全てのタブを非表示（確実な表示制御）
        Object.values(this.tabs).forEach(tab => {
            tab.isActive = false;
            if (tab.element) {
                tab.element.style.display = 'none';
                tab.element.classList.remove('active');
            }
        });
        
        // アクティブタブを表示
        const activeTab = this.tabs[tabId];
        activeTab.isActive = true;
        if (activeTab.element) {
            activeTab.element.style.display = 'block';
            activeTab.element.classList.add('active');
        }
        activeTab.terminal.focus();
        
        // ターミナルサイズを調整
        if (activeTab.fitAddon) {
            setTimeout(() => {
                // デバウンス処理付きリサイズ制御
                this.terminalApp.handleResize();
                
                activeTab.fitAddon.fit();
                // AI起動中のタブの場合、バックエンドプロセスにもリサイズを通知
                if (activeTab.isRunning && activeTab.terminal) {
                    window.electronAPI.tab.resize(tabId, activeTab.terminal.cols, activeTab.terminal.rows);
                    debugLog(`Active tab ${tabId} resized to ${activeTab.terminal.cols}x${activeTab.terminal.rows}`);
                }
            }, 100); // Claude Codeの表示が落ち着くまで少し待つ
        }
        
        this.activeTabId = tabId;
        this.updateTabUI();
        
        // ボタン状態を更新（アクティブタブ変更時）
        if (this.terminalApp && this.terminalApp.updateButtons) {
            this.terminalApp.updateButtons();
        }
    }

    setParentTab(tabId) {
        if (!this.tabs[tabId]) return;
        
        // 現在の親タブを解除
        if (this.parentTabId && this.tabs[this.parentTabId]) {
            this.tabs[this.parentTabId].isParent = false;
        }
        
        // 新しい親タブを設定
        this.parentTabId = tabId;
        this.tabs[tabId].isParent = true;
        
        this.updateTabUI();
    }

    async deleteTab(tabId) {
        if (!this.tabs[tabId] || Object.keys(this.tabs).length === 1) {
            return; // 最後のタブは削除不可
        }
        
        const tab = this.tabs[tabId];
        
        // 1. イベントリスナーをクリーンアップ
        if (tab.eventListeners) {
            tab.eventListeners.forEach(disposable => {
                if (disposable && typeof disposable.dispose === 'function') {
                    disposable.dispose();
                }
            });
            tab.eventListeners = [];
        }
        
        // 2. PTYプロセスの終了処理
        if (window.electronAPI && window.electronAPI.tab) {
            try {
                await window.electronAPI.tab.delete(tabId);
                debugLog(`PTY process for tab ${tabId} terminated`);
            } catch (error) {
                debugError(`Failed to terminate PTY process for tab ${tabId}:`, error);
            }
        }
        
        // 3. ターミナルの前処理
        
        // 3. ターミナルインスタンスの破棄
        if (tab.terminal) {
            try {
                tab.terminal.dispose();
                debugLog(`Terminal instance for tab ${tabId} disposed`);
            } catch (error) {
                debugError(`Error disposing terminal for tab ${tabId}:`, error);
            }
        }
        
        // 4. DOM要素の削除
        if (tab.element && tab.element.parentNode) {
            tab.element.parentNode.removeChild(tab.element);
            debugLog(`DOM element for tab ${tabId} removed`);
        }
        
        // 5. 親タブ変更時の処理
        if (tab.isParent) {
            const remainingTabs = Object.keys(this.tabs).filter(id => id !== tabId);
            if (remainingTabs.length > 0) {
                this.setParentTab(remainingTabs[0]);
                debugLog(`Parent tab switched from ${tabId} to ${remainingTabs[0]}`);
            }
        }
        
        // 6. アクティブタブの場合、他のタブに切り替え
        if (this.activeTabId === tabId) {
            const remainingTabs = Object.keys(this.tabs).filter(id => id !== tabId);
            if (remainingTabs.length > 0) {
                this.switchTab(remainingTabs[0]);
                debugLog(`Active tab switched from ${tabId} to ${remainingTabs[0]}`);
            }
        }
        
        // 7. タブ順序配列から削除
        const orderIndex = this.tabOrder.indexOf(tabId);
        if (orderIndex !== -1) {
            this.tabOrder.splice(orderIndex, 1);
        }
        
        // 8. タブデータ削除
        delete this.tabs[tabId];
        debugLog(`Tab data for ${tabId} deleted`);
        
        this.renderTabs();
    }

    renderTabs() {
        const tabBar = document.getElementById('tab-bar');
        if (!tabBar) return;
        
        // DOMUpdaterを使用して差分更新
        DOMUpdater.updateTabList(
            tabBar, 
            this.tabs, 
            this.tabOrder, 
            this.activeTabId,
            (tabData) => this.createTabElement(tabData)
        );
    }

    createTabElement(tabData) {
        const tab = document.createElement('div');
        tab.className = `tab ${tabData.isActive ? 'active' : ''}`;
        tab.setAttribute('data-tab-id', tabData.id);
        
        // ドラッグ&ドロップ機能を追加（ResourceManager経由）
        tab.draggable = true;
        this.terminalApp.resourceManager.addEventListener(tab, 'dragstart', (e) => this.handleDragStart(e, tabData.id));
        this.terminalApp.resourceManager.addEventListener(tab, 'dragover', (e) => this.handleDragOver(e));
        this.terminalApp.resourceManager.addEventListener(tab, 'dragleave', (e) => this.handleDragLeave(e));
        this.terminalApp.resourceManager.addEventListener(tab, 'drop', (e) => this.handleDrop(e, tabData.id));
        this.terminalApp.resourceManager.addEventListener(tab, 'dragend', (e) => this.handleDragEnd(e));
        
        // 星マーク
        const star = document.createElement('span');
        star.className = `parent-star ${tabData.isParent ? 'active' : 'inactive'}`;
        star.textContent = tabData.isParent ? '★' : '☆';
        this.terminalApp.resourceManager.addEventListener(star, 'click', (e) => {
            e.stopPropagation();
            this.setParentTab(tabData.id);
        });
        
        // タブ名
        const name = document.createElement('span');
        name.className = 'tab-name';
        name.textContent = tabData.name;
        
        // 閉じるボタン
        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-button';
        closeBtn.textContent = '×';
        this.terminalApp.resourceManager.addEventListener(closeBtn, 'click', async (e) => {
            e.stopPropagation();
            await this.deleteTab(tabData.id);
        });
        
        // タブクリックイベント（ResourceManager経由）
        this.terminalApp.resourceManager.addEventListener(tab, 'click', () => {
            this.switchTab(tabData.id);
        });
        
        tab.appendChild(star);
        tab.appendChild(name);
        tab.appendChild(closeBtn);
        
        return tab;
    }

    updateTabUI() {
        this.renderTabs();
    }

    // ドラッグ&ドロップハンドラー
    handleDragStart(e, tabId) {
        this.draggedTabId = tabId;
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', e.target.outerHTML);
        debugLog(`Drag started: ${tabId}`);
    }

    handleDragOver(e) {
        if (e.preventDefault) {
            e.preventDefault();
        }
        e.dataTransfer.dropEffect = 'move';
        
        // ドラッグオーバー効果を追加
        const tabElement = e.currentTarget;
        if (tabElement && !tabElement.classList.contains('dragging')) {
            tabElement.classList.add('drag-over');
        }
        
        return false;
    }

    handleDragLeave(e) {
        // マウスが子要素に移動した場合は無視
        if (e.currentTarget.contains(e.relatedTarget)) {
            return;
        }
        e.currentTarget.classList.remove('drag-over');
    }

    handleDrop(e, targetTabId) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }

        // ドラッグオーバー効果を削除
        e.currentTarget.classList.remove('drag-over');

        if (this.draggedTabId && this.draggedTabId !== targetTabId) {
            this.reorderTabs(this.draggedTabId, targetTabId);
            debugLog(`Tab dropped: ${this.draggedTabId} -> ${targetTabId}`);
        }

        return false;
    }

    handleDragEnd(e) {
        // 全てのドラッグ関連クラスを削除
        e.target.classList.remove('dragging');
        const allTabs = document.querySelectorAll('.tab');
        allTabs.forEach(tab => tab.classList.remove('drag-over'));
        
        this.draggedTabId = null;
        debugLog('Drag ended');
    }

    // タブの順序を変更
    reorderTabs(draggedTabId, targetTabId) {
        const draggedIndex = this.tabOrder.indexOf(draggedTabId);
        const targetIndex = this.tabOrder.indexOf(targetTabId);

        if (draggedIndex !== -1 && targetIndex !== -1) {
            // ドラッグ方向を判定
            const isMovingRight = draggedIndex < targetIndex;
            
            // 配列から要素を削除
            this.tabOrder.splice(draggedIndex, 1);
            
            // ドラッグ方向に応じて挿入位置を決定
            const newTargetIndex = this.tabOrder.indexOf(targetTabId);
            
            if (isMovingRight) {
                // 右移動：ターゲットの後に挿入
                this.tabOrder.splice(newTargetIndex + 1, 0, draggedTabId);
                debugLog(`Moving right: ${draggedTabId} inserted after ${targetTabId}`);
            } else {
                // 左移動：ターゲットの前に挿入（従来通り）
                this.tabOrder.splice(newTargetIndex, 0, draggedTabId);
                debugLog(`Moving left: ${draggedTabId} inserted before ${targetTabId}`);
            }

            debugLog(`Tab order updated:`, this.tabOrder);
            this.renderTabs();
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // ローディング画面を表示
    const loadingScreen = new LoadingScreen();
    loadingScreen.show();
    
    // アプリ初期化処理
    setTimeout(() => {
        new TerminalApp();
        
        // 初期化完了後にローディング画面を非表示
        setTimeout(() => {
            loadingScreen.hide();
        }, 500);
    }, 1000); // 1秒間ローディング画面を表示
});