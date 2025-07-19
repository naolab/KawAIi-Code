// xtermライブラリはCDNから読み込み

// デバッグログ制御（配布版では無効化）
const isDev = window.location.protocol !== 'file:' && 
             (typeof process === 'undefined' || process.env.NODE_ENV !== 'production');
const debugLog = isDev ? console.log : () => {}; // 配布版では無効化
const debugTrace = isDev ? console.trace : () => {}; // 配布版では無効化
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

class TerminalApp {
    constructor() {
        // 基本設定
        this.voiceEnabled = true;
        this.selectedSpeaker = 0;
        this.connectionStatus = 'disconnected';
        this.voiceIntervalSeconds = AppConstants.AUDIO.DEFAULT_INTERVAL_SECONDS;
        this.voiceVolume = 50;
        this.claudeWorkingDir = '';
        this.speakerInitialized = false;
        
        // 音声再生状態の統一管理（全サービス共通）
        this.voicePlayingState = {
            isPlaying: false,           // アプリ内音声再生中フラグ
            isPlayingHook: false,       // Hook音声再生中フラグ
            currentAudio: null,         // 現在再生中の音声オブジェクト
            queue: [],                  // 音声キュー
            // 統一状態チェック関数
            isAnyPlaying: function() {
                return this.isPlaying || this.isPlayingHook;
            }
        };
        
        this.speakers = [];
        this.chatMessages = [];
        this.lastChatMessage = '';
        this.lastChatTime = 0;
        
        // サービスマネージャーの初期化
        this.appManager = new TerminalAppManager(this);
        
        this.init();
    }

    async init() {
        // xtermライブラリが読み込まれるまで待機
        if (typeof Terminal === 'undefined') {
            debugLog('xterm.jsを読み込み中...');
            setTimeout(() => this.init(), 100);
            return;
        }
        
        // Claude Codeの作業ディレクトリを初期化時に取得
        await this.initializeWorkingDirectory();
        
        // サービスマネージャーで全サービスを初期化
        await this.appManager.initializeAllServices();
        
        // チャットインターフェースを設定
        this.setupChatInterface();
        
        // 初期設定の読み込み
        await this.appManager.loadInitialSettings();
        
        // 音声モード初期化
        await this.appManager.initializeVoiceMode();
        
        // AI.mdファイルの生成
        await this.appManager.generateAiMdFiles();
        
        // ステータスを更新
        this.updateStatus('Ready');
        
        // 音声接続チェック
        await this.appManager.checkVoiceConnection();
        
        // 定期タスクの開始
        this.appManager.startPeriodicTasks();
        
        debugLog('🚀 TerminalApp初期化完了');
    }

    // 作業ディレクトリの初期化
    async initializeWorkingDirectory() {
        try {
            const result = await window.electronAPI.getClaudeCwd();
            if (result.success) {
                this.claudeWorkingDir = result.cwd;
                debugLog('Initial Claude CWD set to:', this.claudeWorkingDir);
            } else {
                debugError('Failed to get initial Claude CWD:', result.error);
            }
        } catch (error) {
            debugError('Error calling getClaudeCwd during init:', error);
        }
    }





    // 統一感情処理メソッド（全音声で使用）
    async processEmotionForVRM(text, audioData) {
        try {
            // 音声無効時は感情処理もスキップ（パフォーマンス最適化）
            if (!this.voiceEnabled) {
                debugLog('🎭 音声無効のため感情処理をスキップ:', text ? text.substring(0, 30) + '...' : '');
                return null;
            }
            
            debugLog('🎭 統一感情処理開始:', text ? text.substring(0, 30) + '...' : '');
            
            // 1. VRMに音声データを送信（リップシンク用）
            if (audioData) {
                let arrayBuffer;
                if (audioData.buffer) {
                    arrayBuffer = audioData.buffer;
                } else {
                    arrayBuffer = audioData;
                }
                this.vrmIntegrationService.sendAudioToVRM(arrayBuffer);
                debugLog('🎭 VRMリップシンク用音声データ送信完了');
            }
            
            // 2. 感情分析を実行
            if (text) {
                const emotionResult = await window.electronAPI.voice.getEmotion(text);
                if (emotionResult.success && emotionResult.emotion) {
                    // 3. VRMに感情データを送信
                    this.vrmIntegrationService.sendEmotionToVRM(emotionResult.emotion);
                    debugLog('😊 統一感情処理完了:', emotionResult.emotion);
                    return emotionResult.emotion;
                } else {
                    debugLog('⚠️ 感情分析結果が無効:', emotionResult);
                }
            }
        } catch (error) {
            debugLog('❌ 統一感情処理エラー:', error);
        }
        return null;
    }

    // アプリ内音声再生（VoiceQueue用）- AudioServiceに委譲
    async playAppInternalAudio(audioData, text) {
        // 音声無効時は全処理をスキップ（パフォーマンス最適化）
        if (!this.voiceEnabled) {
            debugLog('🎵 音声無効のためplayAppInternalAudioをスキップ:', text ? text.substring(0, 30) + '...' : '');
            return;
        }
        
        if (!this.audioService) {
            debugError('AudioService not initialized');
            return;
        }
        
        try {
            // 統一感情処理メソッドを使用
            await this.processEmotionForVRM(text, audioData);
            
            // 音声再生開始をVRMビューワーに通知
            this.vrmIntegrationService.notifyAudioStateToVRM('playing');
            
            // AudioServiceに音声再生を委譲
            await this.audioService.playAppInternalAudio(audioData, text);
            
            // 音声終了をVRMビューワーに通知（表情リセットのため）
            this.vrmIntegrationService.notifyAudioStateToVRM('ended');
            
            // 表情を中性に戻す（明示的リセット）
            setTimeout(() => {
                this.vrmIntegrationService.sendEmotionToVRM({ 
                    emotion: 'neutral', 
                    weight: 0 
                });
                debugLog('🎭 表情を中性にリセット完了');
            }, 100); // 100ms後にリセット
            
        } catch (error) {
            debugLog('❌ アプリ内音声再生処理エラー:', error);
            // エラー時は統一管理システムで状態をリセット
            this.voicePlayingState.isPlaying = false;
        }
    }

    // アプリ内監視モード用の音声再生メソッド - AudioServiceに委譲
    async playAudio(audioData) {
        if (this.audioService) {
            return await this.audioService.playAudio(audioData);
        }
    }

    // アプリ内監視モード専用: テキストを表示しながら音声を再生 - AudioServiceに委譲
    async playAudioWithText(audioData, text) {
        if (this.audioService) {
            return await this.audioService.playAudioWithText(audioData, text);
        }
    }

    // 起動時音声ファイルクリーンアップ - TerminalAppManagerに移動済み
    cleanupStartupAudioFiles() {
        if (this.appManager) {
            return this.appManager.cleanupStartupAudioFiles();
        }
    }

    // 初期設定の読み込み（起動時のみ）- TerminalAppManagerに移動
    async loadInitialSettings() {
        return await this.appManager.loadInitialSettings();
    }

    // タブ管理システム初期化 - TerminalAppManagerに移動
    initializeTabManager() {
        return this.appManager.initializeTabManager();
    }
    
    // ターミナル関連の参照を取得（TabManagerDependenciesで必要）
    get terminal() { return this.terminalService.terminal; }
    get fitAddon() { return this.terminalService.fitAddon; }
    get isTerminalRunning() { return this.terminalService.isTerminalRunning; }
    get currentRunningAI() { return this.terminalService.currentRunningAI; }
    
    // リサイズ処理の委譲
    handleResize() {
        return this.terminalService.handleResize();
    }
    
    // ターミナル制御メソッドの委譲
    async startTerminal(aiType) {
        return await this.terminalService.startTerminal(aiType);
    }
    
    async stopTerminal() {
        return await this.terminalService.stopTerminal();
    }
    
    // 音声モード切り替えの委譲
    switchVoiceMode(useHooks) {
        return this.terminalService.switchVoiceMode(useHooks);
    }

    // UIEventManager初期化 - TerminalAppManagerに移動
    initializeUIEventManager() {
        // UIEventManagerの初期化はTerminalAppManagerで行われる
        return this.uiEventManager;
    }


    // setupEventListeners() - modules/ui-event-manager.js に移動済み

    // チャットインターフェースの設定 - UIEventManagerに委譲
    setupChatInterface() {
        if (this.uiEventManager) {
            this.uiEventManager.setupChatInterface();
        }
    }


    // 🗑️ 旧バッチ処理システムは削除し、MessageAccumulatorで置き換え
    // 以下の関数は互換性のため残してありますが、使用されません
    
    // デバッグ用: MessageAccumulatorの状態を取得
    getMessageAccumulatorStatus() {
        return this.messageAccumulator.getStatus();
    }

    
    // 旧処理: 互換性のために残す - TerminalServiceに委譲
    async parseTerminalDataForChat(data) {
        debugLog('⚠️ 旧処理parseTerminalDataForChatが呼ばれました - TerminalServiceに委譲');
        return await this.terminalService.processTerminalData(data);
    }

    // 音声再生完了を待機する関数 - HookServiceに委譲
    async waitForAudioComplete() {
        if (this.hookService) {
            return await this.hookService.waitForAudioComplete();
        }
    }


    // Hook経由の会話表示 - HookServiceに委譲
    displayHookConversation(data) {
        if (this.hookService) {
            this.hookService.displayHookConversation(data);
        }
    }

    // sendChatMessage は削除済み（チャット入力エリア削除に伴い）

    // sendQuickMessage は削除済み

    // チャットメッセージ追加 - UIEventManagerに委譲
    addChatMessage(type, sender, text) {
        if (this.uiEventManager) {
            this.uiEventManager.addChatMessage(type, sender, text);
        }
    }

    // 音声メッセージ追加 - UIEventManagerに委譲
    addVoiceMessage(speaker, text) {
        if (this.uiEventManager) {
            this.uiEventManager.addVoiceMessage(speaker, text);
        }
        
        // メモリ最適化：履歴を制限
        this.chatMessages.push({ type: 'voice', speaker, text, timestamp: Date.now() });
        if (this.chatMessages.length > 50) {
            this.chatMessages.shift();
        }
    }

    // 音声メッセージ要素追加 - UIEventManagerに委譲
    addVoiceMessageElement(speaker, text, parentElement) {
        if (this.uiEventManager) {
            return this.uiEventManager.addVoiceMessageElement(speaker, text, parentElement);
        }
    }

    // 話者選択オプション更新 - UIEventManagerに委譲
    updateSpeakerSelectOptions(selectElement, speakers, selectedSpeakerId = null) {
        if (this.uiEventManager) {
            return this.uiEventManager.updateSpeakerSelectOptions(selectElement, speakers, selectedSpeakerId);
        }
    }

    // キャラクター気分更新 - UIEventManagerに委譲
    updateCharacterMood(mood) {
        if (this.uiEventManager) {
            this.uiEventManager.updateCharacterMood(mood);
        }
    }


    // ステータス更新 - UIEventManagerに委譲
    updateStatus(message) {
        if (this.uiEventManager) {
            this.uiEventManager.updateStatus(message);
        }
    }

    // 両方のAI.mdファイルを生成 - TerminalAppManagerに委譲
    async generateAiMdFiles() {
        return await this.appManager.generateAiMdFiles();
    }

    // AI.mdファイルクリーンアップ - ConfigManagerに委譲
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
    
    // 設定をモーダルに同期 - UIEventManagerに委譲
    async syncSettingsToModal() {
        if (this.uiEventManager) {
            return await this.uiEventManager.syncSettingsToModal();
        }
    }

    // 作業ディレクトリ選択 - UIEventManagerに委譲
    async handleSelectClaudeCwd() {
        if (this.uiEventManager) {
            return await this.uiEventManager.handleSelectClaudeCwd();
        }
    }

    // 音声接続チェック - TerminalAppManagerに委譲
    async checkVoiceConnection() {
        return await this.appManager.checkVoiceConnection();
    }

    // 話者リストを読み込み - AudioServiceに委譲
    async loadSpeakers() {
        if (!this.audioService) {
            debugError('AudioService not initialized');
            return { success: false, error: 'AudioService not initialized' };
        }
        
        const result = await this.audioService.loadSpeakers();
        
        if (result.success) {
            this.speakers = result.speakers;
            await this.updateSpeakerSelect();
        }
        
        return result;
    }

    // 話者選択の更新 - AudioServiceに委譲
    async updateSpeakerSelect() {
        if (this.audioService) {
            return await this.audioService.updateSpeakerSelect();
        }
    }

    updateConnectionStatus(text, status) {
        const statusElementModal = document.getElementById('connection-status-modal');
        if (statusElementModal) {
            statusElementModal.textContent = text;
            statusElementModal.className = `status-${status}`;
        }
    }

    // 音声読み上げ - AudioServiceに委譲
    async speakText(text) {
        if (!this.audioService) {
            debugError('AudioService not initialized');
            return;
        }
        return await this.audioService.speakText(text);
    }
    
    // 音声合成のみ - AudioServiceに委譲
    async synthesizeTextOnly(text) {
        if (!this.audioService) {
            debugError('AudioService not initialized');
            return null;
        }
        return await this.audioService.synthesizeTextOnly(text);
    }
    
    // エラー通知 - UIEventManagerに委譲
    showVoiceError(error) {
        if (this.uiEventManager) {
            this.uiEventManager.showVoiceError(error);
        }
    }
    
    // 通知の表示 - UIEventManagerに委譲
    showNotification(message, type = 'info') {
        if (this.uiEventManager) {
            this.uiEventManager.showNotification(message, type);
        }
    }
    
    // 音声エラーインジケーターの更新 - UIEventManagerに委譲
    updateVoiceErrorIndicator(error) {
        if (this.uiEventManager) {
            this.uiEventManager.updateVoiceErrorIndicator(error);
        }
    }










}

// 音声キューイングシステム

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