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
        
        // シンプル重複防止システム
        this.duplicateChecker = new SimpleDuplicateChecker();
        this.debugLogEnabled = true;
        this.logPrefix = '📝 [MessageAccumulator]';
        
        // TabManager参照（親タブ判定用）
        this.tabManager = null;
        
        // セッションID（ログ用）
        this.sessionId = null;
        
        // ログシステム準備状態
        this.loggerReady = false;
        this.pendingLogs = [];
        
        // ConversationLogger準備完了を待機
        this.waitForLoggerReady();
    }
    
    /**
     * 重複防止システムの設定
     * @param {boolean} enabled - デバッグログを有効にするかどうか
     */
    initDuplicatePrevention(enabled = true) {
        this.duplicateChecker.setDebugLogging(enabled);
        this.debugLogSafe('🛡️ シンプル重複防止システム初期化完了');
    }

    /**
     * TabManagerの参照を設定
     * @param {TabManager} tabManager - TabManagerのインスタンス
     */
    setTabManager(tabManager) {
        this.tabManager = tabManager;
        this.debugLogSafe('🗂️ TabManager参照を設定');
    }

    /**
     * 現在のタブが親タブかどうかを判定
     * @returns {boolean} 親タブの場合true
     */
    isCurrentTabParent() {
        if (!this.tabManager) {
            this.debugLogSafe('🗂️ TabManager未設定 - 音声処理をスキップ（安全側）');
            return false; // 安全優先: 不明な場合は音声処理をスキップ
        }
        
        if (!this.tabManager.parentTabId) {
            this.debugLogSafe('🗂️ 親タブID未設定 - 音声処理をスキップ（安全側）');
            return false; // 安全優先: 不明な場合は音声処理をスキップ
        }
        
        const parentTab = this.tabManager.tabs[this.tabManager.parentTabId];
        const isParent = parentTab && parentTab.isParent;
        
        this.debugLogSafe(`🗂️ 親タブ判定: ${isParent ? '親タブ' : '非親タブ'} (ID: ${this.tabManager.parentTabId})`);
        return isParent;
    }

    setProcessCallback(callback) {
        debugLog(`🔧 setProcessCallback呼び出し - コールバックタイプ:`, typeof callback);
        debugLog(`🔧 コールバック関数:`, callback);
        this.processCallback = callback;
        debugLog(`🔧 コールバック設定完了 - 現在のコールバック:`, this.processCallback);
    }
    
    addChunk(data) {
        const hasMarker = data.includes('⏺') || data.includes('✦');
        const hasQuotes = data.includes('◆') && data.includes('◇');
        
        this.debugLogSafe(`${this.logPrefix} 🔍 チャンク受信: マーカー=${hasMarker}, 括弧=${hasQuotes}, 長さ=${data.length}, プレビュー="${data.substring(0, 30)}..."`);
        
        if (hasMarker) {
            // 新しいメッセージ開始
            if (this.isAccumulating) {
                this.debugLogSafe(`${this.logPrefix} 🔄 既存メッセージを強制完了してから新メッセージ開始`);
                this.forceComplete();
            }
            
            this.pendingMessage = data;
            this.lastChunkTime = Date.now();
            this.isAccumulating = true;
            this.debugLogSafe(`${this.logPrefix} 🆕 新しいメッセージ蓄積開始 - 長さ: ${data.length}`);
            this.scheduleCompletion();
            
        } else if (this.isAccumulating) {
            // 既存メッセージに追加（蓄積中は全てのチャンクを統合）
            this.pendingMessage += '\n' + data;
            this.lastChunkTime = Date.now();
            this.debugLogSafe(`${this.logPrefix} ➕ メッセージに追加 - 現在の総長: ${this.pendingMessage.length}`);
            this.scheduleCompletion();
            
        } else {
            this.debugLogSafe(`${this.logPrefix} ⏭️ チャンクをスキップ - 条件に合致せず`);
        }
    }

    
    // より賢い完了判定
    isMessageComplete(data) {
        // 1. 明確な終了マーカーがある（ユーザー入力プロンプト）
        const hasEndMarker = data.includes('\n> ') || data.includes('╭─') || data.includes('│ ');
        
        // 2. カギカッコが閉じられている
        const openQuotes = (data.match(/◆/g) || []).length;
        const closeQuotes = (data.match(/◇/g) || []).length;
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
            this.debugLogSafe(`${this.logPrefix} ❌ 完了処理スキップ - 蓄積中でないかメッセージが空`);
            this.debugLogSafe(`${this.logPrefix} ❌ デバッグ情報:`, {
                isAccumulating: this.isAccumulating,
                messageLength: this.pendingMessage ? this.pendingMessage.length : 0,
                hasCallback: !!this.processCallback
            });
            return;
        }
        
        this.debugLogSafe(`${this.logPrefix} ✅ メッセージ蓄積完了 - 最終長: ${this.pendingMessage.length}`);
        this.debugLogSafe(`${this.logPrefix} ✅ 蓄積時間: ${Date.now() - this.lastChunkTime + this.completionTimeout}ms`);
        this.debugLogSafe(`${this.logPrefix} 🔔 complete()呼び出し - コールバック有無:`, !!this.processCallback);
        
        const completeMessage = this.pendingMessage;
        const content = this.extractVoiceText(completeMessage);
        
        // シンプル重複チェック
        if (content) {
            this.debugLogSafe(`${this.logPrefix} 🔍 音声テキスト抽出完了: "${content.substring(0, 50)}..."`);
            
            if (this.duplicateChecker.isDuplicate(content)) {
                this.debugLogSafe(`${this.logPrefix} 🚫 重複コンテンツをスキップ: "${content.substring(0, 50)}..."`);
                this.reset();
                return;
            }
            
            // 読み上げ済みとしてマーク
            this.duplicateChecker.markAsSpoken(content);
            this.debugLogSafe(`${this.logPrefix} 🎵 新しい音声コンテンツを検出: "${content.substring(0, 50)}..."`);
            
            // 内部ログシステムに保存
            this.saveToInternalLog(content);
        } else {
            this.debugLogSafe(`${this.logPrefix} ⚠️ 音声テキストが抽出できませんでした`);
        }
        
        // メッセージをリセット
        this.pendingMessage = '';
        this.isAccumulating = false;
        this.completionTimer = null;
        
        // 音声処理は親タブのみ実行
        if (this.processCallback && this.isCurrentTabParent()) {
            debugLog(`📞 コールバック実行開始 - メッセージ長: ${completeMessage.length}`);
            debugLog(`📞 メッセージサンプル:`, completeMessage.substring(0, 100) + '...');
            
            // 大量◆◇テキスト制限（バグ対策）
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
        } else if (!this.isCurrentTabParent()) {
            this.debugLogSafe(`${this.logPrefix} 🗂️ 非親タブのため音声処理をスキップ`);
        } else {
            debugError(`❌ コールバックが設定されていません！`);
            debugError(`❌ メッセージが破棄されました:`, completeMessage.substring(0, 100) + '...');
        }
    }

    /**
     * 音声テキスト（◆◇で囲まれた部分）を抽出
     * @param {string} message - 抽出対象のメッセージ
     * @returns {string|null} 抽出されたテキスト
     */
    extractVoiceText(message) {
        if (!message || typeof message !== 'string') {
            return null;
        }
        
        // ◆◇で囲まれたテキストを抽出
        const matches = message.match(/◆([^◇]+)◇/g);
        if (matches && matches.length > 0) {
            // 複数ある場合は結合
            return matches.map(match => match.slice(1, -1)).join(' ');
        }
        
        return null;
    }

    /**
     * ConversationLogger準備完了の待機
     */
    async waitForLoggerReady() {
        if (window.electronAPI?.logs) {
            // IPC経由で初期化状態を確認
            try {
                const status = await window.electronAPI.checkConversationLoggerReady?.();
                if (status?.isInitialized) {
                    this.loggerReady = true;
                    this.debugLogSafe(`${this.logPrefix} 💾 ログシステム初期化確認完了`);
                    this.processPendingLogs();
                    return;
                }
            } catch (error) {
                this.debugLogSafe(`${this.logPrefix} 💾 ログシステム状態確認エラー:`, error);
            }
        }
        
        // 準備完了イベントを待機
        if (window.electronAPI?.onConversationLoggerReady) {
            window.electronAPI.onConversationLoggerReady((data) => {
                this.loggerReady = true;
                this.debugLogSafe(`${this.logPrefix} 💾 ConversationLogger準備完了通知受信:`, data);
                this.processPendingLogs();
            });
        }
        
        // タイムアウト設定（10秒後に強制的に開始）
        setTimeout(() => {
            if (!this.loggerReady) {
                this.debugLogSafe(`${this.logPrefix} 💾 ログシステム初期化タイムアウト - 強制開始`);
                this.loggerReady = true;
                this.processPendingLogs();
            }
        }, 10000);
    }
    
    /**
     * 保留中ログの処理
     */
    async processPendingLogs() {
        if (this.pendingLogs.length === 0) return;
        
        this.debugLogSafe(`${this.logPrefix} 💾 保留中ログの処理開始: ${this.pendingLogs.length}件`);
        
        for (const log of this.pendingLogs) {
            await this.doSaveLog(log.content);
        }
        
        this.pendingLogs = [];
        this.debugLogSafe(`${this.logPrefix} 💾 保留中ログの処理完了`);
    }
    
    /**
     * 実際のログ保存処理
     * @param {string} content - 保存するテキスト
     */
    async doSaveLog(content) {
        try {
            if (window.electronAPI?.logs?.saveConversationLog) {
                const sessionId = this.generateSessionId();
                const result = await window.electronAPI.logs.saveConversationLog(content, sessionId);
                
                if (result.success) {
                    this.debugLogSafe(`${this.logPrefix} 💾 内部ログ保存成功: ID ${result.logId}`);
                } else {
                    this.debugLogSafe(`${this.logPrefix} 💾 内部ログ保存失敗: ${result.error}`);
                }
            } else {
                this.debugLogSafe(`${this.logPrefix} 💾 内部ログAPI未使用 - electronAPI不使用`);
            }
        } catch (error) {
            this.debugLogSafe(`${this.logPrefix} 💾 内部ログ保存エラー:`, error);
        }
    }

    /**
     * 内部ログシステムに保存（改善版・フォールバック強化）
     * @param {string} content - 保存するテキスト
     */
    async saveToInternalLog(content) {
        if (!this.loggerReady) {
            // 準備未完了時は一時保存（フォールバック印付き）
            this.pendingLogs.push({
                content,
                timestamp: Date.now(),
                fallback: true,
                reason: 'logger_not_ready'
            });
            this.debugLogSafe(`${this.logPrefix} 💾 フォールバック保存（未準備）: ${content.substring(0, 30)}...`);
            
            // メモリ上に保管しているのでユーザーには成功として報告
            console.log(`💾 ログをメモリに一時保存しました: "${content.substring(0, 50)}..."`);
            return;
        }
        
        // 準備完了時は即座に保存を試行
        try {
            await this.doSaveLog(content);
        } catch (error) {
            // 保存失敗時もメモリにフォールバック
            this.pendingLogs.push({
                content,
                timestamp: Date.now(),
                fallback: true,
                reason: 'save_failed',
                error: error.message
            });
            this.debugLogSafe(`${this.logPrefix} 💾 フォールバック保存（保存失敗）: ${error.message}`);
            console.log(`💾 ログ保存失敗のためメモリに保存: "${content.substring(0, 50)}..."`);
        }
    }

    /**
     * セッションIDの生成
     * @returns {string} セッションID
     */
    generateSessionId() {
        if (!this.sessionId) {
            this.sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }
        return this.sessionId;
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
            hasTimer: !!this.completionTimer
        };

        // 重複防止システムの統計情報を追加
        baseStatus.duplicatePrevention = this.duplicateChecker.getStats();

        return baseStatus;
    }

    /**
     * デバッグログの有効/無効切り替え
     * @param {boolean} enabled - ログを有効にするかどうか
     */
    setDebugLogging(enabled) {
        this.debugLogEnabled = enabled;
        this.duplicateChecker.setDebugLogging(enabled);
        this.debugLogSafe(`🐛 デバッグログ: ${enabled ? '有効' : '無効'}`);
    }

    /**
     * 重複防止システムのクリア（デバッグ用）
     */
    clearDuplicatePrevention() {
        this.duplicateChecker.clear();
        this.debugLogSafe('🧹 重複防止システムをクリア');
    }

    /**
     * 重複防止システムの統計表示
     */
    showDuplicateStats() {
        this.duplicateChecker.logStats();
    }

    /**
     * 大量◆◇テキスト制限（バグ対策）
     * @param {string} message - 処理対象メッセージ
     * @returns {string} 制限適用後のメッセージ
     */
    limitVoiceTexts(message) {
        const quotedMatches = message.match(/◆[^◇]*◇/g);
        
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
        
        // 元のメッセージから◆◇を削除
        let limitedMessage = message.replace(/◆[^◇]*◇/g, '');
        
        // 制限された◆◇テキストを追加
        limitedMessage += limitedQuotes.join('');
        
        // 要約メッセージを追加
        limitedMessage += `◆他に${remaining}個のメッセージがあるが、負荷対策で省略したぞ◇`;
        
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