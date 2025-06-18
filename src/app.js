const { Terminal } = require('@xterm/xterm');
const { FitAddon } = require('@xterm/addon-fit');
const { WebLinksAddon } = require('@xterm/addon-web-links');

class TerminalApp {
    constructor() {
        this.terminal = null;
        this.fitAddon = null;
        this.isTerminalRunning = false;
        this.voiceEnabled = false;
        this.selectedSpeaker = 0;
        this.connectionStatus = 'disconnected';
        this.speakers = [];
        this.audioContext = null;
        this.currentAudio = null;
        this.isPlaying = false;
        this.audioQueue = [];
        this.lastSpeechTime = 0;
        this.speechCooldown = 1000; // 1秒のクールダウン（短縮）
        this.lastSpeechText = '';
        this.chatMessages = []; // チャットメッセージ履歴
        this.lastChatMessage = ''; // 重複チャット防止
        this.lastChatTime = 0; // 重複チャット防止
        this.init();
    }

    init() {
        this.setupTerminal();
        this.setupEventListeners();
        this.setupChatInterface();
        this.updateStatus('Ready');
        this.checkVoiceConnection();
    }

    setupTerminal() {
        this.terminal = new Terminal({
            fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
            fontSize: 14,
            lineHeight: 1.2,
            cursorBlink: true,
            cursorStyle: 'block',
            theme: {
                background: 'transparent',
                foreground: '#00ff41',
                cursor: '#00ff41',
                cursorAccent: '#000000',
                selection: 'rgba(255, 255, 255, 0.3)',
                black: '#000000',
                red: '#ff6c6b',
                green: '#98be65',
                yellow: '#ecbe7b',
                blue: '#51afef',
                magenta: '#c678dd',
                cyan: '#46d9ff',
                white: '#ffffff',
                brightBlack: '#686868',
                brightRed: '#ff7474',
                brightGreen: '#a4c76d',
                brightYellow: '#f4c67a',
                brightBlue: '#6bb2ff',
                brightMagenta: '#d084e5',
                brightCyan: '#5ee9ff',
                brightWhite: '#ffffff'
            },
            allowTransparency: true,
            convertEol: true,
            scrollback: 1000,
            tabStopWidth: 4
        });

        this.fitAddon = new FitAddon();
        this.terminal.loadAddon(this.fitAddon);
        this.terminal.loadAddon(new WebLinksAddon());

        const terminalElement = document.getElementById('terminal-mini');
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
                // チャット用の解析は少し遅延させて重複を防ぐ
                setTimeout(() => {
                    this.parseTerminalDataForChat(data);
                }, 100);
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

        // Handle voice text available
        if (window.electronAPI && window.electronAPI.voice) {
            window.electronAPI.voice.onTextAvailable((text) => {
                if (this.voiceEnabled) {
                    this.speakText(text);
                }
            });

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

        startBtn.addEventListener('click', () => this.startTerminal());
        stopBtn.addEventListener('click', () => this.stopTerminal());

        // Voice control events
        const voiceToggle = document.getElementById('voice-toggle');
        const speakerSelect = document.getElementById('speaker-select');
        const stopVoiceBtn = document.getElementById('stop-voice');
        const refreshConnectionBtn = document.getElementById('refresh-connection');
        const cooldownInput = document.getElementById('voice-cooldown');

        if (voiceToggle) {
            voiceToggle.addEventListener('change', (e) => {
                this.voiceEnabled = e.target.checked;
                this.updateVoiceControls();
            });
        }

        if (speakerSelect) {
            speakerSelect.addEventListener('change', (e) => {
                this.selectedSpeaker = parseInt(e.target.value);
            });
        }

        if (cooldownInput) {
            cooldownInput.addEventListener('input', (e) => {
                this.speechCooldown = parseFloat(e.target.value) * 1000; // 秒→ミリ秒（小数点対応）
            });
        }

        if (stopVoiceBtn) {
            stopVoiceBtn.addEventListener('click', () => this.stopVoice());
        }

        if (refreshConnectionBtn) {
            refreshConnectionBtn.addEventListener('click', () => this.checkVoiceConnection());
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
                    this.sendChatMessage();
                }
            });

            sendButton.addEventListener('click', () => {
                this.sendChatMessage();
            });
        }

        // 初期メッセージを追加
        this.addChatMessage('assistant', 'ことね', 'こんにちは〜！✨ 何をお手伝いしましょうか？');
    }

    parseTerminalDataForChat(data) {
        // ANSIエスケープシーケンスを除去してメッセージを抽出
        const cleanData = data.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').trim();
        
        // ⏺記号でAIの応答を検出
        if (cleanData.includes('⏺')) {
            const circleIndex = cleanData.indexOf('⏺');
            let afterCircle = cleanData.substring(circleIndex + 1).trim();
            
            // 不要な部分を除去
            afterCircle = afterCircle
                .replace(/^[⚒↓⭐✶✻✢·✳]+\s*/g, '')
                .replace(/\s*[✢✳✶✻✽·⚒↓↑]\s*(Synthesizing|Conjuring|Spinning|Vibing|Computing|Mulling|Pondering|musing|thinking).*$/gi, '')
                .replace(/\s*\([0-9]+s[^)]*\).*$/g, '')
                .replace(/\s*tokens.*$/gi, '')
                .trim();

            if (afterCircle.length > 10) {
                // 重複メッセージ防止
                const now = Date.now();
                const isSameMessage = afterCircle === this.lastChatMessage;
                const isRecentMessage = now - this.lastChatTime < 2000; // 2秒以内
                
                if (!isSameMessage || !isRecentMessage) {
                    console.log('Adding chat message:', afterCircle.substring(0, 50) + '...');
                    this.addChatMessage('assistant', 'ことね', afterCircle);
                    this.updateCharacterMood('おしゃべり中✨');
                    
                    this.lastChatMessage = afterCircle;
                    this.lastChatTime = now;
                } else {
                    console.log('Skipped duplicate chat message');
                }
            }
        }
    }

    sendChatMessage() {
        const chatInput = document.getElementById('chat-input');
        if (!chatInput) return;

        const message = chatInput.value.trim();
        if (!message) return;

        // ユーザーメッセージを追加
        this.addChatMessage('user', 'あなた', message);
        chatInput.value = '';

        // Claude Codeにメッセージを送信
        if (this.isTerminalRunning && window.electronAPI && window.electronAPI.terminal) {
            console.log('Sending message to terminal:', message);
            window.electronAPI.terminal.write(message + '\r');
            this.updateCharacterMood('考え中...');
        } else {
            console.error('Cannot send message:', {
                isTerminalRunning: this.isTerminalRunning,
                hasElectronAPI: !!window.electronAPI,
                hasTerminalAPI: !!(window.electronAPI && window.electronAPI.terminal)
            });
            this.addChatMessage('assistant', 'ことね', 'Claude Codeが起動してないよ〜！先にStartボタンを押してね！');
        }
    }

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

    updateCharacterMood(mood) {
        const moodElement = document.querySelector('.character-mood');
        if (moodElement) {
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
                this.terminal.writeln('\x1b[96m🎀 AI Kawaii Claude Code Integration Started! 🎀\x1b[0m');
                this.terminal.writeln('\x1b[93mClaude Code is starting up...\x1b[0m');
                
                // チャットにも通知
                this.addChatMessage('assistant', 'ことね', 'Claude Codeが起動したよ〜！✨');
                
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
        const speakerSelect = document.getElementById('speaker-select');
        const stopVoiceBtn = document.getElementById('stop-voice');
        const voiceToggle = document.getElementById('voice-toggle');
        const cooldownInput = document.getElementById('voice-cooldown');

        const canUseVoice = this.connectionStatus === 'connected';

        if (voiceToggle) {
            voiceToggle.disabled = !canUseVoice;
        }
        if (speakerSelect) {
            speakerSelect.disabled = !this.voiceEnabled || !canUseVoice;
        }
        if (cooldownInput) {
            cooldownInput.disabled = !this.voiceEnabled || !canUseVoice;
        }
        if (stopVoiceBtn) {
            stopVoiceBtn.disabled = !this.voiceEnabled || !canUseVoice;
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
        const speakerSelect = document.getElementById('speaker-select');
        if (speakerSelect && this.speakers.length > 0) {
            speakerSelect.innerHTML = '';
            this.speakers.forEach((speaker) => {
                speaker.styles.forEach((style) => {
                    const option = document.createElement('option');
                    option.value = style.id;
                    option.textContent = `${speaker.name} (${style.name})`;
                    speakerSelect.appendChild(option);
                });
            });
            // 最初の話者を自動選択
            if (this.speakers[0] && this.speakers[0].styles[0]) {
                this.selectedSpeaker = this.speakers[0].styles[0].id;
                speakerSelect.value = this.selectedSpeaker;
            }
        }
    }

    updateConnectionStatus(text, status) {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            statusElement.textContent = text;
            statusElement.className = `status-${status}`;
        }
    }

    async speakText(text) {
        if (!window.electronAPI || !window.electronAPI.voice || !this.voiceEnabled || this.connectionStatus !== 'connected') {
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

    async playAudio(audioData) {
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

            // BufferをArrayBufferに変換
            let arrayBuffer;
            if (audioData instanceof ArrayBuffer) {
                arrayBuffer = audioData;
            } else if (audioData.buffer instanceof ArrayBuffer) {
                arrayBuffer = audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength);
            } else {
                // Uint8ArrayまたはBufferの場合
                arrayBuffer = new ArrayBuffer(audioData.length);
                const view = new Uint8Array(arrayBuffer);
                for (let i = 0; i < audioData.length; i++) {
                    view[i] = audioData[i];
                }
            }

            // Decode audio data
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            
            source.onended = () => {
                this.currentAudio = null;
                this.isPlaying = false;
            };

            this.currentAudio = source;
            this.isPlaying = true;
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
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TerminalApp();
});