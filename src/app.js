// xtermライブラリはCDNから読み込み

// デバッグログ制御（本番環境では無効化）
const isDev = !window.location.protocol.startsWith('file:') || process.env.NODE_ENV === 'development';
const debugLog = isDev ? console.log : () => {};
const debugTrace = isDev ? console.trace : () => {};
const debugError = console.error; // エラーは常に出力

// 読み上げ履歴管理クラス
class SpeechHistoryManager {
    constructor(maxHistorySize = 10) {
        this.maxHistorySize = maxHistorySize;
        this.historyKey = 'speech_history';
        this.history = this.loadHistory();
    }

    // LocalStorageから履歴を読み込み
    loadHistory() {
        try {
            const stored = localStorage.getItem(this.historyKey);
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            debugError('履歴読み込みエラー:', error);
            return [];
        }
    }

    // LocalStorageに履歴を保存
    saveHistory() {
        try {
            localStorage.setItem(this.historyKey, JSON.stringify(this.history));
        } catch (error) {
            debugError('履歴保存エラー:', error);
        }
    }

    // テキストのハッシュ値を生成（簡易版）
    generateHash(text) {
        // 正規化：空白、改行を統一するが、句読点は保持してより厳密な重複判定を行う
        const normalized = text
            .replace(/\s+/g, ' ')  // 連続空白を単一空白に
            .replace(/[、，]/g, '、') // 読点を統一
            .trim()
            .toLowerCase();
        
        // 簡易ハッシュ生成
        let hash = 0;
        for (let i = 0; i < normalized.length; i++) {
            const char = normalized.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 32bit整数に変換
        }
        return hash.toString();
    }

    // 重複チェック
    isDuplicate(text) {
        if (!text || text.length < 5) return false; // 短すぎるテキストはスキップ
        
        const hash = this.generateHash(text);
        return this.history.includes(hash);
    }

    // 履歴に追加
    addToHistory(text) {
        if (!text || text.length < 5) return;
        
        const hash = this.generateHash(text);
        
        // 既存の同じハッシュを削除（重複除去）
        this.history = this.history.filter(h => h !== hash);
        
        // 新しいハッシュを先頭に追加
        this.history.unshift(hash);
        
        // 最大件数を超えた場合は古いものを削除
        if (this.history.length > this.maxHistorySize) {
            this.history = this.history.slice(0, this.maxHistorySize);
        }
        
        this.saveHistory();
        debugLog('読み上げ履歴追加:', { text: text.substring(0, 30) + '...', hash, historyCount: this.history.length });
    }

    // 履歴をクリア
    clearHistory() {
        this.history = [];
        this.saveHistory();
        debugLog('読み上げ履歴をクリアしました');
    }

    // 履歴の状態を取得
    getHistoryStatus() {
        return {
            count: this.history.length,
            maxSize: this.maxHistorySize,
            recent: this.history.slice(0, 3) // 最新3件のハッシュ
        };
    }
}

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

        // 時間帯別壁紙切り替え用タイマー
        this.wallpaperTimer = null;
        
        // 読み上げ履歴管理
        this.speechHistory = new SpeechHistoryManager(50);
        this.wallpaperAnimationEnabled = false; // デフォルト壁紙アニメーションの有効/無効
        
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
        this.loadUserConfig(); // 設定を読み込み
        this.updateStatus('Ready');
        this.checkVoiceConnection();

        // キャラクター設定を読み込む
        this.loadCharacterSettings();
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
                selectionBackground: 'rgba(255, 165, 0, 0.7)',
                selectionForeground: '#FFFFFF',
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

    setupEventListeners() {
        const startBtn = document.getElementById('start-terminal');
        const stopBtn = document.getElementById('stop-terminal');
        const settingsBtn = document.getElementById('settings-btn');
        const closeSettingsBtn = document.getElementById('close-settings');
        const settingsModal = document.getElementById('settings-modal');
        const helpBtn = document.getElementById('help-btn');
        const closeHelpBtn = document.getElementById('close-help');
        const helpModal = document.getElementById('help-modal');

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
        
        // ヘルプモーダルのイベント
        helpBtn.addEventListener('click', () => {
            helpModal.style.display = 'flex';
        });
        
        closeHelpBtn.addEventListener('click', () => {
            helpModal.style.display = 'none';
        });
        
        helpModal.addEventListener('click', (e) => {
            if (e.target === helpModal) {
                helpModal.style.display = 'none';
            }
        });

        // 設定モーダル内のコントロール
        const voiceToggleModal = document.getElementById('voice-toggle-modal');
        const speakerSelectModal = document.getElementById('speaker-select-modal');
        const stopVoiceBtnModal = document.getElementById('stop-voice-modal');
        const refreshConnectionBtnModal = document.getElementById('refresh-connection-modal');

        if (voiceToggleModal) {
            voiceToggleModal.addEventListener('change', (e) => {
                this.voiceEnabled = e.target.checked;
                this.updateVoiceControls();
            });
        }

        if (speakerSelectModal) {
            speakerSelectModal.addEventListener('change', async (e) => {
                this.selectedSpeaker = parseInt(e.target.value);
                
                // 設定を永続化
                if (window.electronAPI && window.electronAPI.config) {
                    await window.electronAPI.config.set('defaultSpeakerId', this.selectedSpeaker);
                }
                debugLog('話者設定を更新:', this.selectedSpeaker);
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

        this.updateButtons();
        this.updateVoiceControls();
        // this.updateSpeechHistoryStatus(); // メソッドが存在しないためコメントアウト

        // 壁紙設定ラジオボタンのリスナー
        const wallpaperDefaultRadio = document.getElementById('wallpaper-default-radio');
        const wallpaperUploadedRadio = document.getElementById('wallpaper-uploaded-radio');

        if (wallpaperDefaultRadio) {
            wallpaperDefaultRadio.addEventListener('change', () => {
                this.currentWallpaperOption = 'default';
                localStorage.setItem('wallpaperOption', 'default');
                this.applyWallpaper();
            });
        }

        if (wallpaperUploadedRadio) {
            wallpaperUploadedRadio.addEventListener('change', () => {
                this.currentWallpaperOption = 'uploaded';
                localStorage.setItem('wallpaperOption', 'uploaded');
                this.applyWallpaper();
            });
        }

        const wallpaperAnimationToggle = document.getElementById('wallpaper-animation-toggle');
        if (wallpaperAnimationToggle) {
            wallpaperAnimationToggle.addEventListener('change', () => {
                this.wallpaperAnimationEnabled = wallpaperAnimationToggle.checked;
                localStorage.setItem('wallpaperAnimationEnabled', JSON.stringify(this.wallpaperAnimationEnabled));
                this.applyWallpaper();
            });
        }
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
                this.addVoiceMessage('クロード', quotedText);
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
        
        
        await this.updateSpeakerSelect();
        this.updateConnectionStatus(this.connectionStatus === 'connected' ? '接続済み' : '未接続', this.connectionStatus);

        // 壁紙設定の同期
        const wallpaperDefaultRadio = document.getElementById('wallpaper-default-radio');
        const wallpaperUploadedRadio = document.getElementById('wallpaper-uploaded-radio');
        if (wallpaperDefaultRadio && wallpaperUploadedRadio) {
            if (this.currentWallpaperOption === 'default') {
                wallpaperDefaultRadio.checked = true;
            } else {
                wallpaperUploadedRadio.checked = true;
            }
        }

        const wallpaperAnimationToggle = document.getElementById('wallpaper-animation-toggle');
        if (wallpaperAnimationToggle) {
            wallpaperAnimationToggle.checked = this.wallpaperAnimationEnabled;
        }

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

        // ユーザー設定を読み込み
        const savedVoiceEnabled = localStorage.getItem('voiceEnabled');
        if (savedVoiceEnabled !== null) {
            this.voiceEnabled = JSON.parse(savedVoiceEnabled);
        }

        const savedSelectedSpeaker = localStorage.getItem('selectedSpeaker');
        if (savedSelectedSpeaker !== null) {
            this.selectedSpeaker = parseInt(savedSelectedSpeaker, 10);
        }

        const savedWallpaperOption = localStorage.getItem('wallpaperOption');
        if (savedWallpaperOption) {
            this.currentWallpaperOption = savedWallpaperOption;
        } else {
            this.currentWallpaperOption = 'default'; // デフォルトは静止画
        }

        const savedWallpaperAnimationEnabled = localStorage.getItem('wallpaperAnimationEnabled');
        if (savedWallpaperAnimationEnabled !== null) {
            this.wallpaperAnimationEnabled = JSON.parse(savedWallpaperAnimationEnabled);
        }

        localStorage.setItem('selectedSpeaker', this.selectedSpeaker.toString());
        localStorage.setItem('wallpaperOption', this.currentWallpaperOption);
        localStorage.setItem('wallpaperAnimationEnabled', JSON.stringify(this.wallpaperAnimationEnabled));

        if (this.claudeWorkingDir) {
            localStorage.setItem('claudeWorkingDir', this.claudeWorkingDir);
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
                
                // プロジェクト固有設定を読み込み
                await this.loadProjectSpecificSettings(result.path);
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
        this.audioQueue = this.audioQueue.filter(item => 
            (now - item.timestamp) < this.maxAudioAge
        );
        const newLength = this.audioQueue.length;
        if (oldLength !== newLength) {
            debugLog('🧹 Cleaned old audio:', oldLength - newLength, 'items removed');
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
            this.audioQueue = [];
            debugLog('🛑 Audio stopped and queue cleared');
        }
        // lastSpeechTimeはリセットしない（間隔制御を維持）
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
                const defaultRadio = document.getElementById('wallpaper-default-radio');
                const uploadedRadio = document.getElementById('wallpaper-uploaded-radio');
                const uploadedWallpaperNameSpan = document.getElementById('uploaded-wallpaper-name');
                
                let lastUploadedWallpaper = null;
                if (response.wallpapers.length > 0) {
                    // 常に最新のアップロードされた壁紙を取得
                    lastUploadedWallpaper = response.wallpapers[response.wallpapers.length - 1];
                }

                const savedWallpaperChoice = localStorage.getItem('selectedWallpaperChoice'); // 'default' or 'uploaded'
                const savedUploadedWallpaper = localStorage.getItem('lastUploadedWallpaper'); // ファイル名

                // UIを初期化
                if (defaultRadio) defaultRadio.checked = false;
                if (uploadedRadio) uploadedRadio.checked = false;
                if (uploadedWallpaperNameSpan) uploadedWallpaperNameSpan.textContent = '';

                if (uploadedRadio && lastUploadedWallpaper && (savedWallpaperChoice === 'uploaded' || (savedWallpaperChoice === null && savedUploadedWallpaper))) {
                    // アップロードされた壁紙が存在し、それが選択されていた、または以前アップロード済みの場合
                    uploadedRadio.checked = true;
                    if (uploadedWallpaperNameSpan) {
                        uploadedWallpaperNameSpan.textContent = `現在の壁紙: ${lastUploadedWallpaper.name}`;
                    }
                    this.applyWallpaper(lastUploadedWallpaper.filename);
                    localStorage.setItem('selectedWallpaperChoice', 'uploaded');
                    localStorage.setItem('lastUploadedWallpaper', lastUploadedWallpaper.filename);
                    this.stopWallpaperTimer(); // アップロード済み壁紙が選択されたらタイマーを停止
                } else if (defaultRadio) {
                    // それ以外の場合はデフォルト壁紙を選択
                    defaultRadio.checked = true;
                    this.applyWallpaper('default');
                    localStorage.setItem('selectedWallpaperChoice', 'default');
                    localStorage.removeItem('lastUploadedWallpaper'); // デフォルト選択時はクリア
                    this.startWallpaperTimer(); // デフォルト壁紙が選択されたらタイマーを開始
                }

                // アップロードした壁紙がない場合は、「アップロードした壁紙を使用する」を選択不可にする
                if (uploadedRadio && !lastUploadedWallpaper) {
                    uploadedRadio.disabled = true;
                } else if (uploadedRadio) {
                    uploadedRadio.disabled = false;
                }

            }
        } catch (error) {
            debugError('壁紙リスト読み込みエラー:', error);
            // エラー時はデフォルト選択にするなど、適切なフォールバック処理
            const defaultRadio = document.getElementById('wallpaper-default-radio');
            if (defaultRadio) defaultRadio.checked = true;
            this.applyWallpaper('default');
            localStorage.setItem('selectedWallpaperChoice', 'default');
            localStorage.removeItem('lastUploadedWallpaper');
        }
    }

    // 壁紙関連のイベントリスナーを設定
    setupWallpaperListeners() {
        const defaultRadio = document.getElementById('wallpaper-default-radio');
        const uploadedRadio = document.getElementById('wallpaper-uploaded-radio');
        const uploadBtn = document.getElementById('upload-wallpaper-btn');
        const uploadInput = document.getElementById('wallpaper-upload');
        const uploadedWallpaperNameSpan = document.getElementById('uploaded-wallpaper-name');

        if (defaultRadio) {
            defaultRadio.addEventListener('change', () => {
                if (defaultRadio.checked) {
                    this.applyWallpaper('default');
                    localStorage.setItem('selectedWallpaperChoice', 'default');
                    localStorage.removeItem('lastUploadedWallpaper');
                    if (uploadedWallpaperNameSpan) uploadedWallpaperNameSpan.textContent = '';
                    this.startWallpaperTimer(); // デフォルト壁紙が選択されたらタイマーを開始
                }
            });
        }

        if (uploadedRadio) {
            uploadedRadio.addEventListener('change', async () => {
                if (uploadedRadio.checked) {
                    this.stopWallpaperTimer(); // アップロード済み壁紙が選択されたらタイマーを停止
                    const response = await window.electronAPI.wallpaper.getWallpaperList();
                    if (response.success && response.wallpapers.length > 0) {
                        // 最新のアップロードされた壁紙を適用
                        const latestWallpaper = response.wallpapers[response.wallpapers.length - 1];
                        this.applyWallpaper(latestWallpaper.filename);
                        localStorage.setItem('selectedWallpaperChoice', 'uploaded');
                        localStorage.setItem('lastUploadedWallpaper', latestWallpaper.filename);
                        if (uploadedWallpaperNameSpan) {
                            uploadedWallpaperNameSpan.textContent = `現在の壁紙: ${latestWallpaper.name}`;
                        }
                    } else {
                        // アップロードされた壁紙がない場合は、強制的にデフォルトに戻す
                        if (defaultRadio) defaultRadio.checked = true;
                        this.applyWallpaper('default');
                        localStorage.setItem('selectedWallpaperChoice', 'default');
                        localStorage.removeItem('lastUploadedWallpaper');
                        if (uploadedWallpaperNameSpan) uploadedWallpaperNameSpan.textContent = '';
                        this.addVoiceMessage('クロード', 'アップロードされた壁紙がないため、デフォルト壁紙に戻したよ！');
                        this.startWallpaperTimer(); // デフォルト壁紙に戻るのでタイマーを開始
                    }
                }
            });
        }

        if (uploadBtn && uploadInput) {
            uploadBtn.addEventListener('click', () => {
                uploadInput.click();
            });

            uploadInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    const response = await this.uploadWallpaper(file);
                    if (response.success) {
                        // アップロード成功後、自動選択は行わず、loadWallpaperListでUIを更新
                        // loadWallpaperListがlocalStorageと現在の壁紙の状態に基づいて適切にラジオボタンを設定する
                        uploadedRadio.disabled = false; // アップロード済み壁紙が利用可能になったので有効化
                        this.stopWallpaperTimer(); // アップロード時はタイマーを停止 (loadWallpaperListで再開される可能性あり)
                    }
                }
            });
        }
    }

    // 壁紙を適用
    async applyWallpaper() {
        const body = document.body;

        // 既存の動画要素をクリア
        const existingVideo = document.getElementById('wallpaper-video');
        if (existingVideo) {
            existingVideo.remove();
            debugLog('既存の動画壁紙を削除しました。');
        }
        // 既存の静止画背景をクリア
        body.style.background = '';
        body.style.backgroundAttachment = '';

        const currentHour = new Date().getHours();
        let baseFileName = '';

        // 時間帯に応じたベースファイル名決定
        if (currentHour >= 4 && currentHour < 6) {
            baseFileName = 'default_morning_evening';
        } else if (currentHour >= 6 && currentHour < 17) {
            baseFileName = 'default_noon';
        } else if (currentHour >= 17 && currentHour < 19) {
            baseFileName = 'default_morning_evening';
        } else if (currentHour >= 19 && currentHour <= 23) { // 19:00 - 23:59
            baseFileName = 'default_night';
        } else { // 0:00 - 3:59
            baseFileName = 'default_latenight';
        }

        if (this.currentWallpaperOption === 'default') {
            if (this.wallpaperAnimationEnabled) {
                // 動画壁紙を適用
                const videoPath = `assets/wallpapers/default/${baseFileName}.mp4`;
                const video = document.createElement('video');
                video.id = 'wallpaper-video';
                video.src = videoPath;
                video.loop = true;
                video.autoplay = true;
                video.muted = true;
                video.playsInline = true; // iOSなどで自動再生を有効にするため

                video.style.cssText = `
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    z-index: -1;
                `;
                body.prepend(video); // bodyの最初に挿入
                debugLog(`動画壁紙を適用: ${videoPath}`);
            } else {
                // 静止画壁紙を適用
                const imagePath = `assets/wallpapers/default/${baseFileName}.jpg`; // デフォルト静止画は.jpgを想定
                body.style.background = `url('${imagePath}') center/cover fixed`;
                body.style.backgroundAttachment = 'fixed';
                debugLog(`静止画壁紙を適用: ${imagePath}`);
            }
            this.startWallpaperTimer(); // デフォルト壁紙なのでタイマーを開始
        } else if (this.currentWallpaperOption === 'uploaded') {
            // ユーザー壁紙
            this.stopWallpaperTimer(); // アップロード済み壁紙なのでタイマーを停止

            try {
                const response = await window.electronAPI.wallpaper.getWallpaperList();
                if (response.success && response.wallpapers.length > 0) {
                    const latestWallpaper = response.wallpapers[response.wallpapers.length - 1];
                    const userDataPathResponse = await window.electronAPI.getUserDataPath();
                    if (userDataPathResponse.success) {
                        const userDataPath = userDataPathResponse.path;
                        const wallpaperPath = `file://${userDataPath}/wallpapers/user/${latestWallpaper.filename}`;
                        body.style.background = `url('${wallpaperPath}') center/cover fixed`;
                        body.style.backgroundAttachment = 'fixed';
                        debugLog(`アップロード済み壁紙を適用: ${wallpaperPath}`);
                    } else {
                        debugError('ユーザーデータパスの取得に失敗しました:', userDataPathResponse.error);
                        this.currentWallpaperOption = 'default';
                        localStorage.setItem('wallpaperOption', 'default');
                        document.getElementById('wallpaper-default-radio').checked = true;
                        this.applyWallpaper(); // フォールバック
                        this.addVoiceMessage('クロード', 'アップロードされた壁紙の読み込みに失敗したため、デフォルト壁紙に戻したよ！');
                    }
                } else {
                    debugLog('アップロードされた壁紙がないため、デフォルト壁紙に戻します。');
                    this.currentWallpaperOption = 'default';
                    localStorage.setItem('wallpaperOption', 'default');
                    document.getElementById('wallpaper-default-radio').checked = true;
                    this.applyWallpaper(); // 再帰的に呼び出してデフォルトを適用
                    this.addVoiceMessage('クロード', 'アップロードされた壁紙がないため、デフォルト壁紙に戻したよ！');
                }
            } catch (error) {
                debugError('壁紙適用エラー（ユーザー壁紙）:', error);
                this.currentWallpaperOption = 'default';
                localStorage.setItem('wallpaperOption', 'default');
                document.getElementById('wallpaper-default-radio').checked = true;
                this.applyWallpaper(); // フォールバック
                this.addVoiceMessage('クロード', 'アップロードされた壁紙の読み込み中にエラーが発生したため、デフォルト壁紙に戻したよ！');
            }
        }
    }

    // 壁紙をアップロード
    async uploadWallpaper(file) {
        try {
            // ファイルサイズチェック（5MB制限）
            if (file.size > 5 * 1024 * 1024) {
                alert('ファイルサイズが大きすぎます（5MB以下にしてください）');
                return { success: false, error: 'ファイルサイズが大きすぎます' };
            }

            // ファイル形式チェック
            const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
            if (!allowedTypes.includes(file.type)) {
                alert('対応していないファイル形式です（PNG、JPEG、GIF、WebPのみ）');
                return { success: false, error: '対応していないファイル形式です' };
            }

            // ★ 既存のユーザー壁紙をすべて削除
            const existingWallpapersResponse = await window.electronAPI.wallpaper.getWallpaperList();
            if (existingWallpapersResponse.success && existingWallpapersResponse.wallpapers.length > 0) {
                for (const wp of existingWallpapersResponse.wallpapers) {
                    const deleteResult = await window.electronAPI.wallpaper.deleteWallpaper(wp.filename);
                    if (!deleteResult.success) {
                        debugError(`既存の壁紙 ${wp.filename} の削除に失敗しました:`, deleteResult.error);
                    }
                }
                debugLog('既存のユーザー壁紙をすべて削除しました。');
            }

            // ファイルの内容をArrayBufferとして読み込む
            const reader = new FileReader();
            const fileDataPromise = new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result);
                reader.onerror = error => reject(error);
                reader.readAsArrayBuffer(file);
            });
            const arrayBuffer = await fileDataPromise;

            // IPCで送信するために必要なデータのみを抽出
            const serializableFileData = {
                name: file.name,
                type: file.type,
                data: Array.from(new Uint8Array(arrayBuffer)) // ArrayBufferをArrayに変換して送信
            };

            const response = await window.electronAPI.wallpaper.uploadWallpaper(serializableFileData);
            if (response.success) {
                // 成功メッセージ
                this.addVoiceMessage('クロード', '壁紙がアップロードできたよ〜！✨');

                // 壁紙リストを再読み込みし、UIの状態を更新
                // 自動選択は行わず、loadWallpaperListで既存のlocalStorage設定に基づいて状態を決定させる
                await this.loadWallpaperList();

                return { success: true, filename: response.filename, name: response.name };
            } else {
                alert('壁紙のアップロードに失敗しました');
                return { success: false, error: response.error || '不明なエラー' };
            }
        } catch (error) {
            debugError('壁紙アップロードエラー:', error);
            alert('壁紙のアップロードに失敗しました');
            return { success: false, error: error.message };
        }
    }

    // 壁紙タイマーを開始
    startWallpaperTimer() {
        if (this.wallpaperTimer) {
            clearInterval(this.wallpaperTimer);
        }
        // 1分ごとに壁紙をチェックして適用（デバッグ用、本番は1時間ごとなど調整可能）
        this.wallpaperTimer = setInterval(() => {
            const defaultRadio = document.getElementById('wallpaper-default-radio');
            if (defaultRadio && defaultRadio.checked) {
                debugLog('Wallpaper timer triggered: Applying default wallpaper.');
                this.applyWallpaper();
            }
        }, 60 * 1000); // 1分ごと
        debugLog('Wallpaper timer started.');
    }

    // 壁紙タイマーを停止
    stopWallpaperTimer() {
        if (this.wallpaperTimer) {
            clearInterval(this.wallpaperTimer);
            this.wallpaperTimer = null;
            debugLog('Wallpaper timer stopped.');
        }
    }

    async loadCharacterSettings() {
        try {
            const { fs, path, os } = window.electronAPI;
            if (!fs || !path || !os) {
                debugError('fs, path, or os module not available via electronAPI.');
                return;
            }
            
            // アプリのsrcディレクトリへの直接パスを構築（パッケージ化対応）
            const appPath = window.process && window.process.resourcesPath 
                ? path.join(window.process.resourcesPath, 'app.asar')
                : path.join(__dirname, '..');
            const srcPath = path.join(appPath, 'src');
            
            // 基本設定を読み込み
            const baseSettingsPath = path.join(srcPath, 'character_settings', 'base_settings.md');
            const baseSettings = await fs.promises.readFile(baseSettingsPath, 'utf8');
            
            // 全てのキャラクター設定ファイルを読み込み
            const characterSettingsDir = path.join(srcPath, 'character_settings');
            const characterFiles = await fs.promises.readdir(characterSettingsDir);
            
            // .mdファイルのみをフィルタリング（base_settings.md以外）
            const characterMdFiles = characterFiles.filter(file => 
                file.endsWith('.md') && file !== 'base_settings.md'
            );
            
            let allCharacterSettings = '';
            
            // 照れ屋キャラクターを最初に追加（デフォルト）
            const shyFile = characterMdFiles.find(file => file === 'shy.md');
            if (shyFile) {
                const shyPath = path.join(characterSettingsDir, shyFile);
                const shyContent = await fs.promises.readFile(shyPath, 'utf8');
                allCharacterSettings += '\n\n---\n\n' + shyContent;
                debugLog('Loaded default character: shy');
            }
            
            // 他のキャラクター設定を追加
            for (const file of characterMdFiles) {
                if (file !== 'shy.md') { // 照れ屋は既に追加済み
                    const characterPath = path.join(characterSettingsDir, file);
                    const characterContent = await fs.promises.readFile(characterPath, 'utf8');
                    allCharacterSettings += '\n\n---\n\n' + characterContent;
                    debugLog('Loaded character:', file.replace('.md', ''));
                }
            }
            
            // 設定を統合
            this.claudeMdContent = baseSettings + allCharacterSettings;
            
            
            // ホームディレクトリにCLAUDE.mdファイルを作成または更新
            try {
                const homeDir = os.homedir();
                const claudeMdPath = path.join(homeDir, 'CLAUDE.md');
                await fs.promises.writeFile(claudeMdPath, this.claudeMdContent, 'utf8');
                debugLog('CLAUDE.md file created/updated at:', claudeMdPath);
            } catch (writeError) {
                debugError('Failed to write CLAUDE.md to home directory:', writeError);
            }
            
            debugLog('Character settings loaded successfully (shy character)');
        } catch (error) {
            debugError('Failed to load character settings:', error);
            // フォールバック: 簡単なデフォルト設定
            this.claudeMdContent = `# AIアシスタント設定\n\n必ず日本語で回答してください。\n\n## デフォルトキャラクター\n照れ屋キャラクターとして応答してください。`;
        }
    }

    // キャラクター変更を処理
    async handleCharacterChange(characterType) {
        try {
            // 設定を保存
            if (window.electronAPI && window.electronAPI.config) {
                await window.electronAPI.config.set('selectedCharacter', characterType);
                debugLog('Character setting saved:', characterType);
            }

            // キャラクター設定を再読み込み
            await this.loadCharacterSettings();

            // UI更新
            const characterMessage = document.getElementById('character-message');
            if (characterMessage) {
                const characterNames = {
                    'shy': '照れ屋',
                    'genki': '元気娘',
                    'kuudere': 'クーデレ',
                    'tsundere': 'ツンデレ'
                };
                characterMessage.textContent = `現在のキャラクター: ${characterNames[characterType] || characterType}`;
                characterMessage.style.color = 'green';
                
                // メッセージを3秒後にリセット
                setTimeout(() => {
                    if (characterMessage) {
                        characterMessage.textContent = `現在のキャラクター: ${characterNames[characterType] || characterType}`;
                        characterMessage.style.color = '#555';
                    }
                }, 3000);
            }

            debugLog('Character changed successfully to:', characterType);
        } catch (error) {
            debugError('Failed to change character:', error);
            
            const characterMessage = document.getElementById('character-message');
            if (characterMessage) {
                characterMessage.textContent = 'キャラクター変更に失敗しました';
                characterMessage.style.color = 'red';
            }
        }
    }

    // キャラクター選択の同期
    async syncCharacterSelection() {
        try {
            const characterSelect = document.getElementById('character-select');
            const characterMessage = document.getElementById('character-message');
            
            if (!characterSelect) return;

            // 保存された設定を読み込み
            let selectedCharacter = 'shy'; // デフォルト
            if (window.electronAPI && window.electronAPI.config) {
                try {
                    selectedCharacter = await window.electronAPI.config.get('selectedCharacter', 'shy');
                } catch (configError) {
                    debugError('Failed to get character config:', configError);
                }
            }

            // UIに反映
            characterSelect.value = selectedCharacter;
            
            if (characterMessage) {
                const characterNames = {
                    'shy': '照れ屋',
                    'genki': '元気娘',
                    'kuudere': 'クーデレ',
                    'tsundere': 'ツンデレ'
                };
                characterMessage.textContent = `現在のキャラクター: ${characterNames[selectedCharacter] || selectedCharacter}`;
            }

            debugLog('Character selection synced:', selectedCharacter);
        } catch (error) {
            debugError('Failed to sync character selection:', error);
        }
    }

    // プロジェクト固有設定を読み込んでCLAUDE.mdを更新
    async loadProjectSpecificSettings(projectDir = null) {
        try {
            const { fs, path, os } = window.electronAPI;
            if (!fs || !path || !os) {
                debugError('fs, path, or os module not available via electronAPI.');
                return;
            }

            // プロジェクトディレクトリが指定されていない場合は、現在設定されている作業ディレクトリを使用
            const targetDir = projectDir || this.claudeWorkingDir;
            if (!targetDir) {
                debugLog('No project directory specified for loading project settings');
                return;
            }

            // 基本的なキャラクター設定が読み込まれていない場合は先に読み込む
            if (!this.claudeMdContent) {
                await this.loadCharacterSettings();
                return; // loadCharacterSettingsが完了した後にこのメソッドを呼び直す必要はない
            }

            // 現在の基本設定を保持（プロジェクト設定を除く）
            let baseContent = this.claudeMdContent;
            const projectSectionIndex = baseContent.indexOf('\n\n---\n\n# プロジェクト固有設定\n\n');
            if (projectSectionIndex !== -1) {
                baseContent = baseContent.substring(0, projectSectionIndex);
            }

            // プロジェクトディレクトリのCLAUDE.mdをチェック
            const projectClaudeMdPath = path.join(targetDir, 'CLAUDE.md');
            
            try {
                await fs.promises.access(projectClaudeMdPath);
                const projectSettings = await fs.promises.readFile(projectClaudeMdPath, 'utf8');
                this.claudeMdContent = baseContent + '\n\n---\n\n# プロジェクト固有設定\n\n' + projectSettings;
                debugLog('Project-specific CLAUDE.md found and merged:', projectClaudeMdPath);
            } catch (accessError) {
                // ファイルが存在しない場合は基本設定のみ
                this.claudeMdContent = baseContent;
                debugLog('No project-specific CLAUDE.md found at:', projectClaudeMdPath);
            }

            // ホームディレクトリのCLAUDE.mdを更新
            try {
                const homeDir = os.homedir();
                const claudeMdPath = path.join(homeDir, 'CLAUDE.md');
                await fs.promises.writeFile(claudeMdPath, this.claudeMdContent, 'utf8');
                debugLog('CLAUDE.md file updated with project settings at:', claudeMdPath);
            } catch (writeError) {
                debugError('Failed to write CLAUDE.md to home directory:', writeError);
            }

        } catch (error) {
            debugError('Failed to load project-specific settings:', error);
        }
    }

    // 設定を読み込む
    async loadUserConfig() {
        try {
            if (window.electronAPI && window.electronAPI.config) {
                const cooldownSeconds = await window.electronAPI.config.get('voiceCooldownSeconds', 1);
                this.speechCooldown = cooldownSeconds * 1000;
                
                // UI設定項目にも反映
                const cooldownInputModal = document.getElementById('voice-cooldown-modal');
                if (cooldownInputModal) {
                    cooldownInputModal.value = cooldownSeconds;
                }
                
                debugLog('設定を読み込み:', { voiceCooldownSeconds: cooldownSeconds });
            }
        } catch (error) {
            debugError('設定の読み込みに失敗:', error);
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TerminalApp();
});