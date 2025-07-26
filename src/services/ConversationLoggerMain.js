/**
 * メインプロセス用JSON会話ログシステム
 * - JSONファイルによる会話ログ保存（配布対応）
 * - メモリキャッシュで高速アクセス
 * - 依存関係ゼロ、インストール不要
 * - 既存ログ形式との互換性を保持
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

class ConversationLoggerMain {
    constructor() {
        this.logPath = path.join(os.homedir(), '.claude', 'conversation_log.json');
        this.isInitialized = false;
        this.logPrefix = '💾 [ConversationLoggerMain]';
        
        // メモリキャッシュ
        this.cache = [];
        this.maxCacheSize = 100; // 最大100件をメモリに保持
        
        // 統計情報
        this.stats = {
            totalLogs: 0,
            sessionLogs: 0,
            errors: 0,
            startTime: Date.now()
        };
        
        // ログデータ構造
        this.logData = {
            version: "1.0",
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            stats: this.stats,
            logs: []
        };
    }

    /**
     * ログシステムの初期化
     */
    async initialize() {
        try {
            // .claudeディレクトリの作成
            const claudeDir = path.dirname(this.logPath);
            if (!fs.existsSync(claudeDir)) {
                fs.mkdirSync(claudeDir, { recursive: true });
                console.log(`${this.logPrefix} ディレクトリを作成: ${claudeDir}`);
            }

            // 既存ログファイルの読み込み
            await this.loadFromFile();
            
            this.isInitialized = true;
            console.log(`${this.logPrefix} 初期化完了 - 既存ログ: ${this.stats.totalLogs}件`);
            
            return { success: true, totalLogs: this.stats.totalLogs };
            
        } catch (error) {
            console.error(`${this.logPrefix} 初期化エラー:`, error);
            this.stats.errors++;
            return { success: false, error: error.message };
        }
    }

    /**
     * ファイルからログデータを読み込み
     */
    async loadFromFile() {
        try {
            if (fs.existsSync(this.logPath)) {
                const fileContent = fs.readFileSync(this.logPath, 'utf8');
                const data = JSON.parse(fileContent);
                
                // データの検証と統合
                if (data.logs && Array.isArray(data.logs)) {
                    this.logData = data;
                    this.stats.totalLogs = data.logs.length;
                    
                    // 最新のログをキャッシュに読み込み
                    this.cache = data.logs.slice(-this.maxCacheSize);
                    
                    console.log(`${this.logPrefix} ログファイルを読み込み: ${this.stats.totalLogs}件`);
                } else {
                    console.log(`${this.logPrefix} 新規ログファイルを作成`);
                }
            } else {
                console.log(`${this.logPrefix} 新規ログファイルを作成`);
            }
        } catch (error) {
            console.error(`${this.logPrefix} ファイル読み込みエラー:`, error);
            // エラーが発生しても継続（新規作成として扱う）
        }
    }

    /**
     * ファイルにログデータを保存
     */
    async saveToFile() {
        try {
            // 統計情報を更新
            this.logData.updated = new Date().toISOString();
            this.logData.stats = this.stats;
            
            // ファイルに保存
            const jsonContent = JSON.stringify(this.logData, null, 2);
            fs.writeFileSync(this.logPath, jsonContent, 'utf8');
            
            return { success: true };
        } catch (error) {
            console.error(`${this.logPrefix} ファイル保存エラー:`, error);
            this.stats.errors++;
            return { success: false, error: error.message };
        }
    }

    /**
     * 会話ログの保存
     * @param {string} text - 保存するテキスト
     * @param {string} sessionId - セッションID（オプション）
     */
    async saveLog(text, sessionId = null) {
        if (!this.isInitialized) {
            console.log(`${this.logPrefix} 未初期化のため保存をスキップ: "${text.substring(0, 30)}..."`);
            return { success: false, error: 'Logger not initialized' };
        }

        try {
            const cleanText = this.cleanText(text);
            if (!cleanText) {
                return { success: false, error: 'Empty text after cleaning' };
            }

            // 新しいログエントリを作成
            const logEntry = {
                id: Date.now(),
                timestamp: new Date().toISOString(),
                text: cleanText,
                sessionId: sessionId,
                source: 'kawaii-app'
            };

            // メモリキャッシュに追加
            this.cache.push(logEntry);
            if (this.cache.length > this.maxCacheSize) {
                this.cache.shift(); // 古いものを削除
            }

            // ログデータに追加
            this.logData.logs.push(logEntry);
            
            // 統計情報を更新
            this.stats.sessionLogs++;
            this.stats.totalLogs++;
            
            // ファイルに保存
            const saveResult = await this.saveToFile();
            if (!saveResult.success) {
                throw new Error(saveResult.error);
            }
            
            console.log(`${this.logPrefix} ログ保存完了: "${cleanText.substring(0, 50)}..." (総数: ${this.stats.totalLogs})`);
            
            return { success: true, logId: logEntry.id, totalLogs: this.stats.totalLogs };
            
        } catch (error) {
            this.stats.errors++;
            console.error(`${this.logPrefix} 保存エラー:`, error);
            return { success: false, error: error.message };
        }
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
            // キャッシュから取得（最新のログを優先）
            let logs = [];
            
            if (this.cache.length >= limit && offset === 0) {
                // キャッシュで足りる場合
                logs = this.cache.slice(-limit).reverse();
            } else {
                // ファイルから直接読み込み
                const allLogs = this.logData.logs.slice().reverse(); // 新しい順
                logs = allLogs.slice(offset, offset + limit);
            }

            // 既存形式にフォーマット
            const formattedLogs = this.formatLogs(logs);
            
            console.log(`${this.logPrefix} ログ読み込み完了: ${formattedLogs.length}件`);
            
            return {
                success: true,
                logs: formattedLogs,
                count: formattedLogs.length,
                total: this.stats.totalLogs
            };
            
        } catch (error) {
            this.stats.errors++;
            console.error(`${this.logPrefix} 読み込みエラー:`, error);
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
     * ログのフォーマット（既存形式に合わせる）
     */
    formatLogs(logs) {
        return logs.map(log => ({
            id: log.id,
            timestamp: new Date(log.timestamp).toLocaleString(),
            text: log.text,
            source: log.source || 'kawaii-app',
            sessionId: log.sessionId,
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
            success: true,
            stats: {
                ...this.stats,
                runtimeHours: Math.round(runtimeHours * 100) / 100,
                logsPerHour: runtimeHours > 0 ? Math.round(this.stats.sessionLogs / runtimeHours) : 0,
                isInitialized: this.isInitialized,
                logPath: this.logPath,
                cacheSize: this.cache.length,
                fileSize: this.getFileSize()
            }
        };
    }

    /**
     * ログファイルのサイズを取得
     */
    getFileSize() {
        try {
            if (fs.existsSync(this.logPath)) {
                const stats = fs.statSync(this.logPath);
                return Math.round(stats.size / 1024) + ' KB'; // KB単位
            }
            return '0 KB';
        } catch (error) {
            return 'Unknown';
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
            // ログデータをリセット
            this.logData.logs = [];
            this.cache = [];
            this.stats.totalLogs = 0;
            this.stats.sessionLogs = 0;
            
            // ファイルに保存
            const saveResult = await this.saveToFile();
            if (!saveResult.success) {
                throw new Error(saveResult.error);
            }
            
            console.log(`${this.logPrefix} 全ログをクリアしました`);
            
            return { success: true, totalLogs: 0 };
            
        } catch (error) {
            console.error(`${this.logPrefix} クリアエラー:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * ログローテーション（古いログの管理）
     */
    async rotateLogsIfNeeded() {
        const maxLogs = 1000; // 最大ログ数
        
        if (this.logData.logs.length > maxLogs) {
            try {
                const oldLogs = this.logData.logs.slice(0, this.logData.logs.length - maxLogs);
                this.logData.logs = this.logData.logs.slice(-maxLogs);
                
                // 古いログをアーカイブ
                const archivePath = this.logPath.replace('.json', `_archive_${Date.now()}.json`);
                const archiveData = {
                    version: "1.0",
                    archived: new Date().toISOString(),
                    logs: oldLogs
                };
                
                fs.writeFileSync(archivePath, JSON.stringify(archiveData, null, 2));
                console.log(`${this.logPrefix} 古いログをアーカイブ: ${archivePath}`);
                
                await this.saveToFile();
                
            } catch (error) {
                console.error(`${this.logPrefix} ローテーションエラー:`, error);
            }
        }
    }

    /**
     * 終了処理
     */
    async close() {
        if (this.isInitialized) {
            // 必要に応じてローテーション
            await this.rotateLogsIfNeeded();
            
            // 最終保存
            await this.saveToFile();
            
            console.log(`${this.logPrefix} 終了処理完了`);
        }
        this.isInitialized = false;
        return Promise.resolve();
    }
}

module.exports = ConversationLoggerMain;