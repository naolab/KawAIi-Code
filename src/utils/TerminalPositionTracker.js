// TerminalPositionTracker - ターミナル位置追跡システム
// xterm.jsと連携してターミナル内の正確な位置情報を取得・管理

class TerminalPositionTracker {
    constructor(terminal) {
        this.terminal = terminal;
        this.lastKnownCursor = { x: 0, y: 0, absoluteY: 0 };
        this.isInitialized = false;
        this.debugLog = console.log;
        
        // バッファ変更の監視
        this.bufferChangeCallbacks = [];
        this.setupBufferMonitoring();
    }

    /**
     * バッファ変更の監視を設定
     */
    setupBufferMonitoring() {
        if (this.terminal && this.terminal.onData) {
            this.terminal.onData(() => {
                this.updateLastKnownPosition();
                this.notifyBufferChange();
            });
        }
    }

    /**
     * 現在のカーソル位置を取得
     * @returns {object} 位置情報オブジェクト
     */
    getCurrentPosition() {
        try {
            if (this.terminal && this.terminal.buffer && this.terminal.buffer.active) {
                const buffer = this.terminal.buffer.active;
                const position = {
                    line: buffer.cursorY,                    // 表示領域内での行位置
                    char: buffer.cursorX,                    // 文字位置
                    absoluteLine: buffer.baseY + buffer.cursorY, // 絶対行位置（スクロール考慮）
                    totalLines: buffer.length,              // バッファ総行数
                    scrollTop: buffer.viewportY,            // スクロール位置
                    cols: this.terminal.cols,               // ターミナル幅
                    rows: this.terminal.rows                // ターミナル高さ
                };
                
                this.lastKnownCursor = position;
                this.isInitialized = true;
                
                return position;
            }
        } catch (error) {
            this.debugLog('[PositionTracker] 位置取得エラー:', error.message);
        }
        
        // フォールバック: 最後に分かっている位置を返す
        return this.lastKnownCursor;
    }

    /**
     * 位置Aが位置Bより後（新しい）かを判定
     * @param {number} line1 - 比較対象の行番号1
     * @param {number} char1 - 比較対象の文字位置1
     * @param {number} line2 - 比較対象の行番号2
     * @param {number} char2 - 比較対象の文字位置2
     * @returns {boolean} 位置1が位置2より後の場合true
     */
    isPositionAfter(line1, char1, line2, char2) {
        return line1 > line2 || (line1 === line2 && char1 > char2);
    }

    /**
     * 指定範囲のコンテンツを取得
     * @param {number} fromLine - 開始行
     * @param {number} fromChar - 開始文字位置
     * @param {number} toLine - 終了行
     * @param {number} toChar - 終了文字位置
     * @returns {string} 指定範囲のテキスト
     */
    getContentRange(fromLine, fromChar, toLine, toChar) {
        if (!this.terminal || !this.terminal.buffer || !this.terminal.buffer.active) {
            this.debugLog('[PositionTracker] バッファが利用できません');
            return '';
        }
        
        try {
            const buffer = this.terminal.buffer.active;
            let content = '';
            
            // 範囲検証
            const startLine = Math.max(0, Math.min(fromLine, buffer.length - 1));
            const endLine = Math.max(0, Math.min(toLine, buffer.length - 1));
            
            for (let line = startLine; line <= endLine; line++) {
                const lineData = buffer.getLine(line);
                if (lineData) {
                    const start = (line === startLine) ? Math.max(0, fromChar) : 0;
                    const end = (line === endLine) ? Math.min(toChar, lineData.length) : lineData.length;
                    
                    if (start < end) {
                        const lineText = lineData.translateToString(false, start, end);
                        content += lineText;
                    }
                    
                    // 改行の追加（最終行以外）
                    if (line < endLine) {
                        content += '\n';
                    }
                }
            }
            
            return content;
            
        } catch (error) {
            this.debugLog('[PositionTracker] コンテンツ取得エラー:', error.message);
            return '';
        }
    }

    /**
     * 最後の処理位置以降の新しいコンテンツを取得
     * @param {number} lastLine - 最後に処理した行
     * @param {number} lastChar - 最後に処理した文字位置
     * @returns {string} 新しいコンテンツ
     */
    getNewContentSince(lastLine, lastChar) {
        const currentPos = this.getCurrentPosition();
        
        if (this.isPositionAfter(currentPos.absoluteLine, currentPos.char, lastLine, lastChar)) {
            return this.getContentRange(lastLine, lastChar, currentPos.absoluteLine, currentPos.char);
        }
        
        return '';
    }

    /**
     * 現在の行のコンテンツを取得
     * @returns {string} 現在行のテキスト
     */
    getCurrentLineContent() {
        const pos = this.getCurrentPosition();
        return this.getContentRange(pos.absoluteLine, 0, pos.absoluteLine, pos.char);
    }

    /**
     * 表示されている全コンテンツを取得
     * @returns {string} 表示領域のテキスト
     */
    getVisibleContent() {
        const pos = this.getCurrentPosition();
        const startLine = Math.max(0, pos.scrollTop);
        const endLine = Math.min(pos.totalLines - 1, pos.scrollTop + pos.rows - 1);
        
        return this.getContentRange(startLine, 0, endLine, pos.cols);
    }

    /**
     * 指定した行数分の履歴を取得
     * @param {number} lineCount - 取得する行数
     * @returns {string} 履歴テキスト
     */
    getRecentHistory(lineCount = 10) {
        const pos = this.getCurrentPosition();
        const startLine = Math.max(0, pos.absoluteLine - lineCount);
        
        return this.getContentRange(startLine, 0, pos.absoluteLine, pos.char);
    }

    /**
     * 最後に分かっている位置を更新
     */
    updateLastKnownPosition() {
        if (this.terminal && this.terminal.buffer && this.terminal.buffer.active) {
            this.getCurrentPosition(); // 内部で lastKnownCursor が更新される
        }
    }

    /**
     * バッファ変更のコールバック登録
     * @param {function} callback - バッファ変更時に呼び出される関数
     */
    onBufferChange(callback) {
        if (typeof callback === 'function') {
            this.bufferChangeCallbacks.push(callback);
        }
    }

    /**
     * バッファ変更のコールバック削除
     * @param {function} callback - 削除するコールバック関数
     */
    offBufferChange(callback) {
        const index = this.bufferChangeCallbacks.indexOf(callback);
        if (index !== -1) {
            this.bufferChangeCallbacks.splice(index, 1);
        }
    }

    /**
     * バッファ変更を通知
     */
    notifyBufferChange() {
        const currentPos = this.getCurrentPosition();
        this.bufferChangeCallbacks.forEach(callback => {
            try {
                callback(currentPos);
            } catch (error) {
                this.debugLog('[PositionTracker] コールバックエラー:', error.message);
            }
        });
    }

    /**
     * ターミナルサイズの変更を処理
     * @param {number} cols - 新しい列数
     * @param {number} rows - 新しい行数
     */
    handleResize(cols, rows) {
        this.debugLog(`[PositionTracker] ターミナルリサイズ: ${cols}x${rows}`);
        
        // 位置情報を再取得
        setTimeout(() => {
            this.updateLastKnownPosition();
            this.notifyBufferChange();
        }, 100);
    }

    /**
     * ターミナルクリア時の処理
     */
    handleClear() {
        this.debugLog('[PositionTracker] ターミナルクリア検出');
        this.lastKnownCursor = { x: 0, y: 0, absoluteY: 0 };
        this.notifyBufferChange();
    }

    /**
     * 位置情報のリセット
     */
    reset() {
        this.lastKnownCursor = { x: 0, y: 0, absoluteY: 0 };
        this.isInitialized = false;
        this.debugLog('[PositionTracker] 位置情報をリセット');
    }

    /**
     * デバッグ用：現在の状態を表示
     */
    logCurrentState() {
        const pos = this.getCurrentPosition();
        this.debugLog(`[PositionTracker] 現在位置: L${pos.absoluteLine}:C${pos.char} (表示: L${pos.line}:C${pos.char})`);
        this.debugLog(`[PositionTracker] スクロール: ${pos.scrollTop}, サイズ: ${pos.cols}x${pos.rows}, 総行数: ${pos.totalLines}`);
    }

    /**
     * 位置の詳細情報を取得
     * @returns {object} 詳細な位置情報
     */
    getDetailedPosition() {
        const pos = this.getCurrentPosition();
        
        return {
            ...pos,
            isAtBottom: pos.scrollTop + pos.rows >= pos.totalLines,
            isAtTop: pos.scrollTop === 0,
            visibleRange: {
                start: pos.scrollTop,
                end: pos.scrollTop + pos.rows - 1
            },
            bufferStats: {
                used: pos.totalLines,
                capacity: this.terminal?.buffer?.active?.capacity || 0
            }
        };
    }

    /**
     * 文字位置から絶対位置を計算
     * @param {number} line - 行番号
     * @param {number} char - 文字位置
     * @returns {number} 絶対位置（1次元）
     */
    getAbsolutePosition(line, char) {
        const pos = this.getCurrentPosition();
        return line * pos.cols + char;
    }

    /**
     * 絶対位置から行・文字位置を計算
     * @param {number} absolutePos - 絶対位置
     * @returns {object} {line, char} オブジェクト
     */
    getLineCharFromAbsolute(absolutePos) {
        const pos = this.getCurrentPosition();
        return {
            line: Math.floor(absolutePos / pos.cols),
            char: absolutePos % pos.cols
        };
    }

    /**
     * デバッグログの有効/無効切り替え
     * @param {boolean} enabled - ログを有効にするかどうか
     */
    setDebugLogging(enabled) {
        this.debugLog = enabled ? console.log : () => {};
    }

    /**
     * ターミナルインスタンスの再設定
     * @param {object} terminal - 新しいターミナルインスタンス
     */
    setTerminal(terminal) {
        this.terminal = terminal;
        this.reset();
        this.setupBufferMonitoring();
        this.debugLog('[PositionTracker] ターミナルインスタンスを再設定');
    }

    /**
     * ヘルス チェック
     * @returns {boolean} ターミナルが正常に動作している場合true
     */
    isHealthy() {
        return !!(
            this.terminal &&
            this.terminal.buffer &&
            this.terminal.buffer.active &&
            this.isInitialized
        );
    }
}

// Node.js環境とブラウザ環境の両方に対応
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TerminalPositionTracker;
} else {
    window.TerminalPositionTracker = TerminalPositionTracker;
}