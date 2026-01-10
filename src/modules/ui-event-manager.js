/**
 * UIEventManager - UI制御・イベントリスナー管理クラス
 * 
 * 責務:
 * - DOM要素のイベントリスナー設定
 * - モーダル表示・非表示制御
 * - UI要素の状態更新
 * - ボタンやコントロールの有効・無効化
 */

// デバッグログ制御（配布版では無効化）
// UIEventManager専用のログ関数を作成（グローバル競合を回避）
(function() {
    // Electron環境ではprocess.env.NODE_ENVで判定
    const isDevMode = typeof process !== 'undefined' &&
                     (process.env.NODE_ENV === undefined || process.env.NODE_ENV !== 'production');

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
        
        // 表示状態の管理（3状態: 'both', 'character-only', 'terminal-only'）
        this.displayMode = 'both';
        
        // === 重複防止システム ===
        this.registeredListeners = new Map(); // リスナー管理：Map<elementId_eventType, {element, handler}>
        this.isSetupComplete = false;          // 初期化完了フラグ
        this.processingLocks = new Map();      // 処理中ロック：Map<lockId, boolean>
        this.helpNavigationInitialized = false; // ヘルプナビ初期化フラグ
        this.legalDocumentsLoaded = false;      // 法的ドキュメント読み込み済みフラグ
        this.dragPreventionSetup = false;       // ドラッグ抑止設定フラグ
        
        this.debugLog('UIEventManager initialized with duplicate prevention system');

        this.setupDragPrevention();
    }
    
    /**
     * ボタンやリンクのドラッグ開始によるツールチップ表示を抑止
     */
    setupDragPrevention() {
        if (this.dragPreventionSetup) {
            return;
        }

        const preventDragHandler = (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) {
                return;
            }

            const interactiveElement = target.closest('a, button, [role="button"]');
            if (!interactiveElement) {
                return;
            }

            if (interactiveElement.closest('[data-allow-drag="true"]')) {
                return;
            }

            interactiveElement.setAttribute('draggable', 'false');

            // dragstartを抑止してツールチップ表示を防ぐ
            if (!event.defaultPrevented) {
                event.preventDefault();
                this.debugLog('ドラッグ抑止:', interactiveElement.tagName, interactiveElement.id || interactiveElement.className);
            }
        };

        document.addEventListener('dragstart', preventDragHandler, { capture: true });

        this.dragPreventionSetup = true;
        this.debugLog('ドラッグ抑止リスナーを登録');
    }
    
    /**
     * 安全なイベントリスナー登録（重複防止機能付き）
     */
    safeAddEventListener(element, eventType, handler, uniqueId = null) {
        if (!element) {
            this.debugLog(`⚠️ Element not found for ${uniqueId || 'unknown'}`);
            return false;
        }
        
        // ユニークIDを生成
        const elementId = uniqueId || element.id || `${element.tagName}_${Math.random().toString(36).substr(2, 9)}`;
        const listenerKey = `${elementId}_${eventType}`;
        
        // 既に登録済みかチェック
        if (this.registeredListeners.has(listenerKey)) {
            this.debugLog(`🛡️ 重複防止: ${listenerKey} already registered`);
            return false;
        }
        
        // 古いイベントリスナーを確実に削除
        if (element._uiEventHandlers && element._uiEventHandlers[eventType]) {
            element.removeEventListener(eventType, element._uiEventHandlers[eventType]);
            delete element._uiEventHandlers[eventType];
        }
        
        // 新しいイベントリスナーを登録
        element.addEventListener(eventType, handler);
        
        // ハンドラーを要素に保存（削除用）
        if (!element._uiEventHandlers) {
            element._uiEventHandlers = {};
        }
        element._uiEventHandlers[eventType] = handler;
        
        // 登録情報を記録
        this.registeredListeners.set(listenerKey, { element, handler, eventType });
        
        this.debugLog(`✅ Event listener registered: ${listenerKey}`);
        return true;
    }
    
    /**
     * 処理実行の排他制御
     */
    async executeWithLock(lockId, asyncFunction) {
        // 既に処理中なら無視
        if (this.processingLocks.get(lockId)) {
            this.debugLog(`🔒 Processing locked: ${lockId}`);
            return null;
        }
        
        this.processingLocks.set(lockId, true);
        try {
            this.debugLog(`🔓 Lock acquired: ${lockId}`);
            return await asyncFunction();
        } finally {
            this.processingLocks.set(lockId, false);
            this.debugLog(`🔒 Lock released: ${lockId}`);
        }
    }
    
    /**
     * 全てのイベントリスナーをクリーンアップ
     */
    cleanupAllEventListeners() {
        this.debugLog('🧹 Cleaning up all event listeners...');
        
        for (const [listenerKey, {element, handler, eventType}] of this.registeredListeners) {
            try {
                element.removeEventListener(eventType, handler);
                if (element._uiEventHandlers) {
                    delete element._uiEventHandlers[eventType];
                }
                this.debugLog(`🗑️ Removed listener: ${listenerKey}`);
            } catch (error) {
                this.debugError(`❌ Error removing listener ${listenerKey}:`, error);
            }
        }
        
        this.registeredListeners.clear();
        this.processingLocks.clear();
        this.isSetupComplete = false;
        
        this.debugLog('✅ Event listeners cleanup completed');
    }

    /**
     * 個別のイベントリスナーを削除
     * @param {Element} element - 対象要素
     * @param {string} listenerKey - リスナーキー
     */
    removeEventListener(element, listenerKey) {
        if (!element || !listenerKey) {
            this.debugError('❌ removeEventListener: Invalid parameters');
            return;
        }

        const listenerData = this.registeredListeners.get(listenerKey);
        if (listenerData) {
            try {
                element.removeEventListener(listenerData.eventType, listenerData.handler);
                if (element._uiEventHandlers) {
                    delete element._uiEventHandlers[listenerData.eventType];
                }
                this.registeredListeners.delete(listenerKey);
                this.debugLog(`🗑️ Removed listener: ${listenerKey}`);
            } catch (error) {
                this.debugError(`❌ Error removing listener ${listenerKey}:`, error);
            }
        } else {
            this.debugLog(`⚠️ Listener not found: ${listenerKey}`);
        }
    }

    /**
     * 全てのイベントリスナーを設定
     */
    async setupEventListeners() {
        // 重複初期化防止
        if (this.isSetupComplete) {
            this.debugLog('🛡️ Event listeners already setup, skipping...');
            return;
        }
        
        // 既存のリスナーをクリーンアップ
        this.cleanupAllEventListeners();
        
        await this.setupModalEventListeners();
        this.setupVoiceControlEventListeners();
        this.setupDirectorySelectionEventListeners();
        this.setupGlobalDebugFunctions();
        
        // 初期UI状態を更新
        this.updateButtons();
        this.updateVoiceControls();
        this.updateTerminalToggleButton();
        
        this.isSetupComplete = true;
        this.debugLog('✅ All event listeners setup completed with duplicate prevention');
    }

    /**
     * モーダル関連のイベントリスナー設定
     */
    async setupModalEventListeners() {
        // ターミナル切り替えボタン
        const terminalToggleBtn = document.getElementById('terminal-toggle');
        if (terminalToggleBtn) {
            const terminalToggleHandler = () => this.toggleTerminalVisibility();
            this.safeAddEventListener(terminalToggleBtn, 'click', terminalToggleHandler, 'terminal-toggle');
        }
        
        // 設定モーダルのイベント
        const settingsBtn = document.getElementById('settings-btn');
        const settingsModal = document.getElementById('settings-modal');
        const closeSettingsBtn = document.getElementById('close-settings');
        if (settingsBtn && settingsModal) {
            settingsBtn.addEventListener('click', () => {
                settingsModal.style.display = 'flex';
                this.app.syncSettingsToModal();
                this.initSettingsNavigation(); // タブナビゲーション初期化
            });
        }

        // VRM設定のイベントリスナー
        await this.setupVRMSettingsEventListeners();

        // キャラクター設定のイベントリスナー
        await this.setupCharacterSettingsEventListeners();

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
        const helpBtn = document.getElementById('help-btn');
        const helpModal = document.getElementById('help-modal');
        const closeHelpBtn = document.getElementById('close-help');
        if (helpBtn) {
            this.safeAddEventListener(helpBtn, 'click', async (e) => {
                if (e && typeof e.preventDefault === 'function') {
                    e.preventDefault();
                }
                await this.openHelpModal();
            }, 'open-help-modal-button');
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
        const hooksGuideModal = document.getElementById('hooks-guide-modal');
        const closeHooksGuideBtn = document.getElementById('close-hooks-guide');
        const hooksInfoBtn = document.getElementById('hooks-info-btn');
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
                if (hooksGuideModal) {
                    hooksGuideModal.style.display = 'flex';
                }
            });
        }

        // CLAUDE.md設定関連のイベントリスナー
        await this.setupClaudeMdEventListeners();

        this.debugLog('Modal event listeners setup completed');
    }

    /**
     * 音声制御関連のイベントリスナー設定
     */
    setupVoiceControlEventListeners() {
        const voiceToggleModal = document.getElementById('voice-toggle-modal');
        const speakerSelectModal = document.getElementById('speaker-select-modal');
        const refreshConnectionBtnModal = document.getElementById('refresh-connection-modal');
        const testLocalEngineBtn = document.getElementById('test-local-engine-btn');

        this.debugLog('Voice control elements check:', {
            voiceToggleModal: !!voiceToggleModal,
            speakerSelectModal: !!speakerSelectModal,
            refreshConnectionBtnModal: !!refreshConnectionBtnModal,
            testLocalEngineBtn: !!testLocalEngineBtn
        });

        if (voiceToggleModal) {
            const voiceToggleHandler = (e) => {
                this.app.voiceEnabled = e.target.checked;
                
                // 音声オフに切り替えた場合は音声キューをクリア
                if (!this.app.voiceEnabled && this.app.voiceQueue) {
                    this.app.voiceQueue.clear();
                    this.debugLog('音声オフ切り替えによりキューをクリア');
                }
                
                this.updateVoiceControls();
                this.debugLog('Voice enabled changed:', this.app.voiceEnabled);
            };
            
            // 安全なイベントリスナー登録
            this.safeAddEventListener(voiceToggleModal, 'change', voiceToggleHandler, 'voice-toggle-modal');
        }

        if (speakerSelectModal) {
            const speakerSelectHandler = async (e) => {
                try {
                    const selectedValue = e.target.value;

                    // 現在のエンジンタイプを確認
                    let voiceEngine = 'aivis-local';
                    try {
                        if (window.electronAPI && window.electronAPI.getVoiceEngine) {
                            voiceEngine = await window.electronAPI.getVoiceEngine();
                        } else {
                            const config = getSafeUnifiedConfig();
                            voiceEngine = await config.get('voiceEngine', 'aivis-local');
                        }
                    } catch (error) {
                        this.debugError('エンジン設定取得エラー:', error);
                    }

                    const isCloudAPI = voiceEngine === 'aivis-cloud';
                    const isVoiceVOX = voiceEngine === 'voicevox';

                    if (isCloudAPI) {
                        // クラウドAPI使用時：選択されたモデル（'default' または UUID）を保存
                        this.app.selectedSpeaker = selectedValue;
                        this.debugLog('Cloud API speaker selection:', selectedValue);

                        // 設定を永続化（クラウドAPI用の選択値として保存）
                        if (window.electronAPI && window.electronAPI.config) {
                            await window.electronAPI.config.set('cloudSelectedModel', selectedValue);
                        }
                    } else if (isVoiceVOX) {
                        // VoiceVOX使用時：voicevoxSpeakerIdに保存
                        this.app.selectedSpeaker = parseInt(selectedValue);

                        // 設定を永続化（electronAPI.configがない場合はunifiedConfigにフォールバック）
                        if (window.electronAPI && window.electronAPI.config) {
                            try {
                                await window.electronAPI.config.set('voicevoxSpeakerId', this.app.selectedSpeaker);
                            } catch (saveError) {
                                this.debugError('設定保存エラー:', saveError);
                            }
                        } else {
                            try {
                                const config = getSafeUnifiedConfig();
                                await config.set('voicevoxSpeakerId', this.app.selectedSpeaker);
                            } catch (fallbackError) {
                                this.debugError('フォールバック保存エラー:', fallbackError);
                            }
                        }
                        this.debugLog('VoiceVOX speaker setting updated:', this.app.selectedSpeaker);
                    } else {
                        // AivisSpeech(ローカル)使用時：数値IDを使用（従来通り）
                        this.app.selectedSpeaker = parseInt(selectedValue);

                        // 設定を永続化
                        if (window.electronAPI && window.electronAPI.config) {
                            await window.electronAPI.config.set('defaultSpeakerId', this.app.selectedSpeaker);
                        }
                        this.debugLog('Local speaker setting updated:', this.app.selectedSpeaker);
                    }
                } catch (error) {
                    this.debugError('話者選択処理エラー:', error);
                }
            };

            // 安全なイベントリスナー登録
            this.safeAddEventListener(speakerSelectModal, 'change', speakerSelectHandler, 'speaker-select-modal');
        }

        if (refreshConnectionBtnModal) {
            const refreshConnectionHandler = async () => {
                // 排他制御で重複実行を防止
                return await this.executeWithLock('refresh-connection', async () => {
                    // ボタンを無効化してフィードバックを提供
                    refreshConnectionBtnModal.disabled = true;
                    refreshConnectionBtnModal.textContent = '接続中...';
                    
                    try {
                        // 手動チェック（フルリトライ）を実行
                        await this.app.checkVoiceConnection();
                    } finally {
                        // ボタンを元に戻す
                        refreshConnectionBtnModal.disabled = false;
                        refreshConnectionBtnModal.textContent = '再接続';
                    }
                });
            };
            
            // 安全なイベントリスナー登録
            this.safeAddEventListener(refreshConnectionBtnModal, 'click', refreshConnectionHandler, 'refresh-connection-modal');
        }

        // ローカルエンジン接続テストボタン
        if (testLocalEngineBtn) {
            const testLocalEngineHandler = async () => {
                // 排他制御で重複実行を防止
                return await this.executeWithLock('test-local-engine', async () => {
                    const originalText = testLocalEngineBtn.textContent;
                    testLocalEngineBtn.disabled = true;
                    testLocalEngineBtn.textContent = 'テスト中...';
                    
                    try {
                        this.debugLog('🧪 Local engine test started');
                        
                        if (this.app && this.app.audioService) {
                            // ローカルエンジンでの音声合成テストを実行
                            const testMessage = 'これはローカルエンジンのテスト用メッセージです';
                            this.debugLog('🎵 Synthesizing test audio with local engine...');
                            
                            const audioData = await this.app.audioService.synthesizeTextOnly(testMessage);
                            if (audioData) {
                                this.debugLog('✅ Audio synthesis successful, playing...');
                                await this.app.audioService.playAppInternalAudio(audioData, testMessage);
                            } else {
                                this.showNotification('音声の生成に失敗しました', 'error');
                            }
                        } else {
                            this.showNotification('音声システムの初期化に失敗しました。アプリを再起動してください', 'error');
                        }
                    } catch (error) {
                        this.debugError('❌ Local engine test error:', error);
                        const userFriendlyMessage = this.convertToUserFriendlyError(error.message);
                        this.showNotification(userFriendlyMessage, 'error');
                    } finally {
                        testLocalEngineBtn.disabled = false;
                        testLocalEngineBtn.textContent = originalText;
                        this.debugLog('🏁 Local engine test completed');
                    }
                });
            };
            
            // 安全なイベントリスナー登録
            this.safeAddEventListener(testLocalEngineBtn, 'click', testLocalEngineHandler, 'test-local-engine-btn');
        }

        // 音声読み上げ間隔スライダー
        const voiceIntervalSlider = document.getElementById('voice-interval-slider');
        if (voiceIntervalSlider) {
            // 初期値を統一設定システムから読み込み
            const initInterval = async () => {
                const savedInterval = await unifiedConfig.get('voiceIntervalSeconds', this.app.voiceIntervalSeconds);
                this.app.voiceIntervalSeconds = savedInterval;
                voiceIntervalSlider.value = savedInterval;
            };
            initInterval();
            
            const voiceIntervalHandler = async (e) => {
                const newValue = parseFloat(e.target.value);
                this.app.voiceIntervalSeconds = newValue;
                
                // 統一設定システムに保存
                await unifiedConfig.set('voiceIntervalSeconds', newValue);
            };
            
            // 安全なイベントリスナー登録
            this.safeAddEventListener(voiceIntervalSlider, 'input', voiceIntervalHandler, 'voice-interval-slider');
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
            
            const voiceVolumeHandler = async (e) => {
                const newValue = parseInt(e.target.value);
                this.app.voiceVolume = newValue;
                
                // パーセンテージ表示を削除
                
                // 統一設定システムに保存
                await unifiedConfig.set('voiceVolume', newValue);
                
                this.debugLog('Voice volume changed:', newValue);
            };
            
            // 安全なイベントリスナー登録
            this.safeAddEventListener(voiceVolumeSlider, 'input', voiceVolumeHandler, 'voice-volume-slider');
        }

        // Aivis Cloud API設定
        this.setupCloudApiControls();

        // 自動更新機能
        this.setupAutoUpdaterControls();

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
            const selectCwdHandler = () => this.app.handleSelectClaudeCwd();
            this.safeAddEventListener(selectClaudeCwdBtn, 'click', selectCwdHandler, 'select-claude-cwd-btn');
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
                    
                    // 停止時のステータスメッセージを削除（シンプル化）
                    // this.app.updateStatus('AI stopped - Tab ready for new session');
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
     * CLAUDE.md設定関連のイベントリスナー設定
     */
    async setupClaudeMdEventListeners() {
        const claudeMdContentEditor = document.getElementById('claude-md-content-editor');
        const workspacePathDisplay = document.getElementById('workspace-path-display');
        const claudeMdLoadBtn = document.getElementById('claude-md-load-btn');
        const claudeMdDefaultBtn = document.getElementById('claude-md-default-btn');
        const claudeMdGenerateBtn = document.getElementById('claude-md-generate-btn');
        const claudeMdInfoBtn = document.getElementById('claude-md-info-btn');

        this.debugLog('CLAUDE.md control elements check:', {
            claudeMdContentEditor: !!claudeMdContentEditor,
            workspacePathDisplay: !!workspacePathDisplay,
            claudeMdLoadBtn: !!claudeMdLoadBtn,
            claudeMdDefaultBtn: !!claudeMdDefaultBtn,
            claudeMdGenerateBtn: !!claudeMdGenerateBtn,
            claudeMdInfoBtn: !!claudeMdInfoBtn
        });

        // デフォルト内容を読み込みと作業パス表示を更新
        await this.loadDefaultClaudeMdContent();
        await this.updateWorkspacePathDisplay();
        this.debugLog('CLAUDE.md初期化完了: デフォルト内容読み込み＋作業パス表示更新');

        // 内容編集エリアの変更イベント
        if (claudeMdContentEditor) {
            claudeMdContentEditor.addEventListener('input', async () => {
                try {
                    const config = getSafeUnifiedConfig();
                    await config.set('claudeMdContent', claudeMdContentEditor.value);
                    this.debugLog('CLAUDE.md内容保存');
                } catch (error) {
                    this.debugError('CLAUDE.md内容保存エラー:', error);
                }
            });
        }

        // 既存のファイルを読み込みボタン
        if (claudeMdLoadBtn) {
            claudeMdLoadBtn.addEventListener('click', async () => {
                try {
                    claudeMdLoadBtn.disabled = true;
                    claudeMdLoadBtn.textContent = '読み込み中...';
                    
                    // 選択されたMDファイル名を取得
                    const mdFileSelect = document.getElementById('md-file-select');
                    const selectedFileName = mdFileSelect ? mdFileSelect.value : 'CLAUDE.md';
                    
                    const result = await this.loadExistingClaudeMd(selectedFileName);
                    
                    if (result.success && claudeMdContentEditor) {
                        claudeMdContentEditor.value = result.content;
                        // 設定にも保存
                        const config = getSafeUnifiedConfig();
                        await config.set('claudeMdContent', result.content);
                        
                        this.showNotification(`現在の${selectedFileName}を読み込みました`, 'success');
                        this.debugLog(`${selectedFileName}読み込み成功`);
                    } else {
                        this.showNotification(result.message || `${selectedFileName}の読み込みに失敗しました`, 'error');
                        this.debugError(`${selectedFileName}読み込み失敗:`, result);
                    }
                } catch (error) {
                    this.debugError('MDファイル読み込みエラー:', error);
                    this.showNotification('MDファイルの読み込み中にエラーが発生しました', 'error');
                } finally {
                    claudeMdLoadBtn.disabled = false;
                    claudeMdLoadBtn.textContent = '既存のファイルを読み込み';
                }
            });
        }

        // デフォルト内容を読み込みボタン
        if (claudeMdDefaultBtn) {
            claudeMdDefaultBtn.addEventListener('click', async () => {
                try {
                    claudeMdDefaultBtn.disabled = true;
                    claudeMdDefaultBtn.textContent = '読み込み中...';
                    
                    this.debugLog('デフォルトCLAUDE.md内容読み込み開始');
                    
                    // デフォルト内容を強制的に再取得
                    const defaultContent = await this.getDefaultClaudeMdContent();
                    
                    if (claudeMdContentEditor) {
                        claudeMdContentEditor.value = defaultContent;
                        // 設定にも保存
                        const config = getSafeUnifiedConfig();
                        await config.set('claudeMdContent', defaultContent);
                        
                        this.showNotification('デフォルトCLAUDE.md内容を読み込みました', 'success');
                        this.debugLog('デフォルトCLAUDE.md内容読み込み成功');
                    }
                } catch (error) {
                    this.debugError('デフォルトCLAUDE.md内容読み込みエラー:', error);
                    this.showNotification('デフォルト内容の読み込み中にエラーが発生しました', 'error');
                } finally {
                    claudeMdDefaultBtn.disabled = false;
                    claudeMdDefaultBtn.textContent = 'デフォルト内容を読み込み';
                }
            });
        }

        // 生成ボタン
        if (claudeMdGenerateBtn) {
            claudeMdGenerateBtn.addEventListener('click', async () => {
                try {
                    claudeMdGenerateBtn.disabled = true;
                    claudeMdGenerateBtn.textContent = '生成中...';
                    
                    this.debugLog('手動CLAUDE.md生成開始');
                    
                    // 選択されたMDファイル名を取得
                    const mdFileSelect = document.getElementById('md-file-select');
                    const selectedFileName = mdFileSelect ? mdFileSelect.value : 'CLAUDE.md';
                    
                    const result = await this.generateCustomMdFile(selectedFileName);
                    
                    if (result.success) {
                        this.showNotification(`${selectedFileName}ファイルを生成しました`, 'success');
                        this.debugLog(`手動${selectedFileName}生成成功`);
                    } else {
                        this.showNotification(result.message || `${selectedFileName}ファイルの生成に失敗しました`, 'error');
                        this.debugError(`手動${selectedFileName}生成失敗:`, result);
                    }
                } catch (error) {
                    this.debugError('手動MDファイル生成エラー:', error);
                    this.showNotification('MDファイルの生成中にエラーが発生しました', 'error');
                } finally {
                    claudeMdGenerateBtn.disabled = false;
                    claudeMdGenerateBtn.textContent = '生成';
                }
            });
        }

        // 情報ボタンのイベント - 使い方ガイドのClaude Code項目を開く
        if (claudeMdInfoBtn) {
            this.safeAddEventListener(claudeMdInfoBtn, 'click', async () => {
                const settingsModal = document.getElementById('settings-modal');
                if (settingsModal) {
                    settingsModal.style.display = 'none';
                }

                await this.openHelpModal('claude');
                
                this.debugLog('CLAUDE.md情報ボタン → 使い方ガイドのClaude Code項目を表示');
            }, 'open-help-claude-info');
        }

        this.debugLog('CLAUDE.md event listeners setup completed');
    }

    /**
     * デフォルトCLAUDE.md内容を読み込み
     */
    async loadDefaultClaudeMdContent() {
        try {
            const config = getSafeUnifiedConfig();
            const claudeMdContentEditor = document.getElementById('claude-md-content-editor');
            
            if (!claudeMdContentEditor) return;
            
            // 保存された内容があるかチェック
            let savedContent = await config.get('claudeMdContent', '');
            
            if (!savedContent) {
                // デフォルト内容を取得
                savedContent = await this.getDefaultClaudeMdContent();
                await config.set('claudeMdContent', savedContent);
            }
            
            claudeMdContentEditor.value = savedContent;
            this.debugLog('デフォルトCLAUDE.md内容読み込み完了');
        } catch (error) {
            this.debugError('デフォルトCLAUDE.md内容読み込みエラー:', error);
        }
    }

    /**
     * デフォルトCLAUDE.md内容を取得
     */
    async getDefaultClaudeMdContent() {
        // ConfigManagerからデフォルト内容を取得
        if (this.app && this.app.configManager) {
            try {
                return await this.app.configManager.getCombinedAiMdContent();
            } catch (error) {
                this.debugError('ConfigManager経由での内容取得エラー:', error);
            }
        }
        
        // ConfigManagerが利用できない場合は直接shy.mdを読み込み
        try {
            const { fs, path } = window.electronAPI;
            
            // 動的パス解決（配布対応）
            let shyPath = null;
            
            // 1. アプリのリソースパスから取得を試行（配布版）
            if (window.electronAPI.getAppPath) {
                try {
                    const appPath = await window.electronAPI.getAppPath();
                    shyPath = path.join(appPath, 'src', 'character_settings', 'shy.md');
                    this.debugLog('配布版パス使用:', shyPath);
                } catch (appPathError) {
                    this.debugLog('アプリパス取得失敗:', appPathError);
                }
            }
            
            // 2. 開発環境パスにフォールバック
            if (!shyPath) {
                // __dirnameから相対パスで推測
                const currentDir = window.location.pathname.replace('/index.html', '');
                const projectRoot = path.dirname(path.dirname(currentDir)); // src/modulesから2階層上
                shyPath = path.join(projectRoot, 'src', 'character_settings', 'shy.md');
                this.debugLog('開発環境パス使用:', shyPath);
            }
            
            const content = await fs.promises.readFile(shyPath, 'utf8');
            this.debugLog('shy.mdから直接読み込み成功');
            return content;
        } catch (error) {
            this.debugError('shy.md直接読み込みエラー:', error);
        }
        
        // 最終フォールバック: 最小限のテンプレート
        const fallbackContent = `# ============================================
# 【警告】以下は絶対に変更しないでください
# アプリの動作に支障が出ます
# ============================================

## 音声読み上げ対応
このアプリは音声読み上げ機能があるため、以下のルールに従ってください：

### 【厳守】音声読み上げ用ルール
1. **会話文は◆◇で囲む**
2. **100文字以内で簡潔に**
3. **「詳しく」と言われた場合のみ詳細説明可**

# ============================================
# 以下は自由に編集してください
# キャラクターをお好みにカスタマイズできます
# ============================================

# キャラクター設定

## AIの名前・基本設定
**◆モネ◇**
- 照れ屋なAIアシスタント

## 性格（コア設定）
* 優しくて面倒見のいい性格
* 褒められると照れる
* プログラミングが得意`;
        
        this.debugLog('フォールバック内容を使用');
        return fallbackContent;
    }

    /**
     * 作業パス表示を更新（作業ディレクトリ設定と同じ処理）
     */
    async updateWorkspacePathDisplay() {
        const workspacePathDisplay = document.getElementById('workspace-path-display');
        if (!workspacePathDisplay) {
            this.debugError('workspace-path-display要素が見つかりません');
            return;
        }
        
        try {
            const result = await window.electronAPI.getClaudeCwd();
            if (result.success) {
                // 作業ディレクトリ設定と同じ処理
                workspacePathDisplay.textContent = result.cwd;
                workspacePathDisplay.style.color = 'var(--theme-text-primary)'; // 通常の色にリセット
                this.debugLog('CLAUDE.md作業パス表示更新:', result.cwd);
            } else {
                workspacePathDisplay.textContent = '取得失敗';
                workspacePathDisplay.style.color = 'var(--theme-primary-darker)';
                this.debugError('作業ディレクトリ取得失敗:', result.error);
            }
        } catch (error) {
            workspacePathDisplay.textContent = 'エラー';
            workspacePathDisplay.style.color = 'var(--theme-primary-darker)';
            this.debugError('作業パス表示エラー:', error);
        }
    }

    /**
     * 既存のMDファイルを読み込み（作業ディレクトリのみ）
     */
    async loadExistingClaudeMd(fileName = 'CLAUDE.md') {
        try {
            // 作業ディレクトリから読み込み
            const workspaceResult = await window.electronAPI.getClaudeCwd();
            this.debugLog('作業ディレクトリ取得結果:', workspaceResult);
            
            if (!workspaceResult.success) {
                this.debugError('作業ディレクトリ取得失敗:', workspaceResult);
                return { success: false, message: '作業ディレクトリが設定されていません' };
            }
            
            const targetPath = workspaceResult.cwd + '/' + fileName;
            this.debugLog('読み込み対象パス:', targetPath);
            
            // ファイルを読み込み
            const { fs } = window.electronAPI;
            const content = await fs.promises.readFile(targetPath, 'utf8');
            
            this.debugLog(`${fileName}読み込み成功:`, { path: targetPath, contentLength: content.length });
            return { success: true, content, path: targetPath, fileName };
        } catch (error) {
            this.debugError(`${fileName}読み込みエラー詳細:`, { error, code: error.code, message: error.message });
            
            if (error.code === 'ENOENT') {
                return { success: false, message: `作業ディレクトリに${fileName}ファイルが見つかりません` };
            }
            this.debugError(`既存${fileName}読み込みエラー:`, error);
            return { success: false, message: 'ファイルの読み込みに失敗しました' };
        }
    }

    /**
     * カスタムMDファイルを生成（作業ディレクトリのみ）
     */
    async generateCustomMdFile(fileName = 'CLAUDE.md') {
        try {
            const claudeMdContentEditor = document.getElementById('claude-md-content-editor');
            
            if (!claudeMdContentEditor) {
                return { success: false, message: 'コンテンツエディターが見つかりません' };
            }
            
            const content = claudeMdContentEditor.value.trim();
            if (!content) {
                return { success: false, message: 'MDファイルの内容が空です' };
            }
            
            // 作業ディレクトリに生成
            const workspaceResult = await window.electronAPI.getClaudeCwd();
            if (!workspaceResult.success) {
                return { success: false, message: '作業ディレクトリが設定されていません' };
            }
            
            const targetPath = workspaceResult.cwd + '/' + fileName;
            
            // ファイルを書き込み
            const { fs } = window.electronAPI;
            await fs.promises.writeFile(targetPath, content, 'utf8');
            
            this.debugLog(`${fileName}生成完了:`, targetPath);
            return { success: true, path: targetPath };
        } catch (error) {
            this.debugError(`カスタム${fileName}生成エラー:`, error);
            return { success: false, message: 'ファイルの生成に失敗しました' };
        }
    }

    /**
     * カスタムCLAUDE.mdを生成（作業ディレクトリのみ）
     */
    async generateCustomClaudeMd() {
        return await this.generateCustomMdFile('CLAUDE.md');
    }

    /**
     * CLAUDE.md設定をモーダルに同期
     */
    async syncClaudeMdSettings() {
        try {
            // 内容を同期
            await this.loadDefaultClaudeMdContent();
            
            // 作業パス表示を更新
            await this.updateWorkspacePathDisplay();
            
            this.debugLog('CLAUDE.md設定同期完了');
        } catch (error) {
            this.debugError('CLAUDE.md設定同期エラー:', error);
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
    async updateVoiceControls() {
        const speakerSelectModal = document.getElementById('speaker-select-modal');
        const voiceToggleModal = document.getElementById('voice-toggle-modal');
        const cooldownInputModal = document.getElementById('voice-cooldown-modal');
        const refreshConnectionBtnModal = document.getElementById('refresh-connection-modal');

        // クラウドAPI使用時は接続状態に関係なく有効化
        const unifiedConfig = getSafeUnifiedConfig();
        const voiceEngine = await unifiedConfig.get('voiceEngine', 'aivis-local');
        const isCloudAPI = voiceEngine === 'aivis-cloud';
        const canUseVoice = isCloudAPI ? true : (this.app.connectionStatus === 'connected');

        if (voiceToggleModal) {
            voiceToggleModal.disabled = !canUseVoice;
        }
        if (speakerSelectModal) {
            speakerSelectModal.disabled = !this.app.voiceEnabled || !canUseVoice;
        }
        if (refreshConnectionBtnModal) {
            refreshConnectionBtnModal.disabled = false;
        }

        // 状態が変化した場合のみログ出力
        const currentState = JSON.stringify({
            canUseVoice,
            voiceEnabled: this.app.voiceEnabled,
            connectionStatus: this.app.connectionStatus,
            voiceEngine,
            isCloudAPI
        });

        if (this._lastVoiceControlState !== currentState) {
            this.debugLog('Voice controls updated:', {
                canUseVoice,
                voiceEnabled: this.app.voiceEnabled,
                connectionStatus: this.app.connectionStatus,
                voiceEngine,
                isCloudAPI
            });
            this._lastVoiceControlState = currentState;
        }
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
        this.debugLog('Display mode toggle requested');

        const terminalSection = document.querySelector('.terminal-section');
        const characterSection = document.querySelector('.character-section');
        const mainContent = document.querySelector('.main-content');
        const terminalToggleBtn = document.getElementById('terminal-toggle');

        if (!terminalSection || !characterSection || !mainContent || !terminalToggleBtn) {
            this.debugError('Required elements not found for display toggle');
            return;
        }

        // 3状態をループ: both -> character-only -> terminal-only -> both
        switch (this.displayMode) {
            case 'both':
                this.displayMode = 'character-only';
                break;
            case 'character-only':
                this.displayMode = 'terminal-only';
                break;
            case 'terminal-only':
                this.displayMode = 'both';
                break;
            default:
                this.displayMode = 'both';
        }

        // 表示切り替え用クラスをリセット
        mainContent.classList.remove('character-only', 'terminal-only');

        switch (this.displayMode) {
            case 'both':
                // 両方表示
                terminalSection.style.display = 'flex';
                characterSection.style.display = 'block';
                this.debugLog('Both terminal and character are now visible');
                break;
            case 'character-only':
                // キャラのみ表示
                terminalSection.style.display = 'none';
                characterSection.style.display = 'block';
                mainContent.classList.add('character-only');
                this.debugLog('Character only is now visible');
                break;
            case 'terminal-only':
                // ターミナルのみ表示
                terminalSection.style.display = 'flex';
                characterSection.style.display = 'none';
                mainContent.classList.add('terminal-only');
                this.debugLog('Terminal only is now visible');
                break;
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

        // ツールチップテキストを削除（アクセシビリティのためaria-labelのみ保持）
        terminalToggleBtn.setAttribute('aria-label', 'ターミナル表示切り替え');
        terminalToggleBtn.removeAttribute('title');

        this.debugLog(`Display toggle button updated: ${this.displayMode} mode`);
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

    // 音声メッセージ機能は削除済み


    /**
     * 話者選択オプションを更新
     */
    updateSpeakerSelectOptions(selectElement, speakers, selectedSpeakerId = null) {
        if (!selectElement || !Array.isArray(speakers)) return;

        // 既存のオプションをクリア
        selectElement.innerHTML = '';

        // 新しいオプションを追加
        speakers.forEach(speaker => {
            // VoiceVOX/Cloud API形式（フラット型）: stylesプロパティなし
            if (!speaker.styles) {
                const option = document.createElement('option');
                option.value = speaker.id.toString();
                option.textContent = speaker.name;
                selectElement.appendChild(option);
            }
            // AivisSpeech Local形式（階層型）: stylesプロパティあり
            else {
                speaker.styles.forEach(style => {
                    const option = document.createElement('option');
                    option.value = style.id.toString();
                    option.textContent = `${speaker.name} (${style.name})`;
                    selectElement.appendChild(option);
                });
            }
        });

        // 選択状態を設定
        if (selectedSpeakerId !== null) {
            selectElement.value = selectedSpeakerId.toString();
        }
    }

    // キャラクター気分機能は削除済み

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
     * Cloud API設定のイベントリスナー設定
     */
    setupCloudApiControls() {
        // ラジオボタンに変更
        const voiceEngineLocalRadio = document.getElementById('voice-engine-local');
        const voiceEngineCloudRadio = document.getElementById('voice-engine-cloud');
        const voiceEngineVoicevoxRadio = document.getElementById('voice-engine-voicevox');
        const cloudApiSettings = document.getElementById('cloud-api-settings');
        const cloudApiKeyInput = document.getElementById('cloud-api-key-input');
        const testCloudApiBtn = document.getElementById('test-cloud-api-btn');
        const saveCloudApiBtn = document.getElementById('save-cloud-api-btn');
        const cloudApiStatus = document.getElementById('cloud-api-status');
        const modelUuidInput = document.getElementById('model-uuid-input');
        const addModelBtn = document.getElementById('add-model-btn');
        
        // デバッグ用：要素の取得状況をチェック
        this.debugLog('Voice Engine Radio elements check:', {
            voiceEngineLocalRadio: !!voiceEngineLocalRadio,
            voiceEngineCloudRadio: !!voiceEngineCloudRadio,
            cloudApiSettings: !!cloudApiSettings,
            cloudApiKeyInput: !!cloudApiKeyInput,
            testCloudApiBtn: !!testCloudApiBtn,
            saveCloudApiBtn: !!saveCloudApiBtn,
            cloudApiStatus: !!cloudApiStatus,
            modelUuidInput: !!modelUuidInput,
            addModelBtn: !!addModelBtn
        });

        if (voiceEngineLocalRadio && voiceEngineCloudRadio) {
            // 初期値を設定から読み込み
            const initVoiceEngine = async () => {
                // ElectronのappConfigから読み込む（実際の保存先）
                let voiceEngine = 'aivis-local';
                try {
                    if (window.electronAPI && window.electronAPI.getVoiceEngine) {
                        voiceEngine = await window.electronAPI.getVoiceEngine();
                    } else {
                        // フォールバック：unifiedConfigから読み込み
                        voiceEngine = await unifiedConfig.get('voiceEngine', 'aivis-local');
                    }
                } catch (error) {
                    this.debugLog('音声エンジン設定読み込みエラー:', error);
                    voiceEngine = 'aivis-local';
                }

                // ラジオボタンの状態を設定
                const isCloudAPI = voiceEngine === 'aivis-cloud';
                const isVoiceVOX = voiceEngine === 'voicevox';
                voiceEngineLocalRadio.checked = !isCloudAPI && !isVoiceVOX;
                voiceEngineCloudRadio.checked = isCloudAPI;
                if (voiceEngineVoicevoxRadio) {
                    voiceEngineVoicevoxRadio.checked = isVoiceVOX;
                }

                if (cloudApiSettings) {
                    cloudApiSettings.style.display = isCloudAPI ? 'block' : 'none';
                }

                // 話者選択の更新と音声エンジン接続状況の初期状態設定
                this.updateVoiceControlsForEngine(isCloudAPI);
                
                // APIキーも読み込み（復号化は内部で処理）
                if (cloudApiKeyInput && isCloudAPI) {
                    try {
                        // electronAPIを通してAPIキーを取得
                        const apiKey = await window.electronAPI.getCloudApiKey?.();
                        if (apiKey) {
                            cloudApiKeyInput.value = apiKey;
                        }
                    } catch (error) {
                        this.debugLog('APIキー読み込みエラー:', error);
                    }
                }
            };
            initVoiceEngine();

            // ラジオボタン変更時の処理
            const radioChangeHandler = async (e) => {
                const selectedEngine = e.target.value; // 'local' / 'cloud' / 'voicevox'
                const voiceEngine = selectedEngine === 'cloud' ? 'aivis-cloud' :
                                   selectedEngine === 'voicevox' ? 'voicevox' : 'aivis-local';

                this.debugLog('Voice engine radio changed:', {
                    selectedValue: selectedEngine,
                    voiceEngine,
                    cloudApiSettingsExists: !!cloudApiSettings
                });

                // UIを即座に更新
                if (cloudApiSettings) {
                    cloudApiSettings.style.display = selectedEngine === 'cloud' ? 'block' : 'none';
                }

                // 話者選択の更新と音声エンジン接続状況の制御
                // VoiceVOXはローカルエンジンと同じ挙動（接続確認、話者リスト取得）
                const isCloudAPI = selectedEngine === 'cloud';
                this.updateVoiceControlsForEngine(isCloudAPI);

                // 設定の保存は非同期で実行（UIをブロックしない）
                (async () => {
                    // 新しいvoiceEngine設定を保存
                    await unifiedConfig.set('voiceEngine', voiceEngine);

                    // 後方互換性のためuseCloudAPIも保存
                    await unifiedConfig.set('useCloudAPI', isCloudAPI);

                    // 実際の設定ファイルにも保存
                    try {
                        await window.electronAPI.setVoiceEngine?.(voiceEngine);
                        await window.electronAPI.setUseCloudApi?.(isCloudAPI);
                        console.log('✅ 音声エンジン設定を保存:', voiceEngine);
                    } catch (error) {
                        console.error('❌ 音声エンジン設定の保存エラー:', error);
                    }

                    // AudioServiceの設定を更新
                    if (this.app && this.app.audioService) {
                        await this.app.audioService.updateApiSettings();
                    }

                    // 接続状態を再確認
                    await this.app.checkVoiceConnection();

                    this.debugLog('Voice engine changed:', voiceEngine);
                })();
            };

            // 安全なイベントリスナー登録
            this.safeAddEventListener(voiceEngineLocalRadio, 'change', radioChangeHandler, 'voice-engine-local');
            this.safeAddEventListener(voiceEngineCloudRadio, 'change', radioChangeHandler, 'voice-engine-cloud');
            this.safeAddEventListener(voiceEngineVoicevoxRadio, 'change', radioChangeHandler, 'voice-engine-voicevox');
        }

        // 接続テストボタン（安全な登録方式）
        if (testCloudApiBtn) {
            const testHandler = async () => {
                // 排他制御で重複実行を防止
                return await this.executeWithLock('test-cloud-api', async () => {
                    if (!cloudApiKeyInput) return;
                    
                    let apiKey = cloudApiKeyInput.value.trim();
                    
                    // 表示用のマスクされたキーの場合は、既存のAPIキーを取得
                    if (apiKey.startsWith('sk-') && apiKey.includes('*')) {
                        try {
                            const existingKey = await window.electronAPI.getCloudApiKey?.();
                            if (existingKey) {
                                apiKey = existingKey;
                            } else {
                                this.showNotification('APIキーを入力してください', 'error');
                                return;
                            }
                        } catch (error) {
                            this.showNotification('APIキーの取得に失敗しました', 'error');
                            return;
                        }
                    }
                    
                    if (!apiKey) {
                        this.showNotification('APIキーを入力してください', 'error');
                        return;
                    }
                    
                    testCloudApiBtn.disabled = true;
                    testCloudApiBtn.textContent = 'テスト中...';
                    
                    try {
                        this.debugLog('🧪 Cloud API test started');
                        
                        // electronAPIを通してAPIキーを保存
                        await window.electronAPI.setCloudApiKey?.(apiKey);
                        
                        if (this.app && this.app.audioService) {
                            await this.app.audioService.updateApiSettings();
                            
                            // 実際の音声合成テストを実行（1回のみ保証）
                            const testMessage = 'これはクラウドAPIのテスト用メッセージです';
                            this.debugLog('🎵 Synthesizing test audio...');
                            
                            const audioData = await this.app.audioService.synthesizeTextOnly(testMessage);
                            if (audioData) {
                                this.debugLog('✅ Audio synthesis successful, playing...');
                                await this.app.audioService.playAppInternalAudio(audioData, testMessage);
                            } else {
                                this.showNotification('音声の生成に失敗しました', 'error');
                            }
                        } else {
                            this.showNotification('音声システムの初期化に失敗しました。アプリを再起動してください', 'error');
                        }
                    } catch (error) {
                        this.debugError('❌ Cloud API test error:', error);
                        const userFriendlyMessage = this.convertToUserFriendlyError(error.message);
                        this.showNotification(userFriendlyMessage, 'error');
                    } finally {
                        testCloudApiBtn.disabled = false;
                        testCloudApiBtn.textContent = '接続テスト';
                        this.debugLog('🏁 Cloud API test completed');
                    }
                });
            };
            
            // 安全なイベントリスナー登録
            this.safeAddEventListener(testCloudApiBtn, 'click', testHandler, 'test-cloud-api-btn');
        }

        // 保存ボタン（安全な登録方式）
        if (saveCloudApiBtn) {
            const saveHandler = async () => {
                if (!cloudApiKeyInput) return;
                
                let apiKey = cloudApiKeyInput.value.trim();
                
                // 表示用のマスクされたキーの場合は保存をスキップ
                if (apiKey.startsWith('sk-') && apiKey.includes('*')) {
                    this.showCloudApiStatus('info', '既存のAPIキーが設定済みです');
                    return;
                }
                
                if (!apiKey) {
                    this.showCloudApiStatus('error', 'APIキーを入力してください');
                    return;
                }
                
                try {
                    // electronAPIを通してAPIキーを保存
                    await window.electronAPI.setCloudApiKey?.(apiKey);
                    this.showCloudApiStatus('success', '設定を保存しました');
                    
                    // AudioServiceの設定を更新
                    if (this.app && this.app.audioService) {
                        await this.app.audioService.updateApiSettings();
                    }
                } catch (error) {
                    this.showCloudApiStatus('error', `保存エラー: ${error.message}`);
                }
            };
            
            // 安全なイベントリスナー登録
            this.safeAddEventListener(saveCloudApiBtn, 'click', saveHandler, 'save-cloud-api-btn');
        }
        

        // モデル追加ボタンのイベントリスナー
        if (addModelBtn && modelUuidInput) {
            const addModelHandler = async () => {
                const uuidInput = modelUuidInput.value.trim();

                if (!uuidInput) {
                    this.showCustomModelStatus('error', 'モデルUUIDを入力してください');
                    return;
                }

                // UUID形式の簡易チェック（36文字のハイフン区切り）
                const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                if (!uuidPattern.test(uuidInput)) {
                    this.showCustomModelStatus('error', '有効なUUID形式を入力してください');
                    return;
                }

                try {
                    // カスタムモデルリストに追加
                    await this.addCustomModel(uuidInput);

                    // 話者選択ドロップダウンを更新
                    await this.refreshCloudApiSpeakers();

                    // 入力フィールドをクリア
                    modelUuidInput.value = '';

                    this.showCustomModelStatus('success', 'モデルを追加しました');

                } catch (error) {
                    this.debugError('モデル追加エラー:', error);
                    this.showCustomModelStatus('error', `モデル追加エラー: ${error.message}`);
                }
            };

            this.safeAddEventListener(addModelBtn, 'click', addModelHandler, 'add-model-btn');
        }
    }

    /**
     * Cloud APIステータス表示
     */
    showCloudApiStatus(type, message) {
        const cloudApiStatus = document.getElementById('cloud-api-status');
        if (!cloudApiStatus) return;
        
        cloudApiStatus.style.display = 'block';
        cloudApiStatus.textContent = message;
        
        // スタイルを設定
        if (type === 'success') {
            cloudApiStatus.style.backgroundColor = 'var(--theme-bg-secondary)';
            cloudApiStatus.style.color = 'var(--green-primary)';
            cloudApiStatus.style.border = '1px solid var(--green-primary)';
        } else if (type === 'error') {
            cloudApiStatus.style.backgroundColor = 'var(--theme-bg-secondary)';
            cloudApiStatus.style.color = 'var(--theme-accent)';
            cloudApiStatus.style.border = '1px solid var(--theme-accent)';
        }
        
        // 5秒後に自動で非表示
        setTimeout(() => {
            cloudApiStatus.style.display = 'none';
        }, 5000);
    }


    /**
     * カスタムモデルステータス表示
     */
    showCustomModelStatus(type, message) {
        const customModelStatus = document.getElementById('custom-model-status');
        if (!customModelStatus) return;

        customModelStatus.style.display = 'block';
        customModelStatus.textContent = message;

        // タイプに応じた色分け
        if (type === 'success') {
            customModelStatus.style.backgroundColor = 'var(--theme-bg-secondary)';
            customModelStatus.style.color = 'var(--green-primary)';
            customModelStatus.style.border = '1px solid var(--green-primary)';
        } else if (type === 'error') {
            customModelStatus.style.backgroundColor = 'var(--theme-bg-secondary)';
            customModelStatus.style.color = 'var(--theme-accent)';
            customModelStatus.style.border = '1px solid var(--theme-accent)';
        }

        // 5秒後に自動非表示
        setTimeout(() => {
            customModelStatus.style.display = 'none';
        }, 5000);
    }

    /**
     * 音声エンジンに応じた音声コントロールの更新
     */
    async updateVoiceControlsForEngine(useCloudAPI) {
        // 話者選択ドロップダウンを更新
        await this.updateSpeakerSelectForEngine(useCloudAPI);
        
        // カスタムモデルセクションの表示制御（クラウドAPI時のみ表示）
        const customModelSection = document.getElementById('custom-model-section');
        if (customModelSection) {
            customModelSection.style.display = useCloudAPI ? 'block' : 'none';
        }
        
        // 音声エンジン接続状況グループを制御（ローカル時のみ有効）
        const connectionStatusGroup = document.querySelector('.connection-status-group');
        if (connectionStatusGroup) {
            if (!useCloudAPI) {
                connectionStatusGroup.style.opacity = '1';
                connectionStatusGroup.style.pointerEvents = 'auto';
            } else {
                connectionStatusGroup.style.opacity = '0.5';
                connectionStatusGroup.style.pointerEvents = 'none';
            }
        }
        
        // 再接続ボタンを制御（ローカル時のみ有効）
        const refreshConnectionBtn = document.getElementById('refresh-connection-modal');
        if (refreshConnectionBtn) {
            refreshConnectionBtn.disabled = useCloudAPI;
            if (!useCloudAPI) {
                refreshConnectionBtn.style.opacity = '1';
                refreshConnectionBtn.style.cursor = 'pointer';
            } else {
                refreshConnectionBtn.style.opacity = '0.5';
                refreshConnectionBtn.style.cursor = 'not-allowed';
            }
        }
        
        // ローカルエンジン接続テストボタンを制御（ローカル時のみ有効）
        const testLocalEngineBtn = document.getElementById('test-local-engine-btn');
        if (testLocalEngineBtn) {
            testLocalEngineBtn.disabled = useCloudAPI;
            if (!useCloudAPI) {
                testLocalEngineBtn.style.opacity = '1';
                testLocalEngineBtn.style.cursor = 'pointer';
            } else {
                testLocalEngineBtn.style.opacity = '0.5';
                testLocalEngineBtn.style.cursor = 'not-allowed';
            }
        }
        
        this.debugLog('Voice controls updated for engine:', { useCloudAPI });
    }

    /**
     * 音声エンジンに応じた話者選択ドロップダウンの更新
     */
    async updateSpeakerSelectForEngine(useCloudAPI) {
        const speakerSelect = document.getElementById('speaker-select-modal');
        if (!speakerSelect) return;

        try {
            if (useCloudAPI) {
                // クラウドAPI使用時：設定されているモデルのみを表示
                await this.populateCloudApiSpeakers(speakerSelect);
            } else {
                // ローカルエンジン使用時：全話者を表示（従来通り）
                if (this.app && this.app.audioService) {
                    await this.app.audioService.updateSpeakerSelect();
                }
            }
            
            // 話者選択を有効化（両エンジンで使用可能）
            speakerSelect.disabled = false;
            speakerSelect.style.opacity = '1';
            speakerSelect.style.cursor = 'pointer';
            speakerSelect.style.pointerEvents = 'auto';
            
        } catch (error) {
            this.debugError('話者選択更新エラー:', error);
            
            // エラー時は無効化
            speakerSelect.disabled = true;
            speakerSelect.style.opacity = '0.5';
            speakerSelect.style.cursor = 'not-allowed';
            speakerSelect.style.pointerEvents = 'none';
        }
    }

    /**
     * クラウドAPI用の話者選択を設定
     */
    async populateCloudApiSpeakers(speakerSelect) {
        try {
            this.debugLog('populateCloudApiSpeakers開始');
            
            // 既存のオプションをクリア
            speakerSelect.innerHTML = '';
            
            const unifiedConfig = getSafeUnifiedConfig();
            this.debugLog('unifiedConfig取得完了');
            
            // プレースホルダーオプションを追加
            const placeholderOption = document.createElement('option');
            placeholderOption.value = '';
            placeholderOption.textContent = '音声モデルを選択してください';
            placeholderOption.disabled = true;
            placeholderOption.selected = true;
            speakerSelect.appendChild(placeholderOption);
            
            // カスタムモデルリストを取得
            const customModels = await unifiedConfig.get('cloudCustomModels', []);
            this.debugLog('カスタムモデルリスト取得:', { count: customModels.length, models: customModels });
            
            // カスタムモデルをドロップダウンに追加
            customModels.forEach((model, index) => {
                const option = document.createElement('option');
                option.value = model.uuid;  // UUIDをvalueに設定
                option.textContent = model.name;
                option.dataset.uuid = model.uuid;  // data属性としてもUUIDを保存
                speakerSelect.appendChild(option);
            });
            
            // 保存された選択値を復元（なければプレースホルダー）
            let savedSelection = '';
            try {
                if (window.electronAPI && window.electronAPI.config) {
                    savedSelection = await window.electronAPI.config.get('cloudSelectedModel') || '';
                } else {
                    savedSelection = await unifiedConfig.get('cloudSelectedModel', '');
                }
            } catch (error) {
                this.debugError('保存された選択値取得エラー:', error);
            }

            // 選択値を設定（存在しない場合はプレースホルダーを表示）
            const optionExists = Array.from(speakerSelect.options).some(option => option.value === savedSelection);
            speakerSelect.value = optionExists ? savedSelection : '';
            
            this.debugLog('クラウドAPI話者選択を設定完了:', { 
                customModelCount: customModels.length, 
                optionCount: speakerSelect.options.length,
                savedSelection,
                finalValue: speakerSelect.value
            });
            
        } catch (error) {
            this.debugError('クラウドAPI話者選択設定エラー:', error);
            
            // フォールバック：プレースホルダーのみ表示
            speakerSelect.innerHTML = '';
            const placeholderOption = document.createElement('option');
            placeholderOption.value = '';
            placeholderOption.textContent = '音声モデルが利用できません';
            placeholderOption.disabled = true;
            placeholderOption.selected = true;
            speakerSelect.appendChild(placeholderOption);
        }
    }

    /**
     * ローカル音声コントロールの有効化/無効化（互換性維持用）
     */
    toggleLocalVoiceControls(enabled) {
        this.updateVoiceControlsForEngine(!enabled);
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
        // voiceEngineから判定
        const voiceEngine = unifiedConfig.get('voiceEngine', 'aivis-local');
        const isCloudAPI = voiceEngine === 'aivis-cloud';

        if (error.errorType) {
            switch (error.errorType) {
                case 'network':
                    if (isCloudAPI) {
                        return 'Aivis Cloud APIに接続できません。インターネット接続とAPIキーを確認してください。';
                    }
                    return '音声エンジンに接続できません。AivisSpeechが起動しているか確認してください。';
                case 'timeout':
                    return '音声生成に時間がかかりすぎています。しばらく待ってから再試行してください。';
                case 'server':
                    if (isCloudAPI) {
                        return 'Aivis Cloud APIでエラーが発生しました。APIキーまたは利用制限を確認してください。';
                    }
                    return '音声エンジンでエラーが発生しました。エンジンの再起動を試してください。';
                case 'synthesis':
                    return 'テキストの音声変換に失敗しました。内容を確認してください。';
                default:
                    return '音声読み上げエラーが発生しました。';
            }
        }
        
        // 401エラー（認証エラー）の特別処理
        if (error.message && error.message.includes('401')) {
            return 'APIキーが無効です。設定画面で正しいAPIキーを入力してください。';
        }
        
        return `音声読み上げエラー: ${error.message || 'Unknown error'}`;
    }

    /**
     * エラーメッセージをユーザーフレンドリーに変換
     */
    convertToUserFriendlyError(errorMessage) {
        if (!errorMessage) {
            return '接続テストに失敗しました。設定を確認してください';
        }
        
        const message = errorMessage.toLowerCase();
        
        // 401エラー（認証失敗）
        if (message.includes('401') || message.includes('アクセストークンが不正') || message.includes('unauthorized')) {
            return 'APIキーが正しくありません。設定を確認してください';
        }
        
        // ネットワークエラー
        if (message.includes('fetch failed') || message.includes('network') || message.includes('connection')) {
            return 'インターネット接続を確認してください';
        }
        
        // タイムアウト
        if (message.includes('timeout') || message.includes('タイムアウト')) {
            return '接続がタイムアウトしました。ネットワーク環境を確認してください';
        }
        
        // 403エラー（アクセス拒否）
        if (message.includes('403') || message.includes('forbidden')) {
            return 'アクセスが拒否されました。APIキーの権限を確認してください';
        }
        
        // 429エラー（レート制限）
        if (message.includes('429') || message.includes('rate limit') || message.includes('too many requests')) {
            return 'リクエストが多すぎます';
        }
        
        // 500系エラー（サーバーエラー）
        if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
            return 'サーバーでエラーが発生しています';
        }
        
        // 音声合成関連エラー
        if (message.includes('synthesis') || message.includes('音声合成') || message.includes('tts')) {
            return '音声の生成に失敗しました';
        }
        
        // その他のエラー
        return '接続テストに失敗しました。設定を確認してください';
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
                
                // CLAUDE.md設定の作業パス表示も更新
                await this.updateWorkspacePathDisplay();

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

        // 初期メッセージを削除（シンプルな起動のため）
        // this.addVoiceMessage('モネ', 'こんにちは〜！何をお手伝いしましょうか？');
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
        if (this.app && this.app.audioService) {
            await this.app.audioService.updateSpeakerSelect();
        }
        
        // 接続状態の更新はリアルタイム監視に任せる（競合回避）
        // this.app.updateConnectionStatus(this.app.connectionStatus === 'connected' ? '接続済み' : '未接続', this.app.connectionStatus);

        // 壁紙設定の同期は WallpaperSystem モジュールで処理

        // CLAUDE.md設定の同期
        await this.syncClaudeMdSettings();
        
        // クラウドAPI設定の同期
        await this.syncCloudApiSettings();

        // CLI選択設定の同期
        await this.loadCliSelectionSettings();

        // Claude Code 作業ディレクトリ設定の同期
        const claudeCwdDisplay = document.getElementById('claude-cwd-display');
        const claudeCwdMessage = document.getElementById('claude-cwd-message');

        try {
            const result = await window.electronAPI.getClaudeCwd();
            if (result.success) {
                this.app.claudeWorkingDir = result.cwd; // クラス変数に保存
                if (claudeCwdDisplay) claudeCwdDisplay.textContent = this.app.claudeWorkingDir;
                
                // CLAUDE.md設定の作業パス表示も更新
                await this.updateWorkspacePathDisplay();
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
            await unifiedConfig.set('voiceIntervalSeconds', this.app.voiceIntervalSeconds);
            await unifiedConfig.set('voiceVolume', this.app.voiceVolume);
            
            // 音声エンジン設定も保存（フラグのみ、APIキーは別途Electron側で管理）
            const voiceEngineCloudRadio = document.getElementById('voice-engine-cloud');
            if (voiceEngineCloudRadio) {
                await unifiedConfig.set('useCloudAPI', voiceEngineCloudRadio.checked);
            }

            // 壁紙設定の復元は WallpaperSystem モジュールで処理

            if (this.app.claudeWorkingDir) {
                await unifiedConfig.set('claudeWorkingDir', this.app.claudeWorkingDir);
            }
        }
    }

    /**
     * 音声メッセージを追加（音声読み上げ用）
     */
    addVoiceMessage(speaker, text) {
        if (!text) return;
        
        // 音声読み上げが有効の場合のみ処理
        if (this.app && this.app.voiceEnabled) {
            // app.jsのspeakTextメソッドを使用
            this.app.speakText(text);
        }
    }

    /**
     * 音声メッセージ要素を追加（UI表示用、現在は未使用）
     */
    addVoiceMessageElement(speaker, text, parentElement) {
        // 現在はチャット機能が削除されているため、何もしない
        // 将来的にチャット機能を復活させる場合に実装
        return null;
    }
    
    /**
     * 音声エンジン設定を同期
     */
    async syncCloudApiSettings() {
        try {
            // 実際の設定ファイルから読み込む
            let voiceEngine = 'aivis-local';
            let encryptedApiKey = '';

            try {
                voiceEngine = await window.electronAPI.getVoiceEngine?.() || 'aivis-local';
                encryptedApiKey = await window.electronAPI.getCloudApiKey?.() || '';
            } catch (error) {
                console.error('設定ファイル読み込みエラー:', error);
                // フォールバック: unifiedConfigから読み込む
                const unifiedConfig = getSafeUnifiedConfig();
                voiceEngine = await unifiedConfig.get('voiceEngine', 'aivis-local');
                encryptedApiKey = await unifiedConfig.get('aivisCloudApiKey', '');
            }

            // ラジオボタンの状態を更新
            const isCloudAPI = voiceEngine === 'aivis-cloud';
            const isVoiceVOX = voiceEngine === 'voicevox';
            const voiceEngineLocalRadio = document.getElementById('voice-engine-local');
            const voiceEngineCloudRadio = document.getElementById('voice-engine-cloud');
            const voiceEngineVoicevoxRadio = document.getElementById('voice-engine-voicevox');
            if (voiceEngineLocalRadio && voiceEngineCloudRadio) {
                voiceEngineLocalRadio.checked = !isCloudAPI && !isVoiceVOX;
                voiceEngineCloudRadio.checked = isCloudAPI;
                if (voiceEngineVoicevoxRadio) {
                    voiceEngineVoicevoxRadio.checked = isVoiceVOX;
                }
            }

            // API設定エリアの表示/非表示を更新
            const cloudApiSettings = document.getElementById('cloud-api-settings');
            if (cloudApiSettings) {
                cloudApiSettings.style.display = isCloudAPI ? 'block' : 'none';
            }
            
            // APIキー入力欄の更新
            const cloudApiKeyInput = document.getElementById('cloud-api-key-input');
            if (cloudApiKeyInput) {
                if (encryptedApiKey) {
                    // 暗号化されたキーがある場合は、部分的に表示
                    cloudApiKeyInput.value = 'sk-' + '*'.repeat(40);
                    cloudApiKeyInput.dataset.hasKey = 'true';
                } else {
                    cloudApiKeyInput.value = '';
                    cloudApiKeyInput.dataset.hasKey = 'false';
                }
            }
            
            console.log('🔄 音声エンジン設定を同期:', { voiceEngine, isCloudAPI, isVoiceVOX, hasApiKey: !!encryptedApiKey });
            
        } catch (error) {
            console.error('クラウドAPI設定の同期エラー:', error);
        }
    }

    /**
     * ヘルプナビゲーション機能を初期化
     */
    initHelpNavigation() {
        try {
            if (this.helpNavigationInitialized) {
                this.debugLog('ヘルプナビゲーションは既に初期化済み');
                return;
            }

            const navItems = document.querySelectorAll('.help-nav-item');
            const sections = document.querySelectorAll('.help-section');
            
            if (!navItems.length || !sections.length) {
                console.warn('ヘルプナビゲーション要素が見つかりません');
                return;
            }

            navItems.forEach(item => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    
                    const targetSection = item.getAttribute('data-section');
                    if (!targetSection) return;
                    
                    // 全てのナビアイテムから active クラスを削除
                    navItems.forEach(nav => nav.classList.remove('active'));
                    // クリックされたナビアイテムに active クラスを追加
                    item.classList.add('active');
                    
                    // 全てのセクションを非表示
                    sections.forEach(section => section.classList.remove('active'));
                    // 対象のセクションを表示
                    const targetElement = document.getElementById(`help-section-${targetSection}`);
                    if (targetElement) {
                        targetElement.classList.add('active');
                    }
                    
                    this.debugLog(`ヘルプセクション切り替え: ${targetSection}`);
                });
            });
            
            this.helpNavigationInitialized = true;
            this.debugLog('ヘルプナビゲーション初期化完了');
        } catch (error) {
            this.debugError('ヘルプナビゲーション初期化エラー:', error);
        }
    }

    /**
     * 法的ドキュメントを読み込んで各セクションに表示
     */
    async loadLegalDocuments(forceReload = false) {
        try {
            if (this.legalDocumentsLoaded && !forceReload) {
                this.debugLog('法的ドキュメントは既に読み込み済み');
                return;
            }

            this.debugLog('法的ドキュメント読み込み開始');

            await Promise.all([
                this.loadDocumentIntoSection('license', 'LICENSE.md', 'license-content'),
                this.loadDocumentIntoSection('privacy', 'PRIVACY_POLICY.md', 'privacy-content'),
                this.loadDocumentIntoSection('terms', 'TERMS_OF_SERVICE.md', 'terms-content'),
                this.loadDocumentIntoSection('updates', 'UPDATE_LOG.md', 'updates-content')
            ]);

            this.legalDocumentsLoaded = true;
            this.debugLog('法的ドキュメント読み込み完了');
        } catch (error) {
            this.legalDocumentsLoaded = false;
            this.debugError('法的ドキュメント読み込みエラー:', error);
        }
    }

    /**
     * 特定のドキュメントを読み込んで指定されたセクションに表示
     */
    async loadDocumentIntoSection(type, fileName, contentElementId) {
        try {
            const contentElement = document.getElementById(contentElementId);
            
            if (!contentElement) {
                this.debugError(`要素が見つかりません: ${contentElementId}`);
                return;
            }
            
            // ドキュメントを読み込み（UPDATE_LOG.mdのみ特別パス）
            const filePath = fileName === 'UPDATE_LOG.md' ? `docs/${fileName}` : `docs/legal/${fileName}`;
            const content = await this.requestFileContent(filePath);
            
            if (content) {
                // マークダウンを簡易的にHTMLに変換
                const htmlContent = this.convertMarkdownToHtml(content);
                contentElement.innerHTML = htmlContent;
                
                // デバッグ用: 実際のHTMLをコンソールに出力
                if (type === 'privacy') {
                    console.log('プライバシーポリシーHTML:', htmlContent.substring(0, 2000));
                }
            } else {
                contentElement.innerHTML = '<div style="text-align: center; color: var(--theme-primary-darker);">ドキュメントの読み込みに失敗しました</div>';
            }
            
            this.debugLog(`法的ドキュメント読み込み完了: ${type}`);
        } catch (error) {
            this.debugError(`ドキュメント読み込みエラー (${type}):`, error);
            
            const contentElement = document.getElementById(contentElementId);
            if (contentElement) {
                contentElement.innerHTML = '<div style="text-align: center; color: var(--theme-primary-darker);">エラーが発生しました</div>';
            }
        }
    }


    /**
     * Electronのメインプロセスにファイル読み込みを要求
     */
    async requestFileContent(filePath) {
        try {
            // ElectronのIPCを使用してファイルを読み込み
            if (window.electronAPI && window.electronAPI.readFile) {
                return await window.electronAPI.readFile(filePath);
            }
            
            // フォールバック: fetchを使用（開発時など）
            const response = await fetch(`../${filePath}`);
            if (response.ok) {
                return await response.text();
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            this.debugError('ファイル読み込みエラー:', error);
            return null;
        }
    }

    /**
     * 簡易マークダウンからHTMLへの変換
     */
    convertMarkdownToHtml(markdown) {
        // リストアイテムをより正確にグループ化
        let processedMarkdown = markdown.replace(/(^|\n)(- .+(\n- .+)*)/gm, (match, prefix) => {
            const items = match.trim().split('\n')
                .filter(item => item.trim().startsWith('-'))
                .map(item => {
                    const content = item.substring(2).trim();
                    return `<li>${content}</li>`;
                })
                .join('');
            return (prefix || '') + `<ul>${items}</ul>`;
        });
        
        // 段落を処理（2つ以上の改行で段落区切り）
        const paragraphs = processedMarkdown.split(/\n\n+/);
        
        let html = paragraphs.map((paragraph, index) => {
            // 各段落内で処理
            let processed = paragraph.trim()
                // 見出し（先に処理）
                .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
                .replace(/^### (.*$)/gim, '<h3>$1</h3>')
                .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                .replace(/^# (.*$)/gim, '<h1>$1</h1>')
                // 水平線
                .replace(/^---$/gim, '<hr>')
                // 太字
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                // リンク
                .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
            
            // 見出し、リスト、水平線以外は段落タグで囲む
            if (!processed.match(/^<[hul]|^<hr/) && processed.length > 0) {
                // 段落内の改行を<br>に変換
                processed = '<p>' + processed.replace(/\n/g, '<br>') + '</p>';
            }
            
            return processed;
        }).filter(p => p.length > 0).join('');
        
        // 空の段落やbrタグを削除
        html = html
            .replace(/<p>\s*<\/p>/g, '')
            .replace(/<p><br><\/p>/g, '')
            .replace(/<br><\/p>/g, '</p>')
            .replace(/<p><br>/g, '<p>');
        
        // スタイルを適用して行間を調整
        html = html
            .replace(/<p>/g, '<p style="margin: 0.5em 0; line-height: 1.5; color: var(--theme-text-primary);">')
            // 見出しは上により大きなマージンを設定
            .replace(/<h1>/g, '<h1 style="margin: 1.8em 0 0.5em 0; font-size: 1.8em;">')
            .replace(/<h2>/g, '<h2 style="margin: 1.6em 0 0.4em 0; font-size: 1.5em;">')
            .replace(/<h3>/g, '<h3 style="margin: 1.4em 0 0.3em 0; font-size: 1.3em;">')
            .replace(/<h4>/g, '<h4 style="margin: 1.2em 0 0.3em 0; font-size: 1.1em;">')
            // リストとリスト項目
            .replace(/<ul>/g, '<ul style="margin: 0.3em 0; padding-left: 1.8em; list-style-type: disc;">')
            .replace(/<li>/g, '<li style="margin: 0; padding: 0; line-height: 1.3; color: var(--theme-text-primary);">');
        
        // リストの直後の段落のマージンを調整
        html = html.replace(/(<\/ul>)(<p)/g, '$1<p style="margin: 0.3em 0; line-height: 1.5; color: var(--theme-text-primary);"');
        
        // リストの後の見出しにスペースを追加
        html = html.replace(/(<\/ul>)\s*(<h[1-4])/g, '$1$2');
        
        return html;
    }

    /**
     * カスタムモデルをリストに追加
     */
    async addCustomModel(uuid) {
        try {
            const unifiedConfig = getSafeUnifiedConfig();
            
            // 既存のカスタムモデルリストを取得
            const existingModels = await unifiedConfig.get('cloudCustomModels', []);
            
            // 重複チェック
            const isDuplicate = existingModels.some(model => model.uuid === uuid);
            if (isDuplicate) {
                throw new Error('このモデルは既に追加されています');
            }
            
            // 新しいモデルを追加（短いUUIDをnameに使用）
            const shortUuid = uuid.substring(0, 8) + '...';
            const newModel = {
                uuid: uuid,
                name: `カスタム (${shortUuid})`,
                addedAt: Date.now()
            };
            
            const updatedModels = [...existingModels, newModel];
            await unifiedConfig.set('cloudCustomModels', updatedModels);
            
            this.debugLog('カスタムモデル追加:', newModel);
            
        } catch (error) {
            this.debugError('カスタムモデル追加エラー:', error);
            throw error;
        }
    }

    /**
     * クラウドAPI話者選択を更新
     */
    async refreshCloudApiSpeakers() {
        try {
            const speakerSelect = document.getElementById('speaker-select-modal');
            if (!speakerSelect) return;
            
            // クラウドAPI使用中かチェック
            let voiceEngine = 'aivis-local';
            try {
                if (window.electronAPI && window.electronAPI.getVoiceEngine) {
                    voiceEngine = await window.electronAPI.getVoiceEngine();
                } else {
                    const unifiedConfig = getSafeUnifiedConfig();
                    voiceEngine = await unifiedConfig.get('voiceEngine', 'aivis-local');
                }
            } catch (error) {
                this.debugError('エンジン設定取得エラー:', error);
            }

            const isCloudAPI = voiceEngine === 'aivis-cloud';
            if (isCloudAPI) {
                await this.populateCloudApiSpeakers(speakerSelect);
            }
            
        } catch (error) {
            this.debugError('話者選択更新エラー:', error);
            throw error;
        }
    }

    /**
     * CLI選択設定のイベントリスナー
     */

    /**
     * VRM設定のイベントリスナーをセットアップ
     */
    async setupVRMSettingsEventListeners() {
        const loadVrmFileBtn = document.getElementById('load-vrm-file-btn');
        const loadDefaultVrmBtn = document.getElementById('load-default-vrm-btn');
        const vrmFileInput = document.getElementById('vrm-file-input');
        const currentVrmInfo = document.getElementById('current-vrm-info');

        this.debugLog('VRM設定要素チェック:', {
            loadVrmFileBtn: !!loadVrmFileBtn,
            loadDefaultVrmBtn: !!loadDefaultVrmBtn,
            vrmFileInput: !!vrmFileInput,
            currentVrmInfo: !!currentVrmInfo
        });

        // VRMファイル読み込みボタン
        if (loadVrmFileBtn && vrmFileInput) {
            loadVrmFileBtn.addEventListener('click', () => {
                vrmFileInput.click();
            });
        }

        // ファイル選択時の処理
        if (vrmFileInput) {
            vrmFileInput.addEventListener('change', async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;

                try {
                    this.debugLog('VRMファイル選択:', file.name);

                    // ファイルをArrayBufferとして読み込み
                    const arrayBuffer = await file.arrayBuffer();

                    // iframe経由でNext.jsにpostMessage送信
                    const iframe = document.getElementById('vrm-iframe');
                    if (iframe && iframe.contentWindow) {
                        iframe.contentWindow.postMessage({
                            type: 'loadVRM',
                            fileData: arrayBuffer,
                            fileName: file.name
                        }, '*');

                        // 現在のVRM情報を更新
                        if (currentVrmInfo) {
                            currentVrmInfo.textContent = `現在のVRM: ${file.name}`;
                        }

                        this.debugLog('VRMファイルをNext.jsに送信:', file.name);
                    } else {
                        this.debugError('VRM iframe が見つかりません');
                    }

                    // input要素をクリア（同じファイルを再選択可能にする）
                    vrmFileInput.value = '';

                } catch (error) {
                    this.debugError('VRMファイル読み込みエラー:', error);
                }
            });
        }

        // デフォルトVRM読み込みボタン
        if (loadDefaultVrmBtn) {
            loadDefaultVrmBtn.addEventListener('click', () => {
                try {
                    // iframe経由でNext.jsにpostMessage送信
                    const iframe = document.getElementById('vrm-iframe');
                    if (iframe && iframe.contentWindow) {
                        iframe.contentWindow.postMessage({
                            type: 'loadDefaultVRM'
                        }, '*');

                        // 現在のVRM情報を更新
                        if (currentVrmInfo) {
                            currentVrmInfo.textContent = '現在のVRM: デフォルトキャラクター（モネ）';
                        }

                        this.debugLog('デフォルトVRM読み込みをNext.jsに送信');
                    } else {
                        this.debugError('VRM iframe が見つかりません');
                    }
                } catch (error) {
                    this.debugError('デフォルトVRM読み込みエラー:', error);
                }
            });
        }

        // Next.jsからのVRM情報受信（将来の拡張用）
        window.addEventListener('message', (event) => {
            if (event.data?.type === 'vrmInfoUpdate' && currentVrmInfo) {
                currentVrmInfo.textContent = `現在のVRM: ${event.data.info}`;
                this.debugLog('VRM情報更新:', event.data.info);
            }
        });
    }

    /**
     * 設定画面タブナビゲーションの初期化
     */
    initSettingsNavigation() {
        try {
            const navItems = document.querySelectorAll('.settings-nav-item');
            const sections = document.querySelectorAll('.settings-section');

            if (!navItems.length || !sections.length) {
                console.warn('設定ナビゲーション要素が見つかりません');
                return;
            }

            navItems.forEach(item => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();

                    const targetSection = item.getAttribute('data-section');
                    if (!targetSection) return;

                    // 全てのナビアイテムから active クラスを削除
                    navItems.forEach(nav => nav.classList.remove('active'));
                    // クリックされたナビアイテムに active クラスを追加
                    item.classList.add('active');

                    // 全てのセクションを非表示
                    sections.forEach(section => section.classList.remove('active'));
                    // 対象のセクションを表示
                    const targetElement = document.getElementById(`settings-section-${targetSection}`);
                    if (targetElement) {
                        targetElement.classList.add('active');
                    }

                    // キャラクター設定タブの場合、リストを再描画
                    if (targetSection === 'character') {
                        this.renderCharacterList();
                    }

                    this.debugLog(`設定セクション切り替え: ${targetSection}`);
                });
            });

            // アプリ情報リンクの処理
            this.setupAppInfoLinks();

            this.debugLog('設定ナビゲーション初期化完了');
        } catch (error) {
            this.debugError('設定ナビゲーション初期化エラー:', error);
        }
    }

    /**
     * ヘルプモーダルを開いて必要な初期化を実行
     */
    async openHelpModal(targetSection = null) {
        try {
            const helpModal = document.getElementById('help-modal');
            if (!helpModal) {
                this.debugError('ヘルプモーダルが見つかりません');
                return;
            }

            helpModal.style.display = 'flex';

            this.initHelpNavigation();
            await this.loadLegalDocuments();

            if (targetSection) {
                this.navigateToHelpSection(targetSection);
            }
        } catch (error) {
            this.debugError('ヘルプモーダル表示エラー:', error);
        }
    }

    /**
     * アプリ情報セクションのリンク処理をセットアップ
     */
    setupAppInfoLinks() {
        const settingsModal = document.getElementById('settings-modal');

        // ライセンス情報リンク
        const licenseLink = document.getElementById('show-license-link');
        if (licenseLink) {
            this.safeAddEventListener(licenseLink, 'click', async (e) => {
                e.preventDefault();
                // 設定モーダルを閉じる
                if (settingsModal) settingsModal.style.display = 'none';
                await this.openHelpModal('license');
            }, 'open-help-license');
        }

        // プライバシーポリシーリンク
        const privacyLink = document.getElementById('show-privacy-link');
        if (privacyLink) {
            this.safeAddEventListener(privacyLink, 'click', async (e) => {
                e.preventDefault();
                if (settingsModal) settingsModal.style.display = 'none';
                await this.openHelpModal('privacy');
            }, 'open-help-privacy');
        }

        // 利用規約リンク
        const termsLink = document.getElementById('show-terms-link');
        if (termsLink) {
            this.safeAddEventListener(termsLink, 'click', async (e) => {
                e.preventDefault();
                if (settingsModal) settingsModal.style.display = 'none';
                await this.openHelpModal('terms');
            }, 'open-help-terms');
        }

        // アップデート情報リンク
        const updatesLink = document.getElementById('show-updates-link');
        if (updatesLink) {
            this.safeAddEventListener(updatesLink, 'click', async (e) => {
                e.preventDefault();
                if (settingsModal) settingsModal.style.display = 'none';
                await this.openHelpModal('updates');
            }, 'open-help-updates');
        }
    }

    /**
     * ヘルプモーダルの特定セクションに移動
     */
    navigateToHelpSection(sectionName) {
        const navItems = document.querySelectorAll('.help-nav-item');
        const sections = document.querySelectorAll('.help-section');

        // 全てのナビアイテムから active クラスを削除
        navItems.forEach(nav => nav.classList.remove('active'));
        // 全てのセクションを非表示
        sections.forEach(section => section.classList.remove('active'));

        // 対象のナビアイテムとセクションをアクティブにする
        const targetNavItem = document.querySelector(`[data-section="${sectionName}"]`);
        const targetSection = document.getElementById(`help-section-${sectionName}`);

        if (targetNavItem) targetNavItem.classList.add('active');
        if (targetSection) targetSection.classList.add('active');

        this.debugLog(`ヘルプセクションに移動: ${sectionName}`);
    }

    /**
     * CLI選択変更ハンドラー
     */
    async handleCliToggleChange() {
        const cliToggles = document.querySelectorAll('input[data-cli]');
        const errorElement = document.getElementById('cli-selection-error');
        const checkedToggles = Array.from(cliToggles).filter(toggle => toggle.checked);
        
        // 最低1つ選択の検証
        if (checkedToggles.length === 0) {
            // 最後の1つを無効化させない
            event.target.checked = true;
            if (errorElement) {
                errorElement.style.display = 'block';
                setTimeout(() => {
                    errorElement.style.display = 'none';
                }, 3000);
            }
            return;
        }
        
        // エラー表示を隠す
        if (errorElement) {
            errorElement.style.display = 'none';
        }
        
        // 設定を保存
        const enabledCLIs = checkedToggles.map(toggle => toggle.dataset.cli);
        const unifiedConfig = getSafeUnifiedConfig();
        await unifiedConfig.set('enabledCLIs', enabledCLIs);
        
        this.debugLog('CLI選択更新:', enabledCLIs);
        
        // メイン画面のボタン表示を更新
        // await this.updateMainCliButtons(); // Removed as per instruction
    }

    /**
     * CLI選択設定を読み込み
     */
    async loadCliSelectionSettings() {
        try {
            const unifiedConfig = getSafeUnifiedConfig();
            // 既存の設定を読み込み、なければnullを返す
            let enabledCLIs = await unifiedConfig.get('enabledCLIs');
            
            // 設定が存在しない場合のみデフォルト値を設定
            if (!enabledCLIs) {
                enabledCLIs = ['claude', 'claude-dangerous', 'gemini'];
                await unifiedConfig.set('enabledCLIs', enabledCLIs);
            }
            
            // UIに反映
            const cliToggles = document.querySelectorAll('input[data-cli]');
            cliToggles.forEach(toggle => {
                toggle.checked = enabledCLIs.includes(toggle.dataset.cli);
            });
            
            this.debugLog('CLI設定読み込み:', enabledCLIs);
            
            // メイン画面のボタン表示を更新
            // await this.updateMainCliButtons(); // Removed as per instruction
            
        } catch (error) {
            this.debugError('CLI設定読み込みエラー:', error);
        }
    }

    /**
     * 自動更新機能のイベントリスナー設定
     */
    setupAutoUpdaterControls() {
        const autoUpdaterStatus = document.getElementById('auto-updater-status');

        this.debugLog('Auto updater elements check:', {
            autoUpdaterStatus: !!autoUpdaterStatus
        });

        // IPCイベントリスナー - 自動更新ステータスの受信
        if (window.electronAPI && window.electronAPI.onAutoUpdaterStatus) {
            window.electronAPI.onAutoUpdaterStatus((data) => {
                this.handleAutoUpdaterStatus(data);
            });
        }

        // 初期状態設定
        if (autoUpdaterStatus) {
            autoUpdaterStatus.textContent = 'バックグラウンドで自動更新中...';
        }
    }

    /**
     * 自動更新ステータスの処理
     */
    handleAutoUpdaterStatus(data) {
        const autoUpdaterStatus = document.getElementById('auto-updater-status');

        this.debugLog('Auto updater status:', data);

        if (!autoUpdaterStatus) return;

        switch (data.status) {
            case 'checking':
                autoUpdaterStatus.textContent = '更新をチェック中...';
                autoUpdaterStatus.style.color = 'var(--theme-text-primary)';
                break;

            case 'update-available':
                autoUpdaterStatus.textContent = `新しいバージョン ${data.version} をダウンロード中...`;
                autoUpdaterStatus.style.color = 'var(--blue-primary)';
                this.showNotification(`新しいバージョン ${data.version} をダウンロード中...`, 'info');
                break;

            case 'up-to-date':
                autoUpdaterStatus.textContent = '最新バージョンです';
                autoUpdaterStatus.style.color = 'var(--green-primary)';
                this.showNotification('アプリは最新バージョンです', 'success');
                break;

            case 'downloading':
                autoUpdaterStatus.textContent = `更新をダウンロード中... ${data.percent}%`;
                autoUpdaterStatus.style.color = 'var(--blue-primary)';
                break;

            case 'update-downloaded':
                autoUpdaterStatus.textContent = '更新準備完了 - 次回起動時に適用';
                autoUpdaterStatus.style.color = 'var(--green-primary)';
                this.showNotification('更新のダウンロードが完了しました。次回起動時に適用されます。', 'success');
                break;

            case 'error':
                autoUpdaterStatus.textContent = '更新エラーが発生しました';
                autoUpdaterStatus.style.color = 'var(--theme-accent)';
                this.showNotification(`更新エラー: ${data.message}`, 'error');
                break;

            default:
                autoUpdaterStatus.textContent = 'バックグラウンドで自動更新中...';
                autoUpdaterStatus.style.color = 'var(--theme-text-primary)';
                break;
        }
    }

    /**
     * キャラクター設定関連のイベントリスナー設定
     */
    async setupCharacterSettingsEventListeners() {
        this.debugLog('setupCharacterSettingsEventListeners: Started');
        
        const addCharacterBtn = document.getElementById('add-character-btn');
        const saveCharacterBtn = document.getElementById('save-character-btn');
        const deleteCharacterBtn = document.getElementById('delete-character-btn');
        const testVoiceBtn = document.getElementById('char-test-voice-btn');
        const vrmSelectBtn = document.getElementById('char-select-vrm-btn');
        const iconInput = document.getElementById('char-icon-upload');
        const iconPreview = document.querySelector('.char-icon-preview');

        this.debugLog('Character settings elements check:', {
            addCharacterBtn: !!addCharacterBtn,
            saveCharacterBtn: !!saveCharacterBtn,
            deleteCharacterBtn: !!deleteCharacterBtn,
            testVoiceBtn: !!testVoiceBtn
        });

        // 新規作成ボタン
        if (addCharacterBtn) {
            this.safeAddEventListener(addCharacterBtn, 'click', async (e) => {
                e.preventDefault(); // 念のため
                this.debugLog('New Character Button Clicked');
                await this.createNewCharacter();
            }, 'add-character-btn');
        } else {
            this.debugError('Add character button not found');
        }

        // 保存ボタン
        if (saveCharacterBtn) {
            this.safeAddEventListener(saveCharacterBtn, 'click', async () => {
                await this.saveCurrentCharacter();
            }, 'save-character-btn');
        }

        // 削除ボタン
        if (deleteCharacterBtn) {
            this.safeAddEventListener(deleteCharacterBtn, 'click', async () => {
                await this.deleteCurrentCharacter();
            }, 'delete-character-btn');
        }

        // テスト発話ボタン
        if (testVoiceBtn) {
            this.safeAddEventListener(testVoiceBtn, 'click', async () => {
                await this.testCharacterVoice();
            }, 'char-test-voice-btn');
        }

        // VRMファイル選択ボタン
        if (vrmSelectBtn) {
            this.safeAddEventListener(vrmSelectBtn, 'click', async () => {
                // input type="file" を使う
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = '.vrm';
                fileInput.onchange = (e) => {
                    if (e.target.files.length > 0) {
                        const file = e.target.files[0];
                        // file.path はElectron環境でのみ取得可能 (contextIsolation: false)
                        document.getElementById('char-vrm-path-input').value = file.path;
                    }
                };
                fileInput.click();
            }, 'char-select-vrm-btn');
        }

        // アイコンアップロード
        if (iconPreview && iconInput) {
            this.safeAddEventListener(iconPreview, 'click', () => {
                iconInput.click();
            }, 'char-icon-preview');

            this.safeAddEventListener(iconInput, 'change', (e) => {
                if (e.target.files.length > 0) {
                    const file = e.target.files[0];
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const img = document.getElementById('char-icon-img');
                        const placeholder = document.getElementById('char-icon-placeholder');
                        img.src = e.target.result;
                        img.style.display = 'block';
                        placeholder.style.display = 'none';
                    };
                    reader.readAsDataURL(file);
                }
            }, 'char-icon-upload');
        }
        
        // パラメータスライダーの数値表示更新
        ['speed', 'pitch', 'volume'].forEach(param => {
            const slider = document.getElementById(`char-${param}-slider`);
            const display = document.getElementById(`char-${param}-val`);
            if (slider && display) {
                this.safeAddEventListener(slider, 'input', (e) => {
                    display.textContent = e.target.value;
                }, `char-${param}-slider`);
            }
        });
    }

    // キャラクターリスト描画
    async renderCharacterList() {
        const listContainer = document.getElementById('character-list');
        if (!listContainer) return;

        const configManager = this.app.configManager;
        const characters = configManager.getCharacters();
        const currentId = this.editingCharacterId || configManager.currentCharacterId;

        listContainer.innerHTML = '';

        characters.forEach(char => {
            const item = document.createElement('div');
            item.className = 'character-list-item';
            item.style.padding = '10px';
            item.style.cursor = 'pointer';
            item.style.borderBottom = '1px solid var(--theme-border)';
            item.style.backgroundColor = char.id === currentId ? 'var(--theme-bg-tertiary)' : 'transparent';
            if (char.id === currentId) item.classList.add('active');

            item.innerHTML = `
                <div style="font-weight: bold; font-size: 14px;">${char.name}</div>
                <div style="font-size: 11px; color: #666; margin-top: 2px;">${char.description || '説明なし'}</div>
            `;

            item.addEventListener('click', () => {
                this.selectCharacter(char.id);
            });

            listContainer.appendChild(item);
        });
    }

    // キャラクター選択
    async selectCharacter(charId) {
        const configManager = this.app.configManager;
        const char = configManager.getCharacterById(charId);
        if (!char) return;

        // UI更新
        document.getElementById('no-character-selected').style.display = 'none';
        document.getElementById('character-detail-content').style.display = 'block';

        // フォームに値をセット
        document.getElementById('char-name-input').value = char.name || '';
        document.getElementById('char-desc-input').value = char.description || '';
        document.getElementById('char-vrm-path-input').value = char.model?.path || '';
        
        const engineSelect = document.getElementById('char-engine-select');
        if(engineSelect) engineSelect.value = char.voice?.engine || 'aivis-local';
        
        document.getElementById('char-speaker-id-input').value = char.voice?.speakerId || 0;
        document.getElementById('char-prompt-input').value = char.prompt || '';

        // スライダー設定
        const setSlider = (param, value) => {
            const slider = document.getElementById(`char-${param}-slider`);
            const display = document.getElementById(`char-${param}-val`);
            if (slider && display) {
                slider.value = value;
                display.textContent = value;
            }
        };
        setSlider('speed', char.voice?.speed ?? 1.0);
        setSlider('pitch', char.voice?.pitch ?? 0.0);
        setSlider('volume', char.voice?.volume ?? 1.0);

        // アイコン表示
        const img = document.getElementById('char-icon-img');
        const placeholder = document.getElementById('char-icon-placeholder');
        if (char.icon) {
            img.src = char.icon;
            img.style.display = 'block';
            if (placeholder) placeholder.style.display = 'none';
        } else {
            img.src = '';
            img.style.display = 'none';
            if (placeholder) placeholder.style.display = 'block';
        }

        // 選択状態の保存
        this.editingCharacterId = charId;
        
        // 削除ボタンの制御（デフォルトキャラは削除不可にするなど）
        const deleteBtn = document.getElementById('delete-character-btn');
        if (deleteBtn) {
            deleteBtn.disabled = char.isDefault;
            deleteBtn.style.opacity = char.isDefault ? '0.5' : '1';
        }
        
        // リストのハイライト更新
        this.renderCharacterList();
    }

    // 新規キャラクター作成
    async createNewCharacter() {
        this.debugLog('Creating new character...');
        try {
            const configManager = this.app.configManager;
            if (!configManager) {
                this.debugError('ConfigManager not found');
                return;
            }

            const newId = `char_${Date.now()}`;
            const newChar = {
                id: newId,
                name: '新しいキャラクター',
                description: '',
                voice: { engine: 'aivis-local', speakerId: 0, speed: 1.0, pitch: 0.0, volume: 1.0 },
                prompt: '',
                model: { type: 'vrm', path: '' },
                isDefault: false
            };
            
            const success = await configManager.addCharacter(newChar);
            if (success) {
                this.debugLog('New character added:', newId);
                await this.selectCharacter(newId);
                this.showNotification('新規キャラクターを作成しました', 'success');
            } else {
                this.debugError('Failed to add new character');
                this.showNotification('キャラクターの作成に失敗しました', 'error');
            }
        } catch (error) {
            this.debugError('Error in createNewCharacter:', error);
        }
    }

    // キャラクター保存
    async saveCurrentCharacter() {
        if (!this.editingCharacterId) return;

        const updates = {
            name: document.getElementById('char-name-input').value,
            description: document.getElementById('char-desc-input').value,
            model: {
                type: 'vrm',
                path: document.getElementById('char-vrm-path-input').value
            },
            voice: {
                engine: document.getElementById('char-engine-select').value,
                speakerId: parseInt(document.getElementById('char-speaker-id-input').value) || 0,
                speed: parseFloat(document.getElementById('char-speed-slider').value),
                pitch: parseFloat(document.getElementById('char-pitch-slider').value),
                volume: parseFloat(document.getElementById('char-volume-slider').value)
            },
            prompt: document.getElementById('char-prompt-input').value,
            icon: document.getElementById('char-icon-img').src
        };

        const configManager = this.app.configManager;
        await configManager.updateCharacter(this.editingCharacterId, updates);
        
        // 保存完了表示
        const status = document.getElementById('char-save-status');
        if (status) {
            status.style.display = 'block';
            setTimeout(() => status.style.display = 'none', 2000);
        }
        
        this.renderCharacterList();
        
        // 現在選択中のキャラを更新した場合は、アプリ全体に即時反映させる
        if (this.editingCharacterId === configManager.currentCharacterId) {
            await configManager.loadCharacterSettings();
            this.showNotification('キャラクター設定を適用しました', 'success');
        }
    }

    // キャラクター削除
    async deleteCurrentCharacter() {
        if (!this.editingCharacterId) return;
        if (!confirm('このキャラクターを削除しますか？')) return;

        const configManager = this.app.configManager;
        const success = await configManager.deleteCharacter(this.editingCharacterId);
        
        if (success) {
            this.editingCharacterId = null;
            document.getElementById('character-detail-content').style.display = 'none';
            document.getElementById('no-character-selected').style.display = 'flex';
            this.renderCharacterList();
            this.showNotification('キャラクターを削除しました', 'info');
        } else {
            this.showNotification('削除できませんでした', 'error');
        }
    }

    // テスト発話
    async testCharacterVoice() {
        const text = "こんにちは、音声テストです。";
        // const engine = document.getElementById('char-engine-select').value;
        const speakerId = parseInt(document.getElementById('char-speaker-id-input').value) || 0;
        const speed = parseFloat(document.getElementById('char-speed-slider').value);
        const pitch = parseFloat(document.getElementById('char-pitch-slider').value);
        const volume = parseFloat(document.getElementById('char-volume-slider').value);
        
        if (this.app.audioService) {
            const audioData = await this.app.audioService.synthesizeTextOnly(text, speakerId, volume * 100, speed, pitch);
            if (audioData) {
                await this.app.audioService.playAppInternalAudio(audioData, text);
            } else {
                this.showNotification('音声生成に失敗しました', 'error');
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
