# 🎀 AI Kawaii Project - 総合技術ドキュメント

## 📝 プロジェクト概要

AI Kawaii Projectは、Claude Codeとの対話体験を革新的に向上させるElectronベースのデスクトップアプリケーションです。VRM 3Dキャラクター表示、リアルタイム音声合成、口パクシンク機能を統合し、AIアシスタントとの自然で楽しい対話を実現します。

### 🎯 プロジェクトの特徴

- **3DキャラクターAIアシスタント**: VRMモデルによる生き生きとしたキャラクター表現
- **リアルタイム音声合成**: AivisSpeech連携による高品質日本語音声
- **口パクシンク**: 音声に同期した自然な口の動き
- **Claude Code完全統合**: PTYによる本格的ターミナル統合
- **カスタマイズ性**: 壁紙、キャラクター、音声設定の自由な変更

## 🏗️ システム構成

### アーキテクチャ概要

AI Kawaii Projectは、3つのメインプロセスが協調動作するマルチプロセス・アーキテクチャです：

```
┌─────────────────────────────────────────────────────────┐
│                    AI Kawaii Project                    │
├─────────────────────────────────────────────────────────┤
│  Electronメインプロセス (main.js)                       │
│  ├─ Claude Code統合 (PTY)                               │
│  ├─ 音声合成サービス (AivisSpeech)                      │
│  ├─ Next.jsサーバー管理 (ポート3002)                   │
│  └─ WebSocketサーバー管理 (ポート8080)                 │
├─────────────────────────────────────────────────────────┤
│  Electronレンダラープロセス (app.js)                    │
│  ├─ ターミナルUI (xterm.js)                             │
│  ├─ チャットインターフェース                           │
│  ├─ 音声制御・認識                                     │
│  └─ 設定管理                                           │
├─────────────────────────────────────────────────────────┤
│  Next.jsプロセス (localhost:3002)                      │
│  ├─ VRMビューワー (Three.js)                           │
│  ├─ 表情・感情制御                                     │
│  ├─ リップシンク制御                                   │
│  └─ 3Dアニメーション                                   │
└─────────────────────────────────────────────────────────┘
```

### 主要コンポーネント

#### 1. Electronメインプロセス
- **責任範囲**: アプリケーション制御、プロセス管理、IPC通信
- **主要機能**: Claude Code統合、音声合成、サーバー管理
- **ファイル**: `main.js` (502行)

#### 2. Electronレンダラープロセス  
- **責任範囲**: ユーザーインターフェース、ターミナル表示、音声制御
- **主要機能**: ターミナルUI、チャット、音声認識、設定管理
- **ファイル**: `src/app.js` (1248行)

#### 3. Next.jsプロセス
- **責任範囲**: 3Dキャラクター描画、アニメーション制御
- **主要機能**: VRM表示、口パク、表情制御、カメラ制御
- **ファイル**: `ai-kawaii-nextjs/src/` (TypeScript)

## 💻 技術スタック

### フロントエンド技術

#### Electron アプリケーション
```json
{
  "electron": "27.0.0",
  "@xterm/xterm": "5.5.0",
  "node-pty": "1.0.0",
  "axios": "1.6.0"
}
```

#### Next.js VRMビューワー
```json
{
  "next": "15.3.3",
  "react": "19.0.0",
  "@pixiv/three-vrm": "3.4.1",
  "three": "0.177.0",
  "typescript": "5.0"
}
```

### 音声・3D技術

#### 音声合成
- **エンジン**: AivisSpeech Engine
- **API**: REST API (localhost:10101)
- **フォーマット**: WAV
- **処理**: リアルタイム音声合成

#### 3Dレンダリング
- **ライブラリ**: Three.js 0.177.0
- **モデル**: VRM 3Dキャラクター
- **アニメーション**: .vrmaファイル対応
- **最適化**: 30fps制限、軽量化設定

#### リップシンク
- **解析**: Web Audio API
- **頻度**: 15fps更新
- **方式**: 音量レベル解析による口パク制御

## 🔄 データフローアーキテクチャ

### 完全なユーザー入力→応答フロー

```
[ユーザー入力]
    ↓
[Terminal UI] → [app.js] → [main.js] → [Claude Code PTY]
    ↓
[Claude応答生成]
    ↓
[main.js] ← [Claude Code]
    ↓ (並列処理)
    ├─[Terminal表示] → [app.js] → [xterm.js]
    └─[音声合成] → [VoiceService] → [AivisSpeech API]
        ↓
    [音声データ] → [app.js] → [VRMビューワー]
        ↓
    [口パク制御] → [LipSync] → [VRM表情更新]
```

### プロセス間通信詳細

#### 1. IPC通信 (Electron)
```javascript
// メインプロセス → レンダラープロセス
mainWindow.webContents.send('terminal-data', data)
mainWindow.webContents.send('play-audio', buffer)

// レンダラープロセス → メインプロセス  
window.electronAPI.terminal.start()
window.electronAPI.voice.speak(text, speaker)
```

#### 2. PostMessage通信 (iframe)
```javascript
// Electron → Next.js
iframe.contentWindow.postMessage({
    type: 'lipSync',
    audioData: audioArray
}, 'http://localhost:3002')
```

#### 3. WebSocket通信
```javascript
// ポート8080での双方向通信
{
    type: 'audio',     // 音声データ
    type: 'command',   // Claude実行コマンド
    type: 'lipSync'    // 口パク制御
}
```

## 🎭 主要機能詳細

### 1. VRM 3Dキャラクター表示

#### 技術仕様
```javascript
// レンダリング設定
フレームレート: 30fps (最適化)
解像度: 自動調整 (DPI最大1.5倍)
アンチエイリアス: 無効 (軽量化)
シャドウ: 有効 (品質重視)
照明: ディレクショナル + アンビエント
```

#### 対応機能
- VRMファイル動的読み込み
- アイドルアニメーション (.vrma)
- マウスによるカメラ操作
- 表情制御 (基本実装)
- 透明背景表示

### 2. 音声合成システム

#### AivisSpeech連携
```javascript
// API設定
ベースURL: 'http://127.0.0.1:10101'
話者取得: GET /speakers
音声クエリ: POST /audio_query
音声合成: POST /synthesis
タイムアウト: 8秒
```

#### 高度な制御
- 複数話者対応
- 音声キューイング
- 重複防止機能
- カッコ内テキスト優先処理
- リアルタイム音声再生

### 3. リップシンク (口パク) 機能

#### 音声解析
```javascript
// 解析設定
FFTサイズ: 1024
更新頻度: 15fps
データ長: 1024サンプル
音量しきい値: 0.1
スムージング: 0.3
```

#### VRM表情制御
- aa (あ) 表情での口パク
- 音量レベルに応じた開口度調整
- リアルタイム表情ブレンド
- 自然な口の動き実現

### 4. Claude Code統合

#### PTY (疑似ターミナル) 統合
```javascript
// Claude Code起動設定
プロセス管理: node-pty
カラーサポート: xterm-256color
作業ディレクトリ: ユーザー設定可能
環境変数: CLAUDE_PATH対応
CLAUDE.md: 自動配置・読み込み
```

#### ターミナル機能
- ANSIエスケープシーケンス完全対応
- リサイズ対応
- スクロールバック (50行)
- カスタムカラーテーマ
- リアルタイム出力表示

### 5. 音声認識機能

#### Web Speech API統合
```javascript
// 音声認識設定
言語: 'ja-JP'
連続認識: 有効
中間結果: 有効
自動停止: 5秒無音で停止
統合: Claude Code直接送信
```

#### ユーザビリティ
- マイクボタンによる制御
- 視覚的フィードバック
- エラーハンドリング
- ブラウザ互換性チェック

### 6. カスタマイズ機能

#### 壁紙システム
```javascript
// 対応フォーマット
PNG, JPEG, GIF, WebP
最大サイズ: 5MB
保存先: src/assets/wallpapers/user/
プリセット: default.png
設定保存: localStorage
```

#### VRMキャラクター
- デフォルトキャラクター (kotone_claude1.vrm)
- カスタムVRMファイル読み込み
- アニメーション切り替え
- 表情設定 (実装中)

#### 音声設定
- 話者選択 (動的取得)
- 読み上げON/OFF
- クールダウン時間調整
- 接続状態表示

## ⚡ パフォーマンス最適化

### レンダリング最適化

#### VRM描画最適化
```javascript
// Three.js設定
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
renderer.setSize(width, height, false)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
```

#### フレームレート制御
```javascript
// 30fps制限によるCPU負荷軽減
const maxFPS = 30
const frameInterval = 1000 / maxFPS
if (now - lastFrameTime >= frameInterval) {
    // レンダリング実行
}
```

### 音声処理最適化

#### リップシンク軽量化
```javascript
// 効率的な音声解析
const dataArray = new Uint8Array(1024)
analyser.getByteTimeDomainData(dataArray)
// 4つずつ処理で高速化
for (let i = 0; i < dataArray.length; i += 4) {
    // 早期終了による計算量削減
}
```

#### 音声キューイング
- 古い音声の自動クリーンアップ (30秒)
- 重複再生防止
- メモリ効率的なバッファ管理

### メモリ管理

#### リソース管理
```javascript
// VRMモデルの適切な破棄
if (currentVrm) {
    VRMUtils.deepDispose(currentVrm.scene)
    currentVrm = null
}

// 音声バッファのクリーンアップ
audioQueue = audioQueue.filter(item => 
    (now - item.timestamp) < maxAudioAge
)
```

## 🔧 設定・カスタマイズ

### 設定管理システム

#### 設定ファイル
```javascript
// 保存場所
~/.kawaii-code-config/config.json

// 主要設定項目
{
    "claudeWorkingDir": "/path/to/workspace",
    "voiceEnabled": true,
    "selectedSpeaker": 0,
    "speechCooldown": 500,
    "selectedWallpaper": "default"
}
```

#### UI設定
- モーダルベース設定画面
- リアルタイム設定反映
- 設定の自動保存
- デフォルト値復帰機能

### カスタマイズ可能項目

#### 1. 音声設定
- 話者選択 (複数話者・スタイル対応)
- 読み上げ有効/無効
- クールダウン時間 (0.5-10秒)
- 音声エンジン接続状態

#### 2. 表示設定
- 壁紙選択・アップロード
- VRMキャラクター変更
- ターミナルテーマ (固定)

#### 3. 動作設定
- Claude Code作業ディレクトリ
- 自動起動設定 (未実装)
- ログ出力レベル (未実装)

## 🚀 セットアップ・起動方法

### 前提条件

#### 必要なソフトウェア
```bash
# Node.js (v18以上)
node --version

# npm
npm --version  

# Claude Code CLI
claude --version

# AivisSpeech Engine (音声機能使用時)
# http://127.0.0.1:10101 で起動している必要があります
```

### インストール手順

#### 1. プロジェクトセットアップ
```bash
cd /Users/nao/Desktop/develop/AI-Kawaii-Project

# メインアプリ依存関係
npm install

# Next.js VRMビューワー依存関係  
cd ai-kawaii-nextjs
npm install
cd ..
```

#### 2. アプリケーション起動
```bash
# 全体起動 (推奨)
npm start

# 開発モード起動
npm run dev
```

#### 3. 音声機能セットアップ (オプション)
```bash
# AivisSpeech Engine起動
# ローカルでポート10101で起動してください
# 詳細は AivisSpeech の公式ドキュメントを参照
```

### 起動シーケンス

1. **Electronメインプロセス起動**
   - Next.jsサーバー起動 (ポート3002)
   - WebSocketサーバー起動 (ポート8080)  
   - メインウィンドウ作成

2. **Next.js VRMビューワー初期化**
   - Three.jsシーン作成
   - デフォルトVRMロード
   - アニメーション開始

3. **ターミナル統合準備**
   - xterm.js初期化
   - CLAUDE.md配置
   - 音声サービス接続チェック

## 🔍 トラブルシューティング

### よくある問題と解決方法

#### 1. Claude Codeが起動しない

**症状**: Start Claude Codeボタンを押しても反応しない

**解決方法**:
```bash
# Claude Codeの確認
claude --version
which claude

# 権限確認
chmod +x /opt/homebrew/bin/claude

# 環境変数設定 (必要に応じて)
export CLAUDE_PATH=/opt/homebrew/bin/claude
```

#### 2. 音声合成が機能しない

**症状**: 音声読み上げが開始されない

**確認事項**:
- AivisSpeech Engineが起動しているか
- ポート10101が利用可能か
- 設定で音声機能が有効になっているか

**解決方法**:
```bash
# AivisSpeech接続確認
curl http://127.0.0.1:10101/speakers

# 設定リセット
# アプリの設定モーダルで「接続確認」ボタンをクリック
```

#### 3. VRMキャラクターが表示されない

**症状**: 3Dキャラクターが表示されない、真っ白な画面

**解決方法**:
- ブラウザのWebGL対応確認
- GPUアクセラレーション有効化
- VRMファイルの整合性確認
- Next.jsサーバーの起動状況確認

#### 4. 口パクが動作しない

**症状**: 音声は再生されるが口パクしない

**確認事項**:
- WebSocket接続状況 (ポート8080)
- iframe通信の確立
- 音声データの正常な転送

**解決方法**:
```javascript
// ブラウザ開発者ツールで確認
console.log('WebSocket status:', websocket.readyState)
console.log('Audio data received:', audioData?.length)
```

### デバッグ方法

#### 1. 開発者ツール活用
```javascript
// main.js で有効化
mainWindow.webContents.openDevTools()

// デバッグログ確認
// Console タブでエラーメッセージ確認
// Network タブで通信状況確認
```

#### 2. ログ出力確認
```bash
# アプリログ確認
tail -f ~/.kawaii-code-config/app.log

# Next.js ログ確認
cd ai-kawaii-nextjs
npm run dev
```

## 📈 今後の開発予定

### 短期開発項目 (1-2ヶ月)

#### 1. 表情制御強化
- 感情分析による自動表情変更
- より豊富な表情パターン
- 感情とのスムーズな切り替え

#### 2. 接続安定性向上
- WebSocket自動再接続
- AivisSpeech Engine接続監視
- エラー時の自動復旧機能

#### 3. UI/UX改善
- 設定画面の再設計
- より直感的な操作性
- アクセシビリティ向上

### 中期開発項目 (3-6ヶ月)

#### 1. アニメーション拡張
- ジェスチャーアニメーション
- 感情表現モーション
- カスタムアニメーション対応

#### 2. マルチキャラクター対応
- 複数VRMモデル管理
- キャラクター切り替え機能
- 個別設定保存

#### 3. 音声機能強化
- 音声速度・音量調整
- 複数音声エンジン対応
- 音声エフェクト機能

### 長期開発項目 (6ヶ月以上)

#### 1. プラグインシステム
- 機能拡張アーキテクチャ
- サードパーティ統合
- カスタム機能開発支援

#### 2. クラウド統合
- 設定のクラウド同期
- キャラクターデータ共有
- オンライン機能

#### 3. AI機能強化
- より高度な感情認識
- 会話コンテキスト保持
- パーソナライゼーション

## 📋 開発ガイドライン

### コード品質

#### 1. TypeScript活用
- Next.js部分は完全TypeScript化
- 型安全性の確保
- インターフェース定義の充実

#### 2. エラーハンドリング
- 全ての非同期処理でtry-catch
- ユーザーフレンドリーなエラーメッセージ
- ログ出力による問題追跡

#### 3. パフォーマンス重視
- レンダリングパフォーマンス最適化
- メモリリーク防止
- CPU負荷分散

### アーキテクチャ原則

#### 1. 関心の分離
- UI・ビジネスロジック・データ層の分離
- 単一責任原則の徹底
- 疎結合設計

#### 2. 拡張性確保
- プラグイン対応準備
- 設定外部化
- モジュール化推進

#### 3. テスタビリティ
- ユニットテスト対応設計
- モック可能な依存関係
- テストデータ管理

## 🏆 プロジェクト成果

### 技術的達成

#### 1. 革新的アーキテクチャ
- Electron + Next.js統合成功
- リアルタイム3D + 音声合成
- マルチプロセス協調動作

#### 2. 高品質実装
- 30fps安定動作
- 低レイテンシ音声処理
- 自然な口パク表現

#### 3. 優れたUX
- 直感的インターフェース
- スムーズな操作性
- 高度なカスタマイズ性

### ユーザー価値

#### 1. 楽しいAI対話体験
- 視覚的に魅力的なキャラクター
- 自然な音声読み上げ
- 親しみやすいインターフェース

#### 2. 生産性向上
- Claude Code完全統合
- 効率的なターミナル操作
- 音声による操作支援

#### 3. カスタマイズ自由度
- 個人の好みに応じた調整
- 豊富な設定オプション
- 拡張可能な仕組み

---

**AI Kawaii Project** は、AIアシスタントとの対話を根本的に変革する、技術的に高度で実用的なアプリケーションです。継続的な開発により、さらなる機能強化と用途拡大を目指しています。

*📅 ドキュメント最終更新: 2025年6月20日*