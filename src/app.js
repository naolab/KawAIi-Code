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

        // 音声認識関連のプロパティ (Google Cloud Speech用)
        this.isListening = false;
        this.audioStream = null; // マイクからの音声ストリーム
        this.mediaRecorder = null; // 音声録音用
        this.recognitionTimeout = null; // 認識自動停止用のタイマー
        
        
        // 読み上げ履歴管理
        this.speechHistory = new SpeechHistoryManager(50);
        
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
        const micButton = document.getElementById('mic-button');
        if (micButton) {
            micButton.addEventListener('click', () => this.toggleSpeechRecognition());
        }

        this.updateButtons();
        this.updateVoiceControls();
        // this.updateSpeechHistoryStatus(); // メソッドが存在しないためコメントアウト
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

        // マイクボタンは一時的に無効化
        const micButton = document.getElementById('mic-button');
        if (micButton) {
            // イベントリスナーを追加せず、無効状態を維持
            debugLog('Mic button temporarily disabled');
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

        // 壁紙設定の同期 - ロード時に選択肢を更新する
        await this.loadWallpaperList();

        // 読み上げ履歴状況を更新
        // this.updateSpeechHistoryStatus(); // メソッドが存在しないためコメントアウト
        
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
        if (this.isListening) {
            this.stopSpeechRecognition();
        } else {
            this.startSpeechRecognition();
        }
    }

    // 新しいメソッド: 音声認識の開始
    async startSpeechRecognition() {
        if (this.isListening) {
            debugLog('Already listening.');
            return;
        }

        try {
            // ユーザーにマイクへのアクセスを要求
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioStream = stream; // ストリームを保持

            // MediaRecorderの準備
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm; codecs=opus' // WebM形式のOpusコーデック (Google Speech APIで推奨)
            });

            // 音声データが利用可能になったときのイベント
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    // 音声チャンクをArrayBufferに変換してメインプロセスに送信
                    event.data.arrayBuffer().then(buffer => {
                        window.electronAPI.sendAudioChunk(Array.from(new Uint8Array(buffer)));
                    });
                }
            };

            // 録音停止イベント
            this.mediaRecorder.onstop = () => {
                debugLog('MediaRecorder stopped.');
                this.isListening = false;
                this.updateMicButtonUI();
                if (this.audioStream) {
                    this.audioStream.getTracks().forEach(track => track.stop()); // マイクを停止
                    this.audioStream = null;
                }
                window.electronAPI.stopSpeechRecognitionStream(); // メインプロセスにストリーム終了を通知
            };

            // メインプロセスに音声認識ストリームの開始を要求
            await window.electronAPI.startSpeechRecognitionStream();

            // 録音開始（短く区切って送信）
            this.mediaRecorder.start(100); // 100msごとにデータを取得して送信

            this.isListening = true;
            this.updateMicButtonUI();
            debugLog('Speech recognition started via MediaRecorder.');
            this.terminal.write('\r\n\x1b[96m🎤 Google Cloud音声認識を開始しました（30秒間で自動停止）\x1b[0m\r\n');

            // IPC通信で認識結果とエラーを受け取るリスナーを設定
            window.electronAPI.onSpeechRecognitionResult((resultData) => {
                if (resultData.isFinal) {
                    this.terminal.write(`\r\n\x1b[92m[You]: ${resultData.result}\x1b[0m\r\n`);
                    window.electronAPI.sendChatMessage(resultData.result); // Claude Codeに送信
                } else {
                    // 中間結果は表示しない、または一時的に表示して上書きするなど
                    // 今回は最終結果のみ表示する
                }
                // タイムアウトをリセット (音声入力があったら延長)
                clearTimeout(this.recognitionTimeout);
                this.recognitionTimeout = setTimeout(() => {
                    this.stopSpeechRecognition();
                    this.terminal.write('\r\n\x1b[93m音声認識を自動停止しました（30秒間無音のため）\x1b[0m\r\n');
                }, 30000); // 30秒間音声がない場合停止
            });

            window.electronAPI.onSpeechRecognitionError((errorMessage) => {
                console.error('Google Speech recognition error:', errorMessage);
                this.terminal.write(`\r\n\x1b[91mGoogle音声認識エラー: ${errorMessage}\x1b[0m\r\n`);
                this.stopSpeechRecognition();
            });

            window.electronAPI.onSpeechRecognitionEnd(() => {
                console.log('Google Speech recognition stream ended by main process.');
                this.stopSpeechRecognition(); // レンダラー側の処理を停止
            });

            // 初回起動時のタイムアウト設定 (音声が全くない場合)
            this.recognitionTimeout = setTimeout(() => {
                this.stopSpeechRecognition();
                this.terminal.write('\r\n\x1b[93m音声認識を自動停止しました（30秒間無音のため）\x1b[0m\r\n');
            }, 30000); // 30秒間音声がない場合停止

        } catch (error) {
            console.error('Error starting speech recognition:', error);
            this.terminal.write(`\r\n\x1b[91mマイクアクセスエラー: ${error.message}\x1b[0m\r\n`);
            this.isListening = false;
            this.updateMicButtonUI();
        }
    }

    // 新しいメソッド: 音声認識の停止
    stopSpeechRecognition() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop(); // MediaRecorderを停止
        }
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop()); // マイクのトラックを停止
            this.audioStream = null;
        }
        this.isListening = false;
        this.updateMicButtonUI();
        clearTimeout(this.recognitionTimeout);
        this.terminal.write('\r\n\x1b[96m🛑 Google Cloud音声認識を停止しました\x1b[0m\r\n');
        // メインプロセスにストリームの終了を明示的に通知（onstopで既に通知しているが念のため）
        window.electronAPI.stopSpeechRecognitionStream();
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
            
            // デフォルトキャラクター（照れ屋）を読み込み
            const characterPath = path.join(srcPath, 'character_settings', 'shy.md');
            const characterSettings = await fs.promises.readFile(characterPath, 'utf8');
            
            // 設定を統合
            this.claudeMdContent = baseSettings + '\n\n---\n\n' + characterSettings;
            
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