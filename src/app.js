// xtermライブラリはCDNから読み込み

// デバッグログ制御（本番環境では無効化）
const isDev = !window.location.protocol.startsWith('file:') || process.env.NODE_ENV === 'development';
const debugLog = isDev ? console.log : () => {};
const debugTrace = isDev ? console.trace : () => {};
const debugError = console.error; // エラーは常に出力

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
        this.audioQueue = [];
        this.lastSpeechTime = 0;
        this.speechCooldown = 500; // 0.5秒に短縮
        this.lastSpeechText = '';
        this.chatMessages = [];
        this.lastChatMessage = '';
        this.lastChatTime = 0;
        
        // VRM口パク用通信（postMessage使用）
        this.vrmWebSocket = null;
        
        // パフォーマンス最適化用
        this.chatParseQueue = [];
        this.chatParseTimer = null;
        this.isProcessingChat = false;
        this.claudeWorkingDir = ''; // Claude Code作業ディレクトリの初期値

        // 音声認識関連のプロパティ
        this.speechRecognition = null;
        this.isListening = false;
        this.recognitionTimeout = null; // 認識自動停止用のタイマー

        this.init();
    }

    init() {
        // xtermライブラリが読み込まれるまで待機
        if (typeof Terminal === 'undefined') {
            debugLog('xterm.jsを読み込み中...');
            setTimeout(() => this.init(), 100);
            return;
        }
        
        this.setupTerminal();
        this.setupEventListeners();
        this.setupChatInterface();
        this.setupWallpaperSystem();
        this.updateStatus('Ready');
        this.checkVoiceConnection();

        // CLAUDE.mdのパスを受け取る
        if (window.electronAPI && window.electronAPI.onClaudeMdPath) {
            window.electronAPI.onClaudeMdPath((path) => {
                this.claudeMdPath = path;
                debugLog('Received CLAUDE.md path:', this.claudeMdPath);
                // ここでCLAUDE.mdを読み込む関数を呼び出す（後で実装）
                this.loadClaudeMdContent();
            });
        }
    }

    setupTerminal() {
        this.terminal = new Terminal({
            fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
            fontSize: 14,
            lineHeight: 1.3,
            cursorBlink: true,
            cursorStyle: 'block',
            theme: {
                background: '#FFF8F0',
                foreground: '#6F4F3F',
                cursor: '#FF6B35',
                cursorAccent: '#FFFFFF',
                selection: 'rgba(255, 140, 66, 0.7)',
                black: '#3A2718',
                red: '#D9481E',
                green: '#5D8B4F',
                yellow: '#E0A800',
                blue: '#4C6C8B',
                magenta: '#B35D7A',
                cyan: '#5F9E9D',
                white: '#8A6B5B',
                brightBlack: '#5C4430',
                brightRed: '#FF6B35',
                brightGreen: '#8ED37E',
                brightYellow: '#FFC800',
                brightBlue: '#7AA0C2',
                brightMagenta: '#E68BAA',
                brightCyan: '#82D1CE',
                brightWhite: '#B8A090'
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
                // チャット解析をバッチ処理で高速化
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

    setupEventListeners() {
        const startBtn = document.getElementById('start-terminal');
        const stopBtn = document.getElementById('stop-terminal');
        const settingsBtn = document.getElementById('settings-btn');
        const closeSettingsBtn = document.getElementById('close-settings');
        const settingsModal = document.getElementById('settings-modal');

        startBtn.addEventListener('click', () => this.startTerminal());
        stopBtn.addEventListener('click', () => this.stopTerminal());
        
        // 設定モーダルのイベント
        settingsBtn.addEventListener('click', () => {
            settingsModal.style.display = 'flex';
            this.syncSettingsToModal();
        });
        
        closeSettingsBtn.addEventListener('click', () => {
            settingsModal.style.display = 'none';
        });
        
        // モーダル外クリックで閉じる
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                settingsModal.style.display = 'none';
            }
        });

        // 設定モーダル内のコントロール
        const voiceToggleModal = document.getElementById('voice-toggle-modal');
        const speakerSelectModal = document.getElementById('speaker-select-modal');
        const stopVoiceBtnModal = document.getElementById('stop-voice-modal');
        const refreshConnectionBtnModal = document.getElementById('refresh-connection-modal');
        const cooldownInputModal = document.getElementById('voice-cooldown-modal');

        if (voiceToggleModal) {
            voiceToggleModal.addEventListener('change', (e) => {
                this.voiceEnabled = e.target.checked;
                this.updateVoiceControls();
            });
        }

        if (speakerSelectModal) {
            speakerSelectModal.addEventListener('change', (e) => {
                this.selectedSpeaker = parseInt(e.target.value);
            });
        }

        if (cooldownInputModal) {
            cooldownInputModal.addEventListener('input', (e) => {
                this.speechCooldown = parseFloat(e.target.value) * 1000;
            });
        }

        if (stopVoiceBtnModal) {
            stopVoiceBtnModal.addEventListener('click', () => this.stopVoice());
        }

        if (refreshConnectionBtnModal) {
            refreshConnectionBtnModal.addEventListener('click', () => this.checkVoiceConnection());
        }

        // Claude Code 作業ディレクトリ設定のイベントリスナー
        const selectClaudeCwdBtn = document.getElementById('select-claude-cwd-btn');
        if (selectClaudeCwdBtn) {
            selectClaudeCwdBtn.addEventListener('click', () => this.handleSelectClaudeCwd());
        }

        // マイクボタンのイベントリスナー
        const micButton = document.getElementById('mic-button');
        if (micButton) {
            micButton.addEventListener('click', () => this.toggleSpeechRecognition());
        }

        this.updateButtons();
        this.updateVoiceControls();
    }

    setupChatInterface() {
        const chatInput = document.getElementById('chat-input');
        const sendButton = document.getElementById('send-button');

        if (chatInput && sendButton) {
            // チャット入力のイベントリスナー
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault(); // デフォルト動作を防ぐ
                    e.stopPropagation(); // イベントの伝播を停止
                    this.sendChatMessage();
                }
            });
            
            // フォーカス時にターミナルへの入力を防ぐ
            chatInput.addEventListener('focus', () => {
                if (this.terminal) {
                    this.terminal.blur();
                }
            });

            sendButton.addEventListener('click', () => {
                this.sendChatMessage();
            });
        }

        // クイックボタンは削除済み

        // 初期メッセージを追加（音声読み上げ用）
        this.addVoiceMessage('クロード', 'こんにちは〜！✨ 何をお手伝いしましょうか？');
    }


    // バッチ処理でチャット解析を最適化
    queueChatParsing(data) {
        if (!data.includes('⏺')) return;
        
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
            const circleIndex = cleanData.indexOf('⏺');
            if (circleIndex === -1) return;
            
            let afterCircle = cleanData.substring(circleIndex + 1).trim();
            
            // 文字列クリーニング（音声読み上げ用）
            afterCircle = afterCircle
                    .replace(/^[⚒↓⭐✶✻✢·✳]+\s*/g, '')
                    .replace(/\s*[✢✳✶✻✽·⚒↓↑]\s*(Synthesizing|Conjuring|Spinning|Vibing|Computing|Mulling|Pondering|musing|thinking).*$/gi, '')
                    .replace(/\s*\([0-9]+s[^)]*\).*$/g, '')
                    .replace(/\s*tokens.*$/gi, '')
                    .trim();
            
            // カッコ内のテキストを抽出（音声読み上げ用）
            const quotedTextMatches = afterCircle.match(/「([^」]+)」/g);
            debugLog('Original text:', afterCircle);
            debugLog('Quoted matches:', quotedTextMatches);
            
            if (quotedTextMatches && quotedTextMatches.length > 0) {
                // カッコ内のテキストを一個ずつ処理
                debugLog('Found quoted text, processing only quoted content');
                this.processQuotedTexts(quotedTextMatches);
                return; // カッコ処理の場合は通常の処理をスキップ
            } else {
                // カッコがない場合は読み上げしない
                debugLog('No quoted text found, skipping voice synthesis');
                return;
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
            
            debugLog(`Processing quote ${i + 1}/${quotedTextMatches.length}: "${quotedText}"`);
            
            // DOM操作を最小化
            requestAnimationFrame(() => {
                this.addVoiceMessage('クロード', quotedText);
                this.updateCharacterMood('おしゃべり中✨');
            });
            
            // 音声読み上げ実行（前の音声が終わるまで待機）
            if (this.voiceEnabled) {
                await this.speakTextSequential(quotedText);
            }
            
            // 次のテキストまで少し間隔を開ける
            if (i < quotedTextMatches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }
    }

    // 順次音声再生用メソッド
    async speakTextSequential(text) {
        // 前の音声が再生中の場合は終了まで待機
        while (this.isPlaying) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        debugLog('🔊 Speaking sequentially:', text);
        debugTrace('Call stack for speech:');
        return this.speakText(text);
    }

    sendChatMessage() {
        const chatInput = document.getElementById('chat-input');
        if (!chatInput) return;

        const message = chatInput.value.trim();
        if (!message) return;

        // Claude Codeにメッセージを送信して完全に送信まで実行
        if (this.isTerminalRunning && window.electronAPI && window.electronAPI.terminal) {
            debugLog('Sending message to terminal:', message);
            // タイピング風に送信（Claude Codeのターミナル処理に合わせる）
            setTimeout(() => {
                window.electronAPI.terminal.write(message + '\r');
            }, 100);
            this.updateCharacterMood('考え中...');
            
            // 送信完了後に入力エリアをクリア（非同期で確実に実行）
            setTimeout(() => {
                chatInput.value = '';
                chatInput.blur(); // フォーカスを外す
            }, 50);
            
            // 入力後にターミナルにフォーカスを戻す（遅延を長くして確実に処理完了を待つ）
            setTimeout(() => {
                if (this.terminal) {
                    this.terminal.focus();
                }
            }, 300);
        } else {
            debugError('Cannot send message:', {
                isTerminalRunning: this.isTerminalRunning,
                hasElectronAPI: !!window.electronAPI,
                hasTerminalAPI: !!(window.electronAPI && window.electronAPI.terminal)
            });
            this.addVoiceMessage('クロード', 'Claude Codeが起動してないよ〜！先にStartボタンを押してね！');
        }
    }

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

    async startTerminal() {
        try {
            if (!window.electronAPI || !window.electronAPI.terminal) {
                this.updateStatus('ElectronAPI not available');
                return;
            }
            
            this.updateStatus('Starting Claude Code...');
            const result = await window.electronAPI.terminal.start();
            
            if (result.success) {
                this.isTerminalRunning = true;
                this.updateStatus('Claude Code running - Type your message and press Enter');
                this.terminal.focus();
                
                // Show app welcome message
                this.terminal.writeln('\x1b[90m🎀 KawAIi Code Integration Started! 🎀\x1b[0m');
                this.terminal.writeln('\x1b[90mClaude Code is starting up...\x1b[0m');
                
                // 音声メッセージで通知
                this.addVoiceMessage('クロード', 'Claude Codeが起動したよ〜！✨');
                
                // Resize terminal to fit
                setTimeout(() => {
                    this.fitAddon.fit();
                    window.electronAPI.terminal.resize(
                        this.terminal.cols,
                        this.terminal.rows
                    );
                }, 100);
            } else {
                this.updateStatus('Failed to start Claude Code');
            }
        } catch (error) {
            debugError('Error starting Claude Code:', error);
            this.updateStatus('Error starting Claude Code');
        }
        
        this.updateButtons();
    }

    async stopTerminal() {
        try {
            if (!window.electronAPI || !window.electronAPI.terminal) {
                this.updateStatus('ElectronAPI not available');
                return;
            }
            
            this.updateStatus('Stopping Claude Code...');
            const result = await window.electronAPI.terminal.stop();
            
            if (result.success) {
                this.isTerminalRunning = false;
                this.updateStatus('Claude Code stopped');
                this.terminal.clear();
            } else {
                this.updateStatus('Failed to stop Claude Code');
            }
        } catch (error) {
            debugError('Error stopping Claude Code:', error);
            this.updateStatus('Error stopping Claude Code');
        }
        
        this.updateButtons();
    }

    updateStatus(message) {
        const statusElement = document.getElementById('status');
        if (statusElement) {
            statusElement.textContent = message;
        }
    }

    updateButtons() {
        const startBtn = document.getElementById('start-terminal');
        const stopBtn = document.getElementById('stop-terminal');
        
        if (startBtn && stopBtn) {
            startBtn.disabled = this.isTerminalRunning;
            stopBtn.disabled = !this.isTerminalRunning;
        }
    }

    updateVoiceControls() {
        const speakerSelectModal = document.getElementById('speaker-select-modal');
        const stopVoiceBtnModal = document.getElementById('stop-voice-modal');
        const voiceToggleModal = document.getElementById('voice-toggle-modal');
        const cooldownInputModal = document.getElementById('voice-cooldown-modal');
        const refreshConnectionBtnModal = document.getElementById('refresh-connection-modal');

        const canUseVoice = this.connectionStatus === 'connected';

        if (voiceToggleModal) {
            voiceToggleModal.disabled = !canUseVoice;
        }
        if (speakerSelectModal) {
            speakerSelectModal.disabled = !this.voiceEnabled || !canUseVoice;
        }
        if (cooldownInputModal) {
            cooldownInputModal.disabled = !this.voiceEnabled || !canUseVoice;
        }
        if (stopVoiceBtnModal) {
            stopVoiceBtnModal.disabled = !this.voiceEnabled || !canUseVoice;
        }
        if (refreshConnectionBtnModal) {
            refreshConnectionBtnModal.disabled = false;
        }
    }
    
    async syncSettingsToModal() {
        // 音声読み上げ設定の同期
        const voiceToggleModal = document.getElementById('voice-toggle-modal');
        const speakerSelectModal = document.getElementById('speaker-select-modal');
        const cooldownInputModal = document.getElementById('voice-cooldown-modal');
        const connectionStatusModal = document.getElementById('connection-status-modal');

        if (voiceToggleModal) voiceToggleModal.checked = this.voiceEnabled;
        if (cooldownInputModal) cooldownInputModal.value = (this.speechCooldown / 1000).toString();
        this.updateSpeakerSelect();
        this.updateConnectionStatus(this.connectionStatus === 'connected' ? '接続済み' : '未接続', this.connectionStatus);

        // 壁紙設定の同期 - ロード時に選択肢を更新する
        await this.loadWallpaperList();

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
                    this.updateSpeakerSelect();
                }
            } catch (error) {
                debugError('Failed to load speakers:', error);
            }
        }
    }

    updateSpeakerSelect() {
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
            // 最初の話者を自動選択
            if (this.speakers[0] && this.speakers[0].styles[0]) {
                this.selectedSpeaker = this.speakers[0].styles[0].id;
                speakerSelectModal.value = this.selectedSpeaker;
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
        debugLog('🔍 speakText conditions:', {
            electronAPI: !!window.electronAPI,
            voice: !!window.electronAPI?.voice,
            voiceEnabled: this.voiceEnabled,
            connectionStatus: this.connectionStatus
        });
        
        if (!window.electronAPI || !window.electronAPI.voice || !this.voiceEnabled || this.connectionStatus !== 'connected') {
            debugLog('❌ speakText blocked by conditions');
            return;
        }

        const now = Date.now();
        
        // クールダウン期間中はスキップ（ただし、明らかに新しい内容の場合は例外）
        const isSignificantlyDifferent = text.length > this.lastSpeechText.length + 20;
        if (now - this.lastSpeechTime < this.speechCooldown && !isSignificantlyDifferent) {
            return;
        }

        // 同じテキストの重複を防ぐ（ただし、前回より長い場合は新しい内容として扱う）
        if (text === this.lastSpeechText || (text.length <= this.lastSpeechText.length && this.lastSpeechText.includes(text))) {
            return;
        }

        // 音声再生中は新しい音声をキューに追加せずスキップ（ただし、大幅に長い場合は割り込み）
        if (this.isPlaying && !isSignificantlyDifferent) {
            return;
        }

        // 長い文章の場合は前の音声を停止して新しい音声を再生
        if (this.isPlaying && isSignificantlyDifferent) {
            this.stopAudio();
            await new Promise(resolve => setTimeout(resolve, 100)); // 少し待つ
        }

        try {
            debugLog('Speaking text:', text, 'with speaker:', this.selectedSpeaker);
            this.lastSpeechTime = now;
            this.lastSpeechText = text;
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
                }, 'http://localhost:3002');
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
        
        // 既に再生中の場合はスキップ（キューに溜めない）
        if (this.isPlaying) {
            debugLog('Audio already playing, skipping...');
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

    processAudioQueue() {
        // キューシステムを削除（CPU負荷軽減のため）
        // 音声は即座に再生するか、再生中の場合はスキップ
    }

    stopAudio() {
        if (this.currentAudio) {
            this.currentAudio.stop();
            this.currentAudio = null;
            this.isPlaying = false;
        }
        // キューをクリア（削除）
        this.lastSpeechTime = 0;
        this.lastSpeechText = '';
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

    // 壁紙システムの初期化
    setupWallpaperSystem() {
        this.loadWallpaperList();
        this.setupWallpaperListeners();
    }

    // 壁紙リストを読み込み
    async loadWallpaperList() {
        try {
            const response = await window.electronAPI.wallpaper.getWallpaperList();
            if (response.success) {
                const select = document.getElementById('wallpaper-select');
                if (select) {
                    // デフォルトオプションを残して他をクリア
                    select.innerHTML = '<option value="default">デフォルト壁紙</option>';
                    
                    // ユーザー壁紙を追加
                    response.wallpapers.forEach(wallpaper => {
                        const option = document.createElement('option');
                        option.value = wallpaper.filename;
                        option.textContent = wallpaper.name;
                        select.appendChild(option);
                    });
                    
                    // 保存されている壁紙設定を復元
                    const savedWallpaper = localStorage.getItem('selectedWallpaper');
                    if (savedWallpaper) {
                        select.value = savedWallpaper;
                        this.applyWallpaper(savedWallpaper);
                    }
                }
            }
        } catch (error) {
            debugError('壁紙リスト読み込みエラー:', error);
        }
    }

    // 壁紙関連のイベントリスナーを設定
    setupWallpaperListeners() {
        const wallpaperSelect = document.getElementById('wallpaper-select');
        const uploadBtn = document.getElementById('upload-wallpaper-btn');
        const uploadInput = document.getElementById('wallpaper-upload');
        const resetBtn = document.getElementById('reset-wallpaper-btn');

        if (wallpaperSelect) {
            wallpaperSelect.addEventListener('change', (e) => {
                const selectedWallpaper = e.target.value;
                this.applyWallpaper(selectedWallpaper);
                localStorage.setItem('selectedWallpaper', selectedWallpaper);
            });
        }

        if (uploadBtn && uploadInput) {
            uploadBtn.addEventListener('click', () => {
                uploadInput.click();
            });

            uploadInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    await this.uploadWallpaper(file);
                }
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.resetWallpaper();
            });
        }
    }

    // 壁紙を適用
    applyWallpaper(wallpaperName) {
        const body = document.body;
        
        if (wallpaperName === 'default') {
            // デフォルト壁紙（背景1.png）
            const defaultWallpaperPath = 'assets/wallpapers/default/default.png';
            body.style.background = `url('${defaultWallpaperPath}') center/cover fixed`;
            body.style.backgroundAttachment = 'fixed';
        } else {
            // ユーザー壁紙
            const wallpaperPath = `assets/wallpapers/user/${wallpaperName}`;
            body.style.background = `url('${wallpaperPath}') center/cover fixed`;
            body.style.backgroundAttachment = 'fixed';
        }
    }

    // 壁紙をアップロード
    async uploadWallpaper(file) {
        try {
            // ファイルサイズチェック（5MB制限）
            if (file.size > 5 * 1024 * 1024) {
                alert('ファイルサイズが大きすぎます（5MB以下にしてください）');
                return;
            }

            // ファイル形式チェック
            const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
            if (!allowedTypes.includes(file.type)) {
                alert('対応していないファイル形式です（PNG、JPEG、GIF、WebPのみ）');
                return;
            }

            const response = await window.electronAPI.wallpaper.uploadWallpaper(file);
            if (response.success) {
                // 成功メッセージ
                this.addVoiceMessage('クロード', '壁紙がアップロードできたよ〜！✨');
                
                // 壁紙リストを再読み込み
                await this.loadWallpaperList();
                
                // アップロードした壁紙を自動選択
                const select = document.getElementById('wallpaper-select');
                if (select) {
                    select.value = response.filename;
                    this.applyWallpaper(response.filename);
                    localStorage.setItem('selectedWallpaper', response.filename);
                }
            } else {
                alert('壁紙のアップロードに失敗しました');
            }
        } catch (error) {
            debugError('壁紙アップロードエラー:', error);
            alert('壁紙のアップロードに失敗しました');
        }
    }

    // 壁紙をリセット
    resetWallpaper() {
        const select = document.getElementById('wallpaper-select');
        if (select) {
            select.value = 'default';
            this.applyWallpaper('default');
            localStorage.removeItem('selectedWallpaper');
            this.addVoiceMessage('クロード', 'デフォルト壁紙に戻したよ〜！✨');
        }
    }

    // 新しいメソッド: 音声認識の開始/停止
    toggleSpeechRecognition() {
        if (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)) {
            alert('お使いのブラウザは音声認識をサポートしていません。Chromeをご利用ください。');
            return;
        }

        if (this.isListening) {
            this.stopSpeechRecognition();
        } else {
            this.startSpeechRecognition();
        }
    }

    // 新しいメソッド: 音声認識の開始
    startSpeechRecognition() {
        // 既存の認識インスタンスがあれば停止
        if (this.speechRecognition) {
            this.speechRecognition.stop();
            this.speechRecognition = null;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.speechRecognition = new SpeechRecognition();
        this.speechRecognition.lang = 'ja-JP'; // 日本語に設定
        this.speechRecognition.interimResults = true; // 中間結果も取得
        this.speechRecognition.continuous = true; // 連続認識

        // 認識結果イベント
        this.speechRecognition.onresult = (event) => {
            let interimTranscript = ''; // 中間結果
            let finalTranscript = ''; // 最終結果

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            // 最終結果が確定したらターミナルに送信
            if (finalTranscript) {
                console.log('Final:', finalTranscript);
                this.terminal.write('\x1b[92m[You]: ' + finalTranscript + '\r\n\x1b[0m'); // 色付きで表示
                window.electronAPI.sendChatMessage(finalTranscript); // Claude Codeに送信
            }
            // タイムアウトをリセット
            clearTimeout(this.recognitionTimeout);
            this.recognitionTimeout = setTimeout(() => {
                this.stopSpeechRecognition();
            }, 5000); // 5秒間音声がない場合停止
        };

        // エラーイベント
        this.speechRecognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            this.terminal.write(`\r\n\x1b[91m音声認識エラー: ${event.error}\x1b[0m\r\n`);
            this.stopSpeechRecognition();
        };

        // 認識終了イベント
        this.speechRecognition.onend = () => {
            console.log('音声認識が終了しました。');
            this.isListening = false;
            this.updateMicButtonUI();
            clearTimeout(this.recognitionTimeout);
        };

        this.speechRecognition.start();
        this.isListening = true;
        this.updateMicButtonUI();

        // 初回起動時のタイムアウト設定
        this.recognitionTimeout = setTimeout(() => {
            this.stopSpeechRecognition();
        }, 5000); // 5秒間音声がない場合停止
    }

    // 新しいメソッド: 音声認識の停止
    stopSpeechRecognition() {
        if (this.speechRecognition) {
            this.speechRecognition.stop();
            this.speechRecognition = null; // インスタンスをクリア
        }
        this.isListening = false;
        this.updateMicButtonUI();
        clearTimeout(this.recognitionTimeout);
    }

    // 新しいメソッド: マイクボタンのUI更新
    updateMicButtonUI() {
        const micButton = document.getElementById('mic-button');
        if (micButton) {
            if (this.isListening) {
                micButton.classList.add('listening'); // 認識中のスタイルを適用
                micButton.setAttribute('aria-label', '音声入力中');
            } else {
                micButton.classList.remove('listening'); // 認識中のスタイルを解除
                micButton.setAttribute('aria-label', '音声入力');
            }
        }
    }

    async loadClaudeMdContent() {
        if (!this.claudeMdPath) {
            debugError('CLAUDE.md path is not set.');
            return;
        }
        try {
            // Electronのfsモジュールを使用してファイルを読み込む
            const fs = window.electronAPI.fs; // preload.jsでfsを公開していると仮定
            if (!fs) {
                debugError('fs module not available via electronAPI.');
                return;
            }
            const content = await fs.promises.readFile(this.claudeMdPath, 'utf8');
            this.claudeMdContent = content;
            debugLog('CLAUDE.md content loaded successfully:', content.substring(0, 200) + '...'); // 最初の200文字を表示
            // ここで読み込んだ内容をアプリケーションのロジックに組み込む
        } catch (error) {
            debugError('Failed to load CLAUDE.md content:', error);
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TerminalApp();
});