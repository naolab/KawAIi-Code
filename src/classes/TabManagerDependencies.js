/**
 * TabManagerの依存関係を管理するクラス
 * TerminalAppクラスとTabManagerクラスの間の依存関係を抽象化
 */
class TabManagerDependencies {
    constructor(terminalApp) {
        // TerminalAppへの直接参照（通知などで使用）
        this.terminalApp = terminalApp;
        
        // 音声処理用のMessageAccumulator
        this.messageAccumulator = terminalApp.messageAccumulator;
        
        // メインターミナルとFitAddon
        this.mainTerminal = terminalApp.terminalService ? terminalApp.terminalService.terminal : null;
        this.mainFitAddon = terminalApp.terminalService ? terminalApp.terminalService.fitAddon : null;
        
        // リサイズ処理
        this.handleResize = () => terminalApp.handleResize();
        
        // ボタン状態更新
        this.updateButtons = () => terminalApp.updateButtons();
        
        // イベントリスナー管理
        this.resourceManager = terminalApp.resourceManager;
        
        // デバッグ用
        this.debugLog = terminalApp.debugLog || debugLog;
        this.debugError = terminalApp.debugError || debugError;
        
        // 通知機能
        this.showNotification = (msg, type) => terminalApp.showNotification ? terminalApp.showNotification(msg, type) : null;
    }
    
    // 依存関係の健全性チェック
    isValid() {
        const required = [
            'messageAccumulator',
            'mainTerminal', 
            'mainFitAddon',
            'handleResize',
            'updateButtons',
            'resourceManager'
        ];
        
        for (const prop of required) {
            if (!this[prop]) {
                this.debugError(`TabManagerDependencies: Missing required property: ${prop}`);
                return false;
            }
        }
        
        return true;
    }
}

// ブラウザ環境での利用
if (typeof window !== 'undefined') {
    window.TabManagerDependencies = TabManagerDependencies;
}

// Node.js環境での利用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TabManagerDependencies;
}