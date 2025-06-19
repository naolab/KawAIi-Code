# AI Kawaii Terminal - Next.js版

ElectronアプリをNext.jsで再構築したWebベースのClaude Code統合ターミナルです✨

## 🌟 機能

- 🎮 **VRMキャラクター表示**: 3Dキャラクターをマウスで操作可能
- 💻 **WebSocketターミナル**: リアルタイムでClaude Codeと通信
- 🎨 **可愛いUI**: オレンジグラデーションテーマ
- 🔄 **リアルタイム通信**: WebSocket経由でローカルサーバーと接続

## 🚀 セットアップ

### 1. 依存関係をインストール

```bash
npm install
```

### 2. 開発サーバーとWebSocketサーバーを同時起動

```bash
npm run dev:all
```

または、別々に起動する場合：

```bash
# ターミナル1: Next.jsアプリ
npm run dev

# ターミナル2: WebSocketサーバー
npm run websocket
```

### 3. ブラウザでアクセス

```
http://localhost:3000
```

## 🏗️ アーキテクチャ

```
Next.jsアプリ (localhost:3000)
    ↕ WebSocket
WebSocketサーバー (localhost:8080)
    ↕ プロセス起動
Claude Code / シェルコマンド
```

## 🎯 使い方

1. **キャラクター操作**:
   - ドラッグ: 回転
   - ホイール: ズーム
   - 右ドラッグ: 移動

2. **ターミナル操作**:
   - コマンド入力してEnterで実行
   - ↑↓キーでコマンド履歴
   - `claude` コマンドでClaude Code実行

3. **設定**:
   - 歯車ボタンで設定画面
   - VRMファイル読み込み
   - デフォルトキャラクター切り替え

## 📁 ファイル構成

```
src/
├── app/
│   ├── globals.css      # グローバルスタイル
│   ├── layout.tsx       # レイアウト
│   └── page.tsx         # メインページ
├── components/
│   ├── VRMViewer.tsx    # VRMキャラクター表示
│   └── Terminal.tsx     # ターミナルコンポーネント
├── features/            # VRM関連機能
└── lib/                 # VRMアニメーション
websocket-server.js      # WebSocketサーバー
```

## 🔧 カスタマイズ

### Claude Codeパスの設定

`websocket-server.js`の`claudePath`を環境に合わせて変更：

```javascript
const claudePath = 'claude_desktop_app'; // Claude Codeのパス
```

### キャラクターファイル

`public/`フォルダにVRMファイルを配置して設定画面から読み込み可能です。

## 📝 開発メモ

- Three.js 0.177.0対応
- WebSocket通信でリアルタイム双方向通信
- Dynamic importでSSR回避
- VRMアニメーション（瞬き・アイドル）対応

## 🎨 テーマ

オレンジグラデーション + 透明効果で可愛らしいデザインを実現 ✨
