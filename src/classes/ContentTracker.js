// ContentTracker - ターミナル重複読み上げ防止システム
// 位置・ハッシュ・タイムスタンプベースの三重チェックによる重複防止

class ContentTracker {
    constructor() {
        this.lastProcessedLine = 0;        // 最後に処理した行番号
        this.lastProcessedChar = 0;        // 最後に処理した文字位置
        this.processedContent = new Set();  // 処理済みコンテンツのハッシュ
        this.messageTimestamps = new Map(); // メッセージID -> 処理時刻
        this.DUPLICATE_TIMEOUT = 5000;     // 5秒以内は重複とみなす
        this.MAX_ENTRIES = 1000;           // メモリ使用量制限
        this.debugLog = console.log;
    }

    /**
     * 新しいコンテンツかどうか判定
     * @param {string} content - 判定対象のコンテンツ
     * @param {number} line - 行番号
     * @param {number} char - 文字位置
     * @returns {boolean} 新しいコンテンツの場合true
     */
    isNewContent(content, line, char) {
        if (!content || content.trim().length === 0) {
            return false;
        }

        const contentHash = this.generateHash(content);
        if (!contentHash) {
            return false;
        }
        
        // 1. 位置ベースチェック - 既に処理した位置より前は無視
        if (line < this.lastProcessedLine || 
            (line === this.lastProcessedLine && char <= this.lastProcessedChar)) {
            this.debugLog(`[ContentTracker] 古い位置のコンテンツをスキップ: L${line}:C${char} (最終処理: L${this.lastProcessedLine}:C${this.lastProcessedChar})`);
            return false;
        }
        
        // 2. ハッシュベースチェック - 既処理コンテンツは無視
        if (this.processedContent.has(contentHash)) {
            this.debugLog(`[ContentTracker] 既処理コンテンツをスキップ: ${contentHash}`);
            return false;
        }
        
        // 3. タイムスタンプチェック - 最近処理したものは無視
        const now = Date.now();
        if (this.messageTimestamps.has(contentHash)) {
            const lastTime = this.messageTimestamps.get(contentHash);
            if (now - lastTime < this.DUPLICATE_TIMEOUT) {
                this.debugLog(`[ContentTracker] 最近処理済みコンテンツをスキップ: ${contentHash} (${now - lastTime}ms前)`);
                return false;
            }
        }
        
        return true;
    }

    /**
     * コンテンツを処理済みとしてマーク
     * @param {string} content - 処理したコンテンツ
     * @param {number} line - 行番号
     * @param {number} char - 文字位置
     */
    markAsProcessed(content, line, char) {
        const contentHash = this.generateHash(content);
        if (!contentHash) {
            return;
        }

        this.processedContent.add(contentHash);
        this.messageTimestamps.set(contentHash, Date.now());
        this.lastProcessedLine = line;
        this.lastProcessedChar = char;
        
        this.debugLog(`[ContentTracker] 処理済みにマーク: L${line}:C${char} - ${contentHash} - "${content.substring(0, 30)}..."`);
        
        // メモリ使用量制限チェック
        if (this.processedContent.size > this.MAX_ENTRIES) {
            this.cleanup();
        }
    }

    /**
     * ハッシュ生成（正規化 + 軽量ハッシュ）
     * @param {string} content - ハッシュ対象のコンテンツ
     * @returns {string|null} 生成されたハッシュ
     */
    generateHash(content) {
        if (!content || typeof content !== 'string') {
            return null;
        }

        // テキストの正規化
        const normalized = content
            .replace(/\s+/g, ' ')           // 連続空白を単一空白に
            .replace(/\n+/g, '\n')          // 連続改行を単一改行に
            .replace(/\r/g, '')             // キャリッジリターン削除
            .trim();                        // 前後の空白削除
        
        if (!normalized) {
            return null;
        }
        
        // 軽量ハッシュアルゴリズム（djb2変種）
        let hash = 5381;
        for (let i = 0; i < normalized.length; i++) {
            const char = normalized.charCodeAt(i);
            hash = ((hash << 5) + hash) + char; // hash * 33 + char
            hash = hash & hash; // 32bit整数に変換
        }
        
        // 負の値を正の値に変換して16進数表記
        return (hash >>> 0).toString(16);
    }

    /**
     * 古いエントリのクリーンアップ
     */
    cleanup() {
        const now = Date.now();
        const cleanupThreshold = this.DUPLICATE_TIMEOUT * 4; // 20秒以上古い
        const oldHashes = [];
        
        // 古いタイムスタンプのハッシュを収集
        for (const [hash, timestamp] of this.messageTimestamps) {
            if (now - timestamp > cleanupThreshold) {
                oldHashes.push(hash);
            }
        }
        
        // 古いエントリを削除
        oldHashes.forEach(hash => {
            this.processedContent.delete(hash);
            this.messageTimestamps.delete(hash);
        });
        
        this.debugLog(`[ContentTracker] クリーンアップ完了: ${oldHashes.length}件削除, 残り${this.processedContent.size}件`);
    }

    /**
     * 強制クリーンアップ（メモリ使用量が上限に達した場合）
     */
    forceCleanup() {
        const entriesToKeep = Math.floor(this.MAX_ENTRIES * 0.7); // 70%まで削減
        const entries = Array.from(this.messageTimestamps.entries());
        
        // タイムスタンプでソート（古い順）
        entries.sort((a, b) => a[1] - b[1]);
        
        // 古いエントリから削除
        const toDelete = entries.slice(0, entries.length - entriesToKeep);
        toDelete.forEach(([hash]) => {
            this.processedContent.delete(hash);
            this.messageTimestamps.delete(hash);
        });
        
        this.debugLog(`[ContentTracker] 強制クリーンアップ: ${toDelete.length}件削除, 残り${this.processedContent.size}件`);
    }

    /**
     * 処理済み位置をリセット（ターミナルクリア時など）
     */
    resetPosition() {
        this.lastProcessedLine = 0;
        this.lastProcessedChar = 0;
        this.debugLog('[ContentTracker] 処理済み位置をリセット');
    }

    /**
     * 全データをクリア（デバッグ用）
     */
    clear() {
        this.processedContent.clear();
        this.messageTimestamps.clear();
        this.resetPosition();
        this.debugLog('[ContentTracker] 全データをクリア');
    }

    /**
     * デバッグ情報の取得
     * @returns {object} 統計情報
     */
    getStats() {
        const now = Date.now();
        const timestamps = Array.from(this.messageTimestamps.values());
        
        return {
            processedCount: this.processedContent.size,
            lastPosition: `L${this.lastProcessedLine}:C${this.lastProcessedChar}`,
            oldestTimestamp: timestamps.length > 0 ? Math.min(...timestamps) : 0,
            newestTimestamp: timestamps.length > 0 ? Math.max(...timestamps) : 0,
            averageAge: timestamps.length > 0 ? 
                Math.round((now - timestamps.reduce((a, b) => a + b, 0) / timestamps.length) / 1000) : 0,
            memoryUsage: {
                hashSetSize: this.processedContent.size,
                timestampMapSize: this.messageTimestamps.size,
                estimatedBytes: (this.processedContent.size * 16) + (this.messageTimestamps.size * 24)
            }
        };
    }

    /**
     * デバッグログの有効/無効切り替え
     * @param {boolean} enabled - ログを有効にするかどうか
     */
    setDebugLogging(enabled) {
        this.debugLog = enabled ? console.log : () => {};
    }

    /**
     * 重複タイムアウト値の設定
     * @param {number} timeoutMs - タイムアウト値（ミリ秒）
     */
    setDuplicateTimeout(timeoutMs) {
        this.DUPLICATE_TIMEOUT = Math.max(1000, Math.min(60000, timeoutMs)); // 1秒〜60秒の範囲
        this.debugLog(`[ContentTracker] 重複タイムアウトを${this.DUPLICATE_TIMEOUT}msに設定`);
    }

    /**
     * 最大エントリ数の設定
     * @param {number} maxEntries - 最大エントリ数
     */
    setMaxEntries(maxEntries) {
        this.MAX_ENTRIES = Math.max(100, Math.min(10000, maxEntries)); // 100〜10000の範囲
        this.debugLog(`[ContentTracker] 最大エントリ数を${this.MAX_ENTRIES}に設定`);
    }
}

// Node.js環境とブラウザ環境の両方に対応
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ContentTracker;
} else {
    window.ContentTracker = ContentTracker;
}