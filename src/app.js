// xtermライブラリはCDNから読み込み

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
        this.init();
    }

    init() {
        // xtermライブラリが読み込まれるまで待機
        if (typeof Terminal === 'undefined') {
            console.log('xterm.jsを読み込み中...');
            setTimeout(() => this.init(), 100);
            return;
        }
        
        this.setupTerminal();
        this.setupEventListeners();
        this.setupChatInterface();
        this.setupWallpaperSystem();
        this.updateStatus('Ready');
        this.checkVoiceConnection();
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
                foreground: '#FF8C42',
                cursor: '#FF6B35',
                cursorAccent: '#FFFFFF',
                selection: 'rgba(255, 140, 66, 0.3)',
                black: '#8B4513',
                red: '#FF6B35',
                green: '#32CD32',
                yellow: '#B8860B',
                blue: '#4682B4',
                magenta: '#FF8C42',
                cyan: '#20B2AA',
                white: '#696969',
                brightBlack: '#A0522D',
                brightRed: '#FF8C42',
                brightGreen: '#90EE90',
                brightYellow: '#CD853F',
                brightBlue: '#5F9EA0',
                brightMagenta: '#FFB366',
                brightCyan: '#E0FFFF',
                brightWhite: '#2F4F4F'
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
            console.error('electronAPI not available');
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

        this.updateButtons();
        this.updateVoiceControls();
    }

    setupChatInterface() {
        const chatInput = document.getElementById('chat-input');
        const sendButton = document.getElementById('send-button');

        if (chatInput && sendButton) {
            // チャット入力のイベントリスナー
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault(); // デフォルト動作を防ぐ
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
        this.addVoiceMessage('ことね', 'こんにちは〜！✨ 何をお手伝いしましょうか？');
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
            console.log('Original text:', afterCircle);
            console.log('Quoted matches:', quotedTextMatches);
            
            if (quotedTextMatches && quotedTextMatches.length > 0) {
                // カッコ内のテキストを一個ずつ処理
                console.log('Found quoted text, processing only quoted content');
                this.processQuotedTexts(quotedTextMatches);
                return; // カッコ処理の場合は通常の処理をスキップ
            } else {
                // カッコがない場合は読み上げしない
                console.log('No quoted text found, skipping voice synthesis');
                return;
            }

        } catch (error) {
            console.warn('Chat parsing error:', error);
        }
    }

    // カッコ内のテキストを一個ずつ順次処理
    async processQuotedTexts(quotedTextMatches) {
        console.log('Processing quoted texts:', quotedTextMatches);
        
        for (let i = 0; i < quotedTextMatches.length; i++) {
            let quotedText = quotedTextMatches[i].replace(/[「」]/g, '').trim();
            
            // 改行と余分な空白を除去
            quotedText = quotedText.replace(/\r?\n\s*/g, '').replace(/\s+/g, ' ').trim();
            
            console.log(`Original quoted text: "${quotedText}"`);
            
            
            // 空のテキストはスキップ
            if (quotedText.length === 0) {
                console.log('Skipping empty text');
                continue;
            }
            
            console.log(`Processing quote ${i + 1}/${quotedTextMatches.length}: "${quotedText}"`);
            
            // DOM操作を最小化
            requestAnimationFrame(() => {
                this.addVoiceMessage('ことね', quotedText);
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
        
        console.log('🔊 Speaking sequentially:', text);
        console.trace('Call stack for speech:');
        return this.speakText(text);
    }

    sendChatMessage() {
        const chatInput = document.getElementById('chat-input');
        if (!chatInput) return;

        const message = chatInput.value.trim();
        if (!message) return;

        chatInput.value = '';

        // Claude Codeにメッセージを送信して完全に送信まで実行
        if (this.isTerminalRunning && window.electronAPI && window.electronAPI.terminal) {
            console.log('Sending message to terminal:', message);
            // 確実にコマンドを実行させる
            window.electronAPI.terminal.write(message + '\r');
            this.updateCharacterMood('考え中...');
            
            // 入力後にターミナルにフォーカスを戻す
            setTimeout(() => {
                if (this.terminal) {
                    this.terminal.focus();
                }
            }, 100);
        } else {
            console.error('Cannot send message:', {
                isTerminalRunning: this.isTerminalRunning,
                hasElectronAPI: !!window.electronAPI,
                hasTerminalAPI: !!(window.electronAPI && window.electronAPI.terminal)
            });
            this.addVoiceMessage('ことね', 'Claude Codeが起動してないよ〜！先にStartボタンを押してね！');
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
                this.terminal.writeln('\x1b[90m🎀 AI Kawaii Claude Code Integration Started! 🎀\x1b[0m');
                this.terminal.writeln('\x1b[90mClaude Code is starting up...\x1b[0m');
                
                // 音声メッセージで通知
                this.addVoiceMessage('ことね', 'Claude Codeが起動したよ〜！✨');
                
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
            console.error('Error starting Claude Code:', error);
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
            console.error('Error stopping Claude Code:', error);
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
    
    syncSettingsToModal() {
        const voiceToggleModal = document.getElementById('voice-toggle-modal');
        const speakerSelectModal = document.getElementById('speaker-select-modal');
        const cooldownInputModal = document.getElementById('voice-cooldown-modal');
        
        if (voiceToggleModal) {
            voiceToggleModal.checked = this.voiceEnabled;
        }
        if (speakerSelectModal) {
            speakerSelectModal.value = this.selectedSpeaker;
        }
        if (cooldownInputModal) {
            cooldownInputModal.value = this.speechCooldown / 1000;
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
                console.error('Voice connection check failed:', error);
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
                    console.log('Loaded speakers:', this.speakers);
                    this.updateSpeakerSelect();
                }
            } catch (error) {
                console.error('Failed to load speakers:', error);
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
        console.log('🔍 speakText conditions:', {
            electronAPI: !!window.electronAPI,
            voice: !!window.electronAPI?.voice,
            voiceEnabled: this.voiceEnabled,
            connectionStatus: this.connectionStatus
        });
        
        if (!window.electronAPI || !window.electronAPI.voice || !this.voiceEnabled || this.connectionStatus !== 'connected') {
            console.log('❌ speakText blocked by conditions');
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
            console.log('Speaking text:', text, 'with speaker:', this.selectedSpeaker);
            this.lastSpeechTime = now;
            this.lastSpeechText = text;
            await window.electronAPI.voice.speak(text, this.selectedSpeaker);
        } catch (error) {
            console.error('Failed to speak text:', error);
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
                console.log('🎭 iframeにpostMessage送信, サイズ:', audioArray.length);
            } else {
                console.log('🎭 VRM iframe未発見');
            }
        } catch (error) {
            console.error('🎭 VRM音声データ送信エラー:', error);
        }
    }

    async playAudio(audioData) {
        console.log('🎵 playAudio called with data size:', audioData?.length || audioData?.byteLength || 'unknown');
        
        // 既に再生中の場合はスキップ（キューに溜めない）
        if (this.isPlaying) {
            console.log('Audio already playing, skipping...');
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
            console.log('🎵 Decoding audio data, size:', arrayBuffer.byteLength);
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            console.log('🎵 Audio decoded successfully, duration:', audioBuffer.duration, 'seconds');
            
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            
            source.onended = () => {
                console.log('🎵 Audio playback ended');
                this.currentAudio = null;
                this.isPlaying = false;
            };

            // VRMビューワーに音声データを送信（専用コピーを使用）
            this.sendAudioToVRM(vrmArrayBuffer);
            
            this.currentAudio = source;
            this.isPlaying = true;
            console.log('🎵 Starting audio playback...');
            
            source.start();
        } catch (error) {
            console.error('Failed to play audio:', error);
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
                console.error('Failed to stop voice:', error);
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
            console.error('壁紙リスト読み込みエラー:', error);
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
                this.addVoiceMessage('ことね', '壁紙がアップロードできたよ〜！✨');
                
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
            console.error('壁紙アップロードエラー:', error);
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
            this.addVoiceMessage('ことね', 'デフォルト壁紙に戻したよ〜！✨');
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TerminalApp();
});