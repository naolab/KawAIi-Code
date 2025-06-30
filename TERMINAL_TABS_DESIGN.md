# ターミナルタブ機能 設計書

## 概要

KawAIi CodeアプリにChrome風のタブインターフェースを追加し、複数のターミナルセッション（Claude Code、Gemini CLI）を同時に使用できるようにする。音声読み上げ・口パク連動機能は指定した親タブのみに適用する。

## 要件定義

### 基本要件
- Chrome風のタブバーをターミナル表示エリア上部に配置
- 各タブで独立したClaude CodeまたはGemini CLIセッションを実行
- タブの追加・削除・切り替え機能
- 親タブ（音声読み上げ対象）を星マークで表示・変更可能
- 親タブのみ音声読み上げ・口パク連動を実行

### 機能要件
1. **タブ管理**
   - 新規タブ作成（AI選択ダイアログ）
   - タブ切り替え（クリック操作）
   - タブ削除（×ボタン、最後のタブは削除不可）
   - タブ名編集（ダブルクリック）

2. **親タブシステム**
   - 星マーク（★）で親タブを視覚的に表示
   - 星マーククリックで親タブ変更
   - 親タブのみ音声読み上げ・VRMキャラクター連動

3. **AI統合**
   - Claude Code、Gemini CLIの選択可能
   - 各タブで独立したPTYプロセス管理
   - プロセス終了時の適切なクリーンアップ

## UI設計

### タブバーレイアウト
```
┌─────────────────────────────────────────────┐
│ [★ Main Tab] [Tab 2] [Tab 3] [+]           │
├─────────────────────────────────────────────┤
│                                             │
│           ターミナル表示エリア               │
│                                             │
│                                             │
└─────────────────────────────────────────────┘
```

### タブ要素構成
```
┌─────────────────────┐
│ ★ Claude #1      × │  ← 星マーク + タブ名 + 閉じるボタン
└─────────────────────┘
```

#### 要素詳細
- **星マーク（★）**: 親タブ表示、クリック時に親タブ変更
- **タブ名**: AI種別 + 連番（例: Claude #1, Gemini #2）
- **閉じるボタン（×）**: タブ削除、ホバー時に表示
- **新規タブボタン（+）**: タブバー右端、クリックで新規タブ作成

### 視覚的状態
- **アクティブタブ**: 下線、明るい背景色
- **非アクティブタブ**: 暗い背景色、ホバー時にハイライト
- **親タブ**: 金色の星マーク（★）
- **非親タブ**: グレーの星マーク（☆）

## データ構造設計

### TabManager クラス
```javascript
class TabManager {
  constructor() {
    this.tabs = {}           // タブデータストレージ
    this.activeTabId = null  // 現在アクティブなタブID
    this.parentTabId = null  // 親タブ（音声読み上げ対象）ID
    this.nextTabNumber = 1   // 新規タブの連番
  }
}
```

### Tab データ構造
```javascript
const tabData = {
  id: 'tab-1',              // 一意のタブID
  name: 'Claude #1',        // 表示名
  aiType: 'claude',         // AI種別（claude | gemini）
  isParent: true,           // 親タブフラグ
  isActive: false,          // アクティブフラグ
  terminal: Terminal,       // xterm.jsインスタンス
  process: PTY,            // node-ptyインスタンス
  createdAt: Date.now(),   // 作成日時
  element: HTMLElement     // タブDOMエレメント
}
```

### AI設定データ
```javascript
const aiOptions = [
  {
    type: 'claude',
    name: 'Claude Code',
    icon: '🤖',
    color: '#FF6B35'
  },
  {
    type: 'gemini',
    name: 'Gemini CLI',
    icon: '💎',
    color: '#4285F4'
  }
]
```

## 技術実装設計

### フロントエンド実装

#### TabManager メソッド
```javascript
class TabManager {
  // タブ作成
  async createTab(aiType, name = null) {
    const tabId = `tab-${this.nextTabNumber++}`
    const tabName = name || `${aiType === 'claude' ? 'Claude' : 'Gemini'} #${this.nextTabNumber - 1}`
    
    // PTYプロセス作成要求
    const result = await window.electronAPI.tabCreate(tabId, aiType)
    if (!result.success) throw new Error(result.error)
    
    // タブデータ作成
    this.tabs[tabId] = {
      id: tabId,
      name: tabName,
      aiType: aiType,
      isParent: Object.keys(this.tabs).length === 0, // 最初のタブは親タブ
      isActive: false,
      terminal: new Terminal(this.getTerminalConfig()),
      createdAt: Date.now()
    }
    
    // UI更新
    this.renderTab(tabId)
    this.switchTab(tabId)
    
    return tabId
  }
  
  // タブ切り替え
  switchTab(tabId) {
    if (!this.tabs[tabId]) return
    
    // 現在のアクティブタブを非表示
    if (this.activeTabId) {
      this.tabs[this.activeTabId].isActive = false
      this.tabs[this.activeTabId].terminal.element.style.display = 'none'
    }
    
    // 新しいタブをアクティブに
    this.activeTabId = tabId
    this.tabs[tabId].isActive = true
    this.tabs[tabId].terminal.element.style.display = 'block'
    this.tabs[tabId].terminal.focus()
    
    // UI更新
    this.updateTabUI()
  }
  
  // 親タブ設定
  setParentTab(tabId) {
    if (!this.tabs[tabId]) return
    
    // 現在の親タブを解除
    if (this.parentTabId) {
      this.tabs[this.parentTabId].isParent = false
    }
    
    // 新しい親タブを設定
    this.parentTabId = tabId
    this.tabs[tabId].isParent = true
    
    // 音声サービスに親タブ変更を通知
    window.electronAPI.setParentTab(tabId)
    
    // UI更新
    this.updateTabUI()
  }
  
  // タブ削除
  async deleteTab(tabId) {
    if (!this.tabs[tabId] || Object.keys(this.tabs).length === 1) return
    
    // PTYプロセス終了
    await window.electronAPI.tabDelete(tabId)
    
    // ターミナル破棄
    this.tabs[tabId].terminal.dispose()
    
    // タブが親タブの場合、他のタブを親に設定
    if (this.tabs[tabId].isParent) {
      const remainingTabs = Object.keys(this.tabs).filter(id => id !== tabId)
      if (remainingTabs.length > 0) {
        this.setParentTab(remainingTabs[0])
      }
    }
    
    // アクティブタブの場合、他のタブに切り替え
    if (this.activeTabId === tabId) {
      const remainingTabs = Object.keys(this.tabs).filter(id => id !== tabId)
      if (remainingTabs.length > 0) {
        this.switchTab(remainingTabs[0])
      }
    }
    
    // タブデータ削除
    delete this.tabs[tabId]
    
    // UI更新
    this.renderTabs()
  }
}
```

### バックエンド実装

#### IPC ハンドラー拡張
```javascript
// 複数PTYプロセス管理
const terminalProcesses = {}

// タブ作成
ipcMain.handle('tab-create', async (event, tabId, aiType) => {
  try {
    const aiConfig = getAIConfig(aiType)
    const commandPath = findAICommand(aiConfig)
    
    if (!commandPath) {
      return { success: false, error: `${aiConfig.name} not found` }
    }
    
    // PTYプロセス作成
    terminalProcesses[tabId] = pty.spawn(commandPath, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: claudeWorkingDir,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor'
      }
    })
    
    // データハンドラー設定
    terminalProcesses[tabId].onData((data) => {
      if (mainWindow) {
        mainWindow.webContents.send('tab-data', tabId, data)
      }
    })
    
    // 終了ハンドラー設定
    terminalProcesses[tabId].onExit(({ exitCode, signal }) => {
      if (mainWindow) {
        mainWindow.webContents.send('tab-exit', tabId, exitCode)
      }
      delete terminalProcesses[tabId]
    })
    
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// タブ削除
ipcMain.handle('tab-delete', async (event, tabId) => {
  try {
    if (terminalProcesses[tabId]) {
      terminalProcesses[tabId].kill()
      delete terminalProcesses[tabId]
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// タブ書き込み
ipcMain.handle('tab-write', (event, tabId, data) => {
  try {
    if (terminalProcesses[tabId]) {
      terminalProcesses[tabId].write(data)
      return { success: true }
    }
    return { success: false, error: 'Tab not found' }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// タブリサイズ
ipcMain.handle('tab-resize', (event, tabId, cols, rows) => {
  try {
    if (terminalProcesses[tabId]) {
      terminalProcesses[tabId].resize(cols, rows)
      return { success: true }
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})
```

### CSS スタイル設計

```css
/* タブバー */
.tab-bar {
  display: flex;
  background: #2d2d2d;
  border-bottom: 1px solid #555;
  padding: 0;
  margin: 0;
  user-select: none;
}

/* 個別タブ */
.tab {
  position: relative;
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: #3c3c3c;
  border-right: 1px solid #555;
  cursor: pointer;
  min-width: 120px;
  max-width: 200px;
  transition: background-color 0.2s;
}

.tab:hover {
  background: #4a4a4a;
}

.tab.active {
  background: #1e1e1e;
  border-bottom: 2px solid #007acc;
}

/* 星マーク */
.tab .parent-star {
  margin-right: 6px;
  font-size: 14px;
  cursor: pointer;
}

.tab .parent-star.active {
  color: #ffd700;
}

.tab .parent-star.inactive {
  color: #666;
}

/* タブ名 */
.tab .tab-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: #fff;
}

/* 閉じるボタン */
.tab .close-button {
  margin-left: 6px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: transparent;
  border: none;
  color: #999;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.2s, background-color 0.2s;
}

.tab:hover .close-button {
  opacity: 1;
}

.tab .close-button:hover {
  background: #666;
  color: #fff;
}

/* 新規タブボタン */
.new-tab-button {
  padding: 8px 12px;
  background: #3c3c3c;
  border: none;
  color: #999;
  cursor: pointer;
  font-size: 16px;
  transition: background-color 0.2s, color 0.2s;
}

.new-tab-button:hover {
  background: #4a4a4a;
  color: #fff;
}

/* ターミナルエリア */
.terminal-container {
  position: relative;
  flex: 1;
}

.terminal-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: none;
}

.terminal-wrapper.active {
  display: block;
}
```

## 実装フェーズ

### Phase 1: 基本タブシステム（1-2日）
- [ ] タブバーHTML/CSS実装
- [ ] TabManagerクラス作成
- [ ] 基本的なタブ切り替え機能
- [ ] 新規タブ作成ダイアログ

### Phase 2: AI統合（2-3日）
- [ ] 複数PTYプロセス管理実装
- [ ] IPCハンドラー拡張
- [ ] ターミナル作成・削除機能
- [ ] データ・終了イベント処理

### Phase 3: 親タブシステム（1-2日）
- [ ] 星マーク機能実装
- [ ] 親タブ変更機能
- [ ] 音声読み上げ制御連携
- [ ] 口パク連動制御

### Phase 4: UX改善（1-2日）
- [ ] タブ名編集機能
- [ ] エラーハンドリング強化
- [ ] キーボードショートカット
- [ ] アニメーション効果

### Phase 5: テスト・バグ修正（1日）
- [ ] 全機能テスト
- [ ] メモリリーク対策
- [ ] エラーケース対応
- [ ] パフォーマンス最適化

## 技術的考慮事項

### メモリ管理
- 非アクティブタブのターミナルは描画停止
- 削除されたタブのリソースを確実に解放
- PTYプロセスの適切な終了処理

### パフォーマンス
- 大量のタブ作成時の処理速度
- ターミナル出力の効率的な描画
- リサイズ時の全タブ対応

### エラーハンドリング
- PTYプロセス起動失敗時の処理
- AI実行ファイル未検出時の処理
- 予期しないプロセス終了時の復旧

### 互換性
- 既存の音声読み上げ・VRM連動機能との整合性
- 設定システムとの統合
- Electronバージョン依存の確認

## まとめ

この設計により、KawAIi Codeアプリに本格的なタブ機能を追加し、複数のAIアシスタントを効率的に使用できるようになる。親タブシステムにより、音声読み上げ・口パク連動機能を維持しながら、必要に応じて複数のターミナルセッションを管理可能になる。

実装は段階的に行い、各フェーズで動作確認を行うことで、安定性と品質を確保する。