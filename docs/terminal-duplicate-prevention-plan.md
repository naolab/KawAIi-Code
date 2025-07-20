# ターミナル重複読み上げ問題 - 解決実装計画

## 概要

現在のAI-Kawaii-Projectでは、ターミナルのリサイズやスクロール時に既読コンテンツが再度音声合成される問題が発生している。この文書では、根本的な解決策の詳細な実装計画を示す。

## 問題の現状

### 主要な問題点

1. **リサイズ時の重複読み上げ**
   - ウィンドウリサイズ後に既読テキストが再処理される
   - `isResizing`フラグによる一時停止後の不適切な再開

2. **スクロール時の重複読み上げ**
   - Claude Codeが上部へ自動スクロールする際に既読部分を再読み上げ
   - スクロール位置と処理済み位置の不整合

3. **メッセージ境界の曖昧さ**
   - MessageAccumulatorでの強制完了処理による重複
   - 高速連続データ受信時の境界検出エラー

## 解決戦略

### アプローチ: 三重の重複防止システム

1. **位置ベース追跡** - ターミナル内での絶対位置による管理
2. **コンテンツハッシュ** - 内容の一意性による重複検出
3. **タイムスタンプ** - 時間ベースの重複排除

## 実装計画

### フェーズ1: 基盤クラスの実装

#### 1.1 ContentTracker クラス
**ファイル**: `src/classes/ContentTracker.js`

```javascript
class ContentTracker {
    constructor() {
        this.lastProcessedLine = 0;        // 最後に処理した行番号
        this.lastProcessedChar = 0;        // 最後に処理した文字位置
        this.processedContent = new Set();  // 処理済みコンテンツのハッシュ
        this.messageTimestamps = new Map(); // メッセージID -> 処理時刻
        this.DUPLICATE_TIMEOUT = 5000;     // 5秒以内は重複とみなす
        this.debugLog = console.log;
    }

    // 新しいコンテンツかどうか判定
    isNewContent(content, line, char) {
        const contentHash = this.generateHash(content);
        
        // 1. 位置ベースチェック
        if (line < this.lastProcessedLine || 
            (line === this.lastProcessedLine && char <= this.lastProcessedChar)) {
            this.debugLog(`[ContentTracker] 古い位置のコンテンツをスキップ: L${line}:C${char}`);
            return false;
        }
        
        // 2. ハッシュベースチェック
        if (this.processedContent.has(contentHash)) {
            this.debugLog(`[ContentTracker] 既処理コンテンツをスキップ: ${contentHash}`);
            return false;
        }
        
        // 3. タイムスタンプチェック
        const now = Date.now();
        if (this.messageTimestamps.has(contentHash)) {
            const lastTime = this.messageTimestamps.get(contentHash);
            if (now - lastTime < this.DUPLICATE_TIMEOUT) {
                this.debugLog(`[ContentTracker] 最近処理済みコンテンツをスキップ: ${contentHash}`);
                return false;
            }
        }
        
        return true;
    }

    // コンテンツを処理済みとしてマーク
    markAsProcessed(content, line, char) {
        const contentHash = this.generateHash(content);
        this.processedContent.add(contentHash);
        this.messageTimestamps.set(contentHash, Date.now());
        this.lastProcessedLine = line;
        this.lastProcessedChar = char;
        
        this.debugLog(`[ContentTracker] 処理済みにマーク: L${line}:C${char} - ${contentHash}`);
        
        // メモリ使用量制限（最大1000エントリ）
        if (this.processedContent.size > 1000) {
            this.cleanup();
        }
    }

    // ハッシュ生成（正規化 + SHA-1ライク）
    generateHash(content) {
        const normalized = content
            .replace(/\s+/g, ' ')           // 連続空白を単一空白に
            .replace(/\n+/g, '\n')          // 連続改行を単一改行に
            .trim();                        // 前後の空白削除
        
        if (!normalized) return null;
        
        // 簡易ハッシュ（本格実装ではcrypto使用推奨）
        let hash = 0;
        for (let i = 0; i < normalized.length; i++) {
            const char = normalized.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 32bit整数に変換
        }
        return hash.toString(36);
    }

    // 古いエントリのクリーンアップ
    cleanup() {
        const now = Date.now();
        const oldHashes = [];
        
        for (const [hash, timestamp] of this.messageTimestamps) {
            if (now - timestamp > this.DUPLICATE_TIMEOUT * 4) { // 20秒以上古い
                oldHashes.push(hash);
            }
        }
        
        oldHashes.forEach(hash => {
            this.processedContent.delete(hash);
            this.messageTimestamps.delete(hash);
        });
        
        this.debugLog(`[ContentTracker] クリーンアップ完了: ${oldHashes.length}件削除`);
    }

    // デバッグ情報の出力
    getStats() {
        return {
            processedCount: this.processedContent.size,
            lastPosition: `L${this.lastProcessedLine}:C${this.lastProcessedChar}`,
            oldestTimestamp: Math.min(...this.messageTimestamps.values()),
            newestTimestamp: Math.max(...this.messageTimestamps.values())
        };
    }
}

module.exports = ContentTracker;
```

#### 1.2 TerminalPositionTracker クラス
**ファイル**: `src/utils/TerminalPositionTracker.js`

```javascript
class TerminalPositionTracker {
    constructor(terminal) {
        this.terminal = terminal;
        this.lastKnownCursor = { x: 0, y: 0 };
        this.debugLog = console.log;
    }

    // 現在のカーソル位置を取得
    getCurrentPosition() {
        if (this.terminal && this.terminal.buffer && this.terminal.buffer.active) {
            const position = {
                line: this.terminal.buffer.active.cursorY,
                char: this.terminal.buffer.active.cursorX,
                totalLines: this.terminal.buffer.active.length,
                scrollTop: this.terminal.buffer.active.viewportY
            };
            this.lastKnownCursor = position;
            return position;
        }
        return this.lastKnownCursor;
    }

    // 位置Aが位置Bより後かを判定
    isPositionAfter(line1, char1, line2, char2) {
        return line1 > line2 || (line1 === line2 && char1 > char2);
    }

    // 指定範囲のコンテンツを取得
    getContentRange(fromLine, fromChar, toLine, toChar) {
        if (!this.terminal.buffer || !this.terminal.buffer.active) {
            this.debugLog('[PositionTracker] バッファが利用できません');
            return '';
        }
        
        let content = '';
        for (let line = fromLine; line <= toLine; line++) {
            const lineData = this.terminal.buffer.active.getLine(line);
            if (lineData) {
                const start = (line === fromLine) ? fromChar : 0;
                const end = (line === toLine) ? toChar : lineData.length;
                const lineText = lineData.translateToString(false, start, end);
                content += lineText;
                if (line < toLine) content += '\n';
            }
        }
        return content;
    }

    // 新しいコンテンツ部分を特定
    getNewContentSince(lastLine, lastChar) {
        const currentPos = this.getCurrentPosition();
        
        if (this.isPositionAfter(currentPos.line, currentPos.char, lastLine, lastChar)) {
            return this.getContentRange(lastLine, lastChar, currentPos.line, currentPos.char);
        }
        
        return '';
    }

    // デバッグ用：現在の状態を表示
    logCurrentState() {
        const pos = this.getCurrentPosition();
        this.debugLog(`[PositionTracker] 現在位置: L${pos.line}:C${pos.char}, 総行数: ${pos.totalLines}, スクロール: ${pos.scrollTop}`);
    }
}

module.exports = TerminalPositionTracker;
```

### フェーズ2: 既存クラスの改良

#### 2.1 MessageAccumulator の強化
**ファイル**: `src/classes/MessageAccumulator.js` (既存ファイルの修正)

```javascript
// 既存のコンストラクタに追加
constructor(onComplete, debugLog) {
    // 既存のプロパティ...
    this.contentTracker = new (require('./ContentTracker'))();
    this.positionTracker = null; // TerminalServiceから注入
    this.currentLine = 0;
    this.currentChar = 0;
}

// 新しいメソッド: 位置トラッカーの設定
setPositionTracker(positionTracker) {
    this.positionTracker = positionTracker;
    this.contentTracker.debugLog = this.debugLog;
}

// addChunk メソッドの強化
addChunk(data) {
    // 現在の位置を更新
    if (this.positionTracker) {
        const pos = this.positionTracker.getCurrentPosition();
        this.currentLine = pos.line;
        this.currentChar = pos.char;
    } else {
        this.updatePositionFromData(data);
    }
    
    this.buffer += data;
    this.resetTimeout();

    if (this.detectCompletion()) {
        this.completeMessage();
    }
}

// completeMessage メソッドの強化
completeMessage() {
    const content = this.extractVoiceText(this.buffer);
    
    if (!content) {
        this.debugLog('📝 音声テキストが見つかりません');
        this.reset();
        return;
    }
    
    // 重複チェック
    if (this.contentTracker.isNewContent(content, this.currentLine, this.currentChar)) {
        this.debugLog(`🎵 新しい音声コンテンツを検出: "${content.substring(0, 50)}..."`);
        
        // 処理済みとしてマーク
        this.contentTracker.markAsProcessed(content, this.currentLine, this.currentChar);
        
        // 音声合成へ
        this.onComplete(content);
    } else {
        this.debugLog(`🚫 重複コンテンツをスキップ: "${content.substring(0, 50)}..."`);
    }
    
    this.reset();
}

// データから位置を推定（フォールバック）
updatePositionFromData(data) {
    const lines = data.split('\n').length - 1;
    if (lines > 0) {
        this.currentLine += lines;
        this.currentChar = data.length - data.lastIndexOf('\n') - 1;
    } else {
        this.currentChar += data.length;
    }
}

// 強制完了時の改良
forceCompleteMessage() {
    // 既存のメッセージがある場合のみ処理
    if (this.currentMessage && this.buffer.trim()) {
        this.debugLog('🔄 既存メッセージを強制完了');
        this.completeMessage();
    } else {
        this.debugLog('📭 強制完了: 処理対象なし');
        this.reset();
    }
}
```

#### 2.2 TerminalService の大幅強化
**ファイル**: `src/services/TerminalService.js` (既存ファイルの修正)

```javascript
// 既存のコンストラクタに追加
constructor() {
    // 既存のプロパティ...
    this.positionTracker = null;
    this.scrollPosition = 0;
    this.isScrollingUp = false;
    this.scrollTimeout = null;
    this.lastProcessedPosition = { line: 0, char: 0 };
}

// setupTerminal メソッドの強化
setupTerminal() {
    // 既存のセットアップ...
    
    // 位置トラッカーの初期化
    this.positionTracker = new (require('../utils/TerminalPositionTracker'))(this.terminal);
    this.messageAccumulator.setPositionTracker(this.positionTracker);
    
    // スクロール監視の設定
    this.setupScrollMonitoring();
    
    // 高度なデータ処理の設定
    this.setupAdvancedDataProcessing();
}

// 新しいメソッド: スクロール監視
setupScrollMonitoring() {
    if (this.terminal.onScroll) {
        this.terminal.onScroll((ydisp) => {
            this.handleScroll(ydisp);
        });
    }
}

// 新しいメソッド: スクロール処理
handleScroll(ydisp) {
    const wasScrollingUp = ydisp < this.scrollPosition;
    this.scrollPosition = ydisp;
    
    if (wasScrollingUp && !this.isScrollingUp) {
        this.isScrollingUp = true;
        this.debugLog('📜 上向きスクロール検出 - 音声処理を一時停止');
        
        // スクロールが止まったら再開
        clearTimeout(this.scrollTimeout);
        this.scrollTimeout = setTimeout(() => {
            this.isScrollingUp = false;
            this.debugLog('📜 スクロール停止 - 音声処理を再開');
        }, 1000);
    }
}

// 新しいメソッド: 高度なデータ処理
setupAdvancedDataProcessing() {
    window.electronAPI.terminal.onData((data) => {
        this.handleTerminalData(data);
    });
}

// 新しいメソッド: ターミナルデータ処理
handleTerminalData(data) {
    // ターミナルに表示（常に実行）
    if (this.terminal) {
        this.terminal.write(data);
    }
    
    // 音声処理の可否判定
    if (this.shouldSkipAudioProcessing()) {
        this.debugLog('🚫 音声処理をスキップ中');
        return;
    }
    
    // 位置ベースの新規性チェック
    const currentPos = this.positionTracker.getCurrentPosition();
    
    if (this.isNewPosition(currentPos)) {
        this.debugLog(`🆕 新しい位置でのデータ: L${currentPos.line}:C${currentPos.char}`);
        this.messageAccumulator.addChunk(data);
        this.updateLastProcessedPosition(currentPos);
    } else {
        this.debugLog(`🔄 既知の位置でのデータをスキップ: L${currentPos.line}:C${currentPos.char}`);
    }
}

// 新しいメソッド: 音声処理スキップ判定
shouldSkipAudioProcessing() {
    return this.isScrollingUp || 
           this.isResizing || 
           !this.terminalApp?.voiceEnabled;
}

// 新しいメソッド: 新しい位置かどうか判定
isNewPosition(currentPos) {
    return currentPos.line > this.lastProcessedPosition.line || 
           (currentPos.line === this.lastProcessedPosition.line && 
            currentPos.char > this.lastProcessedPosition.char);
}

// 新しいメソッド: 最後の処理位置を更新
updateLastProcessedPosition(position) {
    this.lastProcessedPosition = {
        line: position.line,
        char: position.char
    };
}

// handleResize メソッドの改良
handleResize() {
    this.isResizing = true;
    this.debugLog('🔄 リサイズ開始 - 音声処理を一時停止');
    
    // 位置トラッカーをリセット
    if (this.positionTracker) {
        this.positionTracker.logCurrentState();
    }
    
    // リサイズタイマーをリセット
    clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
        this.isResizing = false;
        this.debugLog('🔄 リサイズ完了 - 音声処理を再開');
        
        // 現在位置から再開
        if (this.positionTracker) {
            const currentPos = this.positionTracker.getCurrentPosition();
            this.updateLastProcessedPosition(currentPos);
        }
    }, 200);
}
```

### フェーズ3: 統合とテスト

#### 3.1 統合テストクラス
**ファイル**: `src/test/DuplicatePreventionTest.js`

```javascript
class DuplicatePreventionTest {
    constructor(terminalService) {
        this.terminalService = terminalService;
        this.testResults = [];
    }

    // テストシナリオ1: リサイズ時の重複防止
    async testResizeDuplicatePrevention() {
        console.log('🧪 リサイズ重複防止テスト開始');
        
        // テストメッセージを送信
        const testMessage = '『これはリサイズテスト用のメッセージです』';
        this.terminalService.messageAccumulator.addChunk(testMessage);
        
        // リサイズをシミュレート
        this.terminalService.handleResize();
        
        // 同じメッセージを再送信
        setTimeout(() => {
            this.terminalService.messageAccumulator.addChunk(testMessage);
            console.log('🧪 リサイズテスト完了');
        }, 300);
    }

    // テストシナリオ2: スクロール時の重複防止
    async testScrollDuplicatePrevention() {
        console.log('🧪 スクロール重複防止テスト開始');
        
        // 上向きスクロールをシミュレート
        this.terminalService.handleScroll(-10);
        
        // スクロール中にメッセージ送信
        const testMessage = '『これはスクロールテスト用のメッセージです』';
        this.terminalService.messageAccumulator.addChunk(testMessage);
        
        // スクロール停止まで待機
        setTimeout(() => {
            console.log('🧪 スクロールテスト完了');
        }, 1200);
    }

    // テストシナリオ3: 高速連続メッセージ
    async testRapidMessageDuplicatePrevention() {
        console.log('🧪 高速連続メッセージテスト開始');
        
        const baseMessage = '『これは高速テスト用のメッセージです』';
        
        // 100ms間隔で同じメッセージを5回送信
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                this.terminalService.messageAccumulator.addChunk(baseMessage);
                if (i === 4) console.log('🧪 高速連続メッセージテスト完了');
            }, i * 100);
        }
    }

    // 統計情報の表示
    showStats() {
        const stats = this.terminalService.messageAccumulator.contentTracker.getStats();
        console.table(stats);
    }
}

module.exports = DuplicatePreventionTest;
```

#### 3.2 デバッグ用設定
**ファイル**: `src/config/debug-config.js`

```javascript
const DebugConfig = {
    // 重複防止デバッグ
    duplicatePrevention: {
        enabled: true,
        logLevel: 'verbose', // 'silent', 'basic', 'verbose'
        showPositions: true,
        showHashes: true,
        showTimestamps: true
    },
    
    // パフォーマンス監視
    performance: {
        enabled: true,
        logProcessingTime: true,
        trackMemoryUsage: true
    },
    
    // テストモード
    testing: {
        enabled: false,
        autoRunTests: false,
        testInterval: 30000 // 30秒間隔
    }
};

module.exports = DebugConfig;
```

## 実装スケジュール

### Week 1: 基盤実装
- [ ] ContentTracker クラスの実装
- [ ] TerminalPositionTracker クラスの実装
- [ ] 基本的な単体テストの作成

### Week 2: 統合実装
- [ ] MessageAccumulator の改良
- [ ] TerminalService の強化
- [ ] 統合テストの実装

### Week 3: テストと調整
- [ ] 実機でのテスト実行
- [ ] パフォーマンスの最適化
- [ ] エッジケースの対応

### Week 4: 完成と文書化
- [ ] 最終的な調整
- [ ] ドキュメントの完成
- [ ] リリース準備

## パフォーマンス考慮事項

### メモリ使用量の最適化
1. **ContentTracker**: 最大1000エントリでの自動クリーンアップ
2. **PositionTracker**: 軽量な位置情報のみ保持
3. **MessageAccumulator**: バッファサイズの制限

### CPU使用量の最適化
1. **ハッシュ計算**: 軽量なハッシュアルゴリズムの使用
2. **位置比較**: 効率的な数値比較
3. **早期リターン**: 不要な処理の早期スキップ

## トラブルシューティング

### よくある問題と解決策

1. **位置情報が取得できない**
   - フォールバック: データベースの位置推定を使用
   - 対策: TerminalPositionTracker での安全な初期化

2. **ハッシュ衝突**
   - 対策: コンテンツの正規化強化
   - 対策: 位置情報との組み合わせ判定

3. **メモリリーク**
   - 対策: 定期的なクリーンアップ
   - 対策: エントリ数の上限設定

## 今後の拡張可能性

1. **機械学習ベースの重複検出**
   - 意味的類似性の判定
   - 文脈を考慮した重複検出

2. **ユーザー設定の追加**
   - 重複検出の感度調整
   - タイムアウト値のカスタマイズ

3. **他プラットフォーム対応**
   - Web版での同様機能
   - モバイルアプリでの実装

## まとめ

この実装計画により、ターミナルの重複読み上げ問題を根本的に解決できる。三重の防止システム（位置・ハッシュ・タイムスタンプ）により、あらゆるシナリオでの重複を防止し、ユーザー体験を大幅に向上させることができる。

実装は段階的に行い、各フェーズでテストを実施することで、安定性と信頼性を確保する。