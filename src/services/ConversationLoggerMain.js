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
        
        // 動作モード管理（新規追加）
        this.operatingMode = 'initializing'; // 'full', 'memory', 'disabled'
        this.fallbackMode = false;
        this.initializationError = null;
        
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
            await this.normalInitialize();
            this.operatingMode = 'full';
            console.log(`${this.logPrefix} フル機能モードで動作開始`);
            return { success: true, mode: 'full', totalLogs: this.stats.totalLogs };
            
        } catch (error) {
            console.error(`${this.logPrefix} 通常初期化失敗:`, error);
            this.initializationError = error;
            
            // フォールバック: メモリのみモード
            await this.enableMemoryOnlyMode();
            return { success: true, mode: 'memory', fallback: true, error: error.message };
        }
    }

    /**
     * 通常の初期化処理
     */
    async normalInitialize() {
        // .claudeディレクトリの作成
        const claudeDir = path.dirname(this.logPath);
        if (!fs.existsSync(claudeDir)) {
            fs.mkdirSync(claudeDir, { recursive: true });
            console.log(`${this.logPrefix} ディレクトリを作成: ${claudeDir}`);
        }

        // 既存ログファイルの読み込み
        await this.loadFromFile();
        
        this.isInitialized = true;
        console.log(`${this.logPrefix} 通常初期化完了 - 既存ログ: ${this.stats.totalLogs}件`);
    }

    /**
     * メモリのみモードに切り替え
     */
    async enableMemoryOnlyMode() {
        console.warn(`${this.logPrefix} メモリのみモードに切り替え`);
        this.operatingMode = 'memory';
        this.fallbackMode = true;
        this.isInitialized = true; // メモリのみでも動作可能
        
        // メモリキャッシュのみで動作
        this.cache = [];
        this.maxCacheSize = 1000; // メモリのみの場合は多めに保持
        
        // 基本的な統計情報は維持
        this.stats.totalLogs = 0;
        this.stats.sessionLogs = 0;
        
        console.log(`${this.logPrefix} メモリのみモード初期化完了（最大${this.maxCacheSize}件保持）`);
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
     * 会話ログの保存（動作モード対応）
     * @param {string} text - 保存するテキスト
     * @param {string} sessionId - セッションID（オプション）
     */
    async saveLog(text, sessionId = null) {
        if (!this.isInitialized) {
            console.log(`${this.logPrefix} 未初期化のため保存をスキップ: "${text.substring(0, 30)}..."`);
            return { success: false, error: 'Logger not initialized' };
        }

        try {
            // テキストクリーニングはクライアント側で実施済み
            if (!text || typeof text !== 'string' || !text.trim()) {
                return { success: false, error: 'Empty text provided' };
            }

            // 新しいログエントリを作成
            const logEntry = {
                id: Date.now(),
                timestamp: new Date().toISOString(),
                text: text.trim(),
                sessionId: sessionId || 'default-session',
                source: 'kawaii-app',
                mode: this.operatingMode
            };

            // 動作モードに応じた保存処理
            switch (this.operatingMode) {
                case 'full':
                    return await this.saveToFileWithFallback(logEntry);
                    
                case 'memory':
                    return this.saveToMemoryOnly(logEntry);
                    
                case 'disabled':
                    console.log(`${this.logPrefix} ログ機能無効 - 保存スキップ`);
                    return { success: true, mode: 'disabled', skipped: true };
                    
                default:
                    throw new Error(`Unknown operating mode: ${this.operatingMode}`);
            }
        } catch (error) {
            this.stats.errors++;
            console.error(`${this.logPrefix} 保存エラー:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * ファイル保存（フォールバック付き）
     */
    async saveToFileWithFallback(logEntry) {
        try {
            // メモリキャッシュに追加
            this.addToCache(logEntry);

            // ログデータに追加
            this.logData.logs.push(logEntry);
            
            // 統計情報を更新
            this.stats.sessionLogs++;
            this.stats.totalLogs++;
            
            // ファイルに保存を試行
            await this.writeToFile(logEntry);
            
            console.log(`${this.logPrefix} ログ保存完了: "${logEntry.text.substring(0, 50)}..." (総数: ${this.stats.totalLogs})`);
            
            return { 
                success: true, 
                logId: logEntry.id, 
                mode: 'full',
                savedTo: 'file+memory',
                totalLogs: this.stats.totalLogs 
            };
            
        } catch (error) {
            console.error(`${this.logPrefix} ファイル保存失敗、メモリに保存:`, error);
            
            // ファイル保存失敗時はメモリにフォールバック
            this.operatingMode = 'memory';
            return this.saveToMemoryOnly(logEntry);
        }
    }

    /**
     * メモリのみに保存
     */
    saveToMemoryOnly(logEntry) {
        this.addToCache(logEntry);
        
        // 統計情報を更新（メモリのみでも統計は維持）
        this.stats.sessionLogs++;
        this.stats.totalLogs++;
        
        console.log(`${this.logPrefix} メモリ保存成功: "${logEntry.text.substring(0, 50)}..." (ID: ${logEntry.id})`);
        
        return { 
            success: true, 
            logId: logEntry.id, 
            mode: 'memory',
            savedTo: 'memory',
            totalLogs: this.stats.totalLogs 
        };
    }

    /**
     * キャッシュにログエントリを追加
     */
    addToCache(logEntry) {
        this.cache.push(logEntry);
        
        // メモリキャッシュサイズ制限
        if (this.cache.length > this.maxCacheSize) {
            const removed = this.cache.shift(); // 古いエントリを削除
            console.log(`${this.logPrefix} キャッシュ制限により古いログを削除: ${removed.id}`);
        }
    }

    /**
     * ファイルへの書き込み処理
     */
    async writeToFile(logEntry) {
        // 統計情報を更新
        this.logData.updated = new Date().toISOString();
        this.logData.stats = this.stats;
        
        // ファイルに保存
        const jsonContent = JSON.stringify(this.logData, null, 2);
        fs.writeFileSync(this.logPath, jsonContent, 'utf8');
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
     * テキストのクリーニング（廃止）
     * クライアント側で実行済みのため、サーバー側では不要
     */
    // cleanText(text) {
    //     // この処理はクライアント側（ConversationLogger）で実行済み
    //     // 重複処理を避けるため廃止
    // }

    /**
     * 統計情報の取得（動作モード対応）
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
                operatingMode: this.operatingMode,
                fallbackMode: this.fallbackMode,
                initializationError: this.initializationError?.message,
                logPath: this.logPath,
                cacheSize: this.cache.length,
                maxCacheSize: this.maxCacheSize,
                fileSize: this.operatingMode === 'full' ? this.getFileSize() : 'N/A (memory only)'
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