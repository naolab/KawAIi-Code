/**
 * メッセージチャンク結合処理クラス
 * - Claude出力の断片化したメッセージを統合
 * - 完了判定とタイムアウト処理
 * - コールバック実行
 * - 重複防止システム統合
 */

class MessageAccumulator {
    constructor() {
        this.pendingMessage = '';
        this.lastChunkTime = 0;
        this.completionTimeout = AppConstants.MESSAGE.COMPLETION_TIMEOUT;
        this.completionTimer = null;
        this.isAccumulating = false;
        this.processCallback = null;
        this.errorHandler = window.ErrorHandler ? new window.ErrorHandler() : null;
        
        // 重複防止システム
        this.contentTracker = null;
        this.positionTracker = null;
        this.currentLine = 0;
        this.currentChar = 0;
        this.debugLogEnabled = true;
    }
    
    /**
     * 重複防止システムの初期化
     * @param {ContentTracker} contentTracker - コンテンツ追跡インスタンス
     * @param {TerminalPositionTracker} positionTracker - 位置追跡インスタンス
     */
    initDuplicatePrevention(contentTracker, positionTracker) {
        this.contentTracker = contentTracker;
        this.positionTracker = positionTracker;
        
        if (this.contentTracker) {
            this.contentTracker.setDebugLogging(this.debugLogEnabled);
        }
        
        this.debugLogSafe('🛡️ 重複防止システム初期化完了');
    }

    /**
     * 位置トラッカーの設定（後から設定可能）
     * @param {TerminalPositionTracker} positionTracker - 位置追跡インスタンス
     */
    setPositionTracker(positionTracker) {
        this.positionTracker = positionTracker;
        this.debugLogSafe('📍 位置トラッカー設定完了');
    }

    setProcessCallback(callback) {
        debugLog(`🔧 setProcessCallback呼び出し - コールバックタイプ:`, typeof callback);
        debugLog(`🔧 コールバック関数:`, callback);
        this.processCallback = callback;
        debugLog(`🔧 コールバック設定完了 - 現在のコールバック:`, this.processCallback);
    }
    
    addChunk(data) {
        // 現在の位置を更新
        this.updateCurrentPosition(data);
        
        const hasMarker = data.includes('⏺') || data.includes('✦');
        const hasQuotes = data.includes('『') && data.includes('』');
        
        // debugLog(`📝 MessageAccumulator.addChunk - マーカー: ${hasMarker}, 括弧: ${hasQuotes}, データ長: ${data.length}`);
        
        if (hasMarker) {
            // 新しいメッセージ開始
            if (this.isAccumulating) {
                debugLog(`🔄 既存メッセージを強制完了してから新メッセージ開始`);
                this.forceCompleteWithDuplicateCheck();
            }
            
            this.pendingMessage = data;
            this.lastChunkTime = Date.now();
            this.isAccumulating = true;
            debugLog(`🆕 新しいメッセージ蓄積開始 - 長さ: ${data.length}`);
            this.scheduleCompletion();
            
        } else if (this.isAccumulating) {
            // 既存メッセージに追加（蓄積中は全てのチャンクを統合）
            this.pendingMessage += '\n' + data;
            this.lastChunkTime = Date.now();
            debugLog(`➕ メッセージに追加 - 現在の総長: ${this.pendingMessage.length}`);
            this.scheduleCompletion();
            
        } else {
            // debugLog(`⏭️ チャンクをスキップ - 条件に合致せず`);
        }
    }

    /**
     * 現在の位置を更新
     * @param {string} data - 受信したデータ
     */
    updateCurrentPosition(data) {
        if (this.positionTracker) {
            // 位置トラッカーから正確な位置を取得
            const pos = this.positionTracker.getCurrentPosition();
            this.currentLine = pos.absoluteLine;
            this.currentChar = pos.char;
        } else {
            // フォールバック: データから位置を推定
            this.updatePositionFromData(data);
        }
    }

    /**
     * データから位置を推定（フォールバック）
     * @param {string} data - 受信したデータ
     */
    updatePositionFromData(data) {
        const lines = data.split('\n').length - 1;
        if (lines > 0) {
            this.currentLine += lines;
            this.currentChar = data.length - data.lastIndexOf('\n') - 1;
        } else {
            this.currentChar += data.length;
        }
    }
    
    // より賢い完了判定
    isMessageComplete(data) {
        // 1. 明確な終了マーカーがある（ユーザー入力プロンプト）
        const hasEndMarker = data.includes('\n> ') || data.includes('╭─') || data.includes('│ ');
        
        // 2. カギカッコが閉じられている
        const openQuotes = (data.match(/『/g) || []).length;
        const closeQuotes = (data.match(/』/g) || []).length;
        const quotesBalanced = openQuotes === closeQuotes && openQuotes > 0;
        
        // 3. 文章が完結している
        const endsWithPunctuation = /[。！？][\s\n]*$/.test(data.trim());
        
        debugLog(`🔍 完了判定チェック:`, {
            hasEndMarker,
            quotesBalanced: `${openQuotes}/${closeQuotes}`,
            endsWithPunctuation,
            dataEnd: data.trim().slice(-20)
        });
        
        return hasEndMarker || (quotesBalanced && endsWithPunctuation);
    }
    
    scheduleCompletion() {
        // 即座に完了判定をチェック
        if (this.isMessageComplete(this.pendingMessage)) {
            debugLog(`✅ 即座に完了 - 完了条件を満たしています`);
            clearTimeout(this.completionTimer);
            this.complete();
            return;
        }
        
        clearTimeout(this.completionTimer);
        this.completionTimer = setTimeout(() => {
            this.complete();
        }, this.completionTimeout);
        
        debugLog(`⏰ 完了タイマーを${this.completionTimeout}ms後に設定`);
    }
    
    forceComplete() {
        clearTimeout(this.completionTimer);
        this.complete();
    }

    /**
     * 重複チェック付きの強制完了
     */
    forceCompleteWithDuplicateCheck() {
        // 既存のメッセージがある場合のみ処理
        if (this.isAccumulating && this.pendingMessage && this.pendingMessage.trim()) {
            this.debugLogSafe('🔄 既存メッセージを重複チェック付きで強制完了');
            this.completeWithDuplicateCheck();
        } else {
            this.debugLogSafe('📭 強制完了: 処理対象なし');
            this.reset();
        }
    }
    
    complete() {
        // 重複チェック付きの完了処理を呼び出し
        this.completeWithDuplicateCheck();
    }

    /**
     * 重複チェック付きの完了処理
     */
    completeWithDuplicateCheck() {
        if (!this.isAccumulating || !this.pendingMessage) {
            debugLog(`❌ 完了処理スキップ - 蓄積中でないかメッセージが空`);
            debugLog(`❌ デバッグ情報:`, {
                isAccumulating: this.isAccumulating,
                messageLength: this.pendingMessage ? this.pendingMessage.length : 0,
                hasCallback: !!this.processCallback
            });
            return;
        }
        
        debugLog(`✅ メッセージ蓄積完了 - 最終長: ${this.pendingMessage.length}`);
        debugLog(`✅ 蓄積時間: ${Date.now() - this.lastChunkTime + this.completionTimeout}ms`);
        debugLog(`🔔 complete()呼び出し - コールバック有無:`, !!this.processCallback);
        debugLog(`🔔 コールバック関数:`, this.processCallback);
        
        const completeMessage = this.pendingMessage;
        const content = this.extractVoiceText(completeMessage);
        
        // 重複チェック
        if (content && this.contentTracker) {
            if (!this.contentTracker.isNewContent(content, this.currentLine, this.currentChar)) {
                this.debugLogSafe(`🚫 重複コンテンツをスキップ: "${content.substring(0, 50)}..."`);
                this.reset();
                return;
            }
            
            // 処理済みとしてマーク
            this.contentTracker.markAsProcessed(content, this.currentLine, this.currentChar);
            this.debugLogSafe(`🎵 新しい音声コンテンツを検出: "${content.substring(0, 50)}..."`);
        }
        
        // メッセージをリセット
        this.pendingMessage = '';
        this.isAccumulating = false;
        this.completionTimer = null;
        
        if (this.processCallback) {
            debugLog(`📞 コールバック実行開始 - メッセージ長: ${completeMessage.length}`);
            debugLog(`📞 メッセージサンプル:`, completeMessage.substring(0, 100) + '...');
            
            // 大量『』テキスト制限（バグ対策）
            const processedMessage = this.limitVoiceTexts(completeMessage);
            
            try {
                this.processCallback(processedMessage);
                debugLog(`📞 コールバック実行完了`);
            } catch (error) {
                if (this.errorHandler) {
                    this.errorHandler.handle(error, {
                        severity: ErrorHandler.SEVERITY.MEDIUM,
                        category: ErrorHandler.CATEGORY.PROCESS,
                        operation: 'message-callback-execution',
                        userMessage: 'メッセージ処理中にエラーが発生しました'
                    });
                } else {
                    debugError('メッセージ処理中にエラーが発生しました:', error);
                }
            }
        } else {
            debugError(`❌ コールバックが設定されていません！`);
            debugError(`❌ メッセージが破棄されました:`, completeMessage.substring(0, 100) + '...');
        }
    }

    /**
     * 音声テキスト（『』で囲まれた部分）を抽出
     * @param {string} message - 抽出対象のメッセージ
     * @returns {string|null} 抽出されたテキスト
     */
    extractVoiceText(message) {
        if (!message || typeof message !== 'string') {
            return null;
        }
        
        // 『』で囲まれたテキストを抽出
        const matches = message.match(/『([^』]+)』/g);
        if (matches && matches.length > 0) {
            // 複数ある場合は結合
            return matches.map(match => match.slice(1, -1)).join(' ');
        }
        
        return null;
    }

    /**
     * 安全なデバッグログ（デバッグモード時のみ出力）
     * @param {string} message - ログメッセージ
     * @param {...any} args - 追加の引数
     */
    debugLogSafe(message, ...args) {
        if (this.debugLogEnabled && typeof debugLog === 'function') {
            debugLog(message, ...args);
        }
    }

    /**
     * メッセージアキュムレータのリセット
     */
    reset() {
        this.pendingMessage = '';
        this.isAccumulating = false;
        this.completionTimer = null;
        this.debugLogSafe('🔄 MessageAccumulator リセット');
    }
    
    /**
     * 現在の蓄積状態を取得（デバッグ用）
     * @returns {object} 状態情報
     */
    getStatus() {
        const baseStatus = {
            isAccumulating: this.isAccumulating,
            messageLength: this.pendingMessage.length,
            timeSinceLastChunk: Date.now() - this.lastChunkTime,
            hasTimer: !!this.completionTimer,
            currentPosition: `L${this.currentLine}:C${this.currentChar}`
        };

        // 重複防止システムの統計情報を追加
        if (this.contentTracker) {
            baseStatus.duplicatePrevention = this.contentTracker.getStats();
        }

        return baseStatus;
    }

    /**
     * デバッグログの有効/無効切り替え
     * @param {boolean} enabled - ログを有効にするかどうか
     */
    setDebugLogging(enabled) {
        this.debugLogEnabled = enabled;
        if (this.contentTracker) {
            this.contentTracker.setDebugLogging(enabled);
        }
        this.debugLogSafe(`🐛 デバッグログ: ${enabled ? '有効' : '無効'}`);
    }

    /**
     * 重複防止システムのクリア（デバッグ用）
     */
    clearDuplicatePrevention() {
        if (this.contentTracker) {
            this.contentTracker.clear();
            this.debugLogSafe('🧹 重複防止システムをクリア');
        }
    }

    /**
     * 大量『』テキスト制限（バグ対策）
     * @param {string} message - 処理対象メッセージ
     * @returns {string} 制限適用後のメッセージ
     */
    limitVoiceTexts(message) {
        const quotedMatches = message.match(/『[^』]*』/g);
        
        if (!quotedMatches) {
            return message;
        }
        
        const MAX_QUOTED_TEXTS = 10;
        
        if (quotedMatches.length <= MAX_QUOTED_TEXTS) {
            return message;
        }
        
        // 最初の10個のみ残す
        const limitedQuotes = quotedMatches.slice(0, MAX_QUOTED_TEXTS);
        const remaining = quotedMatches.length - MAX_QUOTED_TEXTS;
        
        // 元のメッセージから『』を削除
        let limitedMessage = message.replace(/『[^』]*』/g, '');
        
        // 制限された『』テキストを追加
        limitedMessage += limitedQuotes.join('');
        
        // 要約メッセージを追加
        limitedMessage += `『他に${remaining}個のメッセージがあるが、負荷対策で省略したぞ』`;
        
        this.debugLogSafe(`⚠️ 音声テキスト制限: ${quotedMatches.length}個中${MAX_QUOTED_TEXTS}個のみ処理`);
        
        return limitedMessage;
    }
}

// ブラウザ環境での利用
if (typeof window !== 'undefined') {
    window.MessageAccumulator = MessageAccumulator;
}

// Node.js環境での利用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MessageAccumulator;
}