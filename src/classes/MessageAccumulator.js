/**
 * メッセージチャンク結合処理クラス
 * - Claude出力の断片化したメッセージを統合
 * - 完了判定とタイムアウト処理
 * - コールバック実行
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
    }
    
    setProcessCallback(callback) {
        debugLog(`🔧 setProcessCallback呼び出し - コールバックタイプ:`, typeof callback);
        debugLog(`🔧 コールバック関数:`, callback);
        this.processCallback = callback;
        debugLog(`🔧 コールバック設定完了 - 現在のコールバック:`, this.processCallback);
    }
    
    addChunk(data) {
        const hasMarker = data.includes('⏺') || data.includes('✦');
        const hasQuotes = data.includes('『') && data.includes('』');
        
        // debugLog(`📝 MessageAccumulator.addChunk - マーカー: ${hasMarker}, 括弧: ${hasQuotes}, データ長: ${data.length}`);
        
        if (hasMarker) {
            // 新しいメッセージ開始
            if (this.isAccumulating) {
                debugLog(`🔄 既存メッセージを強制完了してから新メッセージ開始`);
                this.forceComplete();
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
    
    complete() {
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
        this.pendingMessage = '';
        this.isAccumulating = false;
        this.completionTimer = null;
        
        if (this.processCallback) {
            debugLog(`📞 コールバック実行開始 - メッセージ長: ${completeMessage.length}`);
            debugLog(`📞 メッセージサンプル:`, completeMessage.substring(0, 100) + '...');
            
            try {
                this.processCallback(completeMessage);
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
    
    // 現在の蓄積状態を取得（デバッグ用）
    getStatus() {
        return {
            isAccumulating: this.isAccumulating,
            messageLength: this.pendingMessage.length,
            timeSinceLastChunk: Date.now() - this.lastChunkTime,
            hasTimer: !!this.completionTimer
        };
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