#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { app } = require('electron');
const EmotionAnalyzer = require('../src/emotionAnalyzer');

// プロジェクトパス（環境変数から取得）
const PROJECT_PATH = process.env.KAWAII_PROJECT_PATH || '/Users/nao/Desktop/develop/AI-Kawaii-Project';

// VoiceServiceを直接importできないので、必要な機能のみ実装
class VoiceHookService {
    constructor() {
        this.baseUrl = 'http://127.0.0.1:10101';
        this.isConnected = false;
        this.appConfigPath = path.join(PROJECT_PATH, 'src', 'appConfig.js');
        this.tempDir = path.join(PROJECT_PATH, 'temp');
        
        // ファイルベース重複チェック用
        this.lastNotificationPath = null;
        
        // 設定読み込み（非同期なので後で呼び出し）
        this.configLoaded = false;
        
        // 一時ディレクトリ作成
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
        
        // 感情分析器を初期化
        this.emotionAnalyzer = new EmotionAnalyzer();
    }

    // 設定を読み込み（統一設定システム使用）
    async loadConfig() {
        try {
            // 統一設定システムから設定を読み込み（require文を修正）
            const { unifiedConfig } = require('../src/modules/unified-config-manager');
            
            this.voiceEnabled = await unifiedConfig.get('voiceEnabled', true);
            this.selectedSpeaker = await unifiedConfig.get('defaultSpeakerId', 0);
            this.useHooks = await unifiedConfig.get('useHooks', true);
            this.voiceInterval = await unifiedConfig.get('voiceIntervalSeconds', 3);
            
            console.log('統一設定から音声設定を読み込み成功:', {
                voiceEnabled: this.voiceEnabled,
                selectedSpeaker: this.selectedSpeaker,
                useHooks: this.useHooks,
                voiceInterval: this.voiceInterval
            });
        } catch (error) {
            console.error('統一設定読み込みエラー - フォールバック処理:', error.message);
            
            // フォールバック: 従来のconfig.json読み込み
            try {
                const configPath = path.join(require('os').homedir(), '.kawaii-code-config', 'config.json');
                if (fs.existsSync(configPath)) {
                    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    this.voiceEnabled = config.voiceEnabled !== false;
                    this.selectedSpeaker = config.defaultSpeakerId || 0;
                    this.useHooks = true; // Hook機能を強制的に有効
                    this.voiceInterval = config.voiceInterval || 3;
                    console.log('フォールバック設定読み込み成功');
                } else {
                    throw new Error('設定ファイルが見つかりません');
                }
            } catch (fallbackError) {
                console.error('フォールバック設定読み込みも失敗 - デフォルト値を使用:', fallbackError.message);
                this.voiceEnabled = true;
                this.selectedSpeaker = 0;
                this.useHooks = true; // Hook機能を強制的に有効
                this.voiceInterval = 3;
            }
        }
    }

    // 重複チェック（緊急修正：シンプル実装）
    getLastProcessedText() {
        try {
            const files = fs.readdirSync(this.tempDir);
            const notificationFiles = files.filter(f => f.startsWith('notification_') && f.endsWith('.json'));
            
            if (notificationFiles.length === 0) {
                return null;
            }
            
            // 最新のnotificationファイルを取得
            const latestFile = notificationFiles.sort().pop();
            const notificationPath = path.join(this.tempDir, latestFile);
            
            if (fs.existsSync(notificationPath)) {
                const notification = JSON.parse(fs.readFileSync(notificationPath, 'utf8'));
                console.log(`前回処理済みテキスト: ${notification.text}`);
                return notification.text;
            }
        } catch (error) {
            console.error('前回テキスト取得エラー:', error);
        }
        return null;
    }

    // 重複チェック機能（緊急修正：有効化）
    isDuplicateText(text) {
        const lastText = this.getLastProcessedText();
        if (!lastText) {
            return false;
        }
        
        const isDuplicate = text === lastText;
        if (isDuplicate) {
            console.log(`重複テキストのため音声合成をスキップ: ${text}`);
        }
        return isDuplicate;
    }

    // AivisSpeechとの接続確認
    async checkConnection() {
        try {
            const response = await axios.get(`${this.baseUrl}/version`, { timeout: 5000 });
            this.isConnected = true;
            return true;
        } catch (error) {
            this.isConnected = false;
            return false;
        }
    }

    // 音声合成実行
    async synthesizeText(text, speaker = 0) {
        if (!this.isConnected) {
            throw new Error('AivisSpeech Engine not connected');
        }

        try {
            console.log(`音声合成開始: "${text}", speaker=${speaker}`);
            console.log(`リクエストURL: ${this.baseUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`);
            
            // Step 1: Get audio query
            const queryResponse = await axios.post(
                `${this.baseUrl}/audio_query`,
                null,
                {
                    params: { text, speaker },
                    headers: { 'accept': 'application/json' },
                    timeout: 30000
                }
            );
            
            console.log('audio_query成功:', queryResponse.status);
            
            // Step 2: Optimize for faster synthesis
            const queryData = queryResponse.data;
            if (queryData.speedScale) {
                queryData.speedScale = 1.2;  // 20%高速化
            }

            // Step 3: Synthesize audio
            console.log('synthesis実行開始:', queryData);
            const audioResponse = await axios.post(
                `${this.baseUrl}/synthesis`,
                queryData,
                {
                    params: { speaker },
                    headers: { 
                        'accept': 'audio/wav',
                        'Content-Type': 'application/json' 
                    },
                    responseType: 'arraybuffer',
                    timeout: 45000
                }
            );
            
            console.log('synthesis成功:', audioResponse.status);

            return audioResponse.data;
        } catch (error) {
            console.error('音声合成エラー:', error.message);
            throw error;
        }
    }

    // 古いファイルを削除（最新1件以外）
    cleanupOldFiles() {
        try {
            const AudioFileCleanup = require('../src/modules/audio-file-cleanup');
            const cleanup = new AudioFileCleanup(this.tempDir);
            const result = cleanup.cleanupOldFiles(1); // 最新1件を残す
            
            if (result.filesRemoved > 0) {
                console.log(`🗑️ 古いファイル削除完了: ${result.filesRemoved}個`);
            }
            
            if (!result.success && result.errors) {
                result.errors.forEach(error => console.warn(error));
            }
            
            return result;
        } catch (error) {
            console.error('古いファイル削除エラー:', error);
            return { success: false, error: error.message };
        }
    }

    // 音声ファイルを保存してアプリに通知（テキスト表示も含む）
    async saveAndNotifyAudio(audioData, conversationText) {
        const timestamp = Date.now();
        const filename = `voice_${timestamp}.wav`;
        const filepath = path.join(this.tempDir, filename);
        
        try {
            // 新しい音声を保存する前に古いファイルを削除（最新1件以外）
            this.cleanupOldFiles();
            
            // 音声データをファイルに保存
            fs.writeFileSync(filepath, Buffer.from(audioData));
            
            // 感情分析を実行
            console.log('感情分析対象テキスト:', conversationText);
            const emotion = this.emotionAnalyzer.analyzeEmotion(conversationText);
            console.log('感情分析結果:', JSON.stringify(emotion, null, 2));
            
            // アプリに通知（音声再生+テキスト表示+感情）
            const notification = {
                type: 'voice-synthesis-hook',
                filepath: filepath,
                text: conversationText,
                timestamp: timestamp,
                character: 'shy',
                showInChat: true, // チャット画面に表示
                emotion: emotion  // 感情データを追加
            };
            
            // 通知ファイルを作成（アプリが監視）
            const notificationPath = path.join(this.tempDir, `notification_${timestamp}.json`);
            fs.writeFileSync(notificationPath, JSON.stringify(notification, null, 2));
            
            console.log(`音声合成+テキスト出力完了: ${filename}`);
            console.log(`生成された会話: ${conversationText}`);
            return filepath;
        } catch (error) {
            console.error('音声ファイル保存エラー:', error);
            throw error;
        }
    }

    // メイン処理
    async processClaudeResponse() {
        try {
            
            // 処理開始時に必ず設定を読み込み
            if (!this.configLoaded) {
                await this.loadConfig();
                this.configLoaded = true;
            }
            
            
            if (!this.voiceEnabled || !this.useHooks) {
                console.log('音声合成またはフック機能が無効です');
                return;
            }

            // 標準入力からClaude Code Hooksの JSON データを読み取り
            const stdin = process.stdin;
            let inputData = '';
            
            stdin.setEncoding('utf8');
            stdin.on('readable', () => {
                let chunk;
                while (null !== (chunk = stdin.read())) {
                    inputData += chunk;
                }
            });

            stdin.on('end', async () => {
                try {
                    
                    // JSONとして解析
                    const hookData = JSON.parse(inputData);
                    
                    // transcript_pathからClaude応答を取得
                    if (hookData.transcript_path && fs.existsSync(hookData.transcript_path)) {
                        const transcriptData = fs.readFileSync(hookData.transcript_path, 'utf8');
                        console.log('Transcript データ:', transcriptData.substring(0, 200) + '...');
                        
                        // 実際の応答テキストを抽出
                        const responseText = this.extractResponseFromTranscript(transcriptData);
                        console.log('抽出された応答テキスト:', responseText.substring(0, 200) + '...');
                        await this.processSpeechText(responseText);
                    } else {
                        console.log('transcript_pathが存在しません');
                    }
                } catch (error) {
                    console.error('音声合成処理エラー:', error);
                }
            });
        } catch (error) {
            console.error('フック処理エラー:', error);
        }
    }

    // トランスクリプトからClaude応答を抽出（会話ログ保存用フックと同じ方法）
    extractResponseFromTranscript(transcriptData) {
        try {
            console.log('トランスクリプト解析開始:', transcriptData.substring(0, 200) + '...');
            
            // JSONLファイルとして1行ずつ読み込み
            const lines = transcriptData.split('\n');
            const messages = [];
            
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine) {
                    try {
                        const msg = JSON.parse(trimmedLine);
                        messages.push(msg);
                    } catch (parseError) {
                        console.log('行の解析をスキップ:', trimmedLine.substring(0, 50) + '...');
                        continue;
                    }
                }
            }
            
            console.log(`解析されたメッセージ数: ${messages.length}`);
            
            // 最新のassistantメッセージを取得
            for (let i = messages.length - 1; i >= 0; i--) {
                const message = messages[i];
                
                // system メッセージやsummaryは除外
                if (message.type !== 'assistant') {
                    continue;
                }
                
                // messageフィールドから実際の内容を取得
                const msgContent = message.message || {};
                const speaker = msgContent.role;
                const content = msgContent.content;
                
                console.log(`メッセージ[${i}] - タイプ: ${message.type}, 話者: ${speaker}`);
                
                if (speaker === 'assistant' && content) {
                    // テキストコンテンツのみを抽出
                    let textContent = '';
                    if (Array.isArray(content)) {
                        const textItems = [];
                        for (const item of content) {
                            if (typeof item === 'object' && item.type === 'text') {
                                textItems.push(item.text || '');
                            }
                        }
                        textContent = textItems.join('\n');
                    } else {
                        textContent = String(content);
                    }
                    
                    console.log('抽出されたassistantメッセージ:', textContent.substring(0, 200) + '...');
                    return textContent;
                }
            }
            
            console.log('assistantメッセージが見つかりません');
            return '『エラーが発生したぞ...まあ、よくあることだ』';
            
        } catch (error) {
            console.error('トランスクリプト解析エラー:', error);
            return '『エラーが発生したぞ...まあ、よくあることだ』';
        }
    }

    // 最新の『』テキストのみを抽出
    extractLatestBracketText(responseText) {
        // 『』で囲まれたテキストを全て抽出
        const bracketMatches = responseText.match(/『[^』]*』/g);
        
        if (!bracketMatches || bracketMatches.length === 0) {
            return null;
        }
        
        // 最新の（最後の）『』テキストを取得
        const latestBracketText = bracketMatches[bracketMatches.length - 1];
        
        console.log(`抽出された『』テキスト: ${latestBracketText}`);
        console.log(`全体で${bracketMatches.length}個の『』テキストが見つかりました`);
        
        return latestBracketText;
    }


    // 音声合成テキスト処理（全ての『』テキストを順番に）
    async processSpeechText(responseText) {
        console.log(`Claude応答解析開始: ${responseText.substring(0, 100)}...`);

        // 設定が未読み込みの場合は読み込み
        if (!this.configLoaded) {
            await this.loadConfig();
            this.configLoaded = true;
        }


        // 1. 全ての『』テキストを抽出
        const bracketMatches = responseText.match(/『[^』]*』/g);
        
        if (!bracketMatches || bracketMatches.length === 0) {
            console.log('『』テキストが見つかりません - 音声合成をスキップ');
            return;
        }

        console.log(`${bracketMatches.length}個の『』テキストが見つかりました`);

        // 大量テキスト制限（バグ対策）
        const MAX_VOICE_TEXTS = 5;
        let processMatches = bracketMatches;
        
        if (bracketMatches.length > MAX_VOICE_TEXTS) {
            processMatches = bracketMatches.slice(0, MAX_VOICE_TEXTS);
            console.log(`⚠️ 音声読み上げ制限: ${bracketMatches.length}個中${MAX_VOICE_TEXTS}個のみ処理（負荷対策）`);
        }

        // 2. 各『』テキストを順番に処理
        for (let i = 0; i < processMatches.length; i++) {
            const bracketText = processMatches[i];
            console.log(`処理中 (${i + 1}/${processMatches.length}): ${bracketText}`);

            // 重複チェック（緊急修正：重複防止システムを有効化）
            if (this.isDuplicateText && this.isDuplicateText(bracketText)) {
                console.log('重複テキストのためスキップ:', bracketText.substring(0, 50));
                continue;
            }

            // 音声合成実行
            await this.processVoiceSynthesis(bracketText);

            // 次のテキストまで間隔を開ける（最後以外）
            if (i < processMatches.length - 1) {
                const intervalMs = this.voiceInterval * 1000; // 秒をミリ秒に変換
                console.log(`次の音声まで${this.voiceInterval}秒待機中...`);
                await new Promise(resolve => setTimeout(resolve, intervalMs));
            }
        }
    }

    // 音声合成の実行
    async processVoiceSynthesis(text) {
        // 接続確認
        if (!await this.checkConnection()) {
            console.error('AivisSpeech Engine に接続できません');
            return;
        }

        try {
            // 音声合成実行
            const audioData = await this.synthesizeText(text, this.selectedSpeaker);
            
            // 音声ファイル保存・通知（テキスト表示も含む）
            await this.saveAndNotifyAudio(audioData, text);
            
        } catch (error) {
            console.error('音声合成失敗:', error.message);
        }
    }
}

// メイン実行
if (require.main === module) {
    const service = new VoiceHookService();
    service.processClaudeResponse();
}

module.exports = VoiceHookService;