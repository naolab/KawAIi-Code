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
    const isDevMode = window.location.protocol !== 'file:' && 
                     (typeof process === 'undefined' || process.env.NODE_ENV !== 'production');
    
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
    async setupEventListeners() {
        await this.setupModalEventListeners();
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
    async setupModalEventListeners() {
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

        this.debugLog('Voice control elements check:', {
            voiceToggleModal: !!voiceToggleModal,
            speakerSelectModal: !!speakerSelectModal,
            refreshConnectionBtnModal: !!refreshConnectionBtnModal
        });

        if (voiceToggleModal) {
            voiceToggleModal.addEventListener('change', (e) => {
                this.app.voiceEnabled = e.target.checked;
                
                // 音声オフに切り替えた場合は音声キューをクリア
                if (!this.app.voiceEnabled && this.app.voiceQueue) {
                    this.app.voiceQueue.clear();
                    this.debugLog('音声オフ切り替えによりキューをクリア');
                }
                
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

        if (refreshConnectionBtnModal) {
            refreshConnectionBtnModal.addEventListener('click', async () => {
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

        // Aivis Cloud API設定
        this.setupCloudApiControls();

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
        const claudeMdGuideModal = document.getElementById('claude-md-guide-modal');
        const closeClaludeMdGuideBtn = document.getElementById('close-claude-md-guide');

        this.debugLog('CLAUDE.md control elements check:', {
            claudeMdContentEditor: !!claudeMdContentEditor,
            workspacePathDisplay: !!workspacePathDisplay,
            claudeMdLoadBtn: !!claudeMdLoadBtn,
            claudeMdDefaultBtn: !!claudeMdDefaultBtn,
            claudeMdGenerateBtn: !!claudeMdGenerateBtn,
            claudeMdInfoBtn: !!claudeMdInfoBtn,
            claudeMdGuideModal: !!claudeMdGuideModal,
            closeClaludeMdGuideBtn: !!closeClaludeMdGuideBtn
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

        // 現在の内容を読み込みボタン
        if (claudeMdLoadBtn) {
            claudeMdLoadBtn.addEventListener('click', async () => {
                try {
                    claudeMdLoadBtn.disabled = true;
                    claudeMdLoadBtn.textContent = '読み込み中...';
                    
                    const result = await this.loadExistingClaudeMd();
                    
                    if (result.success && claudeMdContentEditor) {
                        claudeMdContentEditor.value = result.content;
                        // 設定にも保存
                        const config = getSafeUnifiedConfig();
                        await config.set('claudeMdContent', result.content);
                        
                        this.showNotification('現在のCLAUDE.mdを読み込みました', 'success');
                        this.debugLog('CLAUDE.md読み込み成功');
                    } else {
                        this.showNotification(result.message || 'CLAUDE.mdの読み込みに失敗しました', 'error');
                        this.debugError('CLAUDE.md読み込み失敗:', result);
                    }
                } catch (error) {
                    this.debugError('CLAUDE.md読み込みエラー:', error);
                    this.showNotification('CLAUDE.mdの読み込み中にエラーが発生しました', 'error');
                } finally {
                    claudeMdLoadBtn.disabled = false;
                    claudeMdLoadBtn.textContent = '現在の内容を読み込み';
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
                    
                    const result = await this.generateCustomClaudeMd();
                    
                    if (result.success) {
                        this.showNotification('CLAUDE.mdファイルを生成しました', 'success');
                        this.debugLog('手動CLAUDE.md生成成功');
                    } else {
                        this.showNotification(result.message || 'CLAUDE.mdファイルの生成に失敗しました', 'error');
                        this.debugError('手動CLAUDE.md生成失敗:', result);
                    }
                } catch (error) {
                    this.debugError('手動CLAUDE.md生成エラー:', error);
                    this.showNotification('CLAUDE.mdファイルの生成中にエラーが発生しました', 'error');
                } finally {
                    claudeMdGenerateBtn.disabled = false;
                    claudeMdGenerateBtn.textContent = '生成';
                }
            });
        }

        // 情報ボタンのイベント
        if (claudeMdInfoBtn && claudeMdGuideModal) {
            claudeMdInfoBtn.addEventListener('click', () => {
                claudeMdGuideModal.style.display = 'flex';
                this.debugLog('CLAUDE.md設定ガイドモーダル表示');
            });
        }

        // ガイドモーダルの閉じるボタン
        if (closeClaludeMdGuideBtn && claudeMdGuideModal) {
            closeClaludeMdGuideBtn.addEventListener('click', () => {
                claudeMdGuideModal.style.display = 'none';
                this.debugLog('CLAUDE.md設定ガイドモーダル非表示');
            });
        }

        // ガイドモーダルの外クリック
        if (claudeMdGuideModal) {
            claudeMdGuideModal.addEventListener('click', (e) => {
                if (e.target === claudeMdGuideModal) {
                    claudeMdGuideModal.style.display = 'none';
                    this.debugLog('CLAUDE.md設定ガイドモーダル非表示（外クリック）');
                }
            });
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
        if (this.app.terminalApp && this.app.terminalApp.configManager) {
            try {
                return await this.app.terminalApp.configManager.getCombinedAiMdContent();
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
1. **会話文は『』で囲む**
2. **100文字以内で簡潔に**
3. **「詳しく」と言われた場合のみ詳細説明可**

# ============================================
# 以下は自由に編集してください
# キャラクターをお好みにカスタマイズできます
# ============================================

# キャラクター設定

## AIの名前・基本設定
**『モネ』**
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
                workspacePathDisplay.style.color = '#555'; // 通常の色にリセット
                this.debugLog('CLAUDE.md作業パス表示更新:', result.cwd);
            } else {
                workspacePathDisplay.textContent = '取得失敗';
                workspacePathDisplay.style.color = '#ff6b35';
                this.debugError('作業ディレクトリ取得失敗:', result.error);
            }
        } catch (error) {
            workspacePathDisplay.textContent = 'エラー';
            workspacePathDisplay.style.color = '#ff6b35';
            this.debugError('作業パス表示エラー:', error);
        }
    }

    /**
     * 既存のCLAUDE.mdを読み込み（作業ディレクトリのみ）
     */
    async loadExistingClaudeMd() {
        try {
            // 作業ディレクトリから読み込み
            const workspaceResult = await window.electronAPI.getClaudeCwd();
            this.debugLog('作業ディレクトリ取得結果:', workspaceResult);
            
            if (!workspaceResult.success) {
                this.debugError('作業ディレクトリ取得失敗:', workspaceResult);
                return { success: false, message: '作業ディレクトリが設定されていません' };
            }
            
            const targetPath = workspaceResult.cwd + '/CLAUDE.md';
            this.debugLog('読み込み対象パス:', targetPath);
            
            // ファイルを読み込み
            const { fs } = window.electronAPI;
            const content = await fs.promises.readFile(targetPath, 'utf8');
            
            this.debugLog('CLAUDE.md読み込み成功:', { path: targetPath, contentLength: content.length });
            return { success: true, content, path: targetPath };
        } catch (error) {
            this.debugError('CLAUDE.md読み込みエラー詳細:', { error, code: error.code, message: error.message });
            
            if (error.code === 'ENOENT') {
                return { success: false, message: '作業ディレクトリにCLAUDE.mdファイルが見つかりません' };
            }
            this.debugError('既存CLAUDE.md読み込みエラー:', error);
            return { success: false, message: 'ファイルの読み込みに失敗しました' };
        }
    }

    /**
     * カスタムCLAUDE.mdを生成（作業ディレクトリのみ）
     */
    async generateCustomClaudeMd() {
        try {
            const claudeMdContentEditor = document.getElementById('claude-md-content-editor');
            
            if (!claudeMdContentEditor) {
                return { success: false, message: 'コンテンツエディターが見つかりません' };
            }
            
            const content = claudeMdContentEditor.value.trim();
            if (!content) {
                return { success: false, message: 'CLAUDE.mdの内容が空です' };
            }
            
            // 作業ディレクトリに生成
            const workspaceResult = await window.electronAPI.getClaudeCwd();
            if (!workspaceResult.success) {
                return { success: false, message: '作業ディレクトリが設定されていません' };
            }
            
            const targetPath = workspaceResult.cwd + '/CLAUDE.md';
            
            // ファイルを書き込み
            const { fs } = window.electronAPI;
            await fs.promises.writeFile(targetPath, content, 'utf8');
            
            this.debugLog('CLAUDE.md生成完了:', targetPath);
            return { success: true, path: targetPath };
        } catch (error) {
            this.debugError('カスタムCLAUDE.md生成エラー:', error);
            return { success: false, message: 'ファイルの生成に失敗しました' };
        }
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
    updateVoiceControls() {
        const speakerSelectModal = document.getElementById('speaker-select-modal');
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
        // グローバル変数として読み込み済み
        const useCloudApiToggle = document.getElementById('use-cloud-api-toggle');
        const cloudApiSettings = document.getElementById('cloud-api-settings');
        const cloudApiKeyInput = document.getElementById('cloud-api-key-input');
        const testCloudApiBtn = document.getElementById('test-cloud-api-btn');
        const saveCloudApiBtn = document.getElementById('save-cloud-api-btn');
        const cloudApiStatus = document.getElementById('cloud-api-status');
        
        // デバッグ用：要素の取得状況をチェック
        this.debugLog('Cloud API elements check:', {
            useCloudApiToggle: !!useCloudApiToggle,
            cloudApiSettings: !!cloudApiSettings,
            cloudApiKeyInput: !!cloudApiKeyInput,
            testCloudApiBtn: !!testCloudApiBtn,
            saveCloudApiBtn: !!saveCloudApiBtn,
            cloudApiStatus: !!cloudApiStatus
        });

        if (useCloudApiToggle) {
            // 初期値を設定から読み込み
            const initCloudApi = async () => {
                const useCloudAPI = await unifiedConfig.get('useCloudAPI', false);
                useCloudApiToggle.checked = useCloudAPI;
                if (cloudApiSettings) {
                    cloudApiSettings.style.display = useCloudAPI ? 'block' : 'none';
                }
                
                // APIキーも読み込み（復号化は内部で処理）
                if (cloudApiKeyInput && useCloudAPI) {
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
            initCloudApi();

            // トグル変更時の処理
            useCloudApiToggle.addEventListener('change', async (e) => {
                const useCloudAPI = e.target.checked;
                this.debugLog('Cloud API toggle clicked:', { 
                    useCloudAPI, 
                    cloudApiSettingsExists: !!cloudApiSettings 
                });
                
                // 統一設定システムに保存（localStorage）
                await unifiedConfig.set('useCloudAPI', useCloudAPI);
                
                // 実際の設定ファイルにも保存
                try {
                    await window.electronAPI.setUseCloudApi?.(useCloudAPI);
                    console.log('✅ クラウドAPI使用設定を保存:', useCloudAPI);
                } catch (error) {
                    console.error('❌ クラウドAPI使用設定の保存エラー:', error);
                }
                
                if (cloudApiSettings) {
                    cloudApiSettings.style.display = useCloudAPI ? 'block' : 'none';
                    this.debugLog('Cloud API settings display changed to:', cloudApiSettings.style.display);
                } else {
                    this.debugLog('ERROR: cloudApiSettings element not found!');
                }
                
                // AudioServiceの設定を更新
                if (this.app.terminalApp && this.app.terminalApp.audioService) {
                    await this.app.terminalApp.audioService.updateApiSettings();
                }
                
                // 接続状態を再確認
                await this.app.checkVoiceConnection();
                
                this.debugLog('Cloud API toggle changed:', useCloudAPI);
            });
        }

        // 接続テストボタン
        if (testCloudApiBtn) {
            testCloudApiBtn.addEventListener('click', async () => {
                if (!cloudApiKeyInput || !cloudApiStatus) return;
                
                const apiKey = cloudApiKeyInput.value.trim();
                if (!apiKey) {
                    this.showCloudApiStatus('error', 'APIキーを入力してください');
                    return;
                }
                
                testCloudApiBtn.disabled = true;
                testCloudApiBtn.textContent = 'テスト中...';
                
                try {
                    // electronAPIを通してAPIキーを保存
                    await window.electronAPI.setCloudApiKey?.(apiKey);
                    
                    if (this.app.terminalApp && this.app.terminalApp.audioService) {
                        await this.app.terminalApp.audioService.updateApiSettings();
                        const result = await this.app.terminalApp.audioService.testConnection();
                        
                        if (result.success) {
                            this.showCloudApiStatus('success', 'クラウドAPIに正常に接続しました');
                        } else {
                            this.showCloudApiStatus('error', `接続失敗: ${result.error}`);
                        }
                    }
                } catch (error) {
                    this.showCloudApiStatus('error', `エラー: ${error.message}`);
                } finally {
                    testCloudApiBtn.disabled = false;
                    testCloudApiBtn.textContent = '接続テスト';
                }
            });
        }

        // 保存ボタン
        if (saveCloudApiBtn) {
            saveCloudApiBtn.addEventListener('click', async () => {
                if (!cloudApiKeyInput) return;
                
                const apiKey = cloudApiKeyInput.value.trim();
                
                try {
                    // electronAPIを通してAPIキーを保存
                    await window.electronAPI.setCloudApiKey?.(apiKey);
                    this.showCloudApiStatus('success', '設定を保存しました');
                    
                    // AudioServiceの設定を更新
                    if (this.app.terminalApp && this.app.terminalApp.audioService) {
                        await this.app.terminalApp.audioService.updateApiSettings();
                    }
                } catch (error) {
                    this.showCloudApiStatus('error', `保存エラー: ${error.message}`);
                }
            });
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
            cloudApiStatus.style.backgroundColor = '#e8f5e9';
            cloudApiStatus.style.color = '#2e7d32';
            cloudApiStatus.style.border = '1px solid #4caf50';
        } else if (type === 'error') {
            cloudApiStatus.style.backgroundColor = '#ffebee';
            cloudApiStatus.style.color = '#c62828';
            cloudApiStatus.style.border = '1px solid #f44336';
        }
        
        // 5秒後に自動で非表示
        setTimeout(() => {
            cloudApiStatus.style.display = 'none';
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
        // グローバル変数として読み込み済み
        const useCloudAPI = unifiedConfig.get('useCloudAPI', false);
        
        if (error.errorType) {
            switch (error.errorType) {
                case 'network':
                    if (useCloudAPI) {
                        return 'Aivis Cloud APIに接続できません。インターネット接続とAPIキーを確認してください。';
                    }
                    return '音声エンジンに接続できません。AivisSpeechが起動しているか確認してください。';
                case 'timeout':
                    return '音声生成に時間がかかりすぎています。しばらく待ってから再試行してください。';
                case 'server':
                    if (useCloudAPI) {
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
        if (this.app.audioService) {
            await this.app.audioService.updateSpeakerSelect();
        }
        
        // 接続状態の更新はリアルタイム監視に任せる（競合回避）
        // this.app.updateConnectionStatus(this.app.connectionStatus === 'connected' ? '接続済み' : '未接続', this.app.connectionStatus);

        // 壁紙設定の同期は WallpaperSystem モジュールで処理

        // CLAUDE.md設定の同期
        await this.syncClaudeMdSettings();
        
        // クラウドAPI設定の同期
        await this.syncCloudApiSettings();

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
     * クラウドAPI設定を同期
     */
    async syncCloudApiSettings() {
        try {
            // 実際の設定ファイルから読み込む
            let useCloudAPI = false;
            let encryptedApiKey = '';
            
            try {
                useCloudAPI = await window.electronAPI.getUseCloudApi?.() || false;
                encryptedApiKey = await window.electronAPI.getCloudApiKey?.() || '';
            } catch (error) {
                console.error('設定ファイル読み込みエラー:', error);
                // フォールバック: unifiedConfigから読み込む
                const unifiedConfig = getSafeUnifiedConfig();
                useCloudAPI = await unifiedConfig.get('useCloudAPI', false);
                encryptedApiKey = await unifiedConfig.get('aivisCloudApiKey', '');
            }
            
            // トグルボタンの状態を更新
            const cloudApiToggle = document.getElementById('use-cloud-api-toggle');
            if (cloudApiToggle) {
                cloudApiToggle.checked = useCloudAPI;
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
            
            console.log('🔄 クラウドAPI設定を同期:', { useCloudAPI, hasApiKey: !!encryptedApiKey });
            
        } catch (error) {
            console.error('クラウドAPI設定の同期エラー:', error);
        }
    }
}

// グローバルに公開（モジュールシステム対応）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIEventManager;
} else {
    window.UIEventManager = UIEventManager;
}