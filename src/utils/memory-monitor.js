/**
 * メモリ監視とリーク検出ユーティリティ
 * - リアルタイムメモリ監視
 * - メモリリーク検出とアラート
 * - 強制ガベージコレクション
 */

class MemoryMonitor {
    constructor(options = {}) {
        this.name = options.name || 'MemoryMonitor';
        this.warningThreshold = options.warningThreshold || 0.8; // メモリ使用率80%で警告
        this.criticalThreshold = options.criticalThreshold || 0.9; // メモリ使用率90%で危険
        this.monitoringInterval = options.monitoringInterval || 60000; // 60秒間隔
        this.maxHistorySize = options.maxHistorySize || 100; // 履歴の最大保持数
        
        this.memoryHistory = [];
        this.isMonitoring = false;
        this.monitoringTimer = null;
        this.logger = typeof Logger !== 'undefined' ? Logger.create(this.name) : console;
        
        // ページアンロード時の強制クリーンアップ
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', () => this.emergencyCleanup());
            window.addEventListener('unload', () => this.emergencyCleanup());
        }
    }

    /**
     * メモリ監視を開始
     */
    startMonitoring() {
        if (this.isMonitoring) {
            this.logger.warn('Memory monitoring is already running');
            return;
        }

        this.isMonitoring = true;
        this.logger.info(`Memory monitoring started (interval: ${this.monitoringInterval}ms)`);
        
        // 初回チェック
        this.checkMemory();
        
        // 定期チェック
        this.monitoringTimer = setInterval(() => {
            this.checkMemory();
        }, this.monitoringInterval);
    }

    /**
     * メモリ監視を停止
     */
    stopMonitoring() {
        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
            this.monitoringTimer = null;
        }
        this.isMonitoring = false;
        this.logger.info('Memory monitoring stopped');
    }

    /**
     * 現在のメモリ使用状況をチェック
     */
    checkMemory() {
        if (!this.isMemoryAPIAvailable()) {
            return null;
        }

        const memory = performance.memory;
        const usedMB = Math.round(memory.usedJSHeapSize / 1024 / 1024);
        const totalMB = Math.round(memory.totalJSHeapSize / 1024 / 1024);
        const limitMB = Math.round(memory.jsHeapSizeLimit / 1024 / 1024);
        const usageRatio = usedMB / limitMB;
        
        const memoryInfo = {
            timestamp: Date.now(),
            usedMB,
            totalMB,
            limitMB,
            usageRatio,
            status: this.getMemoryStatus(usageRatio)
        };

        // 履歴に追加
        this.addToHistory(memoryInfo);
        
        // 警告レベルの判定と対応
        this.handleMemoryStatus(memoryInfo);
        
        return memoryInfo;
    }

    /**
     * メモリ使用状況のステータスを取得
     */
    getMemoryStatus(usageRatio) {
        if (usageRatio >= this.criticalThreshold) {
            return 'critical';
        } else if (usageRatio >= this.warningThreshold) {
            return 'warning';
        } else {
            return 'normal';
        }
    }

    /**
     * メモリステータスに応じた対応
     */
    handleMemoryStatus(memoryInfo) {
        const { status, usedMB, limitMB, usageRatio } = memoryInfo;
        
        switch (status) {
            case 'critical':
                this.logger.error(`🚨 CRITICAL: Memory usage at ${Math.round(usageRatio * 100)}% (${usedMB}MB / ${limitMB}MB)`);
                this.triggerEmergencyCleanup();
                break;
                
            case 'warning':
                this.logger.warn(`⚠️ WARNING: High memory usage at ${Math.round(usageRatio * 100)}% (${usedMB}MB / ${limitMB}MB)`);
                this.triggerCleanup();
                break;
                
            case 'normal':
                this.logger.debug(`✅ Memory usage normal: ${Math.round(usageRatio * 100)}% (${usedMB}MB / ${limitMB}MB)`);
                break;
        }
    }

    /**
     * 履歴に追加（サイズ制限付き）
     */
    addToHistory(memoryInfo) {
        this.memoryHistory.push(memoryInfo);
        
        // 履歴サイズ制限
        if (this.memoryHistory.length > this.maxHistorySize) {
            const removed = this.memoryHistory.splice(0, this.memoryHistory.length - this.maxHistorySize);
            // 削除されたアイテムをnullクリア
            removed.forEach((item, index) => {
                removed[index] = null;
            });
        }
    }

    /**
     * 通常のクリーンアップをトリガー
     */
    triggerCleanup() {
        this.logger.info('🧹 Triggering memory cleanup...');
        
        // リソースマネージャーによるクリーンアップ
        if (typeof window !== 'undefined' && window.ResourceManager) {
            // グローバルリソースマネージャーがあれば使用
            if (window.globalResourceManager) {
                window.globalResourceManager.performRoutineCleanup();
            }
        }
        
        // 手動ガベージコレクション（利用可能な場合）
        this.forceGarbageCollection();
    }

    /**
     * 緊急クリーンアップをトリガー
     */
    triggerEmergencyCleanup() {
        this.logger.error('🚨 Triggering EMERGENCY memory cleanup...');
        
        // より積極的なクリーンアップ
        this.emergencyCleanup();
        
        // 強制ガベージコレクション
        this.forceGarbageCollection();
        
        // メモリ状況を再チェック
        setTimeout(() => {
            const newMemoryInfo = this.checkMemory();
            if (newMemoryInfo && newMemoryInfo.status === 'critical') {
                this.logger.error('🚨 Emergency cleanup failed - memory still critical!');
                // ここで追加の対策（アプリの一部機能停止など）を実装可能
            }
        }, 1000);
    }

    /**
     * 緊急時のメモリクリーンアップ
     */
    emergencyCleanup() {
        this.logger.warn('🧹 Performing emergency memory cleanup...');
        
        // 音声関連のクリーンアップ
        if (typeof window !== 'undefined' && window.terminalApp) {
            const app = window.terminalApp;
            
            // 音声キューをクリア
            if (app.voiceQueue) {
                app.voiceQueue.clear();
            }
            
            // 現在の音声を停止
            if (app.audioService) {
                app.audioService.stopAudio();
            }
            
            // リソースマネージャーによるクリーンアップ
            if (app.resourceManager) {
                app.resourceManager.performRoutineCleanup();
            }
        }
        
        // DOM要素のクリーンアップ
        this.cleanupDOMElements();
        
        // 履歴の削除
        this.clearHistory();
    }

    /**
     * DOM要素の不要なイベントリスナーをクリーンアップ
     */
    cleanupDOMElements() {
        // 孤立したAudio要素を検索して削除
        const audioElements = document.querySelectorAll('audio');
        audioElements.forEach(audio => {
            if (audio.src && audio.src.startsWith('blob:')) {
                try {
                    audio.pause();
                    audio.src = '';
                    audio.load();
                    URL.revokeObjectURL(audio.src);
                } catch (error) {
                    this.logger.warn('Failed to cleanup audio element:', error);
                }
            }
        });
    }

    /**
     * 強制ガベージコレクション
     */
    forceGarbageCollection() {
        if (typeof window !== 'undefined' && window.gc) {
            this.logger.info('🗑️ Forcing garbage collection...');
            try {
                window.gc();
            } catch (error) {
                this.logger.warn('Failed to force garbage collection:', error);
            }
        } else {
            this.logger.debug('Garbage collection not available');
        }
    }

    /**
     * Memory API の利用可能性をチェック
     */
    isMemoryAPIAvailable() {
        return typeof performance !== 'undefined' && 
               performance.memory && 
               typeof performance.memory.usedJSHeapSize === 'number';
    }

    /**
     * メモリ使用量の傾向を分析
     */
    analyzeMemoryTrend(sampleCount = 10) {
        if (this.memoryHistory.length < sampleCount) {
            return { trend: 'insufficient_data', samples: this.memoryHistory.length };
        }

        const recent = this.memoryHistory.slice(-sampleCount);
        const first = recent[0].usedMB;
        const last = recent[recent.length - 1].usedMB;
        const change = last - first;
        const changePercent = (change / first) * 100;

        let trend = 'stable';
        if (changePercent > 10) {
            trend = 'increasing';
        } else if (changePercent < -10) {
            trend = 'decreasing';
        }

        return {
            trend,
            change,
            changePercent: Math.round(changePercent * 100) / 100,
            samples: sampleCount
        };
    }

    /**
     * 履歴をクリア
     */
    clearHistory() {
        this.memoryHistory.forEach((item, index) => {
            this.memoryHistory[index] = null;
        });
        this.memoryHistory.length = 0;
        this.memoryHistory = [];
        this.logger.debug('Memory history cleared');
    }

    /**
     * 現在のステータスを取得
     */
    getStatus() {
        const currentMemory = this.checkMemory();
        const trend = this.analyzeMemoryTrend();
        
        return {
            isMonitoring: this.isMonitoring,
            currentMemory,
            trend,
            historySize: this.memoryHistory.length,
            thresholds: {
                warning: this.warningThreshold,
                critical: this.criticalThreshold
            }
        };
    }

    /**
     * 破棄処理
     */
    destroy() {
        this.stopMonitoring();
        this.clearHistory();
        this.logger.info('MemoryMonitor destroyed');
    }
}

// ブラウザ環境での利用
if (typeof window !== 'undefined') {
    window.MemoryMonitor = MemoryMonitor;
    
    // グローバルメモリモニターを作成
    if (!window.globalMemoryMonitor) {
        window.globalMemoryMonitor = new MemoryMonitor({
            name: 'GlobalMemoryMonitor',
            monitoringInterval: 60000, // 60秒間隔
            warningThreshold: 0.75,
            criticalThreshold: 0.85
        });
        
        // 自動開始
        window.globalMemoryMonitor.startMonitoring();
    }
}

// Node.js環境での利用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MemoryMonitor;
}