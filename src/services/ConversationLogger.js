/**
 * レンダラープロセス用会話ログクライアント
 * - IPC通信でメインプロセスのSQLiteシステムにアクセス
 * - Electronセキュリティベストプラクティスに準拠
 * - 既存APIインターフェースとの互換性を保持
 */

class ConversationLogger {
    constructor() {
        this.logPrefix = '💾 [ConversationLogger]';
        this.isInitialized = false;
        
        // 統計情報（キャッシュ用）
        this.stats = {
            totalLogs: 0,
            sessionLogs: 0,
            errors: 0,
            startTime: Date.now()
        };
        
        this.debugLog = console.log;
        
        // ElectronAPIの確認
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.logs) {
            this.electronAPI = window.electronAPI.logs;
        } else {
            console.warn(`${this.logPrefix} ElectronAPIが利用できません`);
            this.electronAPI = null;
        }
    }

    /**
     * 初期化（IPC通信版では統計情報の取得のみ）
     */
    async initialize() {
        try {
            if (!this.electronAPI) {
                throw new Error('ElectronAPI not available');
            }

            // 統計情報を取得して初期化の確認
            const result = await this.electronAPI.getStats();
            if (result.success) {
                this.stats = { ...this.stats, ...result.stats };
                this.isInitialized = true;
                this.debugLog(`${this.logPrefix} 初期化完了 - 既存ログ: ${this.stats.totalLogs}件`);
                return { success: true, totalLogs: this.stats.totalLogs };
            } else {
                throw new Error(result.error || 'Stats retrieval failed');
            }
            
        } catch (error) {
            this.debugLog(`${this.logPrefix} 初期化エラー:`, error);
            this.stats.errors++;
            return { success: false, error: error.message };
        }
    }


    /**
     * 会話ログの保存（IPC通信版）
     * @param {string} text - 保存するテキスト
     * @param {string} sessionId - セッションID（オプション）
     */
    async saveLog(text, sessionId = null) {
        try {
            if (!this.electronAPI) {
                throw new Error('ElectronAPI not available');
            }

            const cleanText = this.cleanText(text);
            if (!cleanText) {
                return { success: false, error: 'Empty text after cleaning' };
            }

            const result = await this.electronAPI.saveConversationLog(cleanText, sessionId);
            
            if (result.success) {
                this.stats.sessionLogs++;
                if (result.totalLogs) {
                    this.stats.totalLogs = result.totalLogs;
                }
                this.debugLog(`${this.logPrefix} ログ保存完了: "${cleanText.substring(0, 50)}..." (総数: ${this.stats.totalLogs})`);
            } else {
                this.stats.errors++;
                this.debugLog(`${this.logPrefix} 保存エラー:`, result.error);
            }
            
            return result;
            
        } catch (error) {
            this.stats.errors++;
            this.debugLog(`${this.logPrefix} 保存エラー:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * ログの読み込み（IPC通信版）
     * @param {number} limit - 取得件数
     * @param {number} offset - オフセット
     */
    async getLogs(limit = 20, offset = 0) {
        try {
            if (!this.electronAPI) {
                throw new Error('ElectronAPI not available');
            }

            if (!this.isInitialized) {
                await this.initialize();
            }

            const result = await this.electronAPI.loadConversationLog(limit);
            
            if (result.success) {
                this.debugLog(`${this.logPrefix} ログ読み込み完了: ${result.logs.length}件`);
                
                // 統計情報の更新
                if (result.total !== undefined) {
                    this.stats.totalLogs = result.total;
                }
                
                return {
                    success: true,
                    logs: result.logs,
                    count: result.count || result.logs.length,
                    total: result.total || this.stats.totalLogs
                };
            } else {
                this.stats.errors++;
                this.debugLog(`${this.logPrefix} 読み込みエラー:`, result.error);
                return result;
            }
            
        } catch (error) {
            this.stats.errors++;
            this.debugLog(`${this.logPrefix} 読み込みエラー:`, error);
            return { 
                success: false, 
                error: error.message,
                logs: [],
                count: 0,
                total: 0
            };
        }
    }


    /**
     * テキストのクリーニング
     */
    cleanText(text) {
        if (!text || typeof text !== 'string') {
            return null;
        }
        
        // 『』を除去して中身のテキストのみを抽出
        let cleaned = text.replace(/[『』]/g, '');
        
        // 空白の正規化
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        
        return cleaned || null;
    }

    /**
     * 統計情報の取得（IPC通信版）
     */
    async getStats() {
        try {
            if (!this.electronAPI) {
                throw new Error('ElectronAPI not available');
            }

            const result = await this.electronAPI.getStats();
            
            if (result.success) {
                // ローカル統計と統合
                const runtimeHours = (Date.now() - this.stats.startTime) / (1000 * 60 * 60);
                
                return {
                    success: true,
                    stats: {
                        ...result.stats,
                        sessionLogs: this.stats.sessionLogs,
                        runtimeHours: Math.round(runtimeHours * 100) / 100,
                        logsPerHour: runtimeHours > 0 ? Math.round(this.stats.sessionLogs / runtimeHours) : 0
                    }
                };
            } else {
                this.stats.errors++;
                return result;
            }
            
        } catch (error) {
            this.stats.errors++;
            this.debugLog(`${this.logPrefix} 統計取得エラー:`, error);
            return { 
                success: false, 
                error: error.message,
                stats: null
            };
        }
    }

    /**
     * 接続のクローズ（IPC版では不要だが互換性のため残す）
     */
    async close() {
        this.debugLog(`${this.logPrefix} クローズ要求（IPC版では不要）`);
        this.isInitialized = false;
        return Promise.resolve();
    }

    /**
     * ログのクリア（IPC通信版）
     */
    async clearLogs() {
        try {
            if (!this.electronAPI) {
                throw new Error('ElectronAPI not available');
            }

            const result = await this.electronAPI.clearLogs();
            
            if (result.success) {
                this.stats.totalLogs = result.totalLogs || 0;
                this.stats.sessionLogs = 0;
                this.debugLog(`${this.logPrefix} 全ログをクリアしました`);
            } else {
                this.stats.errors++;
                this.debugLog(`${this.logPrefix} クリアエラー:`, result.error);
            }
            
            return result;
            
        } catch (error) {
            this.stats.errors++;
            this.debugLog(`${this.logPrefix} クリアエラー:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * デバッグモードの設定
     */
    setDebugMode(enabled) {
        this.debugLog = enabled ? console.log : () => {};
    }
}

// Node.js環境とブラウザ環境の両方に対応
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConversationLogger;
} else {
    window.ConversationLogger = ConversationLogger;
}