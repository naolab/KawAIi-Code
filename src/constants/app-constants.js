// アプリケーション全体の定数管理
class AppConstants {
    // メッセージ処理関連
    static get MESSAGE() {
        return {
            COMPLETION_TIMEOUT: 3000  // 3秒でメッセージ完了と判定
        };
    }
    
    // 音声・オーディオ関連
    static get AUDIO() {
        return {
            MAX_AGE: 120000,              // 120秒（2分）で古い音声とみなす
            MAX_QUEUE_SIZE: 10,           // キューの最大サイズ（メモリ使用量制限）
            DEFAULT_INTERVAL_SECONDS: 0.5,  // 音声読み上げ間隔（デフォルト0.5秒）
            DEFAULT_INTERVAL: 500        // 音声読み上げ間隔（ミリ秒）
        };
    }
    
    // ターミナル関連
    static get TERMINAL() {
        return {
            SCROLLBACK: 1000,             // ターミナルのスクロールバック行数
            INIT_DELAY: 100,              // 初期化遅延
            CHECK_COMPLETE_INTERVAL: 100   // 完了チェック間隔
        };
    }
    
    // UI関連
    static get UI() {
        return {
            Z_INDEX_HIGH: 1000,           // 高いz-index値
            NOTIFICATION_DELAY: 5000,     // 通知表示時間
            CLEANUP_DELAY: 10000          // クリーンアップ遅延
        };
    }
}

// Node.js環境とブラウザ環境の両方に対応
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppConstants;
} else {
    window.AppConstants = AppConstants;
}