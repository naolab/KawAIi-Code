// Logger はブラウザ環境でグローバルに利用可能

class ErrorHandler {
    constructor(moduleName = 'App') {
        this.logger = Logger.create(moduleName);
    }

    // エラーの重要度レベル
    static get SEVERITY() {
        return {
            LOW: 'low',        // ログのみ
            MEDIUM: 'medium',  // ログ + 詳細情報
            HIGH: 'high',      // ログ + ユーザー通知
            CRITICAL: 'critical' // ログ + ダイアログ + アプリ停止検討
        };
    }

    // エラー分類
    static get CATEGORY() {
        return {
            NETWORK: 'network',
            FILE_SYSTEM: 'file_system',
            PROCESS: 'process',
            UI: 'ui',
            VALIDATION: 'validation',
            CONFIGURATION: 'configuration'
        };
    }

    handle(error, context = {}) {
        const errorInfo = this.createErrorInfo(error, context);
        
        // ログ出力（常に実行）
        this.logError(errorInfo);
        
        // 重要度に応じた追加処理
        switch (errorInfo.severity) {
            case ErrorHandler.SEVERITY.HIGH:
            case ErrorHandler.SEVERITY.CRITICAL:
                this.notifyUser(errorInfo);
                break;
            case ErrorHandler.SEVERITY.MEDIUM:
                this.logDetailedInfo(errorInfo);
                break;
        }

        // クリティカルエラーの場合は追加対応
        if (errorInfo.severity === ErrorHandler.SEVERITY.CRITICAL) {
            this.handleCriticalError(errorInfo);
        }

        return errorInfo;
    }

    createErrorInfo(error, context) {
        const timestamp = new Date().toISOString();
        const stack = error.stack || new Error().stack;
        
        return {
            message: error.message || String(error),
            stack,
            timestamp,
            severity: context.severity || ErrorHandler.SEVERITY.LOW,
            category: context.category || ErrorHandler.CATEGORY.UI,
            operation: context.operation || 'unknown',
            additionalInfo: context.additionalInfo || {},
            userMessage: context.userMessage || 'エラーが発生しました'
        };
    }

    logError(errorInfo) {
        this.logger.error(`[${errorInfo.category.toUpperCase()}] ${errorInfo.operation}: ${errorInfo.message}`);
        
        if (errorInfo.severity !== ErrorHandler.SEVERITY.LOW) {
            this.logger.error('Error details:', {
                timestamp: errorInfo.timestamp,
                severity: errorInfo.severity,
                additionalInfo: errorInfo.additionalInfo
            });
        }
    }

    logDetailedInfo(errorInfo) {
        this.logger.error('Stack trace:', errorInfo.stack);
        this.logger.error('Additional context:', errorInfo.additionalInfo);
    }

    notifyUser(errorInfo) {
        // ブラウザ環境でのユーザー通知
        if (typeof window !== 'undefined') {
            this.showBrowserNotification(errorInfo);
        }
    }

    showBrowserNotification(errorInfo) {
        // 既存の通知要素があれば削除
        const existingNotification = document.getElementById('error-notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        // エラー通知を表示
        const notification = document.createElement('div');
        notification.id = 'error-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background-color: #f44336;
            color: white;
            padding: 16px;
            border-radius: 8px;
            z-index: 10000;
            max-width: 400px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            font-family: Arial, sans-serif;
        `;
        
        notification.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 8px;">エラーが発生しました</div>
            <div style="font-size: 14px;">${errorInfo.userMessage}</div>
            <button onclick="this.parentElement.remove()" style="
                position: absolute;
                top: 8px;
                right: 8px;
                background: none;
                border: none;
                color: white;
                font-size: 18px;
                cursor: pointer;
            ">×</button>
        `;

        document.body.appendChild(notification);

        // 5秒後に自動削除
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    handleCriticalError(errorInfo) {
        this.logger.error('CRITICAL ERROR - System may be unstable:', errorInfo);
        
        // Node.js環境（メインプロセス）でダイアログ表示
        if (typeof require !== 'undefined') {
            try {
                const { dialog } = require('electron');
                if (dialog) {
                    dialog.showErrorBox('重大なエラー', errorInfo.userMessage);
                }
            } catch (e) {
                // Electronが利用できない場合は何もしない
            }
        }
    }

    // 便利メソッド
    handleNetworkError(error, operation, userMessage = 'ネットワークエラーが発生しました') {
        return this.handle(error, {
            severity: ErrorHandler.SEVERITY.MEDIUM,
            category: ErrorHandler.CATEGORY.NETWORK,
            operation,
            userMessage
        });
    }

    handleFileSystemError(error, operation, userMessage = 'ファイル操作でエラーが発生しました') {
        return this.handle(error, {
            severity: ErrorHandler.SEVERITY.HIGH,
            category: ErrorHandler.CATEGORY.FILE_SYSTEM,
            operation,
            userMessage
        });
    }

    handleProcessError(error, operation, userMessage = 'プロセスでエラーが発生しました') {
        return this.handle(error, {
            severity: ErrorHandler.SEVERITY.HIGH,
            category: ErrorHandler.CATEGORY.PROCESS,
            operation,
            userMessage
        });
    }

    handleValidationError(error, operation, userMessage = '入力値が正しくありません') {
        return this.handle(error, {
            severity: ErrorHandler.SEVERITY.MEDIUM,
            category: ErrorHandler.CATEGORY.VALIDATION,
            operation,
            userMessage
        });
    }
}

// Node.js環境とブラウザ環境の両方に対応
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ErrorHandler;
} else {
    window.ErrorHandler = ErrorHandler;
}