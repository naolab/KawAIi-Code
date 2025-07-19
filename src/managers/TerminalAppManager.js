/**
 * TerminalAppManager
 * 全てのサービスを統合管理するマネージャークラス
 * - サービスの初期化と依存関係の解決
 * - サービス間の連携管理
 * - ライフサイクル管理
 */

class TerminalAppManager {
    constructor(terminalApp) {
        this.terminalApp = terminalApp;
        this.services = {};
        this.initialized = false;
        
        debugLog('🎯 TerminalAppManager初期化開始');
    }

    /**
     * 全サービスの初期化
     */
    async initializeAllServices() {
        if (this.initialized) {
            debugLog('⚠️ TerminalAppManager既に初期化済み');
            return;
        }

        try {
            // 1. 基础サービスの初期化
            await this.initializeBasicServices();
            
            // 2. メッセージ処理サービスの初期化
            await this.initializeMessageServices();
            
            // 3. 音声・VRM関連サービスの初期化
            await this.initializeAudioVRMServices();
            
            // 4. ターミナル関連サービスの初期化
            await this.initializeTerminalServices();
            
            // 5. UI関連サービスの初期化
            await this.initializeUIServices();
            
            // 6. モジュールの初期化
            await this.initializeModules();
            
            // 7. サービス間の連携設定
            await this.setupServiceIntegration();
            
            this.initialized = true;
            debugLog('✅ TerminalAppManager初期化完了');
            
        } catch (error) {
            debugError('❌ TerminalAppManager初期化エラー:', error);
            throw error;
        }
    }

    /**
     * 基础サービスの初期化
     */
    async initializeBasicServices() {
        debugLog('🔧 基础サービス初期化開始');
        
        // ErrorHandler
        this.terminalApp.errorHandler = new ErrorHandler('TerminalApp');
        
        // リソース管理システム
        this.terminalApp.resourceManager = new ResourceManager('TerminalApp');
        this.services.resourceManager = this.terminalApp.resourceManager;
        
        // 処理最適化システム
        this.terminalApp.processingCache = new ProcessingCache({
            maxCacheSize: 50,
            maxAge: 300000, // 5分
            maxPoolSize: 5
        });
        this.services.processingCache = this.terminalApp.processingCache;
        
        // 読み上げ履歴管理
        this.terminalApp.speechHistory = new SpeechHistoryManager(200);
        this.services.speechHistory = this.terminalApp.speechHistory;
        
        debugLog('✅ 基础サービス初期化完了');
    }

    /**
     * メッセージ処理サービスの初期化
     */
    async initializeMessageServices() {
        debugLog('📨 メッセージ処理サービス初期化開始');
        
        // MessageAccumulator
        this.terminalApp.messageAccumulator = new MessageAccumulator();
        this.services.messageAccumulator = this.terminalApp.messageAccumulator;
        
        // VoiceQueue
        this.terminalApp.voiceQueue = new VoiceQueue(this.terminalApp);
        this.services.voiceQueue = this.terminalApp.voiceQueue;
        
        debugLog('✅ メッセージ処理サービス初期化完了');
    }

    /**
     * 音声・VRM関連サービスの初期化
     */
    async initializeAudioVRMServices() {
        debugLog('🎵 音声・VRM関連サービス初期化開始');
        
        // AudioService
        this.terminalApp.audioService = new AudioService(this.terminalApp);
        this.services.audioService = this.terminalApp.audioService;
        
        // VRMIntegrationService（HookServiceより先に初期化）
        this.terminalApp.vrmIntegrationService = new VRMIntegrationService(this.terminalApp);
        this.services.vrmIntegrationService = this.terminalApp.vrmIntegrationService;
        
        // HookService（VRMIntegrationServiceを渡す）
        this.terminalApp.hookService = new HookService(this.terminalApp, this.terminalApp.vrmIntegrationService);
        this.services.hookService = this.terminalApp.hookService;
        
        // VRMIntegrationServiceをグローバルに設定
        window.vrmIntegrationService = this.terminalApp.vrmIntegrationService;
        
        debugLog('✅ 音声・VRM関連サービス初期化完了');
    }

    /**
     * ターミナル関連サービスの初期化
     */
    async initializeTerminalServices() {
        debugLog('🖥️ ターミナル関連サービス初期化開始');
        
        // TerminalService
        this.terminalApp.terminalService = new TerminalService(this.terminalApp);
        this.services.terminalService = this.terminalApp.terminalService;
        
        // ターミナルの設定
        this.terminalApp.terminalService.setupTerminal();
        
        // TabManager初期化
        this.initializeTabManager();
        
        debugLog('✅ ターミナル関連サービス初期化完了');
    }

    /**
     * UIサービスの初期化
     */
    async initializeUIServices() {
        debugLog('🎨 UIサービス初期化開始');
        
        // UIEventManager
        this.terminalApp.uiEventManager = new UIEventManager(this.terminalApp);
        this.services.uiEventManager = this.terminalApp.uiEventManager;
        this.terminalApp.uiEventManager.setupEventListeners();
        
        debugLog('✅ UIサービス初期化完了');
    }

    /**
     * モジュールの初期化
     */
    async initializeModules() {
        debugLog('🧩 モジュール初期化開始');
        
        // WallpaperSystem
        this.terminalApp.wallpaperSystem = new WallpaperSystem();
        this.services.wallpaperSystem = this.terminalApp.wallpaperSystem;
        
        // ConfigManager
        this.terminalApp.configManager = new ConfigManager();
        this.services.configManager = this.terminalApp.configManager;
        
        // ConfigManagerの初期化
        await this.terminalApp.configManager.initialize(this.terminalApp.claudeWorkingDir);
        
        debugLog('✅ モジュール初期化完了');
    }

    /**
     * サービス間の連携設定
     */
    async setupServiceIntegration() {
        debugLog('🔗 サービス間連携設定開始');
        
        // MessageAccumulatorのコールバック設定
        this.terminalApp.messageAccumulator.setProcessCallback(async (data) => {
            await this.terminalApp.terminalService.processTerminalData(data);
        });
        
        // 壁紙システムの初期化
        this.terminalApp.wallpaperSystem.setMessageCallback((character, message) => {
            // メッセージ表示機能は削除済み
        });
        this.terminalApp.wallpaperSystem.setupWallpaperSystem();
        
        debugLog('✅ サービス間連携設定完了');
    }

    /**
     * TabManager初期化
     */
    initializeTabManager() {
        // 依存関係オブジェクトを作成
        this.terminalApp.tabManagerDependencies = new TabManagerDependencies(this.terminalApp);
        
        // 依存関係の健全性チェック
        if (!this.terminalApp.tabManagerDependencies.isValid()) {
            debugError('TabManagerDependencies is not valid');
            return;
        }
        
        this.terminalApp.tabManager = new TabManager(this.terminalApp.tabManagerDependencies);
        this.services.tabManager = this.terminalApp.tabManager;
        this.terminalApp.tabManager.initialize();
    }

    /**
     * 初期設定の読み込み
     */
    async loadInitialSettings() {
        debugLog('⚙️ 初期設定読み込み開始');
        
        // 起動時音声ファイルクリーンアップを実行
        this.cleanupStartupAudioFiles();
        
        // 統一設定システムから設定を読み込み
        const config = getSafeUnifiedConfig();
        this.terminalApp.voiceEnabled = await config.get('voiceEnabled', this.terminalApp.voiceEnabled);
        this.terminalApp.selectedSpeaker = await config.get('selectedSpeaker', this.terminalApp.selectedSpeaker);
        this.terminalApp.voiceIntervalSeconds = await config.get('voiceIntervalSeconds', this.terminalApp.voiceIntervalSeconds);
        this.terminalApp.voiceVolume = await config.get('voiceVolume', this.terminalApp.voiceVolume);
        
        debugLog('Initial settings loaded:', {
            voiceEnabled: this.terminalApp.voiceEnabled,
            selectedSpeaker: this.terminalApp.selectedSpeaker,
            voiceIntervalSeconds: this.terminalApp.voiceIntervalSeconds,
            voiceVolume: this.terminalApp.voiceVolume
        });
        
        debugLog('✅ 初期設定読み込み完了');
    }

    /**
     * 起動時音声ファイルクリーンアップ
     */
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

    /**
     * 音声モードの初期化
     */
    async initializeVoiceMode() {
        debugLog('🎤 音声モード初期化開始');
        
        await this.terminalApp.terminalService.initializeVoiceMode();
        
        debugLog('✅ 音声モード初期化完了');
    }

    /**
     * 定期処理の開始
     */
    startPeriodicTasks() {
        debugLog('⏰ 定期処理開始');
        
        // リソース管理：定期クリーンアップ開始
        this.terminalApp.resourceManager.startPeriodicCleanup(AppConstants.AUDIO.DEFAULT_INTERVAL * 20);
        
        // 処理キャッシュ：定期クリーンアップ開始
        this.terminalApp.resourceManager.setInterval(() => {
            this.terminalApp.processingCache.cleanupExpiredEntries();
        }, 120000); // 2分間隔
        
        // Hook監視サービスを開始
        this.terminalApp.hookService.startHookWatcher();
        
        debugLog('✅ 定期処理開始完了');
    }

    /**
     * 音声接続チェック
     */
    async checkVoiceConnection() {
        debugLog('🔊 音声接続チェック開始');
        
        if (!this.terminalApp.audioService) {
            debugError('AudioService not initialized');
            return;
        }
        
        try {
            const result = await this.terminalApp.audioService.testConnection();
            if (result.success) {
                this.terminalApp.connectionStatus = 'connected';
                this.terminalApp.updateConnectionStatus('接続済み', 'connected');
                await this.terminalApp.loadSpeakers();
            } else {
                this.terminalApp.connectionStatus = 'disconnected';
                this.terminalApp.updateConnectionStatus('未接続', 'disconnected');
            }
        } catch (error) {
            this.terminalApp.connectionStatus = 'error';
            this.terminalApp.updateConnectionStatus('エラー', 'error');
            debugError('Voice connection check failed:', error);
        }
        this.terminalApp.updateVoiceControls();
        
        debugLog('✅ 音声接続チェック完了');
    }

    /**
     * AI.mdファイルの生成
     */
    async generateAiMdFiles() {
        debugLog('📝 AI.mdファイル生成開始');
        
        try {
            const result = await this.terminalApp.configManager.generateBothAiMdFiles();
            if (result.success) {
                debugLog('AI MD files generated successfully');
            } else {
                debugError('Failed to generate AI MD files:', result);
            }
            debugLog('✅ AI.mdファイル生成完了');
            return result;
        } catch (error) {
            debugError('Error generating AI MD files:', error);
            debugLog('❌ AI.mdファイル生成エラー完了');
            return { success: false, error: error.message };
        }
    }

    /**
     * 全サービスの破棄
     */
    dispose() {
        debugLog('🗑️ TerminalAppManager破棄開始');
        
        // リソース管理システムのクリーンアップ
        if (this.terminalApp.resourceManager) {
            this.terminalApp.resourceManager.cleanup();
        }
        
        // 各サービスの破棄
        Object.values(this.services).forEach(service => {
            if (service && typeof service.dispose === 'function') {
                service.dispose();
            }
        });
        
        this.services = {};
        this.initialized = false;
        
        debugLog('✅ TerminalAppManager破棄完了');
    }

    /**
     * サービス取得
     */
    getService(name) {
        return this.services[name];
    }

    /**
     * 全サービス取得
     */
    getAllServices() {
        return { ...this.services };
    }

    /**
     * 初期化状態の確認
     */
    isInitialized() {
        return this.initialized;
    }
}

// ブラウザ環境での利用
if (typeof window !== 'undefined') {
    window.TerminalAppManager = TerminalAppManager;
}

// Node.js環境での利用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TerminalAppManager;
}