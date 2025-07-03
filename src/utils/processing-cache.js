/**
 * 重い処理の最適化ユーティリティ
 * - 正規表現処理のキャッシュ機構
 * - 音声データの効率的な処理
 * - 計算結果のメモ化
 */
class ProcessingCache {
    constructor(options = {}) {
        this.maxCacheSize = options.maxCacheSize || 100;
        this.maxAge = options.maxAge || 300000; // 5分
        this.regexCache = new Map();
        this.computationCache = new Map();
        this.audioBufferPool = new Set();
        this.maxPoolSize = options.maxPoolSize || 10;
        this.logger = typeof Logger !== 'undefined' ? Logger.create('ProcessingCache') : console;
    }

    /**
     * 正規表現処理のキャッシュ化
     */
    cachedRegexProcess(input, regexPattern, replacement = null) {
        const cacheKey = `${regexPattern.toString()}_${input.length}_${input.substring(0, 50)}`;
        
        // キャッシュヒット確認
        const cached = this.regexCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.maxAge) {
            this.logger.debug('Regex cache hit:', cacheKey.substring(0, 30));
            return cached.result;
        }

        // 処理実行
        const startTime = performance.now();
        let result;
        
        if (replacement !== null) {
            result = input.replace(regexPattern, replacement);
        } else {
            result = input.match(regexPattern);
        }
        
        const processingTime = performance.now() - startTime;
        
        // キャッシュに保存
        this.regexCache.set(cacheKey, {
            result,
            timestamp: Date.now(),
            processingTime
        });
        
        // キャッシュサイズ制限
        this.limitCacheSize(this.regexCache, this.maxCacheSize);
        
        this.logger.debug(`Regex processed: ${processingTime.toFixed(2)}ms`);
        return result;
    }

    /**
     * テキストクリーニング処理の最適化
     */
    optimizedTextCleaning(text) {
        const cacheKey = `clean_${text.length}_${this.hashString(text)}`;
        
        // キャッシュ確認
        const cached = this.computationCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.maxAge) {
            return cached.result;
        }

        const startTime = performance.now();
        
        // 一度の処理で複数の正規表現を適用
        let result = text
            .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '') // ANSIエスケープシーケンス除去
            .replace(/^[⚒↓⭐✶✻✢·✳]+\s*/g, '') // 先頭記号除去
            .replace(/\s*[✢✳✶✻✽·⚒↓↑]\s*(Synthesizing|Conjuring|Spinning|Vibing|Computing|Mulling|Pondering|musing|thinking).*$/gi, '') // ステータス除去
            .replace(/\s*\([0-9]+s[^)]*\).*$/g, '') // 時間情報除去
            .replace(/\s*tokens.*$/gi, '') // トークン情報除去
            .trim();

        const processingTime = performance.now() - startTime;
        
        // 結果をキャッシュ
        this.computationCache.set(cacheKey, {
            result,
            timestamp: Date.now(),
            processingTime
        });
        
        this.limitCacheSize(this.computationCache, this.maxCacheSize);
        
        this.logger.debug(`Text cleaning: ${processingTime.toFixed(2)}ms`);
        return result;
    }

    /**
     * 音声データの効率的な処理
     */
    optimizedAudioProcessing(audioData) {
        let arrayBuffer, sharedBuffer;

        if (audioData instanceof ArrayBuffer) {
            // 既にArrayBufferの場合はそのまま使用
            arrayBuffer = audioData;
            sharedBuffer = audioData; // 同じ参照を使用（コピー回避）
        } else if (audioData.buffer instanceof ArrayBuffer) {
            // TypedArrayの場合
            arrayBuffer = audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength);
            sharedBuffer = arrayBuffer; // 新しく作成したバッファを共有
        } else {
            // その他の場合のみ新規作成
            arrayBuffer = this.getPooledBuffer(audioData.length);
            const view = new Uint8Array(arrayBuffer);
            
            // 高速コピー（可能な場合はTypedArrayメソッドを使用）
            if (audioData.constructor === Uint8Array || audioData.constructor === Buffer) {
                view.set(audioData);
            } else {
                // フォールバック: インデックス コピー
                for (let i = 0; i < audioData.length; i++) {
                    view[i] = audioData[i];
                }
            }
            sharedBuffer = arrayBuffer;
        }

        return {
            arrayBuffer,
            sharedBuffer, // VRM用も同じバッファを参照（メモリ節約）
            size: arrayBuffer.byteLength
        };
    }

    /**
     * バッファプールからバッファを取得
     */
    getPooledBuffer(size) {
        // 適切なサイズのバッファをプールから探す
        for (const buffer of this.audioBufferPool) {
            if (buffer.byteLength >= size) {
                this.audioBufferPool.delete(buffer);
                // 必要なサイズにスライス
                return buffer.slice(0, size);
            }
        }
        
        // プールに適切なバッファがない場合は新規作成
        return new ArrayBuffer(size);
    }

    /**
     * バッファをプールに戻す
     */
    returnBufferToPool(buffer) {
        if (this.audioBufferPool.size < this.maxPoolSize) {
            this.audioBufferPool.add(buffer);
        }
    }

    /**
     * メモ化された計算関数
     */
    memoize(fn, keyGenerator = null) {
        const cache = new Map();
        
        return (...args) => {
            const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);
            
            if (cache.has(key)) {
                const cached = cache.get(key);
                if ((Date.now() - cached.timestamp) < this.maxAge) {
                    return cached.result;
                }
                cache.delete(key);
            }
            
            const result = fn(...args);
            cache.set(key, {
                result,
                timestamp: Date.now()
            });
            
            // キャッシュサイズ制限
            this.limitCacheSize(cache, this.maxCacheSize);
            
            return result;
        };
    }

    /**
     * 文字列のハッシュ生成（簡易版）
     */
    hashString(str) {
        let hash = 0;
        if (str.length === 0) return hash;
        
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 32bit整数に変換
        }
        return hash;
    }

    /**
     * キャッシュサイズを制限
     */
    limitCacheSize(cache, maxSize) {
        if (cache.size <= maxSize) return;
        
        // 古いエントリから削除
        const entries = Array.from(cache.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        const toDelete = entries.slice(0, cache.size - maxSize);
        toDelete.forEach(([key]) => cache.delete(key));
        
        this.logger.debug(`Cache trimmed: removed ${toDelete.length} entries`);
    }

    /**
     * パフォーマンス統計の取得
     */
    getPerformanceStats() {
        const regexStats = this.getCacheStats(this.regexCache, 'regex');
        const computationStats = this.getCacheStats(this.computationCache, 'computation');
        
        return {
            regex: regexStats,
            computation: computationStats,
            audioBufferPool: this.audioBufferPool.size,
            totalCacheSize: this.regexCache.size + this.computationCache.size
        };
    }

    /**
     * キャッシュ統計の計算
     */
    getCacheStats(cache, type) {
        const entries = Array.from(cache.values());
        const totalProcessingTime = entries.reduce((sum, entry) => sum + (entry.processingTime || 0), 0);
        const avgProcessingTime = entries.length > 0 ? totalProcessingTime / entries.length : 0;
        
        return {
            type,
            size: cache.size,
            avgProcessingTime: avgProcessingTime.toFixed(2),
            totalSavedTime: totalProcessingTime.toFixed(2)
        };
    }

    /**
     * キャッシュをクリア
     */
    clearCache() {
        this.regexCache.clear();
        this.computationCache.clear();
        this.audioBufferPool.clear();
        this.logger.debug('All caches cleared');
    }

    /**
     * 古いキャッシュエントリを削除
     */
    cleanupExpiredEntries() {
        const now = Date.now();
        let cleanedCount = 0;
        
        // 正規表現キャッシュのクリーンアップ
        for (const [key, value] of this.regexCache.entries()) {
            if ((now - value.timestamp) > this.maxAge) {
                this.regexCache.delete(key);
                cleanedCount++;
            }
        }
        
        // 計算キャッシュのクリーンアップ
        for (const [key, value] of this.computationCache.entries()) {
            if ((now - value.timestamp) > this.maxAge) {
                this.computationCache.delete(key);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            this.logger.debug(`Cleaned up ${cleanedCount} expired cache entries`);
        }
        
        return cleanedCount;
    }
}

// ブラウザ環境での利用
if (typeof window !== 'undefined') {
    window.ProcessingCache = ProcessingCache;
}

// Node.js環境での利用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProcessingCache;
}