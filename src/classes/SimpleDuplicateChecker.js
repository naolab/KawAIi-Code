/**
 * シンプル重複防止システム
 * - ハッシュベースの軽量重複チェック
 * - アプリ起動中のみログ保持
 * - 高速・軽量・確実な重複防止
 */

class SimpleDuplicateChecker {
    constructor() {
        this.spokenTexts = new Set();
        this.debugLog = console.log;
        this.stats = { 
            checked: 0, 
            duplicates: 0, 
            spoken: 0,
            startTime: Date.now()
        };
        this.debugMode = true; // 開発モード：デフォルトでオン
        this.logPrefix = '🛡️ [DupeChecker]';
        
        // リアルタイム状況表示
        this.logInfo('シンプル重複防止システム初期化完了');
    }

    /**
     * 重複チェック（メイン機能）
     * @param {string} text - チェック対象のテキスト
     * @returns {boolean} 重複の場合true
     */
    isDuplicate(text) {
        this.stats.checked++;
        const hash = this.generateHash(text);
        
        this.logDebug(`チェック #${this.stats.checked}: "${text.substring(0, 40)}..."`);
        
        if (!hash) {
            this.logDebug(`ハッシュ生成失敗 - スキップ`);
            return false;
        }
        
        const isDupe = this.spokenTexts.has(hash);
        if (isDupe) {
            this.stats.duplicates++;
            this.logWarning(`🚫 重複検出！ スキップします: "${text.substring(0, 30)}..." (hash: ${hash})`);
            this.showRealtimeStats();
        } else {
            this.logSuccess(`✅ 新規テキスト: "${text.substring(0, 30)}..." (hash: ${hash})`);
        }
        return isDupe;
    }

    /**
     * 読み上げ済みとしてマーク
     * @param {string} text - 読み上げ完了したテキスト
     */
    markAsSpoken(text) {
        const hash = this.generateHash(text);
        if (hash) {
            this.spokenTexts.add(hash);
            this.stats.spoken++;
            this.logInfo(`🎵 読み上げ完了をマーク: "${text.substring(0, 30)}..." (total: ${this.stats.spoken}件)`);
            
            // 10件ごとに統計表示
            if (this.stats.spoken % 10 === 0) {
                this.showRealtimeStats();
            }
        }
    }

    /**
     * ハッシュ生成（軽量版）
     * @param {string} text - ハッシュ対象のテキスト
     * @returns {string|null} 生成されたハッシュ
     */
    generateHash(text) {
        if (!text || typeof text !== 'string') return null;
        
        // テキストの正規化
        const normalized = text
            .replace(/\s+/g, ' ')           // 連続空白を単一空白に
            .replace(/\r?\n/g, ' ')         // 改行を空白に
            .trim();                        // 前後の空白削除
        
        if (!normalized) return null;
        
        // Base64ハッシュ（軽量・高速）
        try {
            return btoa(unescape(encodeURIComponent(normalized))).substring(0, 32);
        } catch (e) {
            this.debugLog('⚠️ [SimpleDupe] ハッシュ生成エラー:', e);
            return null;
        }
    }

    /**
     * 統計情報の取得
     * @returns {object} 統計データ
     */
    getStats() {
        const runtimeHours = (Date.now() - this.stats.startTime) / (1000 * 60 * 60);
        
        return {
            ...this.stats,
            runtimeHours: Math.round(runtimeHours * 100) / 100,
            memoryKB: Math.round(this.spokenTexts.size * 0.1),
            duplicateRate: this.stats.checked > 0 ? 
                Math.round((this.stats.duplicates / this.stats.checked) * 100) : 0,
            avgPerHour: runtimeHours > 0 ? 
                Math.round(this.stats.spoken / runtimeHours) : 0
        };
    }

    /**
     * 統計情報をコンソールに表示
     */
    logStats() {
        const stats = this.getStats();
        console.table({
            '総チェック数': stats.checked,
            '重複検出数': stats.duplicates,
            '読み上げ数': stats.spoken,
            '重複率(%)': stats.duplicateRate,
            'メモリ使用量(KB)': stats.memoryKB,
            '稼働時間(h)': stats.runtimeHours,
            '時間あたり読み上げ': stats.avgPerHour
        });
    }

    /**
     * デバッグログの有効/無効切り替え
     * @param {boolean} enabled - ログを有効にするかどうか
     */
    setDebugLogging(enabled) {
        this.debugLog = enabled ? console.log : () => {};
    }

    /**
     * 特定のテキストが読み上げ済みかチェック
     * @param {string} text - チェック対象のテキスト
     * @returns {boolean} 読み上げ済みの場合true
     */
    isSpoken(text) {
        const hash = this.generateHash(text);
        return hash ? this.spokenTexts.has(hash) : false;
    }

    /**
     * クリア（アプリ終了時・デバッグ用）
     */
    clear() {
        const oldSize = this.spokenTexts.size;
        this.spokenTexts.clear();
        this.stats = { 
            checked: 0, 
            duplicates: 0, 
            spoken: 0,
            startTime: Date.now()
        };
        this.debugLog(`🗑️ [SimpleDupe] ログクリア完了: ${oldSize}件削除`);
    }

    /**
     * サイズ制限チェック（念のため）
     * 通常は不要だが、異常に大量のデータが溜まった場合の保護
     */
    checkSizeLimit() {
        const MAX_ENTRIES = 10000; // 10000件まで（約1MB）
        
        if (this.spokenTexts.size > MAX_ENTRIES) {
            this.logWarning(`⚠️ サイズ制限到達 (${this.spokenTexts.size}件) - ログをクリアします`);
            
            // 単純にクリア（本来はLRU等が理想だが、実用上問題なし）
            this.clear();
        }
    }

    // ===========================================
    // ログ出力メソッド（開発・デバッグ用）
    // ===========================================

    /**
     * 情報ログ出力
     * @param {string} message - ログメッセージ
     */
    logInfo(message) {
        if (this.debugMode) {
            console.log(`${this.logPrefix} ℹ️ ${message}`);
        }
    }

    /**
     * 成功ログ出力
     * @param {string} message - ログメッセージ
     */
    logSuccess(message) {
        if (this.debugMode) {
            console.log(`${this.logPrefix} ✅ ${message}`);
        }
    }

    /**
     * 警告ログ出力
     * @param {string} message - ログメッセージ
     */
    logWarning(message) {
        if (this.debugMode) {
            console.warn(`${this.logPrefix} ⚠️ ${message}`);
        }
    }

    /**
     * デバッグログ出力
     * @param {string} message - ログメッセージ
     */
    logDebug(message) {
        if (this.debugMode) {
            console.log(`${this.logPrefix} 🐛 ${message}`);
        }
    }

    /**
     * リアルタイム統計表示
     */
    showRealtimeStats() {
        if (!this.debugMode) return;
        
        const stats = this.getStats();
        const runtime = Math.round(stats.runtimeHours * 60); // 分単位
        
        console.group(`${this.logPrefix} 📊 統計情報 (${runtime}分稼働)`);
        console.log(`🔍 総チェック数: ${stats.checked}件`);
        console.log(`🚫 重複検出数: ${stats.duplicates}件 (${stats.duplicateRate}%)`);
        console.log(`🎵 読み上げ数: ${stats.spoken}件`);
        console.log(`💾 メモリ使用: ${stats.memoryKB}KB`);
        console.log(`⚡ 効率性: ${stats.duplicates > 0 ? '重複を検出済み' : '重複なし'}`);
        console.groupEnd();
    }

    /**
     * 詳細診断情報の表示
     */
    showDiagnostics() {
        console.group(`${this.logPrefix} 🔧 詳細診断`);
        
        const stats = this.getStats();
        console.table({
            '稼働時間(分)': Math.round(stats.runtimeHours * 60),
            '総チェック数': stats.checked,
            '重複検出数': stats.duplicates,
            '読み上げ数': stats.spoken,
            '重複率(%)': stats.duplicateRate,
            'メモリ(KB)': stats.memoryKB,
            '時間あたり読み上げ': stats.avgPerHour
        });
        
        console.log('📝 最近のハッシュサンプル:');
        const hashes = Array.from(this.spokenTexts).slice(-5);
        hashes.forEach((hash, i) => {
            console.log(`  ${i+1}. ${hash}`);
        });
        
        console.groupEnd();
    }

    /**
     * デバッグモードの切り替え
     * @param {boolean} enabled - デバッグモードを有効にするか
     */
    setDebugMode(enabled) {
        this.debugMode = enabled;
        this.logInfo(`デバッグモード: ${enabled ? '有効' : '無効'}`);
    }
}

// Node.js環境とブラウザ環境の両方に対応
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SimpleDuplicateChecker;
} else {
    window.SimpleDuplicateChecker = SimpleDuplicateChecker;
}