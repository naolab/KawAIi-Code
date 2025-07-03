/**
 * リソース管理とメモリリーク防止ユーティリティ
 * - イベントリスナーの自動クリーンアップ
 * - 定期実行処理の管理
 * - メモリリーク検出とクリーンアップ
 */
class ResourceManager {
    constructor(name = 'ResourceManager') {
        this.name = name;
        this.cleanupFunctions = new Set();
        this.timers = new Set();
        this.eventListeners = new Map(); // element -> [{event, handler, options}]
        this.isDestroyed = false;
        this.logger = typeof Logger !== 'undefined' ? Logger.create(name) : console;
    }

    /**
     * イベントリスナーを追加（自動クリーンアップ対応）
     */
    addEventListener(element, event, handler, options = false) {
        if (this.isDestroyed) {
            this.logger.warn('ResourceManager is destroyed, cannot add event listener');
            return;
        }

        element.addEventListener(event, handler, options);
        
        // クリーンアップ用に記録
        if (!this.eventListeners.has(element)) {
            this.eventListeners.set(element, []);
        }
        this.eventListeners.get(element).push({ event, handler, options });
        
        this.logger.debug(`Event listener added: ${event} on`, element);
    }

    /**
     * タイマーを追加（自動クリーンアップ対応）
     */
    setTimeout(callback, delay, ...args) {
        if (this.isDestroyed) {
            this.logger.warn('ResourceManager is destroyed, cannot set timeout');
            return null;
        }

        const timerId = setTimeout((...callbackArgs) => {
            this.timers.delete(timerId);
            callback(...callbackArgs);
        }, delay, ...args);
        
        this.timers.add(timerId);
        this.logger.debug(`Timeout set: ${delay}ms`);
        return timerId;
    }

    /**
     * インターバルを追加（自動クリーンアップ対応）
     */
    setInterval(callback, interval, ...args) {
        if (this.isDestroyed) {
            this.logger.warn('ResourceManager is destroyed, cannot set interval');
            return null;
        }

        const intervalId = setInterval(callback, interval, ...args);
        this.timers.add(intervalId);
        this.logger.debug(`Interval set: ${interval}ms`);
        return intervalId;
    }

    /**
     * カスタムクリーンアップ関数を登録
     */
    registerCleanup(cleanupFunction) {
        if (this.isDestroyed) {
            this.logger.warn('ResourceManager is destroyed, cannot register cleanup');
            return;
        }

        if (typeof cleanupFunction !== 'function') {
            this.logger.error('Cleanup function must be a function');
            return;
        }

        this.cleanupFunctions.add(cleanupFunction);
        this.logger.debug('Cleanup function registered');
    }

    /**
     * 配列サイズを制限（メモリリーク防止）
     */
    limitArraySize(array, maxSize, itemName = 'items') {
        if (!Array.isArray(array)) {
            this.logger.error('limitArraySize: First argument must be an array');
            return 0;
        }

        const originalLength = array.length;
        if (originalLength > maxSize) {
            const removed = array.splice(0, originalLength - maxSize);
            this.logger.debug(`Array size limited: removed ${removed.length} ${itemName}, kept ${array.length}`);
            return removed.length;
        }
        return 0;
    }

    /**
     * 古いアイテムを削除（時間ベース）
     */
    removeOldItems(array, maxAgeMs, timestampProp = 'timestamp') {
        if (!Array.isArray(array)) {
            this.logger.error('removeOldItems: First argument must be an array');
            return 0;
        }

        const now = Date.now();
        const originalLength = array.length;
        
        for (let i = array.length - 1; i >= 0; i--) {
            const item = array[i];
            const timestamp = typeof item === 'object' ? item[timestampProp] : item;
            
            if (now - timestamp > maxAgeMs) {
                array.splice(i, 1);
            }
        }

        const removedCount = originalLength - array.length;
        if (removedCount > 0) {
            this.logger.debug(`Removed ${removedCount} old items (older than ${maxAgeMs}ms)`);
        }
        return removedCount;
    }

    /**
     * メモリ使用量の簡易チェック
     */
    checkMemoryUsage() {
        if (typeof performance !== 'undefined' && performance.memory) {
            const memory = performance.memory;
            const usedMB = Math.round(memory.usedJSHeapSize / 1024 / 1024);
            const totalMB = Math.round(memory.totalJSHeapSize / 1024 / 1024);
            const limitMB = Math.round(memory.jsHeapSizeLimit / 1024 / 1024);
            
            this.logger.debug(`Memory usage: ${usedMB}MB / ${totalMB}MB (limit: ${limitMB}MB)`);
            
            // 使用量が80%を超えた場合は警告
            if (usedMB / limitMB > 0.8) {
                this.logger.warn(`High memory usage detected: ${usedMB}MB / ${limitMB}MB`);
                return { warning: true, usedMB, totalMB, limitMB };
            }
            
            return { warning: false, usedMB, totalMB, limitMB };
        }
        
        return { warning: false, message: 'Memory API not available' };
    }

    /**
     * 定期的なクリーンアップの開始
     */
    startPeriodicCleanup(intervalMs = 60000) { // デフォルト1分
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        this.cleanupInterval = this.setInterval(() => {
            this.performRoutineCleanup();
        }, intervalMs);

        this.logger.debug(`Periodic cleanup started: every ${intervalMs}ms`);
    }

    /**
     * 定期クリーンアップの実行
     */
    performRoutineCleanup() {
        this.logger.debug('Performing routine cleanup...');
        
        // メモリ使用量チェック
        const memoryInfo = this.checkMemoryUsage();
        
        // 高メモリ使用時は強制ガベージコレクション（利用可能な場合）
        if (memoryInfo.warning && typeof window !== 'undefined' && window.gc) {
            this.logger.warn('Forcing garbage collection due to high memory usage');
            window.gc();
        }
    }

    /**
     * 特定のタイマーを削除
     */
    clearTimer(timerId) {
        if (this.timers.has(timerId)) {
            clearTimeout(timerId); // clearTimeoutとclearIntervalは同じ関数
            this.timers.delete(timerId);
            this.logger.debug('Timer cleared');
        }
    }

    /**
     * 状態情報の取得
     */
    getStatus() {
        return {
            name: this.name,
            isDestroyed: this.isDestroyed,
            cleanupFunctions: this.cleanupFunctions.size,
            timers: this.timers.size,
            eventListeners: Array.from(this.eventListeners.values()).reduce((total, listeners) => total + listeners.length, 0),
            elements: this.eventListeners.size
        };
    }

    /**
     * 全リソースのクリーンアップと破棄
     */
    destroy() {
        if (this.isDestroyed) {
            this.logger.warn('ResourceManager already destroyed');
            return;
        }

        this.logger.debug('Destroying ResourceManager...');

        // 定期クリーンアップを停止
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        // イベントリスナーを削除
        for (const [element, listeners] of this.eventListeners) {
            for (const { event, handler, options } of listeners) {
                try {
                    element.removeEventListener(event, handler, options);
                } catch (error) {
                    this.logger.warn('Failed to remove event listener:', error);
                }
            }
        }
        this.eventListeners.clear();

        // タイマーをクリア
        for (const timerId of this.timers) {
            clearTimeout(timerId);
        }
        this.timers.clear();

        // カスタムクリーンアップ関数を実行
        for (const cleanupFn of this.cleanupFunctions) {
            try {
                cleanupFn();
            } catch (error) {
                this.logger.error('Cleanup function failed:', error);
            }
        }
        this.cleanupFunctions.clear();

        this.isDestroyed = true;
        this.logger.debug('ResourceManager destroyed');
    }
}

// ブラウザ環境での利用
if (typeof window !== 'undefined') {
    window.ResourceManager = ResourceManager;
}

// Node.js環境での利用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ResourceManager;
}