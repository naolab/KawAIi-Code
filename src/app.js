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
        
        // 音声再生状態の統一管理
        this.voicePlayingState = {
            isPlaying: false,
            currentAudio: null,
            queue: []
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





    // アプリ内音声再生（VoiceQueue用）- AudioServiceに委譲
    async playAppInternalAudio(audioData, text) {
        if (!this.audioService) {
            debugError('AudioService not initialized');
            return;
        }
        
        try {
            // VRMリップシンク用に音声データを送信
            let arrayBuffer;
            if (audioData.buffer) {
                arrayBuffer = audioData.buffer;
            } else {
                arrayBuffer = audioData;
            }
            this.vrmIntegrationService.sendAudioToVRM(arrayBuffer);
            
            // 感情データを抽出・送信（Hook処理と同じ）
            try {
                if (text) {
                    const emotionResult = await window.electronAPI.voice.getEmotion(text);
                    if (emotionResult.success && emotionResult.emotion) {
                        this.vrmIntegrationService.sendEmotionToVRM(emotionResult.emotion);
                        debugLog('😊 アプリ内音声感情データをVRMに送信完了:', emotionResult.emotion);
                    }
                }
            } catch (emotionError) {
                debugLog('❌ 感情データ送信エラー:', emotionError);
                // エラーが発生しても音声再生は続行
            }
            
            // 音声再生開始をVRMビューワーに通知
            this.vrmIntegrationService.notifyAudioStateToVRM('playing');
            
            // AudioServiceに音声再生を委譲
            await this.audioService.playAppInternalAudio(audioData, text);
            
            // 音声終了をVRMビューワーに通知（表情リセットのため）
            this.vrmIntegrationService.notifyAudioStateToVRM('ended');
            
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
            this.vrmIntegrationService.sendAudioToVRM(audioData);
            
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
                this.vrmIntegrationService.notifyAudioStateToVRM('ended');
                
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
                this.vrmIntegrationService.notifyAudioStateToVRM('error');
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
                this.vrmIntegrationService.notifyAudioStateToVRM('error');
                
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
            this.vrmIntegrationService.notifyAudioStateToVRM('error');
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

    
    // 旧処理: 互換性のために残す
    async parseTerminalDataForChat(data) {
        debugLog('⚠️ 旧処理parseTerminalDataForChatが呼ばれました - TerminalServiceに委譲');
        return await this.terminalService.processTerminalData(data);
        
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
                    setTimeout(checkComplete, 250);
                }
            };
            checkComplete();
        });
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

    async updateSpeakerSelect() {
        const speakerSelectModal = document.getElementById('speaker-select-modal');
        if (speakerSelectModal && this.speakers.length > 0) {
            // 話者選択の更新
            this.updateSpeakerSelectOptions(speakerSelectModal, this.speakers, this.selectedSpeaker);
            
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








    // 音声停止 - AudioServiceに委譲
    async stopVoice() {
        if (this.audioService) {
            return await this.audioService.stopVoice();
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