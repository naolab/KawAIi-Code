# AI Character Chat App 設計書

## 概要

Claude CodeのAIエージェントとアニメキャラクターが対話するデスクトップアプリケーションの設計書です。
ターミナル機能を統合し、音声読み上げとキャラクターアニメーションを連動させた没入感のある体験を提供します。

## 1. アーキテクチャ設計

### 1.1 技術スタック

| 項目 | 技術 | 理由 |
|------|------|------|
| **フレームワーク** | Electron | クロスプラットフォーム対応、ネイティブ機能アクセス |
| **フロントエンド** | HTML/CSS/JavaScript + React | UI構築の効率性、状態管理 |
| **ターミナル** | node-pty + xterm.js | プロセス制御、ターミナルエミュレーション |
| **音声合成** | VOICEVOX API / Web Speech API | 日本語音声合成、アニメ調ボイス |
| **キャラクター** | Canvas/WebGL / Live2D Cubism | 2Dアニメーション、表情制御 |
| **プロセス間通信** | Electron IPC | メイン・レンダラープロセス間通信 |

### 1.2 プロセス構成

```
Main Process (Electron)
├── Claude Code Process Management
│   ├── プロセス起動・終了
│   ├── 入出力制御
│   └── エラーハンドリング
├── Audio System
│   ├── 音声合成
│   ├── 音声再生
│   └── 音声キューイング
└── IPC Handler
    ├── レンダラープロセスとの通信
    └── 状態管理

Renderer Process
├── UI Components
│   ├── チャットインターフェース
│   ├── ターミナル表示
│   └── 制御パネル
├── Terminal Emulator
│   ├── xterm.js統合
│   └── プロセス出力表示
├── Character Controller
│   ├── アニメーション制御
│   ├── 表情管理
│   └── 口パク同期
└── Chat Interface
    ├── メッセージ履歴
    ├── 応答解析
    └── UI更新
```

## 2. モジュール設計

### 2.1 ディレクトリ構成

```
ai-character-chat/
├── package.json
├── main.js                    # Electronメインプロセス
├── src/
│   ├── main/                  # メインプロセス用コード
│   │   ├── claude-manager.js  # Claude Codeプロセス管理
│   │   ├── audio-engine.js    # 音声生成・再生エンジン
│   │   ├── ipc-handlers.js    # IPC通信ハンドラー
│   │   └── window-manager.js  # ウィンドウ管理
│   ├── renderer/              # レンダラープロセス用コード
│   │   ├── components/
│   │   │   ├── ChatInterface.js    # チャット画面コンポーネント
│   │   │   ├── Terminal.js         # ターミナルコンポーネント
│   │   │   ├── Character.js        # キャラクターコンポーネント
│   │   │   ├── VoiceController.js  # 音声制御コンポーネント
│   │   │   └── ControlPanel.js     # 制御パネル
│   │   ├── utils/
│   │   │   ├── claude-parser.js    # Claude応答解析
│   │   │   ├── emotion-detector.js # 感情判定
│   │   │   ├── voice-queue.js      # 音声キューイング
│   │   │   └── animation-sync.js   # アニメーション同期
│   │   ├── styles/
│   │   │   ├── main.css
│   │   │   ├── chat.css
│   │   │   └── character.css
│   │   └── app.js             # レンダラーメインファイル
├── assets/
│   ├── character/             # キャラクター素材
│   │   ├── sprites/           # スプライト画像
│   │   ├── animations/        # アニメーションデータ
│   │   └── expressions/       # 表情データ
│   ├── audio/                 # 音声ファイル
│   │   ├── se/               # 効果音
│   │   └── bgm/              # BGM
│   └── fonts/                # フォント
├── config/
│   ├── character-config.json  # キャラクター設定
│   ├── voice-config.json      # 音声設定
│   └── app-config.json        # アプリ設定
└── docs/
    ├── API.md                 # API仕様書
    └── SETUP.md               # セットアップガイド
```

### 2.2 主要モジュールの詳細

#### Claude Manager (claude-manager.js)
```javascript
class ClaudeManager {
  // Claude Codeプロセスの起動・制御
  startClaudeProcess()
  stopClaudeProcess()
  sendCommand(command)
  onOutput(callback)
  onError(callback)
}
```

#### Audio Engine (audio-engine.js)
```javascript
class AudioEngine {
  // 音声合成・再生
  synthesizeText(text, voice)
  playAudio(audioData)
  queueSpeech(textArray)
  getCurrentSpeakingState()
}
```

#### Character Controller (Character.js)
```javascript
class CharacterController {
  // キャラクター制御
  setExpression(emotion)
  startSpeakingAnimation()
  stopSpeakingAnimation()
  syncWithAudio(audioData)
}
```

## 3. データフロー設計

### 3.1 メッセージフロー

```
User Input → Terminal Component → IPC → Claude Manager → Claude Code Process
                                                            ↓
Character Animation ← Emotion Detector ← Response Parser ← Process Output
         ↓
Voice Synthesis → Audio Queue → Audio Playback
```

### 3.2 状態管理

```javascript
// アプリケーション状態
const AppState = {
  claude: {
    isRunning: boolean,
    currentCommand: string,
    output: string[]
  },
  chat: {
    messages: Message[],
    isTyping: boolean
  },
  character: {
    currentEmotion: string,
    isAnimating: boolean,
    isSpeaking: boolean
  },
  audio: {
    isPlaying: boolean,
    queue: AudioQueue,
    currentVolume: number
  }
}
```

## 4. UI/UX設計

### 4.1 レイアウト構成

```
┌─────────────────────────────────────────────────────────┐
│  Title Bar                                              │
├─────────────────────────────────┬───────────────────────┤
│                                 │                       │
│  Chat Messages Area             │   Character Display   │
│  ┌─────────────────────────────┐ │   ┌─────────────────┐ │
│  │ USER: command               │ │   │                 │ │
│  │ CHARACTER: response         │ │   │   Anime Char    │ │
│  │ ...                         │ │   │                 │ │
│  └─────────────────────────────┘ │   └─────────────────┘ │
│                                 │                       │
│  Terminal Output Area           │   Status & Controls   │
│  ┌─────────────────────────────┐ │   ┌─────────────────┐ │
│  │ $ claude-code               │ │   │ Voice: ON       │ │
│  │ > thinking...               │ │   │ Emotion: Happy  │ │
│  │ > response generated        │ │   │ [Settings]      │ │
│  └─────────────────────────────┘ │   └─────────────────┘ │
├─────────────────────────────────┴───────────────────────┤
│  Input Field                               [Send Button] │
└─────────────────────────────────────────────────────────┘
```

### 4.2 色彩・テーマ設計

```css
:root {
  /* メインカラー */
  --primary-gradient: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%);
  --character-gradient: linear-gradient(135deg, #ff6b9d, #c44569);
  
  /* 背景色 */
  --bg-glass: rgba(255, 255, 255, 0.1);
  --bg-terminal: #1a1a1a;
  
  /* テキスト色 */
  --text-primary: #333;
  --text-secondary: #666;
  --text-terminal: #00ff00;
  
  /* アクセント */
  --accent-pink: #ff6b9d;
  --accent-blue: #00bfff;
}
```

## 5. 実装フェーズ（段階的開発手順）

### Step 1: 基本ターミナルデスクトップアプリ (1週間)
**目標**: Claude Codeが動作するターミナルアプリの作成

**実装内容**:
- [ ] Electronアプリケーション基盤構築
- [ ] xterm.js + node-ptyでターミナルエミュレーター実装
- [ ] Claude Codeプロセス統合
- [ ] 基本的なUI構築（ターミナルのみ）
- [ ] プロセス制御（起動・停止・入力・出力）

**技術要素**:
```javascript
// 主要パッケージ
- electron
- xterm
- node-pty
- electron-builder (パッケージング用)
```

**成果物**: シンプルなターミナルアプリ（Claude Code実行可能）

**検証項目**:
- Claude Codeの正常な起動・終了
- コマンド入力・出力の正常動作
- クロスプラットフォーム動作確認

---

### Step 2: Claude Codeのアニメ調応答調整 (3-5日)
**目標**: AIエージェントの喋り方をアニメキャラクター風に調整

**実装内容**:
- [ ] Claude応答の解析・フィルタリング機能
- [ ] アニメ調プロンプト注入システム
- [ ] 応答テキストの後処理（語尾調整等）
- [ ] キャラクター設定管理システム

**技術要素**:
```javascript
// プロンプト例
const animeCharacterPrompt = `
あなたは可愛いアニメキャラクターです。
以下の特徴で応答してください：
- 語尾に「～だよ」「～なの」を付ける
- 感情表現を豊かにする
- 親しみやすい口調を使う
- 専門用語は分かりやすく説明する
`;

// 応答後処理
function processResponse(text) {
  // 敬語→カジュアル変換
  // 感情表現追加
  // アニメ的な語尾追加
}
```

**成果物**: アニメキャラクター風に応答するClaude Code

**検証項目**:
- キャラクター性の一貫性
- 技術的内容の正確性維持
- 応答速度への影響確認

---

### Step 3: 音声読み上げ機能実装 (1週間)
**目標**: Claude応答の音声読み上げシステム構築

**実装内容**:
- [ ] VOICEVOX API統合（または代替TTS）
- [ ] 音声合成・再生システム
- [ ] 音声キューイング機能
- [ ] 音声設定UI（音量、速度、声質調整）
- [ ] 応答テキストの音声用前処理

**技術要素**:
```javascript
// 音声システム構成
class VoiceEngine {
  async synthesize(text, voiceId) {
    // VOICEVOX API呼び出し
    const audioQuery = await this.createAudioQuery(text, voiceId);
    const audioData = await this.synthesizeAudio(audioQuery);
    return audioData;
  }
  
  playAudio(audioData) {
    // Web Audio API使用
  }
  
  queueSpeech(textArray) {
    // 順次読み上げキュー
  }
}
```

**成果物**: 音声読み上げ対応のターミナルアプリ

**検証項目**:
- 音声品質・自然性
- 読み上げ速度と応答性
- 長文対応とキューイング動作

---

### Step 4: アニメキャラクターVTuber部分実装 (2週間)
**目標**: 音声連動アニメキャラクターシステム構築

**実装内容**:

**4.1 キャラクター表示基盤 (1週目)**
- [ ] Live2D Cubism SDK統合 または Canvas/WebGL実装
- [ ] キャラクター素材読み込みシステム
- [ ] 基本アニメーション（待機、まばたき）
- [ ] 表情管理システム

**4.2 音声連動システム (2週目)**
- [ ] 音声解析（音量レベル、音素解析）
- [ ] 口パクアニメーション同期
- [ ] 感情判定システム（テキスト解析）
- [ ] 表情・動作の自動切り替え
- [ ] リアルタイム同期調整

**技術要素**:
```javascript
// キャラクター制御
class CharacterController {
  constructor() {
    this.emotions = ['happy', 'surprised', 'thinking', 'normal'];
    this.currentEmotion = 'normal';
  }
  
  // 音声同期
  syncWithAudio(audioData) {
    const volume = this.analyzeVolume(audioData);
    this.setMouthOpen(volume);
  }
  
  // 感情判定
  analyzeEmotion(text) {
    const emotionKeywords = {
      'happy': ['嬉しい', '楽しい', '良い'],
      'surprised': ['驚き', 'すごい', 'わあ'],
      'thinking': ['考え', '検討', 'うーん']
    };
    // キーワードマッチングまたはML使用
  }
}
```

**成果物**: 音声連動アニメキャラクター完全版

**検証項目**:
- 音声とキャラクターの同期精度
- 感情表現の自然性
- パフォーマンス（フレームレート維持）

---

### Step 5: 統合・最適化・仕上げ (1週間)
**目標**: 全機能統合と品質向上

**実装内容**:
- [ ] UI/UX最終調整（画面レイアウト改善）
- [ ] パフォーマンス最適化
- [ ] エラーハンドリング強化
- [ ] 設定保存・読み込み機能
- [ ] アプリケーションパッケージング
- [ ] ドキュメント整備

**成果物**: リリース可能な完成版アプリ

---

## 開発環境セットアップ

### 必要なツール・API
```bash
# 基本環境
- Node.js (v18以上)
- npm または yarn
- Git

# 外部サービス
- VOICEVOX (ローカル実行 or API)
- Claude Code (Anthropic)

# 開発ツール
- VS Code + Electron拡張
- Chrome DevTools
```

### 各ステップの期間目安
- **Step 1**: 1週間（7日）
- **Step 2**: 3-5日
- **Step 3**: 1週間（7日）  
- **Step 4**: 2週間（14日）
- **Step 5**: 1週間（7日）

**総開発期間**: 約6-7週間

## 各ステップでの成果物
1. **ターミナルアプリ** → 動作する基盤
2. **アニメ調応答** → キャラクター性確立
3. **音声読み上げ** → 聴覚体験追加
4. **キャラクター連動** → 視覚・聴覚統合
5. **完成品** → 商用レベル品質

## 6. 技術的課題と解決策

### 6.1 Claude Codeとの統合
**課題**: プロセス制御、出力キャプチャ、エラーハンドリング
**解決策**: 
- node-ptyでプロセス制御
- ストリーミング出力解析
- プロセス状態監視

### 6.2 リアルタイム音声生成
**課題**: 応答性、品質、システムリソース
**解決策**:
- 非同期音声合成
- 音声キューイングシステム
- バックグラウンド処理

### 6.3 キャラクター同期
**課題**: 音声とアニメーションの同期、表情制御
**解決策**:
- 音素解析による口パク
- 感情キーワード検出
- フレーム単位の同期制御

### 6.4 クロスプラットフォーム対応
**課題**: OS固有の機能差異、パッケージング
**解決策**:
- Electronの統一API使用
- 条件分岐によるOS対応
- 自動ビルドパイプライン

## 7. パフォーマンス要件

### 7.1 応答性能
- Claude応答表示: 100ms以内
- 音声合成開始: 500ms以内
- キャラクターアニメーション: 60fps

### 7.2 リソース使用量
- メモリ使用量: 512MB以下
- CPU使用率: 平常時10%以下
- ディスク使用量: 100MB以下

## 8. セキュリティ考慮事項

### 8.1 プロセス制御
- Claude Codeプロセスの適切な権限制御
- 入力コマンドのサニタイズ
- プロセス間通信の暗号化

### 8.2 外部API連携
- 音声合成APIの認証情報保護
- ネットワーク通信の暗号化
- レート制限の実装

## 9. 今後の拡張可能性

### 9.1 機能拡張
- 複数キャラクター対応
- カスタムキャラクター読み込み
- プラグインシステム
- クラウド同期機能

### 9.2 技術改善
- WebAssembly活用による高速化
- AI音声合成の品質向上
- リアルタイムレンダリング最適化

---

**更新履歴**
- 2025/06/16: 初版作成