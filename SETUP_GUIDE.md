# 🔧 他のPCでのセットアップガイド

このガイドは、AI Kawaii Projectを他のPCで動作させるための詳細な手順をまとめています。

## 📋 前提条件

以下の環境が必要です：

### 必須ソフトウェア
- **Node.js**: v18以上
- **npm**: 最新版
- **Git**: バージョン管理用
- **Claude Code CLI**: 必須

### 推奨環境
- macOS 10.15以上
- Windows 10/11
- Ubuntu 20.04以上

## 🚀 セットアップ手順

### 1. 基本環境の確認

```bash
# バージョン確認
node --version    # v18以上であることを確認
npm --version     # 最新版であることを確認
git --version     # Gitが使用可能であることを確認
claude --version  # Claude Code CLIが利用可能であることを確認
```

Claude Code CLIがインストールされていない場合は、[公式ドキュメント](https://docs.anthropic.com/en/docs/claude-code)を参照してインストールしてください。

### 2. プロジェクトのクローン

```bash
# リポジトリをクローン
git clone https://github.com/your-username/AI-Kawaii-Project.git
cd AI-Kawaii-Project
```

### 3. Electronアプリのセットアップ

```bash
# メインアプリの依存関係をインストール
npm install

# アプリの起動テスト
npm start
```

### 4. Next.jsアプリのセットアップ（VRM機能用）

```bash
# Next.jsプロジェクトディレクトリに移動
cd ai-kawaii-nextjs

# 依存関係をインストール
npm install

# 開発サーバーの起動テスト
npm run dev
```

### 5. 音声合成エンジンのセットアップ

#### AivisSpeech Engineの準備

音声合成機能を使用するには、AivisSpeech Engineが必要です：

1. **AivisSpeech Engineをダウンロード・インストール**
2. **エンジンを起動**
   ```bash
   # ローカルポート 10101 で起動する必要があります
   # 起動方法はAivisSpeechの公式ドキュメントを参照
   ```

3. **動作確認**
   ```bash
   # ブラウザで以下にアクセスして確認
   # http://127.0.0.1:10101
   ```

## 📁 必要ファイルの確認

以下のファイルが正しく配置されていることを確認してください：

### VRMモデルファイル
```
ai-kawaii-nextjs/public/
├── kotone_claude1.vrm     # VRMキャラクターモデル
└── idle_loop.vrma         # アニメーションファイル
```

### 設定ファイル
```
src/
├── appConfig.js           # アプリ設定
├── voiceService.js        # 音声合成サービス
└── preload.js            # Electronプリロード
```

## ⚙️ 動作確認

### 1. 基本機能の確認

```bash
# メインアプリの起動
npm start

# 「Start Claude Code」ボタンをクリック
# ターミナルに「🎀 KawAIi Code Integration Started! 🎀」が表示されることを確認
```

### 2. 音声機能の確認

1. AivisSpeech Engineが起動していることを確認
2. アプリで何かメッセージを送信
3. 音声読み上げが動作することを確認

### 3. VRM機能の確認

```bash
# Next.jsアプリの起動
cd ai-kawaii-nextjs
npm run dev

# ブラウザで http://localhost:3000 にアクセス
# 3Dキャラクターが表示されることを確認
```

## 🐛 トラブルシューティング

### よくある問題と解決方法

#### 1. Claude Code が見つからない
```bash
# インストール確認
which claude

# パスが通っていない場合
export PATH=$PATH:/opt/homebrew/bin  # macOS
export PATH=$PATH:/usr/local/bin     # Linux
```

#### 2. 依存関係エラー
```bash
# node_modulesを削除して再インストール
rm -rf node_modules package-lock.json
npm install
```

#### 3. 音声合成が動作しない
- AivisSpeech Engineが起動しているか確認
- ポート10101が使用可能か確認
- ファイアウォール設定を確認

#### 4. VRMモデルが表示されない
- VRMファイルが正しく配置されているか確認
- WebGLが有効になっているか確認
- ブラウザのConsoleでエラーを確認

#### 5. 権限エラー
```bash
# 実行権限の付与
chmod +x /path/to/claude

# macOSでの追加設定
sudo xattr -r -d com.apple.quarantine /Applications/Claude.app
```

## 🔧 開発者向け設定

### デバッグモード

本番環境では以下の設定を変更してください：

```javascript
// main.js - 本番では削除
// mainWindow.webContents.openDevTools();
```

### ビルド設定

```bash
# パッケージング
npm run pack

# ディストリビューション作成
npm run dist
```

## 📱 使用方法

1. **アプリ起動**: `npm start`
2. **Claude Code開始**: 「Start Claude Code」ボタンをクリック
3. **音声確認**: AivisSpeech Engineが起動していることを確認
4. **VRM確認**: Next.jsアプリで3Dキャラクターを確認
5. **対話開始**: ターミナルでメッセージを入力

## 🆘 サポート

問題が解決しない場合は：

1. **ログの確認**: DevToolsのConsoleタブでエラーを確認
2. **Issue作成**: GitHubリポジトリでIssueを作成
3. **ドキュメント参照**: READMEファイルの詳細情報を確認

## 📄 関連ドキュメント

- [メインREADME](./README.md)
- [Claude Code公式ドキュメント](https://docs.anthropic.com/en/docs/claude-code)
- [AivisSpeech公式サイト](https://aivis-project.com/)

---

**✨ セットアップ完了後は、美しいKawaiiなAI体験をお楽しみください！ ✨**