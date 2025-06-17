# 🎀 AI Kawaii Claude Code Terminal

Claude Codeとアニメキャラクターが対話するデスクトップアプリケーションです。美しいカワイイデザインで、Claude Codeを直感的に操作できます。

![AI Kawaii Terminal](https://img.shields.io/badge/status-development-orange)
![Platform](https://img.shields.io/badge/platform-macOS-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ 特徴

- 🎀 **カワイイデザイン**: グラデーション背景とガラスモーフィズムUI
- 💬 **Claude Code統合**: Claude Codeとの直接対話
- 🖥️ **デスクトップアプリ**: Electronベースのネイティブアプリ
- 🔄 **リアルタイム応答**: Claude Codeとのライブ通信
- 🎨 **美しいターミナル**: xterm.jsによる高機能ターミナル

## 🛠️ 技術スタック

- **フレームワーク**: Electron
- **フロントエンド**: HTML/CSS/JavaScript
- **ターミナル**: @xterm/xterm
- **AI**: Claude Code CLI
- **デザイン**: CSS Gradients + Glassmorphism

## 📋 前提条件

以下がインストールされている必要があります：

```bash
# Node.js (v18以上)
node --version

# npm
npm --version

# Claude Code CLI
claude --version
```

Claude Codeがインストールされていない場合は、[公式ドキュメント](https://docs.anthropic.com/en/docs/claude-code)を参照してインストールしてください。

## 🚀 インストール・起動方法

### 1. プロジェクトディレクトリに移動
```bash
cd /Users/nao/Desktop/develop/AI-Kawaii-Project
```

### 2. 依存関係をインストール
```bash
npm install
```

### 3. アプリケーションを起動
```bash
npm start
```

## 📱 使用方法

1. **アプリ起動**: `npm start`でアプリケーションウィンドウが開きます
2. **Claude Code開始**: 「Start Claude Code」ボタンをクリック
3. **対話開始**: ターミナル画面に「🎀 AI Kawaii Claude Code へようこそ! 🎀」が表示されます
4. **メッセージ入力**: キーボードでメッセージを入力し、Enterキーで送信
5. **Claude応答**: Claude Codeがリアルタイムで応答します
6. **終了**: 「Stop Claude Code」ボタンで終了

## 🎯 機能説明

### 現在の機能
- ✅ Claude Codeプロセス管理
- ✅ リアルタイム入出力
- ✅ 美しいUI/UX
- ✅ エラーハンドリング
- ✅ デバッグ機能

### 今後の機能（開発予定）
- 🔄 アニメキャラクター風応答調整
- 🔊 音声読み上げ機能（VOICEVOX統合）
- 🎭 キャラクターアニメーション
- 💾 設定保存機能
- 🎨 テーマ切り替え

## 🐛 トラブルシューティング

### Start Claude Codeボタンを押しても何も表示されない

1. **DevToolsを確認**: アプリが自動でDevToolsを開くので、Consoleタブでエラーを確認
2. **Claude Code確認**: 
   ```bash
   claude --version
   which claude
   ```
3. **ログ確認**: Consoleに以下のようなログが表示されるか確認
   - `Starting Claude Code process...`
   - `Claude process spawned with PID: [番号]`

### Claude Codeが起動しない

```bash
# Claude Codeのテスト
claude "こんにちは"

# 権限確認
chmod +x /opt/homebrew/bin/claude
```

### 依存関係エラー

```bash
# 依存関係を再インストール
rm -rf node_modules package-lock.json
npm install
```

## 📁 プロジェクト構成

```
AI-Kawaii-Project/
├── package.json          # プロジェクト設定
├── main.js               # Electronメインプロセス
├── src/
│   ├── index.html        # メインHTML
│   ├── app.js           # レンダラープロセス
│   ├── preload.js       # プリロードスクリプト
│   └── styles/
│       └── main.css     # スタイルシート
├── assets/              # アセット（予定）
├── config/              # 設定ファイル（予定）
└── docs/                # ドキュメント
```

## 🔧 開発者向け

### デバッグモード
アプリは自動でDevToolsを開くように設定されています。本番環境では以下を無効にしてください：

```javascript
// main.js - 本番では削除
mainWindow.webContents.openDevTools();
```

### ビルド
```bash
# パッケージング
npm run pack

# ディストリビューション作成
npm run dist
```

## 📄 ライセンス

MIT License

## 🤝 コントリビューション

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## 📞 サポート

問題や質問がある場合は、Issueを作成してください。

---

**🎀 Enjoy your Kawaii AI experience! 🎀**