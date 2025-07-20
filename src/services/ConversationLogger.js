/**
 * 内部会話ログシステム
 * - SQLiteデータベースによる会話ログ保存
 * - 外部依存なしの自立型ログシステム
 * - 既存ログ形式との互換性を保持
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const os = require('os');

class ConversationLogger {
    constructor() {
        this.dbPath = path.join(os.homedir(), '.claude', 'conversation_log.db');
        this.db = null;
        this.isInitialized = false;
        this.logPrefix = '💾 [ConversationLogger]';
        
        // 統計情報
        this.stats = {
            totalLogs: 0,
            sessionLogs: 0,
            errors: 0,
            startTime: Date.now()
        };
        
        this.debugLog = console.log;
    }

    /**
     * データベースの初期化
     */
    async initialize() {
        try {
            // .claudeディレクトリの作成
            const claudeDir = path.dirname(this.dbPath);
            if (!fs.existsSync(claudeDir)) {
                fs.mkdirSync(claudeDir, { recursive: true });
                this.debugLog(`${this.logPrefix} ディレクトリを作成: ${claudeDir}`);
            }

            // データベース接続
            await this.connectDatabase();
            
            // テーブル初期化
            await this.createTables();
            
            // 既存ログ数を取得
            await this.loadStats();
            
            this.isInitialized = true;
            this.debugLog(`${this.logPrefix} 初期化完了 - 既存ログ: ${this.stats.totalLogs}件`);
            
            return { success: true };
            
        } catch (error) {
            this.debugLog(`${this.logPrefix} 初期化エラー:`, error);
            this.stats.errors++;
            return { success: false, error: error.message };
        }
    }

    /**
     * データベース接続
     */
    async connectDatabase() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * テーブル作成
     */
    async createTables() {
        return new Promise((resolve, reject) => {
            // 既存ログ形式と互換性のあるテーブル構造
            const sql = `
                CREATE TABLE IF NOT EXISTS conversation_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    text TEXT NOT NULL,
                    source TEXT DEFAULT 'kawaii-app',
                    session_id TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `;
            
            this.db.run(sql, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * 統計情報の読み込み
     */
    async loadStats() {
        return new Promise((resolve, reject) => {
            const sql = `SELECT COUNT(*) as total FROM conversation_logs`;
            
            this.db.get(sql, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    this.stats.totalLogs = row.total || 0;
                    resolve();
                }
            });
        });
    }

    /**
     * 会話ログの保存
     * @param {string} text - 保存するテキスト
     * @param {string} sessionId - セッションID（オプション）
     */
    async saveLog(text, sessionId = null) {
        if (!this.isInitialized) {
            this.debugLog(`${this.logPrefix} 未初期化のため保存をスキップ: "${text.substring(0, 30)}..."`);
            return { success: false, error: 'Logger not initialized' };
        }

        try {
            const cleanText = this.cleanText(text);
            if (!cleanText) {
                return { success: false, error: 'Empty text after cleaning' };
            }

            await this.insertLog(cleanText, sessionId);
            
            this.stats.sessionLogs++;
            this.stats.totalLogs++;
            
            this.debugLog(`${this.logPrefix} ログ保存完了: "${cleanText.substring(0, 50)}..." (総数: ${this.stats.totalLogs})`);
            
            return { success: true, logId: this.stats.totalLogs };
            
        } catch (error) {
            this.stats.errors++;
            this.debugLog(`${this.logPrefix} 保存エラー:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * ログをデータベースに挿入
     */
    async insertLog(text, sessionId) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO conversation_logs (text, session_id) 
                VALUES (?, ?)
            `;
            
            this.db.run(sql, [text, sessionId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    /**
     * ログの読み込み
     * @param {number} limit - 取得件数
     * @param {number} offset - オフセット
     */
    async getLogs(limit = 20, offset = 0) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            const logs = await this.selectLogs(limit, offset);
            const formattedLogs = this.formatLogs(logs);
            
            this.debugLog(`${this.logPrefix} ログ読み込み完了: ${formattedLogs.length}件`);
            
            return {
                success: true,
                logs: formattedLogs,
                count: formattedLogs.length,
                total: this.stats.totalLogs
            };
            
        } catch (error) {
            this.stats.errors++;
            this.debugLog(`${this.logPrefix} 読み込みエラー:`, error);
            return { 
                success: false, 
                error: error.message,
                logs: []
            };
        }
    }

    /**
     * ログをデータベースから選択
     */
    async selectLogs(limit, offset) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT id, text, timestamp, source, session_id
                FROM conversation_logs 
                ORDER BY timestamp DESC 
                LIMIT ? OFFSET ?
            `;
            
            this.db.all(sql, [limit, offset], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    /**
     * ログのフォーマット（既存形式に合わせる）
     */
    formatLogs(logs) {
        return logs.map(log => ({
            id: log.id,
            timestamp: new Date(log.timestamp).toLocaleString(),
            text: log.text,
            source: log.source || 'kawaii-app',
            sessionId: log.session_id,
            raw: `『${log.text}』` // 既存形式に合わせる
        }));
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
     * 統計情報の取得
     */
    getStats() {
        const runtimeHours = (Date.now() - this.stats.startTime) / (1000 * 60 * 60);
        
        return {
            ...this.stats,
            runtimeHours: Math.round(runtimeHours * 100) / 100,
            logsPerHour: runtimeHours > 0 ? Math.round(this.stats.sessionLogs / runtimeHours) : 0,
            isInitialized: this.isInitialized,
            dbPath: this.dbPath
        };
    }

    /**
     * データベースの閉じる
     */
    async close() {
        if (this.db) {
            return new Promise((resolve) => {
                this.db.close((err) => {
                    if (err) {
                        this.debugLog(`${this.logPrefix} 閉じる際にエラー:`, err);
                    } else {
                        this.debugLog(`${this.logPrefix} データベース接続を閉じました`);
                    }
                    resolve();
                });
            });
        }
    }

    /**
     * ログのクリア（デバッグ用）
     */
    async clearLogs() {
        if (!this.isInitialized) {
            return { success: false, error: 'Logger not initialized' };
        }

        try {
            await new Promise((resolve, reject) => {
                this.db.run('DELETE FROM conversation_logs', (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            this.stats.totalLogs = 0;
            this.debugLog(`${this.logPrefix} 全ログをクリアしました`);
            
            return { success: true };
            
        } catch (error) {
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