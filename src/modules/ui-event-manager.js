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
        
        // ターミナル表示状態の管理
        this.isTerminalVisible = true;
        
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
        this.updateTerminalToggleButton();
        
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
        const startClaudeDangerousBtn = document.getElementById('start-claude-dangerous');

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
            startClaudeDangerousBtn: !!startClaudeDangerousBtn,
        });

        // ターミナル制御ボタン
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                if (aiSelectModal) aiSelectModal.style.display = 'flex';
            });
        }
        if (stopBtn) stopBtn.addEventListener('click', () => this.handleStopButtonClick());
        
        // ターミナル切り替えボタン
        const terminalToggleBtn = document.getElementById('terminal-toggle');
        if (terminalToggleBtn) {
            terminalToggleBtn.addEventListener('click', () => this.toggleTerminalVisibility());
        }

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
        if (startClaudeDangerousBtn && aiSelectModal) {
            startClaudeDangerousBtn.addEventListener('click', () => {
                this.app.startTerminal('claude-dangerous');
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

        // 音量調整スライダー
        const voiceVolumeSlider = document.getElementById('voice-volume-slider');
        const volumeValueDisplay = document.getElementById('volume-value-display');
        if (voiceVolumeSlider) {
            // 初期値を設定から読み込み
            const initVolume = async () => {
                const savedVolume = await unifiedConfig.get('voiceVolume', 50);
                voiceVolumeSlider.value = savedVolume;
                // パーセンテージ表示を削除
                this.app.voiceVolume = savedVolume;
            };
            initVolume();
            
            voiceVolumeSlider.addEventListener('input', async (e) => {
                const newValue = parseInt(e.target.value);
                this.app.voiceVolume = newValue;
                
                // パーセンテージ表示を削除
                
                // 統一設定システムに保存
                await unifiedConfig.set('voiceVolume', newValue);
                
                this.debugLog('Voice volume changed:', newValue);
            });
        }

        // Hook使用切り替えスイッチ
        const useHooksToggle = document.getElementById('use-hooks-toggle');
        if (useHooksToggle) {
            // 初期値を設定から読み込み（強制的にfalseに設定）
            const initHooks = async () => {
                // デフォルトは必ずfalse（アプリ内監視モード）
                const savedUseHooks = false;
                await unifiedConfig.set('useHooks', false); // 強制的に設定を保存
                useHooksToggle.checked = savedUseHooks;
                this.debugLog('Hooks setting initialized (forced false):', savedUseHooks);
                
                // 初期設定でアプリにモード通知
                this.app.switchVoiceMode(savedUseHooks);
            };
            initHooks();
            
            useHooksToggle.addEventListener('change', async (e) => {
                const newValue = e.target.checked;
                
                // 統一設定システムに保存
                await unifiedConfig.set('useHooks', newValue);
                
                this.debugLog('Hooks usage changed:', newValue);
                
                // 即座にモード切り替え
                this.app.switchVoiceMode(newValue);
                
                // 設定変更の通知
                if (newValue) {
                    // Hook有効時の通知
                    setTimeout(() => {
                        if (window.showTemporaryMessage) {
                            window.showTemporaryMessage('Claude Code Hooks機能を有効にしました。音声合成がHookで処理されます。', 'info');
                        }
                    }, 100);
                } else {
                    // Hook無効時の通知
                    setTimeout(() => {
                        if (window.showTemporaryMessage) {
                            window.showTemporaryMessage('Claude Code Hooks機能を無効にしました。アプリ内監視モードを使用します。', 'info');
                        }
                    }, 100);
                }
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
                    activeTabAiType: activeTab?.aiType,
                    activeTabName: activeTab?.name,
                    allTabsStatus: Object.keys(this.app.tabManager.tabs).map(id => ({
                        id,
                        isRunning: this.app.tabManager.tabs[id].isRunning,
                        aiType: this.app.tabManager.tabs[id].aiType
                    }))
                });
            } else {
                // フォールバック：メインターミナルの状態
                isAIRunning = this.app.isTerminalRunning;
                this.debugLog('Fallback to main terminal state:', { isTerminalRunning: isAIRunning });
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

    /**
     * ターミナル表示・非表示を切り替える
     */
    toggleTerminalVisibility() {
        this.debugLog('Terminal visibility toggle requested');
        
        const terminalSection = document.querySelector('.terminal-section');
        const mainContent = document.querySelector('.main-content');
        const terminalToggleBtn = document.getElementById('terminal-toggle');
        
        if (!terminalSection || !mainContent || !terminalToggleBtn) {
            this.debugError('Required elements not found for terminal toggle');
            return;
        }
        
        // 現在の状態を反転
        this.isTerminalVisible = !this.isTerminalVisible;
        
        if (this.isTerminalVisible) {
            // ターミナル表示状態
            terminalSection.style.display = 'flex';
            mainContent.classList.remove('terminal-hidden');
            terminalToggleBtn.classList.remove('terminal-hidden');
            this.debugLog('Terminal is now visible');
        } else {
            // ターミナル非表示状態
            terminalSection.style.display = 'none';
            mainContent.classList.add('terminal-hidden');
            terminalToggleBtn.classList.add('terminal-hidden');
            this.debugLog('Terminal is now hidden');
        }
        
        // ボタンの状態を更新
        this.updateTerminalToggleButton();
    }

    /**
     * ターミナル切り替えボタンの状態を更新
     */
    updateTerminalToggleButton() {
        const terminalToggleBtn = document.getElementById('terminal-toggle');
        if (!terminalToggleBtn) return;
        
        // ツールチップテキストを更新
        if (this.isTerminalVisible) {
            terminalToggleBtn.setAttribute('aria-label', 'ターミナルを非表示');
            terminalToggleBtn.setAttribute('title', 'ターミナルを非表示');
        } else {
            terminalToggleBtn.setAttribute('aria-label', 'ターミナルを表示');
            terminalToggleBtn.setAttribute('title', 'ターミナルを表示');
        }
        
        this.debugLog(`Terminal toggle button updated: ${this.isTerminalVisible ? 'show' : 'hide'} mode`);
    }
}

// グローバルに公開（モジュールシステム対応）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIEventManager;
} else {
    window.UIEventManager = UIEventManager;
}