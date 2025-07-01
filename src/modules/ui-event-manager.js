/**
 * UIEventManager - UI制御・イベントリスナー管理クラス
 * 
 * 責務:
 * - DOM要素のイベントリスナー設定
 * - モーダル表示・非表示制御
 * - UI要素の状態更新
 * - ボタンやコントロールの有効・無効化
 */

// デバッグログ制御（本番環境では無効化）
// UIEventManager専用のログ関数を作成（グローバル競合を回避）
(function() {
    const isDevMode = !window.location.protocol.startsWith('file:') || process.env.NODE_ENV === 'development';
    
    // UIEventManager専用のログ関数をグローバルに設定
    if (typeof window.uiEventManagerLog === 'undefined') {
        window.uiEventManagerLog = {
            debug: isDevMode ? console.log : () => {},
            error: console.error
        };
    }
})();

class UIEventManager {
    constructor(terminalApp) {
        // ログ関数の初期化
        this.debugLog = window.uiEventManagerLog.debug;
        this.debugError = window.uiEventManagerLog.error;
        
        // TerminalAppインスタンスへの参照
        this.app = terminalApp;
        
        this.debugLog('UIEventManager initialized');
    }

    /**
     * 全てのイベントリスナーを設定
     */
    setupEventListeners() {
        this.setupModalEventListeners();
        this.setupVoiceControlEventListeners();
        this.setupDirectorySelectionEventListeners();
        this.setupGlobalDebugFunctions();
        
        // 初期UI状態を更新
        this.updateButtons();
        this.updateVoiceControls();
        
        this.debugLog('All event listeners setup completed');
    }

    /**
     * モーダル関連のイベントリスナー設定
     */
    setupModalEventListeners() {
        const startBtn = document.getElementById('start-ai-selection');
        const stopBtn = document.getElementById('stop-terminal');
        const settingsBtn = document.getElementById('settings-btn');
        const closeSettingsBtn = document.getElementById('close-settings');
        const settingsModal = document.getElementById('settings-modal');
        const helpBtn = document.getElementById('help-btn');
        const closeHelpBtn = document.getElementById('close-help');
        const helpModal = document.getElementById('help-modal');

        // AI選択モーダル用の要素を取得
        const aiSelectModal = document.getElementById('ai-select-modal');
        const closeAiSelectBtn = document.getElementById('close-ai-select');
        const startClaudeBtn = document.getElementById('start-claude');
        const startGeminiBtn = document.getElementById('start-gemini');

        // デバッグ用：要素の取得状況をログ出力
        this.debugLog('Modal elements check:', {
            startBtn: !!startBtn,
            stopBtn: !!stopBtn,
            settingsBtn: !!settingsBtn,
            closeSettingsBtn: !!closeSettingsBtn,
            settingsModal: !!settingsModal,
            helpBtn: !!helpBtn,
            closeHelpBtn: !!closeHelpBtn,
            helpModal: !!helpModal,
            aiSelectModal: !!aiSelectModal,
            closeAiSelectBtn: !!closeAiSelectBtn,
            startClaudeBtn: !!startClaudeBtn,
            startGeminiBtn: !!startGeminiBtn
        });

        // ターミナル制御ボタン
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                if (aiSelectModal) aiSelectModal.style.display = 'flex';
            });
        }
        if (stopBtn) stopBtn.addEventListener('click', () => this.handleStopButtonClick());

        // AI選択モーダルのイベント
        if (closeAiSelectBtn && aiSelectModal) {
            closeAiSelectBtn.addEventListener('click', () => {
                aiSelectModal.style.display = 'none';
            });
        }
        if (startClaudeBtn && aiSelectModal) {
            startClaudeBtn.addEventListener('click', () => {
                this.app.startTerminal('claude');
                aiSelectModal.style.display = 'none';
            });
        }
        if (startGeminiBtn && aiSelectModal) {
            startGeminiBtn.addEventListener('click', () => {
                this.app.startTerminal('gemini');
                aiSelectModal.style.display = 'none';
            });
        }
        if (aiSelectModal) {
            aiSelectModal.addEventListener('click', (e) => {
                if (e.target === aiSelectModal) {
                    aiSelectModal.style.display = 'none';
                }
            });
        }
        
        // 設定モーダルのイベント
        if (settingsBtn && settingsModal) {
            settingsBtn.addEventListener('click', () => {
                settingsModal.style.display = 'flex';
                this.app.syncSettingsToModal();
            });
        }
        
        if (closeSettingsBtn && settingsModal) {
            closeSettingsBtn.addEventListener('click', () => {
                settingsModal.style.display = 'none';
            });
        }
        
        // モーダル外クリックで閉じる
        if (settingsModal) {
            settingsModal.addEventListener('click', (e) => {
                if (e.target === settingsModal) {
                    settingsModal.style.display = 'none';
                }
            });
        }
        
        // ヘルプモーダルのイベント
        if (helpBtn && helpModal) {
            helpBtn.addEventListener('click', () => {
                helpModal.style.display = 'flex';
            });
        }
        
        if (closeHelpBtn && helpModal) {
            closeHelpBtn.addEventListener('click', () => {
                helpModal.style.display = 'none';
            });
        }
        
        if (helpModal) {
            helpModal.addEventListener('click', (e) => {
                if (e.target === helpModal) {
                    helpModal.style.display = 'none';
                }
            });
        }

        this.debugLog('Modal event listeners setup completed');
    }

    /**
     * 音声制御関連のイベントリスナー設定
     */
    setupVoiceControlEventListeners() {
        const voiceToggleModal = document.getElementById('voice-toggle-modal');
        const speakerSelectModal = document.getElementById('speaker-select-modal');
        const stopVoiceBtnModal = document.getElementById('stop-voice-modal');
        const refreshConnectionBtnModal = document.getElementById('refresh-connection-modal');

        this.debugLog('Voice control elements check:', {
            voiceToggleModal: !!voiceToggleModal,
            speakerSelectModal: !!speakerSelectModal,
            stopVoiceBtnModal: !!stopVoiceBtnModal,
            refreshConnectionBtnModal: !!refreshConnectionBtnModal
        });

        if (voiceToggleModal) {
            voiceToggleModal.addEventListener('change', (e) => {
                this.app.voiceEnabled = e.target.checked;
                this.updateVoiceControls();
                this.debugLog('Voice enabled changed:', this.app.voiceEnabled);
            });
        }

        if (speakerSelectModal) {
            speakerSelectModal.addEventListener('change', async (e) => {
                this.app.selectedSpeaker = parseInt(e.target.value);
                
                // 設定を永続化
                if (window.electronAPI && window.electronAPI.config) {
                    await window.electronAPI.config.set('defaultSpeakerId', this.app.selectedSpeaker);
                }
                this.debugLog('Speaker setting updated:', this.app.selectedSpeaker);
            });
        }

        if (stopVoiceBtnModal) {
            stopVoiceBtnModal.addEventListener('click', () => this.app.stopVoice());
        }

        if (refreshConnectionBtnModal) {
            refreshConnectionBtnModal.addEventListener('click', () => this.app.checkVoiceConnection());
        }

        // 音声読み上げ間隔スライダー
        const voiceIntervalSlider = document.getElementById('voice-interval-slider');
        if (voiceIntervalSlider) {
            // 初期値を設定から読み込み
            voiceIntervalSlider.value = this.app.voiceIntervalSeconds;
            
            voiceIntervalSlider.addEventListener('input', async (e) => {
                const newValue = parseFloat(e.target.value);
                this.app.voiceIntervalSeconds = newValue;
                
                // 統一設定システムに保存
                await unifiedConfig.set('voiceIntervalSeconds', newValue);
            });
        }

        this.debugLog('Voice control event listeners setup completed');
    }

    /**
     * ディレクトリ選択関連のイベントリスナー設定
     */
    setupDirectorySelectionEventListeners() {
        const selectClaudeCwdBtn = document.getElementById('select-claude-cwd-btn');
        if (selectClaudeCwdBtn) {
            selectClaudeCwdBtn.addEventListener('click', () => this.app.handleSelectClaudeCwd());
            this.debugLog('Directory selection event listener setup completed');
        }

        // 壁紙設定ラジオボタン（WallpaperSystemで処理されるためログのみ）
        const wallpaperDefaultRadio = document.getElementById('wallpaper-default-radio');
        const wallpaperUploadedRadio = document.getElementById('wallpaper-uploaded-radio');
        this.debugLog('Wallpaper radio buttons found:', {
            defaultRadio: !!wallpaperDefaultRadio,
            uploadedRadio: !!wallpaperUploadedRadio
        });
    }

    /**
     * グローバルデバッグ関数の設定
     */
    setupGlobalDebugFunctions() {
        // 🔧 音声テスト機能をグローバルに追加（デバッグ用）
        if (typeof window !== 'undefined') {
            window.debugTestVoice = (text = "テスト用音声です") => {
                this.app.debugTestVoice(text);
            };
            window.debugCheckVoiceConnection = () => {
                this.app.checkVoiceConnection();
            };
            window.debugSpeakText = (text) => {
                this.app.speakText(text);
            };
            
            this.debugLog('Global debug functions setup completed');
        }
    }

    /**
     * 停止ボタンクリックの処理
     */
    async handleStopButtonClick() {
        try {
            // タブ機能有効時は、アクティブタブのAIを停止
            if (this.app.tabManager && this.app.tabManager.activeTabId) {
                const activeTab = this.app.tabManager.tabs[this.app.tabManager.activeTabId];
                if (activeTab && activeTab.isRunning) {
                    this.debugLog('Stopping AI in active tab:', this.app.tabManager.activeTabId);
                    await this.app.tabManager.stopAIForTab(this.app.tabManager.activeTabId);
                    
                    // ボタン状態を更新
                    this.updateButtons();
                    
                    // タブ表示も更新
                    this.app.tabManager.renderTabs();
                    
                    this.app.updateStatus('AI stopped - Tab ready for new session');
                    return;
                }
            }
            
            // フォールバック：メインターミナルを停止
            this.debugLog('Stopping main terminal');
            await this.app.stopTerminal();
            
        } catch (error) {
            this.debugError('Error in stop button handler:', error);
            this.app.updateStatus('Error stopping AI');
        }
    }

    /**
     * ボタンの有効・無効状態を更新
     */
    updateButtons() {
        const startAiSelectionBtn = document.getElementById('start-ai-selection');
        const stopBtn = document.getElementById('stop-terminal');
        
        if (startAiSelectionBtn && stopBtn) {
            // タブ機能有効時は、アクティブタブの状態を確認
            let isAIRunning = false;
            
            if (this.app.tabManager && this.app.tabManager.activeTabId) {
                const activeTab = this.app.tabManager.tabs[this.app.tabManager.activeTabId];
                isAIRunning = activeTab ? activeTab.isRunning : false;
                
                this.debugLog('Tab-based button state check:', {
                    activeTabId: this.app.tabManager.activeTabId,
                    activeTabRunning: isAIRunning,
                    activeTabAiType: activeTab?.aiType
                });
            } else {
                // フォールバック：メインターミナルの状態
                isAIRunning = this.app.isTerminalRunning;
            }
            
            startAiSelectionBtn.disabled = isAIRunning;
            stopBtn.disabled = !isAIRunning;
            
            this.debugLog('Buttons updated:', {
                startAiSelectionDisabled: startAiSelectionBtn.disabled,
                stopDisabled: stopBtn.disabled,
                isAIRunning: isAIRunning
            });
        }
    }

    /**
     * 音声制御UIの有効・無効状態を更新
     */
    updateVoiceControls() {
        const speakerSelectModal = document.getElementById('speaker-select-modal');
        const stopVoiceBtnModal = document.getElementById('stop-voice-modal');
        const voiceToggleModal = document.getElementById('voice-toggle-modal');
        const cooldownInputModal = document.getElementById('voice-cooldown-modal');
        const refreshConnectionBtnModal = document.getElementById('refresh-connection-modal');

        const canUseVoice = this.app.connectionStatus === 'connected';

        if (voiceToggleModal) {
            voiceToggleModal.disabled = !canUseVoice;
        }
        if (speakerSelectModal) {
            speakerSelectModal.disabled = !this.app.voiceEnabled || !canUseVoice;
        }
        if (stopVoiceBtnModal) {
            stopVoiceBtnModal.disabled = !this.app.voiceEnabled || !canUseVoice;
        }
        if (refreshConnectionBtnModal) {
            refreshConnectionBtnModal.disabled = false;
        }

        this.debugLog('Voice controls updated:', {
            canUseVoice,
            voiceEnabled: this.app.voiceEnabled,
            connectionStatus: this.app.connectionStatus
        });
    }

    /**
     * ステータスメッセージを更新
     */
    updateStatus(message) {
        const statusElement = document.getElementById('status');
        if (statusElement) {
            statusElement.textContent = message;
            this.debugLog('Status updated:', message);
        }
    }

    /**
     * 🔧 追加機能: モーダルの表示状態を取得
     */
    getModalStates() {
        const settingsModal = document.getElementById('settings-modal');
        const helpModal = document.getElementById('help-modal');
        
        return {
            settingsVisible: settingsModal ? settingsModal.style.display === 'flex' : false,
            helpVisible: helpModal ? helpModal.style.display === 'flex' : false
        };
    }

    /**
     * 🔧 追加機能: 全モーダルを閉じる
     */
    closeAllModals() {
        const settingsModal = document.getElementById('settings-modal');
        const helpModal = document.getElementById('help-modal');
        
        if (settingsModal) settingsModal.style.display = 'none';
        if (helpModal) helpModal.style.display = 'none';
        
        this.debugLog('All modals closed');
    }
}

// グローバルに公開（モジュールシステム対応）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIEventManager;
} else {
    window.UIEventManager = UIEventManager;
}