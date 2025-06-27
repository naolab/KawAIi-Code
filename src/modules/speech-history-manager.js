/**
 * SpeechHistoryManager - 音声読み上げ履歴管理クラス
 * 
 * 責務:
 * - 読み上げテキストの重複チェック
 * - LocalStorageでの履歴永続化
 * - ハッシュベースの効率的な重複判定
 * - 履歴サイズの自動管理
 */

// デバッグログ制御（本番環境では無効化）
// SpeechHistoryManager専用のログ関数を作成（グローバル競合を回避）
(function() {
    const isDevMode = !window.location.protocol.startsWith('file:') || process.env.NODE_ENV === 'development';
    
    // SpeechHistoryManager専用のログ関数をグローバルに設定
    if (typeof window.speechHistoryLog === 'undefined') {
        window.speechHistoryLog = {
            debug: isDevMode ? console.log : () => {},
            error: console.error
        };
    }
})();

// 統一設定管理システム（グローバル参照）
// unifiedConfigはunified-config-manager.jsで既にグローバルに定義済み

class SpeechHistoryManager {
    constructor(maxHistorySize = 10) {
        // ログ関数の初期化
        this.debugLog = window.speechHistoryLog.debug;
        this.debugError = window.speechHistoryLog.error;
        
        this.maxHistorySize = maxHistorySize;
        this.historyKey = 'speech_history';
        this.history = [];
        
        // 非同期初期化
        this.initializeAsync();
        
        this.debugLog('SpeechHistoryManager initialized with maxSize:', maxHistorySize);
    }

    // 非同期初期化
    async initializeAsync() {
        this.history = await this.loadHistory();
    }

    // 統一設定システムから履歴を読み込み
    async loadHistory() {
        try {
            const history = await unifiedConfig.get(this.historyKey, []);
            this.debugLog('音声履歴を読み込み:', { count: history.length });
            return history;
        } catch (error) {
            this.debugError('履歴読み込みエラー:', error);
            return [];
        }
    }

    // 統一設定システムに履歴を保存
    async saveHistory() {
        try {
            await unifiedConfig.set(this.historyKey, this.history);
            this.debugLog('音声履歴を保存:', { count: this.history.length });
        } catch (error) {
            this.debugError('履歴保存エラー:', error);
        }
    }

    // テキストのハッシュ値を生成（簡易版）
    generateHash(text) {
        // 正規化：空白、改行を統一するが、句読点は保持してより厳密な重複判定を行う
        const normalized = text
            .replace(/\s+/g, ' ')  // 連続空白を単一空白に
            .replace(/[、，]/g, '、') // 読点を統一
            .trim()
            .toLowerCase();
        
        // 簡易ハッシュ生成
        let hash = 0;
        for (let i = 0; i < normalized.length; i++) {
            const char = normalized.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 32bit整数に変換
        }
        return hash.toString();
    }

    // 重複チェック
    isDuplicate(text) {
        if (!text || text.length < 5) return false; // 短すぎるテキストはスキップ
        
        const hash = this.generateHash(text);
        const isDupe = this.history.includes(hash);
        
        if (isDupe) {
            this.debugLog('重複テキストを検出:', { 
                text: text.substring(0, 30) + '...', 
                hash,
                historySize: this.history.length 
            });
        }
        
        return isDupe;
    }

    // 履歴に追加
    addToHistory(text) {
        if (!text || text.length < 5) return;
        
        const hash = this.generateHash(text);
        
        // 既存の同じハッシュを削除（重複除去）
        this.history = this.history.filter(h => h !== hash);
        
        // 新しいハッシュを先頭に追加
        this.history.unshift(hash);
        
        // 最大件数を超えた場合は古いものを削除
        if (this.history.length > this.maxHistorySize) {
            this.history = this.history.slice(0, this.maxHistorySize);
        }
        
        this.saveHistory();
        this.debugLog('読み上げ履歴追加:', { 
            text: text.substring(0, 30) + '...', 
            hash, 
            historyCount: this.history.length 
        });
    }

    // 履歴をクリア
    clearHistory() {
        this.history = [];
        this.saveHistory();
        this.debugLog('読み上げ履歴をクリアしました');
    }

    // 履歴の状態を取得
    getHistoryStatus() {
        const status = {
            count: this.history.length,
            maxSize: this.maxHistorySize,
            recent: this.history.slice(0, 3) // 最新3件のハッシュ
        };
        
        this.debugLog('履歴状態を取得:', status);
        return status;
    }

    // 🔧 追加機能: 履歴のエクスポート（将来的な機能拡張用）
    exportHistory() {
        return {
            history: [...this.history],
            maxSize: this.maxHistorySize,
            exportedAt: new Date().toISOString()
        };
    }

    // 🔧 追加機能: 履歴のインポート（将来的な機能拡張用）
    importHistory(data) {
        if (data && Array.isArray(data.history)) {
            this.history = [...data.history];
            if (data.maxSize) {
                this.maxHistorySize = data.maxSize;
            }
            this.saveHistory();
            this.debugLog('履歴をインポートしました:', { count: this.history.length });
        }
    }
}

// グローバルに公開（モジュールシステム対応）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SpeechHistoryManager;
} else {
    window.SpeechHistoryManager = SpeechHistoryManager;
}