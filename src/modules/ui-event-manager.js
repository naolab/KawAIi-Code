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
        const hooksGuideModal = document.getElementById('hooks-guide-modal');
        const closeHooksGuideBtn = document.getElementById('close-hooks-guide');

        // AI選択モーダル用の要素を取得
        const aiSelectModal = document.getElementById('ai-select-modal');
        const closeAiSelectBtn = document.getElementById('close-ai-select');
        const startClaudeBtn = document.getElementById('start-claude');
        const startClaudeDangerousBtn = document.getElementById('start-claude-dangerous');
        
        // Claude Code Hooks情報ボタン
        const hooksInfoBtn = document.getElementById('hooks-info-btn');

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
            hooksInfoBtn: !!hooksInfoBtn,
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
        
        // Hooksガイドモーダルの閉じるボタンとクリック外し
        if (closeHooksGuideBtn && hooksGuideModal) {
            closeHooksGuideBtn.addEventListener('click', () => {
                hooksGuideModal.style.display = 'none';
            });
        }
        
        if (hooksGuideModal) {
            hooksGuideModal.addEventListener('click', (e) => {
                if (e.target === hooksGuideModal) {
                    hooksGuideModal.style.display = 'none';
                }
            });
        }

        // Claude Code Hooks情報ボタンのイベント
        if (hooksInfoBtn) {
            hooksInfoBtn.addEventListener('click', () => {
                const hooksGuideModal = document.getElementById('hooks-guide-modal');
                if (hooksGuideModal) {
                    hooksGuideModal.style.display = 'flex';
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

        // Hook使用切り替えスイッチ（配布版では無効化）
        const useHooksToggle = document.getElementById('use-hooks-toggle');
        if (useHooksToggle) {
            // 配布版では常時オフに固定し、スイッチを無効化
            useHooksToggle.checked = false;
            useHooksToggle.disabled = true;
            
            // 親要素にもスタイルを適用（グレーアウト効果）
            const switchContainer = useHooksToggle.parentElement;
            if (switchContainer && switchContainer.classList.contains('setting-switch')) {
                switchContainer.style.opacity = '0.5';
                switchContainer.style.pointerEvents = 'none';
            }
            
            // 強制的にアプリ内監視モードに設定
            this.app.switchVoiceMode(false);
            
            this.debugLog('Hooks mode disabled for distribution version');
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

    /**
     * チャットメッセージを追加
     */
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
        if (this.app.chatMessages) {
            this.app.chatMessages.push({ type, sender, text, timestamp: new Date() });
        }
    }

    /**
     * 音声メッセージを追加
     */
    addVoiceMessage(speaker, text) {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;

        // セキュアなDOM操作でメッセージを追加
        this.addVoiceMessageElement(speaker, text, chatMessages);
        
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    /**
     * 音声メッセージ要素を追加
     */
    addVoiceMessageElement(speaker, text, parentElement) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'voice-message';
        
        const speakerDiv = document.createElement('div');
        speakerDiv.className = 'voice-speaker';
        speakerDiv.textContent = speaker;
        
        const textP = document.createElement('p');
        textP.className = 'voice-text';
        textP.textContent = text;
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'voice-time';
        timeDiv.textContent = new Date().toLocaleTimeString('ja-JP', { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        });
        
        messageDiv.appendChild(speakerDiv);
        messageDiv.appendChild(textP);
        messageDiv.appendChild(timeDiv);
        
        parentElement.appendChild(messageDiv);
        
        return messageDiv;
    }

    /**
     * 話者選択オプションを更新
     */
    updateSpeakerSelectOptions(selectElement, speakers, selectedSpeakerId = null) {
        if (!selectElement || !Array.isArray(speakers)) return;
        
        // 既存のオプションをクリア
        selectElement.innerHTML = '';
        
        // 新しいオプションを追加
        speakers.forEach(speaker => {
            speaker.styles.forEach(style => {
                const option = document.createElement('option');
                option.value = style.id.toString();
                option.textContent = `${speaker.name} (${style.name})`;
                selectElement.appendChild(option);
            });
        });
        
        // 選択状態を設定
        if (selectedSpeakerId !== null) {
            selectElement.value = selectedSpeakerId.toString();
        }
    }

    /**
     * キャラクター気分を更新
     */
    updateCharacterMood(mood) {
        const moodElement = document.querySelector('.character-mood');
        if (moodElement && moodElement.textContent !== mood) {
            moodElement.textContent = mood;
        }
    }

    /**
     * ステータスを更新
     */
    updateStatus(message) {
        const statusElement = document.getElementById('status');
        if (statusElement) {
            statusElement.textContent = message;
        }
    }

    /**
     * 通知を表示
     */
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
            z-index: 1000;
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

    /**
     * 音声エラーを表示
     */
    showVoiceError(error) {
        const errorMessage = this.getVoiceErrorMessage(error);
        
        // エラー通知を画面に表示
        this.showNotification(errorMessage, 'error');
        
        // 音声関連のUIを更新
        this.updateVoiceErrorIndicator(error);
    }

    /**
     * 音声エラーメッセージを生成
     */
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

    /**
     * 音声エラーインジケーターを更新
     */
    updateVoiceErrorIndicator(error) {
        const statusElement = document.getElementById('connection-status-modal');
        if (statusElement) {
            statusElement.textContent = 'エラー発生';
            statusElement.className = 'status-error';
            
            // 10秒後にステータスを復元
            setTimeout(() => {
                if (this.app && this.app.checkVoiceConnection) {
                    this.app.checkVoiceConnection();
                }
            }, 10000);
        }
    }

    /**
     * 作業ディレクトリ選択処理
     */
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
                this.app.claudeWorkingDir = result.path; // クラス変数を更新
                if (claudeCwdDisplay) claudeCwdDisplay.textContent = this.app.claudeWorkingDir;
                if (claudeCwdMessage) {
                    claudeCwdMessage.textContent = `作業ディレクトリを\'${result.path}\'に設定しました。`;
                    claudeCwdMessage.style.color = 'green';
                }
                
                // ConfigManagerにも作業ディレクトリを同期
                if (this.app.configManager) {
                    this.app.configManager.setWorkingDirectory(this.app.claudeWorkingDir);
                }
                
                // 作業ディレクトリ設定時に両方のAI.mdファイルを再生成
                await this.app.generateAiMdFiles();

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

    /**
     * チャットインターフェースの設定
     */
    setupChatInterface() {
        // チャット入力エリアは削除済み

        // 初期メッセージを追加（音声読み上げ用）
        this.addVoiceMessage('ニコ', 'こんにちは〜！何をお手伝いしましょうか？');
    }

    /**
     * 設定をモーダルに同期
     */
    async syncSettingsToModal() {
        // 音声読み上げ設定の同期
        const voiceToggleModal = document.getElementById('voice-toggle-modal');
        const speakerSelectModal = document.getElementById('speaker-select-modal');
        const cooldownInputModal = document.getElementById('voice-cooldown-modal');
        const connectionStatusModal = document.getElementById('connection-status-modal');

        if (voiceToggleModal) voiceToggleModal.checked = this.app.voiceEnabled;
        
        // 話者選択の更新をAudioServiceに委譲
        if (this.app.audioService) {
            await this.app.audioService.updateSpeakerSelect();
        }
        
        // 接続状態の更新
        this.app.updateConnectionStatus(this.app.connectionStatus === 'connected' ? '接続済み' : '未接続', this.app.connectionStatus);

        // 壁紙設定の同期は WallpaperSystem モジュールで処理

        // Claude Code 作業ディレクトリ設定の同期
        const claudeCwdDisplay = document.getElementById('claude-cwd-display');
        const claudeCwdMessage = document.getElementById('claude-cwd-message');

        try {
            const result = await window.electronAPI.getClaudeCwd();
            if (result.success) {
                this.app.claudeWorkingDir = result.cwd; // クラス変数に保存
                if (claudeCwdDisplay) claudeCwdDisplay.textContent = this.app.claudeWorkingDir;
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
        if (window.getSafeUnifiedConfig) {
            const unifiedConfig = window.getSafeUnifiedConfig();
            await unifiedConfig.set('voiceEnabled', this.app.voiceEnabled);
            await unifiedConfig.set('selectedSpeaker', this.app.selectedSpeaker);

            // 壁紙設定の復元は WallpaperSystem モジュールで処理

            if (this.app.claudeWorkingDir) {
                await unifiedConfig.set('claudeWorkingDir', this.app.claudeWorkingDir);
            }
        }
    }
}

// グローバルに公開（モジュールシステム対応）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIEventManager;
} else {
    window.UIEventManager = UIEventManager;
}