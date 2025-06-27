const axios = require('axios');

// ログレベル制御（本番環境でも有効）
const isProduction = false; // 常にデバッグログを有効化
const debugLog = console.log;
const infoLog = console.log;
const errorLog = console.error;

class VoiceService {
    constructor() {
        this.baseUrl = 'http://127.0.0.1:10101';
        this.audioQueue = [];
        this.isPlaying = false;
        this.audioContext = null;
        this.currentAudio = null;
        this.isConnected = false;
        this.speakers = [];
        
        // 動的タイムアウト設定
        this.minTimeout = 30000; // 30秒（最低）
        this.maxTimeout = 120000; // 120秒（最高）
        this.baseTimeout = 45000; // 45秒（基準）
        this.timeoutPerChar = 100; // 1文字あたり100ms追加
        
        // 再試行設定
        this.maxRetries = 3;
        this.retryBaseDelay = 1000; // 1秒
        this.retryMultiplier = 2;
        
        // エラー分類マップ
        this.errorTypes = {
            NETWORK: 'network',
            TIMEOUT: 'timeout',
            SERVER: 'server',
            SYNTHESIS: 'synthesis',
            UNKNOWN: 'unknown'
        };
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

    // 動的タイムアウト計算
    calculateTimeout(text) {
        const textLength = text ? text.length : 0;
        const dynamicTimeout = this.baseTimeout + (textLength * this.timeoutPerChar);
        return Math.min(Math.max(dynamicTimeout, this.minTimeout), this.maxTimeout);
    }
    
    // エラー分類
    classifyError(error) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            return this.errorTypes.NETWORK;
        }
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
            return this.errorTypes.TIMEOUT;
        }
        if (error.response && error.response.status >= 500) {
            return this.errorTypes.SERVER;
        }
        if (error.response && error.response.status >= 400) {
            return this.errorTypes.SYNTHESIS;
        }
        return this.errorTypes.UNKNOWN;
    }
    
    // 指数バックオフでの再試行
    async retryWithBackoff(fn, context, retryCount = 0) {
        try {
            return await fn();
        } catch (error) {
            const errorType = this.classifyError(error);
            
            if (retryCount >= this.maxRetries) {
                errorLog(`最大再試行回数に達しました (${retryCount}/${this.maxRetries}):`, {
                    context,
                    errorType,
                    message: error.message
                });
                throw new Error(`音声合成が失敗しました (${errorType}): ${error.message}`);
            }
            
            // ネットワークエラーやタイムアウトの場合のみ再試行
            if (errorType === this.errorTypes.NETWORK || errorType === this.errorTypes.TIMEOUT || errorType === this.errorTypes.SERVER) {
                const delay = this.retryBaseDelay * Math.pow(this.retryMultiplier, retryCount);
                
                infoLog(`音声合成エラー (${errorType}) - ${delay}ms後に再試行 (${retryCount + 1}/${this.maxRetries}):`, {
                    context,
                    error: error.message
                });
                
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.retryWithBackoff(fn, context, retryCount + 1);
            }
            
            // 再試行不可能なエラー
            errorLog('再試行不可能なエラー:', { errorType, message: error.message });
            throw new Error(`音声合成エラー (${errorType}): ${error.message}`);
        }
    }

    async synthesizeText(text, speaker = 0) {
        if (!this.isConnected) {
            throw new Error('AivisSpeech Engine not connected');
        }

        const timeout = this.calculateTimeout(text);
        debugLog(`音声合成開始: テキスト長=${text.length}文字, タイムアウト=${timeout}ms`);
        
        const synthesizeOperation = async () => {
            // Step 1: Get audio query with dynamic timeout
            const queryResponse = await axios.post(
                `${this.baseUrl}/audio_query`,
                null,
                {
                    params: { text, speaker },
                    headers: { 'accept': 'application/json' },
                    timeout: Math.floor(timeout * 0.4) // クエリには40%の時間を割り当て
                }
            );
            
            // Step 1.5: Optimize query for faster synthesis
            const queryData = queryResponse.data;
            if (queryData.speedScale) {
                queryData.speedScale = 1.2;  // 20%高速化
            }

            // Step 2: Synthesize audio with remaining timeout
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
                    timeout: Math.floor(timeout * 0.6) // 合成には60%の時間を割り当て
                }
            );

            return audioResponse.data;
        };
        
        return await this.retryWithBackoff(synthesizeOperation, `text=${text.substring(0, 30)}...`);
    }

    async speakText(text, speaker = 0) {
        try {
            // 動的タイムアウトで音声合成実行（再試行機構付き）
            const audioData = await this.synthesizeText(text, speaker);
            
            infoLog('音声合成完了:', {
                textLength: text.length,
                audioSize: audioData.byteLength
            });
            
            // 音声データはメインプロセスからレンダラープロセスに送信
            return { success: true, audioData };
        } catch (error) {
            const errorType = this.classifyError(error);
            errorLog('音声読み上げエラー:', {
                errorType,
                message: error.message,
                textLength: text.length
            });
            
            // エラー情報を詳細化して再スロー
            const enhancedError = new Error(`音声読み上げに失敗しました (${errorType}): ${error.message}`);
            enhancedError.errorType = errorType;
            enhancedError.originalError = error;
            throw enhancedError;
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
        const hasJapanese = /[あ-んア-ヶ一-龯]/.test(trimmed);
        const isLongEnough = trimmed.length > 10;
        
        debugLog('🔍 日本語チェック:', { hasJapanese, isLongEnough, length: trimmed.length });
        
        if (hasJapanese && isLongEnough) {
            debugLog('✅ 一般的な日本語テキストとして返却:', trimmed.substring(0, 50) + '...');
            return trimmed;
        }

        debugLog('⚠️ 有効なコンテンツが見つからずスキップ');
        debugLog('⚠️ スキップ理由:', { hasJapanese, isLongEnough, textSample: trimmed.substring(0, 100) });
        return null;
    }
}

module.exports = VoiceService;