/**
 * ターミナル制御サービス
 * - ターミナルの設定・初期化
 * - AI（Claude Code）の起動・停止
 * - ターミナルデータの処理
 * - リサイズ処理
 * - 重複読み上げ防止システム統合
 */

class TerminalService {
    constructor(terminalApp) {
        this.terminalApp = terminalApp;
        this.terminal = null;
        this.fitAddon = null;
        this.isTerminalRunning = false;
        this.currentRunningAI = null;
        this.isResizing = false;
        this.resizeTimer = null;
        
        // 参照を保持
        this.messageAccumulator = terminalApp.messageAccumulator;
        this.audioService = terminalApp.audioService;
        this.hookService = terminalApp.hookService;
        this.vrmIntegrationService = terminalApp.vrmIntegrationService;
        this.resourceManager = terminalApp.resourceManager;
        this.errorHandler = terminalApp.errorHandler;
        this.configManager = terminalApp.configManager;
        this.processingCache = terminalApp.processingCache;
        this.speechHistory = terminalApp.speechHistory;
        this.voiceQueue = terminalApp.voiceQueue;
        
        // 設定参照
        this.voiceEnabled = terminalApp.voiceEnabled;
        this.connectionStatus = terminalApp.connectionStatus;
        this.selectedSpeaker = terminalApp.selectedSpeaker;
        this.voicePlayingState = terminalApp.voicePlayingState;
        
        // シンプルな状態管理
        this.scrollPosition = 0;
        this.isScrollingUp = false;
        this.scrollTimeout = null;
        
        // イベントリスナー重複防止フラグ
        this.isEventListenersInitialized = false;

        // 軽量リフレッシュ用インターバル
        this.lightRefreshInterval = null;

        debugLog('🖥️ TerminalService初期化完了');
    }


    setupTerminal() {
        this.terminal = new Terminal(TerminalFactory.createConfig());
        
        this.fitAddon = new FitAddon.FitAddon();
        this.terminal.loadAddon(this.fitAddon);
        this.terminal.loadAddon(new WebLinksAddon.WebLinksAddon());

        // タブシステムが管理するため、ここではopen()を呼び出さない（二重初期化防止）
        // TabManager.createInitialTab()が後ほど適切な要素に対してopen()を実行し、その後fit()を呼び出します
        
        // シンプル重複防止システムの初期化
        if (this.messageAccumulator && this.messageAccumulator.initDuplicatePrevention) {
            this.messageAccumulator.initDuplicatePrevention(true);
            debugLog('🛡️ シンプル重複防止システム初期化完了');
        }

        // Handle window resize (ResourceManager経由)
        this.resourceManager.addEventListener(window, 'resize', () => {
            // デバウンス処理付きリサイズ制御
            this.handleResize();
            
            // タブシステムが有効な場合、アクティブなタブの全ペインをリサイズ
            if (this.terminalApp.tabManager && this.terminalApp.tabManager.activeTabId) {
                const activeTab = this.terminalApp.tabManager.tabs[this.terminalApp.tabManager.activeTabId];
                if (activeTab) {
                    activeTab.panes.forEach(pane => {
                        if (pane.fitAddon) {
                            pane.fitAddon.fit();
                            if (pane.isRunning && pane.terminal) {
                                window.electronAPI.tab.resize(pane.id, pane.terminal.cols, pane.terminal.rows);
                            }
                        }
                    });
                }
            } else if (this.fitAddon) {
                // シングルターミナルモード（後方互換性）
                this.fitAddon.fit();
                if (this.isTerminalRunning) {
                    window.electronAPI.terminal.resize(
                        this.terminal.cols,
                        this.terminal.rows
                    );
                }
            }
        });

        // イベントリスナー初期化（重複防止付き）
        this.initializeEventListeners();

        // 軽量リフレッシュを開始
        this.startLightRefresh();
    }

    async startShell() {
        // タブシステムが有効な場合はアクティブタブでシェルを起動
        if (this.terminalApp.tabManager && this.terminalApp.tabManager.activeTabId) {
            return await this.startShellForActiveTab();
        }
        
        // 従来のメインターミナル起動（後方互換性）
        try {
            if (!window.electronAPI || !window.electronAPI.terminal) {
                this.terminalApp.updateStatus('ElectronAPI not available');
                return;
            }

            this.terminalApp.updateStatus(`Starting shell...`);
            const result = await window.electronAPI.terminal.start();
            
            if (result.success) {
                this.isTerminalRunning = true;
                this.terminalApp.updateStatus(`Terminal ready`);
                this.terminal.focus();
                
                setTimeout(() => {
                    this.fitAddon.fit();
                    window.electronAPI.terminal.resize(
                        this.terminal.cols,
                        this.terminal.rows
                    );
                }, 100);
            } else {
                const errorMessage = result.error || `Failed to start shell`;
                this.terminalApp.updateStatus(errorMessage);
                debugError(`Failed to start shell:`, errorMessage);
            }
        } catch (error) {
            debugError(`Error starting shell:`, error);
            this.terminalApp.updateStatus(`Error starting shell: ${error.message}`);
        }
    }
    
    async startShellForActiveTab() {
        if (!this.terminalApp.tabManager || !this.terminalApp.tabManager.activeTabId) {
            debugError('No active tab available');
            return;
        }
        
        const activeTab = this.terminalApp.tabManager.tabs[this.terminalApp.tabManager.activeTabId];
        if (!activeTab) {
            debugError('Active tab not found');
            return;
        }
        
        // 既にプロセスが起動している場合は停止してから新しいシェルを起動
        if (activeTab.isRunning) {
            await this.terminalApp.tabManager.stopShellForTab(this.terminalApp.tabManager.activeTabId);
        }
        
        this.terminalApp.updateStatus(`Starting shell in active tab...`);
        
        try {
            const success = await this.terminalApp.tabManager.startShellForPane(
                this.terminalApp.tabManager.activeTabId,
                activeTab.activePaneId
            );
            if (success) {
                activeTab.isRunning = true;
                this.terminalApp.updateStatus(`Terminal ready in tab`);
                this.terminalApp.tabManager.renderTabs();
            } else {
                this.terminalApp.updateStatus(`Failed to start shell in tab`);
            }
        } catch (error) {
            debugError(`Error starting shell in tab:`, error);
            this.terminalApp.updateStatus(`Error starting shell in tab: ${error.message}`);
        }
    }


    async stopTerminal() {
        try {
            if (!window.electronAPI || !window.electronAPI.terminal) {
                this.terminalApp.updateStatus('ElectronAPI not available');
                return;
            }
            
            this.terminalApp.updateStatus('Stopping terminal...');
            const result = await window.electronAPI.terminal.stop();
            
            if (result.success) {
                this.isTerminalRunning = false;
                this.terminal.clear();
                this.currentRunningAI = null;
            } else {
                this.terminalApp.updateStatus(`Failed to stop terminal: ${result.error || 'Unknown error'}`);
            }
        } catch (error) {
            debugError('Error stopping terminal:', error);
            this.terminalApp.updateStatus(`Error stopping terminal: ${error.message}`);
        }
    }


    /**
     * スクロール監視の設定
     */
    setupScrollMonitoring() {
        if (this.terminal && this.terminal.onScroll) {
            this.terminal.onScroll((ydisp) => {
                this.handleScroll(ydisp);
            });
            debugLog('📜 スクロール監視を設定');
        }
    }

    /**
     * スクロール処理
     * @param {number} ydisp - スクロール位置
     */
    handleScroll(ydisp) {
        const wasScrollingUp = ydisp < this.scrollPosition;
        this.scrollPosition = ydisp;
        
        if (wasScrollingUp && !this.isScrollingUp) {
            this.isScrollingUp = true;
            debugLog('📜 上向きスクロール検出 - 音声処理を一時停止');
            
            // スクロールが止まったら再開
            clearTimeout(this.scrollTimeout);
            this.scrollTimeout = setTimeout(() => {
                this.isScrollingUp = false;
                debugLog('📜 スクロール停止 - 音声処理を再開');
            }, 1000);
        }
    }


    /**
     * 音声処理スキップ判定
     * @returns {boolean} スキップする場合true
     */
    shouldSkipAudioProcessing() {
        return this.isScrollingUp || 
               this.isResizing || 
               !this.terminalApp?.voiceEnabled;
    }


    handleResize() {
        // 既存のリサイズタイマーをクリア
        if (this.resizeTimer) {
            clearTimeout(this.resizeTimer);
        }
        
        // リサイズ中フラグを設定
        this.isResizing = true;
        debugLog('🔄 リサイズ開始 - 音声処理を一時停止');
        
        // 位置トラッカーの状態をログ出力
        if (this.positionTracker) {
            this.positionTracker.logCurrentState();
        }
        
        // 新しいタイマーを設定（最後のリサイズから200ms後に解除）
        this.resizeTimer = setTimeout(() => {
            this.isResizing = false;
            this.resizeTimer = null;
            debugLog('🔄 リサイズ完了 - 音声処理を再開');
            
            debugLog('🔄 リサイズ完了 - 音声処理を再開');
        }, 200);
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
            if (!this.hookService.isAppTerminalData(data)) {
                debugLog('📡 外部ターミナル（Hookモード）: Hook専用処理');
                await this.hookService.processHookOnlyData(data);
            } else {
                debugLog('📱 アプリ内ターミナル（Hookモード）: 音声処理スキップ');
                // アプリ内ターミナルでは音声処理を行わない
            }
        } else {
            // フックモードOFF: 全てのターミナルをアプリ内で処理
            debugLog('📱 アプリ内監視モード: processAppInternalMode呼び出し');
            await this.processAppInternalMode(data);
        }
    }

    // アプリ内監視モード処理
    async processAppInternalMode(data) {
        try {
            // ProcessingCacheによる最適化されたテキストクリーニング
            const cleanData = this.processingCache.optimizedTextCleaning(data);
            
            // 直接◆◇テキストを抽出（キャッシュ化された正規表現処理）
            const quotedTextMatches = this.processingCache.cachedRegexProcess(
                cleanData, 
                /◆([^◇]+)◇/gs
            );
            
            if (quotedTextMatches && quotedTextMatches.length > 0) {
                // ◆◇内のテキストを一個ずつ処理
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

    // カッコ内のテキストを一個ずつ順次処理（音声キューイングシステム使用）
    async processQuotedTexts(quotedTextMatches) {
        debugLog('🎵 processQuotedTexts開始:', { matchCount: quotedTextMatches.length });
        
        // 既存の音声キューをクリア（新しい音声セッション開始）
        this.voiceQueue.clear();
        
        for (let i = 0; i < quotedTextMatches.length; i++) {
            let quotedText = quotedTextMatches[i].replace(/[◆◇]/g, '').trim();
            
            // 改行と余分な空白を除去
            quotedText = quotedText.replace(/\r?\n\s*/g, '').replace(/\s+/g, ' ').trim();
            
            // 空のテキストはスキップ
            if (quotedText.length === 0) {
                continue;
            }
            
            // 音声キューに追加（順次処理）
            await this.voiceQueue.addToQueue(quotedText);
        }
        
        // 音声キュー処理完了（気分表示は削除済み）
        
        debugLog('🎵 processQuotedTexts完了');
    }

    /**
     * 軽量リフレッシュを開始（10秒間隔）
     */
    startLightRefresh() {
        // 既存のインターバルをクリア
        if (this.lightRefreshInterval) {
            clearInterval(this.lightRefreshInterval);
        }

        // 10秒間隔で軽量リフレッシュを実行
        this.lightRefreshInterval = setInterval(() => {
            this.performLightRefresh();
        }, 10000); // 10秒 = 10,000ms

        debugLog('🔄 軽量リフレッシュ開始 (10秒間隔)');
    }

    /**
     * 軽量リフレッシュを停止
     */
    stopLightRefresh() {
        if (this.lightRefreshInterval) {
            clearInterval(this.lightRefreshInterval);
            this.lightRefreshInterval = null;
            debugLog('🔄 軽量リフレッシュ停止');
        }
    }

    /**
     * 軽量リフレッシュを実行
     */
    performLightRefresh() {
        try {
            // ターミナルとfitAddonが存在し、かつアクティブな場合のみ実行
            if (this.fitAddon && this.terminal && this.terminal.element &&
                document.hasFocus() && this.terminal.element.offsetParent) {

                // 軽量なサイズ調整のみ実行
                this.fitAddon.fit();

                debugLog('🔄 軽量リフレッシュ実行完了');
            }
        } catch (error) {
            debugLog('❌ 軽量リフレッシュエラー:', error.message);
        }
    }

    /**
     * イベントリスナー初期化（重複防止機構付き）
     */
    initializeEventListeners() {
        // 重複初期化の防止
        if (this.isEventListenersInitialized) {
            debugLog('🛡️ イベントリスナー重複初期化をスキップ');
            return;
        }

        // Handle terminal data from backend
        if (window.electronAPI && window.electronAPI.terminal) {
            window.electronAPI.terminal.onData((data) => {
                debugLog('📡 ターミナルデータ受信:', {
                    dataLength: data.length,
                    hasTerminal: !!this.terminal,
                    dataPreview: data.substring(0, 50)
                });
                
                // 高度なデータ処理（重複防止付き）
                this.handleTerminalData(data);
            });

            // Handle Shell exit
            window.electronAPI.terminal.onExit((exitCode) => {
                this.terminal.write(`\r\n\x1b[91mShell exited with code: ${exitCode}\x1b[0m\r\n`);
                this.isTerminalRunning = false;
                this.terminalApp.updateButtons();
            });
        } else {
            debugError('electronAPI not available');
            this.terminalApp.updateStatus('ElectronAPI not available');
        }

        // Handle voice text available - DISABLED for bracket-only mode
        if (window.electronAPI && window.electronAPI.voice) {
            // Handle Hook conversation display
            window.electronAPI.voice.onShowHookConversation((data) => {
                this.terminalApp.displayHookConversation(data);
            });
        }

        // 初期化完了フラグを設定
        this.isEventListenersInitialized = true;
        debugLog('🛡️ イベントリスナー初期化完了（重複防止済み）');
    }

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
}

// ブラウザ環境での利用
if (typeof window !== 'undefined') {
    window.TerminalService = TerminalService;
}

// Node.js環境での利用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TerminalService;
}
