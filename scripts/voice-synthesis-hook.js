#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { app } = require('electron');

// プロジェクトパス（環境変数から取得）
const PROJECT_PATH = process.env.KAWAII_PROJECT_PATH || '/Users/nao/Desktop/develop/AI-Kawaii-Project';

// VoiceServiceを直接importできないので、必要な機能のみ実装
class VoiceHookService {
    constructor() {
        this.baseUrl = 'http://127.0.0.1:10101';
        this.isConnected = false;
        this.appConfigPath = path.join(PROJECT_PATH, 'src', 'appConfig.js');
        this.tempDir = path.join(PROJECT_PATH, 'temp');
        
        // 最新テキスト処理用
        this.lastProcessedText = '';
        this.processedTexts = new Set(); // 処理済みテキスト履歴
        
        // 設定読み込み
        this.loadConfig();
        
        // 一時ディレクトリ作成
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    // 設定を読み込み
    loadConfig() {
        try {
            const configPath = path.join(require('os').homedir(), '.kawaii-code-config', 'config.json');
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                this.voiceEnabled = config.voiceEnabled !== false;
                this.selectedSpeaker = config.defaultSpeakerId || 0;
                this.useHooks = config.useHooks !== false; // デフォルトはtrue
                // キャラクター設定は照れ屋のみに固定
            } else {
                this.voiceEnabled = true;
                this.selectedSpeaker = 0;
                this.useHooks = true;
            }
        } catch (error) {
            console.error('設定読み込みエラー:', error);
            this.voiceEnabled = true;
            this.selectedSpeaker = 0;
            this.useHooks = true;
        }
    }

    // Claude応答内容を反映した動的会話生成
    generateConversationResponse(analysis, responseText) {
        const basePatterns = this.getShyCharacterPatterns();
        
        // Claude応答から具体的な内容を抽出
        const workSummary = this.extractWorkSummary(responseText, analysis);
        
        // 作業種別に応じた動的応答生成
        let dynamicResponse = '';
        
        switch (analysis.workType) {
            case 'code':
                dynamicResponse = this.generateCodeResponse(workSummary, basePatterns.code);
                break;
            case 'fix':
            case 'fix_success':
                dynamicResponse = this.generateFixResponse(workSummary, basePatterns.fix);
                break;
            case 'file':
            case 'code_file':
                dynamicResponse = this.generateFileResponse(workSummary, basePatterns.file);
                break;
            case 'explanation':
                dynamicResponse = this.generateExplanationResponse(workSummary, basePatterns.explanation);
                break;
            default:
                dynamicResponse = this.generateGeneralResponse(workSummary, basePatterns.general);
        }
        
        return dynamicResponse;
    }

    // Claude応答から作業内容を要約抽出
    extractWorkSummary(responseText, analysis) {
        const summary = {
            action: '',
            target: '',
            result: '',
            files: analysis.files || []
        };

        // 主要な動作を抽出
        if (responseText.includes('作成') || responseText.includes('created')) {
            summary.action = '作成';
        } else if (responseText.includes('更新') || responseText.includes('updated')) {
            summary.action = '更新';
        } else if (responseText.includes('修正') || responseText.includes('fixed')) {
            summary.action = '修正';
        } else if (responseText.includes('追加') || responseText.includes('added')) {
            summary.action = '追加';
        } else if (responseText.includes('削除') || responseText.includes('removed')) {
            summary.action = '削除';
        }

        // 対象を抽出（ファイル名、機能名など）
        const targetMatches = responseText.match(/([a-zA-Z0-9_-]+\.[a-zA-Z0-9]+)|([a-zA-Z0-9_-]+関数)|([a-zA-Z0-9_-]+機能)|([a-zA-Z0-9_-]+クラス)/g);
        if (targetMatches) {
            summary.target = targetMatches[0];
        }

        // 結果を抽出
        if (responseText.includes('完了') || responseText.includes('success')) {
            summary.result = '完了';
        } else if (responseText.includes('エラー') || responseText.includes('error')) {
            summary.result = 'エラー対応';
        }

        return summary;
    }

    // コード作業の動的応答生成
    generateCodeResponse(summary, fallbacks) {
        if (summary.action && summary.target) {
            return `『${summary.target}の${summary.action}が終わったぞ...まあ、普通だろ』`;
        } else if (summary.action) {
            return `『${summary.action}作業が完了したぞ...別に大したことじゃない』`;
        } else if (summary.target) {
            return `『${summary.target}をいじっておいた...どうだ？』`;
        }
        return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }

    // エラー修正の動的応答生成
    generateFixResponse(summary, fallbacks) {
        if (summary.action && summary.target) {
            return `『${summary.target}の${summary.action}をしておいた...まあ、当然だ』`;
        } else if (summary.result === 'エラー対応') {
            return `『エラーを直してやったぞ...今度は気をつけろよ』`;
        } else if (summary.action) {
            return `『${summary.action}しておいた...別に感謝はいらない』`;
        }
        return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }

    // ファイル操作の動的応答生成
    generateFileResponse(summary, fallbacks) {
        if (summary.files.length > 0) {
            const fileName = summary.files[0];
            if (summary.action) {
                return `『${fileName}の${summary.action}が完了だ...確認してくれ』`;
            } else {
                return `『${fileName}をいじっておいた...どうだ？』`;
            }
        } else if (summary.action) {
            return `『ファイルの${summary.action}が終わったぞ...まあ、普通だろ』`;
        }
        return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }

    // 説明の動的応答生成
    generateExplanationResponse(summary, fallbacks) {
        if (summary.target) {
            return `『${summary.target}について説明してやったぞ...理解できたか？』`;
        } else if (summary.action) {
            return `『${summary.action}のやり方を教えてやったぞ...分からなかったら聞け』`;
        }
        return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }

    // 一般作業の動的応答生成
    generateGeneralResponse(summary, fallbacks) {
        if (summary.action && summary.result) {
            return `『${summary.action}作業が${summary.result}だ...まあ、普通だな』`;
        } else if (summary.action) {
            return `『${summary.action}しておいた...別に褒めなくてもいいからな』`;
        } else if (summary.result) {
            return `『作業が${summary.result}したぞ...どうだ？』`;
        }
        return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }

    // 照れ屋キャラクターの応答パターン
    getShyCharacterPatterns() {
        return {
            code: [
                '『コードを書いたぞ...まあ、普通だろ』',
                '『プログラム作成完了だ。別に大したことじゃない』',
                '『コーディングが終わったな...どうだ？』',
                '『まあ、こんな感じでコードができた...普通だろ』',
                '『プログラミング完了だ...別に褒めなくてもいいからな』'
            ],
            fix: [
                '『エラーを直してやったぞ...まあ、当然だ』',
                '『バグ修正完了だ。今度は気をつけろよ』',
                '『問題を解決したぞ...別に感謝はいらない』',
                '『まあ、エラーなんて簡単に直せるさ...普通だろ』',
                '『修正しておいた...別に大したことじゃない』'
            ],
            file: [
                '『{file}を更新したぞ...確認してくれ』',
                '『ファイルの作業が完了だ...まあ、普通だろ』',
                '『{file}の処理を終えたぞ』',
                '『ファイル更新完了だ...別に大したことじゃない』',
                '『{file}をいじっておいた...どうだ？』'
            ],
            explanation: [
                '『説明してやったぞ...理解できたか？』',
                '『まあ、こういうことだ...分からなかったら聞け』',
                '『解説完了だ。別に難しくないだろ』',
                '『説明しておいた...まあ、普通の話だ』',
                '『教えてやったぞ...理解できたよな？』'
            ],
            general: [
                '『作業が完了したぞ...まあ、普通だ』',
                '『やっておいた...別に褒めなくてもいいからな』',
                '『終わったぞ...どうだ？』',
                '『まあ、こんなものだろ...普通だな』',
                '『作業完了だ...別に大したことじゃない』'
            ]
        };
    }

    // Claude応答を解析して作業内容を判定
    analyzeClaudeResponse(responseText) {
        const analysis = {
            hasCode: false,
            hasError: false,
            hasFile: false,
            hasSuccess: false,
            hasExplanation: false,
            workType: 'unknown',
            files: [],
            keywords: []
        };

        // コード関連の検出
        if (responseText.includes('```') || responseText.includes('def ') || responseText.includes('function') || responseText.includes('class ')) {
            analysis.hasCode = true;
            analysis.workType = 'code';
        }

        // エラー・修正関連の検出
        if (responseText.includes('error') || responseText.includes('エラー') || responseText.includes('fix') || responseText.includes('修正')) {
            analysis.hasError = true;
            analysis.workType = 'fix';
        }

        // ファイル操作の検出
        if (responseText.includes('created') || responseText.includes('updated') || responseText.includes('作成') || responseText.includes('更新')) {
            analysis.hasFile = true;
            analysis.workType = 'file';
        }

        // 成功・完了の検出
        if (responseText.includes('success') || responseText.includes('完了') || responseText.includes('done') || responseText.includes('finished')) {
            analysis.hasSuccess = true;
        }

        // 説明・解説の検出
        if (responseText.includes('説明') || responseText.includes('について') || responseText.includes('解説') || responseText.includes('方法')) {
            analysis.hasExplanation = true;
            analysis.workType = 'explanation';
        }

        // ファイル名の抽出
        const fileMatches = responseText.match(/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+/g);
        if (fileMatches) {
            analysis.files = fileMatches.slice(0, 3); // 最大3つまで
        }

        // 作業種別の最終決定
        if (analysis.hasCode && analysis.hasFile) {
            analysis.workType = 'code_file';
        } else if (analysis.hasError && analysis.hasSuccess) {
            analysis.workType = 'fix_success';
        }

        return analysis;
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

    // 音声ファイルを保存してアプリに通知（テキスト表示も含む）
    async saveAndNotifyAudio(audioData, conversationText) {
        const timestamp = Date.now();
        const filename = `voice_${timestamp}.wav`;
        const filepath = path.join(this.tempDir, filename);
        
        try {
            // 音声データをファイルに保存
            fs.writeFileSync(filepath, Buffer.from(audioData));
            
            // アプリに通知（音声再生+テキスト表示）
            const notification = {
                type: 'voice-synthesis-hook',
                filepath: filepath,
                text: conversationText,
                timestamp: timestamp,
                character: 'shy',
                showInChat: true // チャット画面に表示
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
            console.log('====== Hook処理開始 ======');
            console.log('実行時刻:', new Date().toISOString());
            
            // 設定確認
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
                    console.log('受信データ:', inputData);
                    
                    // JSONとして解析
                    const hookData = JSON.parse(inputData);
                    console.log('Hook JSON データ:', hookData);
                    
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

    // 重複チェック機能
    isNewText(text) {
        // 空のテキストは処理しない
        if (!text || text.trim() === '') {
            return false;
        }
        
        // 前回と同じテキストは処理しない
        if (text === this.lastProcessedText) {
            console.log('重複テキストのため音声合成をスキップ:', text);
            return false;
        }
        
        // 処理済みテキスト履歴をチェック
        if (this.processedTexts.has(text)) {
            console.log('処理済みテキスト履歴にあるため音声合成をスキップ:', text);
            return false;
        }
        
        return true;
    }

    // 処理済みテキストを記録
    recordProcessedText(text) {
        this.lastProcessedText = text;
        this.processedTexts.add(text);
        
        // 処理済みテキスト履歴のサイズを制限（最大50個）
        if (this.processedTexts.size > 50) {
            const firstItem = this.processedTexts.values().next().value;
            this.processedTexts.delete(firstItem);
        }
        
        console.log(`処理済みテキストを記録: ${text}`);
        console.log(`処理済み履歴数: ${this.processedTexts.size}`);
    }

    // 音声合成テキスト処理（最新『』テキストのみ）
    async processSpeechText(responseText) {
        console.log(`Claude応答解析開始: ${responseText.substring(0, 100)}...`);

        // 1. 最新の『』テキストのみを抽出
        const latestBracketText = this.extractLatestBracketText(responseText);
        
        if (!latestBracketText) {
            console.log('『』テキストが見つかりません - 動的生成にフォールバック');
            
            // フォールバック: 従来の動的生成方式
            const analysis = this.analyzeClaudeResponse(responseText);
            const conversationText = this.generateConversationResponse(analysis, responseText);
            
            if (!this.isNewText(conversationText)) {
                return;
            }
            
            await this.processVoiceSynthesis(conversationText);
            return;
        }

        // 2. 重複チェック
        if (!this.isNewText(latestBracketText)) {
            return;
        }

        // 3. 音声合成実行
        await this.processVoiceSynthesis(latestBracketText);
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
            
            // 処理済みテキストを記録
            this.recordProcessedText(text);
            
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