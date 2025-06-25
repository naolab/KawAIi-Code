const axios = require('axios');

// ログレベル制御（本番環境では詳細ログを無効化）
const isProduction = process.env.NODE_ENV === 'production';
const debugLog = isProduction ? () => {} : console.log;
const infoLog = console.log; // 重要な情報は常に出力
const errorLog = console.error; // エラーは常に出力

class VoiceService {
    constructor() {
        this.baseUrl = 'http://127.0.0.1:10101';
        this.audioQueue = [];
        this.isPlaying = false;
        this.audioContext = null;
        this.currentAudio = null;
        this.isConnected = false;
        this.speakers = [];
    }

    async checkConnection() {
        try {
            const response = await axios.get(`${this.baseUrl}/version`, { timeout: 10000 });
            this.isConnected = true;
            return { success: true, version: response.data.version };
        } catch (error) {
            this.isConnected = false;
            return { success: false, error: 'AivisSpeech Engine not running' };
        }
    }

    async getSpeakers() {
        try {
            const response = await axios.get(`${this.baseUrl}/speakers`);
            this.speakers = response.data;
            return this.speakers;
        } catch (error) {
            console.error('Failed to get speakers:', error);
            return [];
        }
    }

    async synthesizeText(text, speaker = 0) {
        if (!this.isConnected) {
            throw new Error('AivisSpeech Engine not connected');
        }

        try {
            // Step 1: Get audio query with speed optimization
            const queryResponse = await axios.post(
                `${this.baseUrl}/audio_query`,
                null,
                {
                    params: { text, speaker },
                    headers: { 'accept': 'application/json' },
                    timeout: 30000  // 30秒タイムアウト
                }
            );
            
            // Step 1.5: Optimize query for faster synthesis
            const queryData = queryResponse.data;
            if (queryData.speedScale) {
                queryData.speedScale = 1.2;  // 20%高速化
            }

            // Step 2: Synthesize audio with optimized query
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
                    timeout: 45000  // 45秒タイムアウト
                }
            );

            return audioResponse.data;
        } catch (error) {
            console.error('Voice synthesis error:', error);
            throw error;
        }
    }

    async speakText(text, speaker = 0) {
        try {
            // 音声合成を非同期で開始（Promise化でタイムアウト対応）
            const synthesisPromise = this.synthesizeText(text, speaker);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Speech synthesis timeout')), 60000)
            );
            
            const audioData = await Promise.race([synthesisPromise, timeoutPromise]);
            // 音声データはメインプロセスからレンダラープロセスに送信
            return { success: true, audioData };
        } catch (error) {
            console.error('Text-to-speech error:', error);
            throw error;
        }
    }

    // キューシステムは削除（レンダラープロセスで管理）
    
    stopAudio() {
        // レンダラープロセスに停止信号を送信
        return { success: true };
    }

    clearQueue() {
        // レンダラープロセスに停止信号を送信
        return { success: true };
    }

    // Parse terminal output to extract text for TTS
    parseTerminalOutput(data) {
        // セキュリティ上の理由でターミナルデータの詳細ログは出力しない
        debugLog('ターミナルデータ解析中, データ長:', data.length, '文字');
        
        // より強力なANSI除去処理
        let cleanText = data
            .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '') // 基本的なANSIエスケープシーケンス
            .replace(/Claude PTY data:\s*/g, '') // Claude PTY data: を除去
            .replace(/\x1b\][0-2];[^\x07]*\x07/g, '') // OSC sequences
            .replace(/\x1b\[[0-9;]*[HfABCDEFGJKmhlpsu]/g, '') // より多くのANSI制御文字
            .replace(/\x1b\([AB01]/g, '') // 文字セット選択
            .replace(/[\x00-\x08\x0B-\x1F\x7F-\x9F]/g, ' ') // 制御文字除去
            .replace(/\r?\n/g, ' ') // 改行を空白に
            .replace(/\s+/g, ' '); // 連続空白を単一空白に

        const trimmed = cleanText.trim();
        // セキュリティ上の理由で詳細テキストは出力せず長さのみ記録
        debugLog('テキスト整理完了, 文字数:', trimmed.length);
        
        // 空文字やごく短いテキストをスキップ
        if (trimmed.length < 3) {
            debugLog('スキップ: 文字数不足');
            return null;
        }

        // ⏺記号がない場合でユーザー入力パターンを事前チェック
        if (!trimmed.includes('⏺')) {
            // ⏺記号がない場合はユーザー入力の可能性が高い
            if (trimmed.includes('>') || (trimmed.includes('╭') && trimmed.includes('│'))) {
                debugLog('スキップ: ユーザー入力の可能性');
                return null;
            }
        }

        // ⏺記号での会話抽出（最優先）  
        if (trimmed.includes('⏺')) {
            debugLog('⏺記号を検出, 会話抽出開始');
            
            // ⏺の直後から会話内容を抽出
            const circleIndex = trimmed.indexOf('⏺');
            if (circleIndex !== -1) {
                let afterCircle = trimmed.substring(circleIndex + 1).trim();
                
                debugLog('⏺後のテキスト長:', afterCircle.length, '文字');
                
                // 状態インジケーターやUI要素を除去
                afterCircle = afterCircle
                    .replace(/^[⚒↓⭐✶✻✢·✳]+\s*/g, '') // 先頭の記号を除去
                    .replace(/\s*[✢✳✶✻✽·⚒↓↑]\s*(Synthesizing|Conjuring|Spinning|Vibing|Computing|Mulling|Pondering|musing|thinking).*$/gi, '') // ステータス除去（優先）
                    .replace(/\s*\([0-9]+s[^)]*\).*$/g, '') // 時間表示除去
                    .replace(/\s*tokens.*$/gi, '') // トークン情報除去
                    .replace(/\s*[│╭╯╰┌┐┬┴┼─═║╔╗╚╝╠╣╦╩╬]+.*$/g, '') // ボックス描画文字除去（ユーザー入力ボックス含む）
                    .replace(/\s*>\s*[^│]*$/g, '') // ユーザー入力プロンプト除去
                    .replace(/\s*\?\s*for\s+shortcuts.*$/gi, '') // ショートカット情報除去
                    .replace(/\s*interrupt.*$/gi, '') // interrupt情報除去
                    .replace(/\s*\[[0-9;]+m.*$/g, '') // ANSI残存除去
                    .trim();
                
                debugLog('クリーンアップ完了, 最終文字数:', afterCircle.length);
                
                // 早期読み上げ用: 短い文でも読み上げ開始
                if (afterCircle.length > 15) {
                    // 日本語文字、句読点、絵文字を含むかチェック
                    const hasJapanese = /[あ-んア-ヶ一-龯]/.test(afterCircle);
                    const hasPunctuation = /[。！？\.\!\?]/.test(afterCircle);
                    const hasEmoji = /[✨🎀💕]/.test(afterCircle);
                    const hasValidChars = /[a-zA-Z]/.test(afterCircle) && afterCircle.length > 10;
                    
                    debugLog('コンテンツ検証:', {
                        hasJapanese,
                        hasPunctuation,
                        hasEmoji,
                        hasValidChars,
                        length: afterCircle.length
                    });
                    
                    if (hasJapanese || hasPunctuation || hasEmoji || hasValidChars) {
                        // 文章の長さに応じた最適化
                        let finalText = afterCircle;
                        
                        // 100文字以上の場合は文末で区切って先に読み上げ
                        if (finalText.length > 100) {
                            // 句読点での区切りを優先
                            const sentenceEnd = finalText.search(/[。！？]/);
                            if (sentenceEnd !== -1 && sentenceEnd < 150) {
                                finalText = finalText.substring(0, sentenceEnd + 1);
                            } else {
                                // 句読点がない場合は80文字程度で区切る
                                finalText = finalText.substring(0, 80) + '...';
                            }
                        }
                        
                        // 箇条書きやリストが多い場合は最初の部分のみ読み上げる
                        if (finalText.includes('-') && finalText.length > 150) {
                            const lines = finalText.split(/[\r\n]/);
                            const firstMeaningfulLines = lines.slice(0, 2).join(' ');
                            finalText = firstMeaningfulLines + '...など！';
                        }
                        
                        debugLog('抽出した会話を返却 (最適化済み):', finalText.substring(0, 50) + '...');
                        return finalText;
                    }
                }
                
                debugLog('⏺が見つかったが音声合成に適さないコンテンツ');
                return null;
            }
        }

        // skipPatternsを削除 - カッコ制限以外のスキップ処理を除去

        // 一般的な日本語テキストとして処理
        if (/[あ-んア-ヶ一-龯]/.test(trimmed) && trimmed.length > 10) {
            debugLog('一般的な日本語テキストを返却:', trimmed.substring(0, 50) + '...');
            return trimmed;
        }

        debugLog('有効なコンテンツが見つからずスキップ');
        return null;
    }
}

module.exports = VoiceService;