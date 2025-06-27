// xtermライブラリはCDNから読み込み

// デバッグログ制御（本番環境では無効化）
const isDev = !window.location.protocol.startsWith('file:') || process.env.NODE_ENV === 'development';
const debugLog = isDev ? console.log : () => {};
const debugTrace = isDev ? console.trace : () => {};
const debugError = console.error; // エラーは常に出力

// 統一設定管理システム（グローバル参照）
// unifiedConfigはunified-config-manager.jsで既にグローバルに定義済み

// 読み上げ履歴管理クラス - modules/speech-history-manager.js に移動済み

class TerminalApp {
    constructor() {
        this.terminal = null;
        this.fitAddon = null;
        this.isTerminalRunning = false;
        this.voiceEnabled = true; // デフォルトで有効に
        this.selectedSpeaker = 0;
        this.connectionStatus = 'disconnected';
        this.speakers = [];
        this.audioContext = null;
        this.currentAudio = null;
        this.isPlaying = false;
        this.audioQueue = []; // { audioData, timestamp } の配列
        this.maxAudioAge = 120000; // 120秒（2分）で古い音声とみなす
        this.maxQueueSize = 10; // キューの最大サイズ（メモリ使用量制限）
        this.chatMessages = [];
        this.lastChatMessage = '';
        this.lastChatTime = 0;
        this.currentRunningAI = null; // 現在起動しているAIの種類を保持
        
        // VRM口パク用通信（postMessage使用）
        this.vrmWebSocket = null;
        
        // パフォーマンス最適化用
        this.chatParseQueue = [];
        this.chatParseTimer = null;
        this.isProcessingChat = false;
        this.claudeWorkingDir = ''; // Claude Code作業ディレクトリの初期値
        
        // 読み上げ履歴管理
        this.speechHistory = new SpeechHistoryManager(50);
        
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
        this.initializeUIEventManager(); // UI制御初期化
        this.setupChatInterface();
        await this.initializeModules(); // モジュール初期化をawait
        this.updateStatus('Ready');
        this.checkVoiceConnection();
    }

    // モジュール初期化
    async initializeModules() {
        // 壁紙システムの初期化
        this.wallpaperSystem.setMessageCallback((character, message) => {
            this.addVoiceMessage(character, message);
        });
        this.wallpaperSystem.setupWallpaperSystem();
        
        // 設定管理の初期化
        // configManagerに現在のclaudeWorkingDirを渡す
        await this.configManager.initialize(this.claudeWorkingDir);
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
                yellow: '#DAA520',
                blue: '#708090',
                magenta: '#CD853F',
                cyan: '#5F9EA0',
                white: '#8B7D6B',
                brightBlack: '#696969',
                brightRed: '#CD853F',
                brightGreen: '#BDB76B',
                brightYellow: '#F0E68C',
                brightBlue: '#87CEEB',
                brightMagenta: '#DEB887',
                brightCyan: '#AFEEEE',
                brightWhite: '#5D4E3A'
            },
            allowTransparency: false,
            convertEol: true,
            scrollback: 50,
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
                // チャット解析をバッチ処理で高速化（「」内処理）
                this.queueChatParsing(data);
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


    // バッチ処理でチャット解析を最適化
    queueChatParsing(data) {
        if (!data.includes('⏺') && !data.includes('✦')) return;
        
        this.chatParseQueue.push(data);
        
        if (!this.chatParseTimer) {
            this.chatParseTimer = setTimeout(() => {
                this.processChatQueue();
            }, 50); // 50msに短縮で高速化
        }
    }
    
    processChatQueue() {
        if (this.isProcessingChat) return;
        this.isProcessingChat = true;
        
        const latestData = this.chatParseQueue[this.chatParseQueue.length - 1];
        this.chatParseQueue = [];
        this.chatParseTimer = null;
        
        this.parseTerminalDataForChat(latestData);
        this.isProcessingChat = false;
    }

    parseTerminalDataForChat(data) {
        try {
            const cleanData = data.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').trim();
            
            // Claude Code (⏺) と Gemini Code Assist (✦) の両方に対応
            let markerIndex = cleanData.indexOf('⏺');
            if (markerIndex === -1) {
                markerIndex = cleanData.indexOf('✦');
            }
            if (markerIndex === -1) return;
            
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
            debugLog('Original text:', afterMarker);
            debugLog('Quoted matches:', quotedTextMatches);
            
            if (quotedTextMatches && quotedTextMatches.length > 0) {
                // カギカッコ内のテキストを一個ずつ処理
                debugLog('Found quoted text, processing only quoted content');
                this.processQuotedTexts(quotedTextMatches);
                return; // カギカッコ処理の場合は通常の処理をスキップ
            } else {
                // カギカッコがない場合は読み上げをスキップ
                debugLog('No quoted text found, skipping speech synthesis.');
                return; // 読み上げをスキップ
            }

        } catch (error) {
            console.warn('Chat parsing error:', error);
        }
    }

    // カッコ内のテキストを一個ずつ順次処理
    async processQuotedTexts(quotedTextMatches) {
        debugLog('Processing quoted texts:', quotedTextMatches);
        
        for (let i = 0; i < quotedTextMatches.length; i++) {
            let quotedText = quotedTextMatches[i].replace(/[「」]/g, '').trim();
            
            // 改行と余分な空白を除去
            quotedText = quotedText.replace(/\r?\n\s*/g, '').replace(/\s+/g, ' ').trim();
            
            debugLog(`Original quoted text: "${quotedText}"`);
            
            
            // 空のテキストはスキップ
            if (quotedText.length === 0) {
                debugLog('Skipping empty text');
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
            }
            
            // 次のテキストまで少し間隔を開ける
            if (i < quotedTextMatches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
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
                await this.configManager.writeAiMdToHomeDir(aiType);
                this.addVoiceMessage('ことね', `${aiMdFilename}を更新したよ！`);

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

                // 停止したAIに応じて.mdファイルを削除
                const aiMdFilename = this.currentRunningAI === 'claude' ? 'CLAUDE.md' : 'GEMINI.md';
                if (this.currentRunningAI) { // 念のためnullチェック
                    await this.configManager.deleteAiMdFromHomeDir(this.currentRunningAI);
                    this.addVoiceMessage('ことね', `${aiMdFilename}を削除したよ！`);
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

        // ユーザー設定を統一設定システムから読み込み
        this.voiceEnabled = await unifiedConfig.get('voiceEnabled', this.voiceEnabled);
        this.selectedSpeaker = await unifiedConfig.get('selectedSpeaker', this.selectedSpeaker);

        // 壁紙設定の復元は WallpaperSystem モジュールで処理

        // 設定を統一設定システムに保存
        await unifiedConfig.set('selectedSpeaker', this.selectedSpeaker);

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
            
            // 現在選択中の話者IDを優先的に使用
            let targetSpeakerId = this.selectedSpeaker;
            
            // 現在の選択が無効または未設定の場合、設定ファイルから読み込み
            if (!targetSpeakerId || targetSpeakerId === 0) {
                if (window.electronAPI && window.electronAPI.config) {
                    try {
                        targetSpeakerId = await window.electronAPI.config.get('defaultSpeakerId');
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
        if (!window.electronAPI || !window.electronAPI.voice || !this.voiceEnabled || this.connectionStatus !== 'connected') {
            return;
        }

        // 重複チェックを実行
        if (this.speechHistory.isDuplicate(text)) {
            debugLog('🔄 重複テキストをスキップ:', text.substring(0, 30) + '...');
            return;
        }

        try {
            debugLog('Speaking text:', text, 'with speaker:', this.selectedSpeaker);
            
            // 読み上げ履歴に追加
            this.speechHistory.addToHistory(text);
            
            await window.electronAPI.voice.speak(text, this.selectedSpeaker);
        } catch (error) {
            debugError('Failed to speak text:', error);
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

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TerminalApp();
});