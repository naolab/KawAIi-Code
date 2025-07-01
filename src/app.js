// xtermライブラリはCDNから読み込み

// デバッグログ制御（本番環境でも有効）
const isDev = true; // 常にデバッグログを有効化
const debugLog = console.log;
const debugTrace = console.trace;
const debugError = console.error;

// 統一設定管理システム（グローバル参照）
// unifiedConfigはunified-config-manager.jsで既にグローバルに定義済み

// 読み上げ履歴管理クラス - modules/speech-history-manager.js に移動済み

// メッセージチャンク結合クラス
class MessageAccumulator {
    constructor() {
        this.pendingMessage = '';
        this.lastChunkTime = 0;
        this.completionTimeout = 3000; // 3秒でメッセージ完了と判定
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
        const hasQuotes = data.includes('「') && data.includes('」');
        
        debugLog(`📝 MessageAccumulator.addChunk - マーカー: ${hasMarker}, 括弧: ${hasQuotes}, データ長: ${data.length}`);
        
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
            
        } else if (hasQuotes && this.isAccumulating) {
            // 既存メッセージに追加（括弧付きテキストがある場合のみ）
            this.pendingMessage += '\n' + data;
            this.lastChunkTime = Date.now();
            debugLog(`➕ メッセージに追加 - 現在の総長: ${this.pendingMessage.length}`);
            this.scheduleCompletion();
            
        } else {
            debugLog(`⏭️ チャンクをスキップ - 条件に合致せず`);
        }
    }
    
    // より賢い完了判定
    isMessageComplete(data) {
        // 1. 明確な終了マーカーがある（ユーザー入力プロンプト）
        const hasEndMarker = data.includes('\n> ') || data.includes('╭─') || data.includes('│ ');
        
        // 2. カギカッコが閉じられている
        const openQuotes = (data.match(/「/g) || []).length;
        const closeQuotes = (data.match(/」/g) || []).length;
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
                debugError(`❌ コールバック実行エラー:`, error);
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
        
        // タブ管理システム
        this.tabManager = null;
        this.voiceEnabled = true; // デフォルトで有効に
        this.selectedSpeaker = 0;
        this.connectionStatus = 'disconnected';
        this.speakers = [];
        this.audioContext = null;
        this.currentAudio = null;
        this.isPlaying = false;
        this.voiceIntervalSeconds = 3; // 音声読み上げ間隔（デフォルト3秒）
        this.audioQueue = []; // { audioData, timestamp } の配列
        this.maxAudioAge = 120000; // 120秒（2分）で古い音声とみなす
        this.maxQueueSize = 50; // キューの最大サイズ（メモリ使用量制限）
        this.chatMessages = [];
        this.lastChatMessage = '';
        this.lastChatTime = 0;
        this.currentRunningAI = null; // 現在起動しているAIの種類を保持
        
        // VRM口パク用通信（postMessage使用）
        this.vrmWebSocket = null;
        
        // パフォーマンス最適化用（チャンク結合方式に変更）
        this.messageAccumulator = new MessageAccumulator();
        this.claudeWorkingDir = ''; // Claude Code作業ディレクトリの初期値
        this.speakerInitialized = false; // 話者選択初期化フラグ
        
        // 読み上げ履歴管理
        this.speechHistory = new SpeechHistoryManager(100);
        
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
        this.updateStatus('Ready');
        this.checkVoiceConnection();
    }

    // モジュール初期化
    async initializeModules() {
        // MessageAccumulatorのコールバック設定
        this.messageAccumulator.setProcessCallback((data) => {
            this.parseTerminalDataForChat(data);
        });
        
        // 壁紙システムの初期化
        this.wallpaperSystem.setMessageCallback((character, message) => {
            this.addVoiceMessage(character, message);
        });
        this.wallpaperSystem.setupWallpaperSystem();
        
        // 設定管理の初期化
        // configManagerに現在のclaudeWorkingDirを渡す
        await this.configManager.initialize(this.claudeWorkingDir);
    }

    // 初期設定の読み込み（起動時のみ）
    async loadInitialSettings() {
        // 統一設定システムから設定を読み込み（起動時のみ）
        this.voiceEnabled = await unifiedConfig.get('voiceEnabled', this.voiceEnabled);
        this.selectedSpeaker = await unifiedConfig.get('selectedSpeaker', this.selectedSpeaker);
        this.voiceIntervalSeconds = await unifiedConfig.get('voiceIntervalSeconds', this.voiceIntervalSeconds);
        
        debugLog('Initial settings loaded:', {
            voiceEnabled: this.voiceEnabled,
            selectedSpeaker: this.selectedSpeaker,
            voiceIntervalSeconds: this.voiceIntervalSeconds
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
        this.terminal = new Terminal({
            fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
            fontSize: 14,
            lineHeight: 1.3,
            cursorBlink: true,
            cursorStyle: 'block',
            theme: {
                background: '#F0EAD6',
                foreground: '#4A3728',
                cursor: '#D2691E',
                cursorAccent: '#FFFEF7',
                selectionBackground: 'rgba(210, 105, 30, 0.2)',
                selectionForeground: '#5D4E3A',
                black: '#3C2E1F',
                red: '#A0522D',
                green: '#8B7355',
                yellow: '#B8860B',
                blue: '#708090',
                magenta: '#CD853F',
                cyan: '#5F9EA0',
                white: '#8B7D6B',
                brightBlack: '#696969',
                brightRed: '#CD853F',
                brightGreen: '#8B7355',
                brightYellow: '#B8860B',
                brightBlue: '#4682B4',
                brightMagenta: '#A0522D',
                brightCyan: '#2F4F4F',
                brightWhite: '#5D4E3A'
            },
            allowTransparency: false,
            convertEol: true,
            scrollback: 1000,
            tabStopWidth: 4,
            fastScrollModifier: 'shift',
            fastScrollSensitivity: 5,
            rendererType: 'canvas',
            smoothScrollDuration: 0,
            windowsMode: false,
            macOptionIsMeta: true
        });

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

        // Handle window resize
        window.addEventListener('resize', () => {
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
                if (this.terminal) {
                    this.terminal.write(data);
                }
                // チャンク結合方式でメッセージ処理
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

            // Handle audio playback
            window.electronAPI.voice.onPlayAudio((audioData) => {
                this.playAudio(audioData);
            });

            // Handle audio stop
            window.electronAPI.voice.onStopAudio(() => {
                this.stopAudio();
            });
        }
    }

    // setupEventListeners() - modules/ui-event-manager.js に移動済み

    setupChatInterface() {
        // チャット入力エリアは削除済み

        // 初期メッセージを追加（音声読み上げ用）
        this.addVoiceMessage('ことね', 'こんにちは〜！何をお手伝いしましょうか？');
    }


    // 🗑️ 旧バッチ処理システムは削除し、MessageAccumulatorで置き換え
    // 以下の関数は互換性のため残してありますが、使用されません
    
    // デバッグ用: MessageAccumulatorの状態を取得
    getMessageAccumulatorStatus() {
        return this.messageAccumulator.getStatus();
    }

    parseTerminalDataForChat(data) {
        try {
            debugLog('🔍 parseTerminalDataForChat 開始 - 入力データ長:', data.length);
            
            const cleanData = data.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').trim();
            // Claude Code (⏺) と Gemini Code Assist (✦) の両方に対応
            let markerIndex = cleanData.indexOf('⏺');
            let markerType = '⏺';
            if (markerIndex === -1) {
                markerIndex = cleanData.indexOf('✦');
                markerType = '✦';
            }
            
            if (markerIndex === -1) {
                return;
            }
            
            let afterMarker = cleanData.substring(markerIndex + 1).trim();
            
            // 文字列クリーニング（音声読み上げ用）
            afterMarker = afterMarker
                    .replace(/^[⚒↓⭐✶✻✢·✳]+\s*/g, '')
                    .replace(/\s*[✢✳✶✻✽·⚒↓↑]\s*(Synthesizing|Conjuring|Spinning|Vibing|Computing|Mulling|Pondering|musing|thinking).*$/gi, '')
                    .replace(/\s*\([0-9]+s[^)]*\).*$/g, '')
                    .replace(/\s*tokens.*$/gi, '')
                    .trim();
            
            // カッコ内のテキストを抽出（音声読み上げ用・改行にも対応）
            const quotedTextMatches = afterMarker.match(/「([^」]+)」/gs);
            
            if (quotedTextMatches && quotedTextMatches.length > 0) {
                // カギカッコ内のテキストを一個ずつ処理
                this.processQuotedTexts(quotedTextMatches);
                return; // カギカッコ処理の場合は通常の処理をスキップ
            } else {
                // カギカッコがない場合は読み上げをスキップ
                return; // 読み上げをスキップ
            }

        } catch (error) {
            debugError('❌ parseTerminalDataForChat エラー:', error);
            console.warn('Chat parsing error:', error);
        }
    }

    // 音声再生完了を待機する関数
    async waitForAudioComplete() {
        return new Promise(resolve => {
            if (!this.isPlaying && this.audioQueue.length === 0) {
                resolve();
                return;
            }
            
            const checkComplete = () => {
                if (!this.isPlaying && this.audioQueue.length === 0) {
                    debugLog('🎵 音声再生完了を確認');
                    resolve();
                } else {
                    setTimeout(checkComplete, 100);
                }
            };
            checkComplete();
        });
    }

    // カッコ内のテキストを一個ずつ順次処理
    async processQuotedTexts(quotedTextMatches) {
        
        for (let i = 0; i < quotedTextMatches.length; i++) {
            let quotedText = quotedTextMatches[i].replace(/[「」]/g, '').trim();
            
            // 改行と余分な空白を除去
            quotedText = quotedText.replace(/\r?\n\s*/g, '').replace(/\s+/g, ' ').trim();
            
            // 空のテキストはスキップ
            if (quotedText.length === 0) {
                continue;
            }
            
            // DOM操作を最小化
            requestAnimationFrame(() => {
                this.addVoiceMessage('ことね', quotedText);
                this.updateCharacterMood('おしゃべり中✨');
            });
            
            // 音声読み上げ実行
            if (this.voiceEnabled) {
                await this.speakText(quotedText);
                // 音声再生完了まで待機（順序保証）
                await this.waitForAudioComplete();
            }
        }
        
        // キャラクターの気分をリセット
        setTimeout(() => {
            this.updateCharacterMood('待機中💕');
        }, 3000);
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

        // DOM操作を最小化（innerHTML使用）
        const timeString = new Date().toLocaleTimeString('ja-JP', { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        });

        const messageHTML = `
            <div class="voice-message">
                <div class="voice-speaker">${speaker}</div>
                <p class="voice-text">${text}</p>
                <div class="voice-time">${timeString}</div>
            </div>
        `;

        chatMessages.insertAdjacentHTML('beforeend', messageHTML);
        
        // スクロールを最小化
        if (chatMessages.children.length > 20) {
            chatMessages.removeChild(chatMessages.firstChild);
        }
        
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

            const aiName = aiType === 'claude' ? 'Claude Code' : 'Gemini Code Assist';
            
            this.updateStatus(`Starting ${aiName}...`);
            const result = await window.electronAPI.terminal.start(aiType);
            
            if (result.success) {
                this.isTerminalRunning = true;
                this.currentRunningAI = aiType; // 起動したAIの種類を保存
                this.updateStatus(`${aiName} running - Type your message and press Enter`);
                this.terminal.focus();
                
                this.terminal.writeln(`\x1b[90m🎀 KawAIi Code Integration Started! 🎀\x1b[0m`);
                this.terminal.writeln(`\x1b[90m${aiName} is starting up...\x1b[0m`);
                
                this.addVoiceMessage('ことね', `${aiName}が起動したよ〜！`);
                
                // 起動するAIに応じて.mdファイルを生成/更新
                const aiMdFilename = aiType === 'claude' ? 'CLAUDE.md' : 'GEMINI.md';
                const mdResult = await this.configManager.writeAiMdToHomeDir(aiType);
                
                if (mdResult.success) {
                    if (aiType === 'gemini' && mdResult.hadBackup) {
                        this.addVoiceMessage('ことね', `${aiMdFilename}を準備したよ！既存ファイルはバックアップ済み✨`);
                    } else {
                        this.addVoiceMessage('ことね', `${aiMdFilename}を更新したよ！`);
                    }
                } else {
                    this.addVoiceMessage('ことね', `${aiMdFilename}の更新に失敗しちゃった...`);
                }

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
            const aiName = aiType === 'claude' ? 'Claude Code' : 'Gemini Code Assist';
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
        
        const aiName = aiType === 'claude' ? 'Claude Code' : 'Gemini Code Assist';
        this.updateStatus(`Starting ${aiName} in active tab...`);
        
        try {
            const success = await this.tabManager.startAIForTab(this.tabManager.activeTabId, aiType);
            if (success) {
                // タブ情報を更新
                activeTab.aiType = aiType;
                activeTab.isRunning = true;
                activeTab.name = `${aiType === 'claude' ? 'Claude' : 'Gemini'} #${activeTab.id.split('-')[1]}`;
                
                this.updateStatus(`${aiName} running in tab - Type your message and press Enter`);
                this.addVoiceMessage('ことね', `${aiName}をタブで起動したよ〜！`);
                
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

                // 停止したAIに応じて.mdファイルを削除/復元
                const aiMdFilename = this.currentRunningAI === 'claude' ? 'CLAUDE.md' : 'GEMINI.md';
                if (this.currentRunningAI) { // 念のためnullチェック
                    const deleteResult = await this.configManager.deleteAiMdFromHomeDir(this.currentRunningAI);
                    
                    if (deleteResult.success) {
                        if (this.currentRunningAI === 'gemini' && deleteResult.restored) {
                            this.addVoiceMessage('ことね', `${aiMdFilename}を元の状態に戻したよ！`);
                        } else {
                            this.addVoiceMessage('ことね', `${aiMdFilename}を削除したよ！`);
                        }
                    } else {
                        this.addVoiceMessage('ことね', `${aiMdFilename}の処理に失敗しちゃった...`);
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

        // 既存データの自動マイグレーション実行
        const migratedCount = await unifiedConfig.migrateFromLocalStorage();
        if (migratedCount > 0) {
            debugLog(`Configuration migration completed: ${migratedCount} settings migrated`);
        }

        // 現在の設定を統一設定システムに保存（読み込みは初期化時のみ）
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
                
                // プロジェクト固有設定を読み込み
                // loadProjectSpecificSettingsはaiTypeを引数に取るようになったため、ここでは呼び出さない
                // 代わりに、writeAiMdToHomeDirが呼び出された際に最新のclaudeWorkingDirが使われる

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
            speakerSelectModal.innerHTML = '';
            this.speakers.forEach((speaker) => {
                speaker.styles.forEach((style) => {
                    const option = document.createElement('option');
                    option.value = style.id;
                    option.textContent = `${speaker.name} (${style.name})`;
                    speakerSelectModal.appendChild(option);
                });
            });
            
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
    
    // 音声エラーインジケーターの更新
    updateVoiceErrorIndicator(error) {
        const statusElement = document.getElementById('connection-status-modal');
        if (statusElement) {
            statusElement.textContent = 'エラー発生';
            statusElement.className = 'status-error';
            
            // 10秒後にステータスを復元
            setTimeout(() => {
                this.checkVoiceConnection();
            }, 10000);
        }
    }


    // VRMビューワーに音声データを送信
    sendAudioToVRM(audioData) {
        try {
            const iframe = document.getElementById('vrm-iframe');
            if (iframe && iframe.contentWindow) {
                // ArrayBufferを直接Arrayに変換（すでにコピー済み）
                const audioArray = Array.from(new Uint8Array(audioData));
                iframe.contentWindow.postMessage({
                    type: 'lipSync',
                    audioData: audioArray
                }, '*');
                debugLog('🎭 iframeにpostMessage送信, サイズ:', audioArray.length);
            } else {
                debugLog('🎭 VRM iframe未発見');
            }
        } catch (error) {
            debugError('🎭 VRM音声データ送信エラー:', error);
        }
    }

    async playAudio(audioData) {
        debugLog('🎵 playAudio called with data size:', audioData?.length || audioData?.byteLength || 'unknown');
        
        // 古い音声をクリーンアップ
        this.cleanOldAudio();
        
        // 既に再生中の場合はキューに追加（タイムスタンプ付き）
        if (this.isPlaying) {
            // キューサイズ制限チェック
            if (this.audioQueue.length >= this.maxQueueSize) {
                // 古いアイテムを削除してスペースを確保
                const removedItem = this.audioQueue.shift();
                debugLog('🗑️ Queue full, removed oldest item. Queue length:', this.audioQueue.length);
            }
            
            this.audioQueue.push({
                audioData: audioData,
                timestamp: Date.now()
            });
            debugLog('🎵 Audio queued, queue length:', this.audioQueue.length);
            return;
        }

        try {
            // Create audio context if not exists
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                // Resume audio context if suspended
                if (this.audioContext.state === 'suspended') {
                    await this.audioContext.resume();
                }
            }

            // BufferをArrayBufferに変換（VRM用のコピーも作成）
            let arrayBuffer, vrmArrayBuffer;
            if (audioData instanceof ArrayBuffer) {
                arrayBuffer = audioData;
                vrmArrayBuffer = audioData.slice(0); // VRM用にコピー
            } else if (audioData.buffer instanceof ArrayBuffer) {
                arrayBuffer = audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength);
                vrmArrayBuffer = arrayBuffer.slice(0); // VRM用にコピー
            } else {
                // Uint8ArrayまたはBufferの場合
                arrayBuffer = new ArrayBuffer(audioData.length);
                const view = new Uint8Array(arrayBuffer);
                for (let i = 0; i < audioData.length; i++) {
                    view[i] = audioData[i];
                }
                vrmArrayBuffer = arrayBuffer.slice(0); // VRM用にコピー
            }

            // Decode audio data
            debugLog('🎵 Decoding audio data, size:', arrayBuffer.byteLength);
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            debugLog('🎵 Audio decoded successfully, duration:', audioBuffer.duration, 'seconds');
            
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            
            source.onended = () => {
                debugLog('🎵 Audio playback ended');
                this.currentAudio = null;
                this.isPlaying = false;
                
                // 音声再生完了時に間隔制御の基準時間を更新
                this.lastSpeechTime = Date.now();
                debugLog('🔇 Updated lastSpeechTime for cooldown control');
                
                // 次のキューを処理
                this.processAudioQueue();
            };

            // VRMビューワーに音声データを送信（専用コピーを使用）
            this.sendAudioToVRM(vrmArrayBuffer);
            
            this.currentAudio = source;
            this.isPlaying = true;
            debugLog('🎵 Starting audio playback...');
            
            source.start();
        } catch (error) {
            debugError('Failed to play audio:', error);
            this.isPlaying = false;
        }
    }

    // 古い音声をクリーンアップ
    cleanOldAudio() {
        const now = Date.now();
        const oldLength = this.audioQueue.length;
        
        // 時間制限による削除
        this.audioQueue = this.audioQueue.filter(item => 
            (now - item.timestamp) < this.maxAudioAge
        );
        
        // サイズ制限による削除（念のため）
        if (this.audioQueue.length > this.maxQueueSize) {
            const excess = this.audioQueue.length - this.maxQueueSize;
            this.audioQueue.splice(0, excess); // 古いものから削除
            debugLog('🗑️ Queue size limit exceeded, removed', excess, 'items');
        }
        
        const newLength = this.audioQueue.length;
        if (oldLength !== newLength) {
            debugLog('🧹 Cleaned audio queue:', {
                removed: oldLength - newLength,
                remaining: newLength,
                maxAge: this.maxAudioAge / 1000 + 's',
                maxSize: this.maxQueueSize
            });
        }
    }

    processAudioQueue() {
        // 処理前にもクリーンアップ
        this.cleanOldAudio();
        
        if (this.audioQueue.length > 0 && !this.isPlaying) {
            debugLog('🎵 Processing queue, items:', this.audioQueue.length);
            
            // 前の音声から設定可能間隔を確保
            const timeSinceLastSpeech = Date.now() - this.lastSpeechTime;
            const requiredInterval = (this.voiceIntervalSeconds || 3) * 1000; // 設定可能間隔
            
            if (timeSinceLastSpeech < requiredInterval) {
                const remainingWait = requiredInterval - timeSinceLastSpeech;
                debugLog(`⏰ キュー処理待機: ${remainingWait}ms後に次の音声を再生`);
                
                setTimeout(() => {
                    this.processAudioQueue();
                }, remainingWait);
                return;
            }
            
            const nextItem = this.audioQueue.shift();
            this.playAudio(nextItem.audioData);
        }
    }

    stopAudio() {
        if (this.currentAudio) {
            this.currentAudio.stop();
            this.currentAudio = null;
            this.isPlaying = false;
            // キューもクリア
            const queueLength = this.audioQueue.length;
            this.audioQueue = [];
            debugLog('🛑 Audio stopped and queue cleared:', queueLength, 'items removed');
        }
        // lastSpeechTimeはリセットしない（間隔制御を維持）
    }

    // 🔧 追加機能: キューの状態を取得
    getAudioQueueStatus() {
        return {
            length: this.audioQueue.length,
            maxSize: this.maxQueueSize,
            maxAge: this.maxAudioAge,
            isPlaying: this.isPlaying,
            oldestTimestamp: this.audioQueue.length > 0 ? this.audioQueue[0].timestamp : null
        };
    }

    async stopVoice() {
        if (window.electronAPI && window.electronAPI.voice) {
            try {
                await window.electronAPI.voice.stop();
                this.stopAudio();
            } catch (error) {
                debugError('Failed to stop voice:', error);
            }
        }
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
        const terminal = new Terminal(this.getTerminalConfig());
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
        terminal.writeln(`\x1b[90mClick the start button to begin with Claude Code or Gemini CLI\x1b[0m`);
        
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
        
        this.renderTabs();
        this.switchTab(tabId);
        
        return tabId;
    }


    getTerminalConfig() {
        return {
            fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
            fontSize: 14,
            lineHeight: 1.3,
            cursorBlink: true,
            cursorStyle: 'block',
            theme: {
                background: '#F0EAD6',
                foreground: '#4A3728',
                cursor: '#D2691E',
                cursorAccent: '#FFFEF7',
                selectionBackground: 'rgba(210, 105, 30, 0.2)',
                selectionForeground: '#5D4E3A',
                black: '#3C2E1F',
                red: '#A0522D',
                green: '#8B7355',
                yellow: '#B8860B',
                blue: '#708090',
                magenta: '#CD853F',
                cyan: '#5F9EA0',
                white: '#8B7D6B',
                brightBlack: '#696969',
                brightRed: '#CD853F',
                brightGreen: '#8B7355',
                brightYellow: '#B8860B',
                brightBlue: '#4682B4',
                brightMagenta: '#A0522D',
                brightCyan: '#2F4F4F',
                brightWhite: '#5D4E3A'
            },
            allowTransparency: false,
            convertEol: true,
            scrollback: 1000,
            tabStopWidth: 4,
            fastScrollModifier: 'shift',
            fastScrollSensitivity: 5,
            rendererType: 'canvas',
            smoothScrollDuration: 0,
            windowsMode: false,
            macOptionIsMeta: true
        };
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

            const aiName = aiType === 'claude' ? 'Claude Code' : 'Gemini Code Assist';
            debugLog(`Starting ${aiName} for tab ${tabId}`);
            
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
            
            // ユーザー入力をプロセスに送信
            terminal.onData((data) => {
                window.electronAPI.tab.write(tabId, data);
            });
            
            // リサイズ処理
            terminal.onResize(({ cols, rows }) => {
                window.electronAPI.tab.resize(tabId, cols, rows);
            });
            
            // ターミナルサイズを適切に調整（AI起動後に実行）
            setTimeout(() => {
                if (tab.fitAddon && tab.terminal) {
                    tab.fitAddon.fit();
                    // バックエンドプロセスにも新しいサイズを通知
                    window.electronAPI.tab.resize(tabId, tab.terminal.cols, tab.terminal.rows);
                    debugLog(`Tab ${tabId} resized to ${tab.terminal.cols}x${tab.terminal.rows}`);
                }
            }, 200); // Claude Codeの初期化完了を待つ
            
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
                tab.terminal.writeln(`\x1b[90mClick the start button to begin with Claude Code or Gemini CLI\x1b[0m`);
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
        
        // 1. PTYプロセスの終了処理
        if (window.electronAPI && window.electronAPI.tab) {
            try {
                await window.electronAPI.tab.delete(tabId);
                debugLog(`PTY process for tab ${tabId} terminated`);
            } catch (error) {
                debugError(`Failed to terminate PTY process for tab ${tabId}:`, error);
            }
        }
        
        // 2. イベントリスナーの削除（ターミナル破棄前に実行）
        if (tab.terminal) {
            // onDataとonResizeイベントは自動的にクリーンアップされるが、念のため
            try {
                // ターミナルが提供するクリーンアップ機能があれば利用
                if (typeof tab.terminal.clear === 'function') {
                    tab.terminal.clear();
                }
            } catch (error) {
                debugError(`Error clearing terminal for tab ${tabId}:`, error);
            }
        }
        
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
        
        // 7. タブデータ削除
        delete this.tabs[tabId];
        debugLog(`Tab data for ${tabId} deleted`);
        
        this.renderTabs();
    }

    renderTabs() {
        const tabBar = document.getElementById('tab-bar');
        if (!tabBar) return;
        
        // 既存のタブを削除（新規タブボタン以外）
        const existingTabs = tabBar.querySelectorAll('.tab');
        existingTabs.forEach(tab => tab.remove());
        
        // タブを作成
        Object.values(this.tabs).forEach(tabData => {
            const tabElement = this.createTabElement(tabData);
            tabBar.insertBefore(tabElement, document.getElementById('new-tab-button'));
        });
    }

    createTabElement(tabData) {
        const tab = document.createElement('div');
        tab.className = `tab ${tabData.isActive ? 'active' : ''}`;
        tab.setAttribute('data-tab-id', tabData.id);
        
        // 星マーク
        const star = document.createElement('span');
        star.className = `parent-star ${tabData.isParent ? 'active' : 'inactive'}`;
        star.textContent = tabData.isParent ? '★' : '☆';
        star.addEventListener('click', (e) => {
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
        closeBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.deleteTab(tabData.id);
        });
        
        // タブクリックイベント
        tab.addEventListener('click', () => {
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
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TerminalApp();
});