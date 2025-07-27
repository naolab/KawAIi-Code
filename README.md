# 🎀 KawAIi Code

Claude CodeとアニメキャラクターVRMが対話するデスクトップアプリケーションです。美しいカワイイデザインで、Claude Codeを直感的に操作できます。

![KawAIi Code](https://img.shields.io/badge/status-ready_for_distribution-brightgreen)
![Platform](https://img.shields.io/badge/platform-macOS-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ 特徴

- 🎀 **カワイイデザイン**: 3D VRMキャラクターとアニメUI
- 💬 **AIアシスタント選択**: Claude CodeとGemini Code Assistを切り替えて利用可能
- 🖥️ **デスクトップアプリ**: Electronベースのネイティブアプリ
- 🔄 **リアルタイム応答**: AIアシスタントとのライブ通信
- 🎨 **3D VRMビューワー**: Three.js/VRM対応の3Dキャラクター表示
- 🗣️ **音声合成**: AivisSpeech連携による音声読み上げ
- 🎭 **キャラクターアニメーション**: アイドルアニメーション・LipSync機能
- 📝 **動的プロンプト管理**: AI起動時にキャラクター設定やプロジェクト固有の指示を`.md`ファイルとして自動生成・更新（Claudeはホームディレクトリ、Geminiは作業ディレクトリ）
- 🖼️ **カスタム壁紙**: 時間帯別デフォルト壁紙・ユーザー壁紙アップロード対応
- ⚙️ **設定管理**: キャラクター変更・作業ディレクトリ設定・プロジェクト固有設定
- 🔧 **モジュラー設計**: リファクタリング済みの保守しやすいコード構造

## 📥 インストール（ユーザー向け）

### 配布版ダウンロード
1. GoogleドライブまたはGitHub Releasesから最新の`KawAIi-Code-1.0.0-arm64-app.zip`をダウンロード

2. **隔離属性を削除（重要！）**  
   ダウンロード後、ターミナルを開いて以下のコマンドを実行：
   ```bash
   # ZIPファイルの隔離属性を削除
   xattr -dr com.apple.quarantine /Users/YOUR_USERNAME/Downloads/KawAIi-Code-1.0.0-arm64-app.zip
   ```

3. **ZIPファイルを展開**  
   ZIPファイルをダブルクリックして展開

4. **アプリの隔離属性を削除**  
   展開されたアプリの隔離属性も削除：
   ```bash
   # アプリの隔離属性を削除
   xattr -dr com.apple.quarantine "/Users/YOUR_USERNAME/Downloads/KawAIi Code.app"
   ```

5. **アプリを移動**  
   `KawAIi Code.app`をApplicationsフォルダにドラッグ&ドロップ

6. **起動**  
   アプリをダブルクリックして起動

### ⚠️ なぜこの手順が必要？
macOSは、インターネットからダウンロードしたファイルに「隔離属性」を自動で付けます。署名がないアプリは「壊れている」として実行を拒否されますが、隔離属性を削除すれば正常に動作します。

### システム要件
- macOS 10.15 (Catalina) 以降
- Apple Silicon (M1/M2/M3) または Intel 64-bit
- 2GB以上の空きディスク容量
- 4GB以上のRAM推奨

## 🎯 使用方法

### 基本操作
1. **KawAIi Code起動**: アプリケーションから起動
2. **AIアシスタント開始**: 「AIアシスタントを開始」ボタンをクリックし、Claude CodeまたはGemini Code Assistを選択
3. **対話開始**: ターミナル画面でAIアシスタントと対話
4. **VRMキャラクター**: 右側に3Dキャラクターが表示・アニメーション
5. **設定**: 右上の設定ボタンでVRMファイル変更可能

### AIアシスタント機能詳細

#### Claude Code統合
- **Claude Code (通常版)**: 標準のClaude Codeを起動
- **Claude Code (Dangerous版)**: 権限チェックをスキップした危険モード
- **動的プロンプト生成**: 起動時に自動でキャラクター設定ファイルを生成
- **自動停止**: 停止時にプロンプトファイルは自動削除

#### ターミナル機能
- **xterm.js**: フル機能のターミナルエミュレーション
- **タブ機能**: 複数のターミナルを同時管理（最大4つ）
- **表示切り替え**: 眼のアイコンでターミナルの表示/非表示

### VRMキャラクター機能
- **デフォルトキャラクター**: プリセットキャラクター読み込み
- **カスタムVRM**: 外部VRMファイルのアップロード対応
- **リアルタイムアニメーション**: アイドルアニメーション自動再生
- **LipSync**: 音声合成時の口パク同期
- **表情制御**: 感情解析による自動表情変化

### 音声機能（オプション）
音声読み上げを利用する場合：
1. [AivisSpeech](https://aivis-project.com/)をダウンロード・起動
2. ローカルサーバー（127.0.0.1:10101）で起動
3. KawAIi Code上で音声機能が自動的に有効化
4. Claude Codeの応答が音声で読み上げられます

### 壁紙・カスタマイズ機能
- **時間帯別自動壁紙**: 朝・昼・夕・夜で自動切り替え
- **ユーザー壁紙**: カスタム画像・動画のアップロード対応
- **設定保存**: ユーザー設定は自動的に保存・復元

## 🛠️ 技術スタック

### フロントエンド
- **Electron**: デスクトップアプリフレームワーク
- **Next.js**: VRMビューワー（静的ファイル化済み）
- **Three.js**: 3Dレンダリングエンジン
- **@pixiv/three-vrm**: VRMファイル読み込み・制御
- **xterm.js**: ターミナルエミュレーター

### バックエンド & アーキテクチャ
- **Node.js**: Electronメインプロセス
- **node-pty**: ターミナルプロセス管理 (Claude Code / Gemini Code Assist)
- **AivisSpeech**: 音声合成エンジン連携
- **モジュラー設計**: 壁紙システム、設定管理の独立モジュール
- **LocalStorage**: ユーザー設定の永続化

### 配布・ビルド
- **electron-builder**: パッケージング・配布
- **webpack**: モジュールバンドラー

## 🔧 開発者向け

### 開発環境セットアップ

```bash
# リポジトリクローン
git clone [repository-url]
cd AI-Kawaii-Project

# 依存関係インストール
npm install

# Next.jsアプリ依存関係
cd ai-kawaii-nextjs
npm install
cd ..

# 開発モード起動
npm run dev
```

### ビルド・パッケージング

```bash
# Next.jsアプリビルド
cd ai-kawaii-nextjs
npm run build
cd ..

# 静的ファイル処理（自動化済み）
# VRMビューワーを静的ファイルとしてElectronに統合

# Electronアプリパッケージング
npm run pack    # 開発用テスト
npm run build   # DMGインストーラー作成
```

### プロジェクト構成

```
AI-Kawaii-Project/
├── package.json                    # Electronアプリ設定
├── main.js                         # Electronメインプロセス
├── src/
│   ├── index.html                  # メインHTML
│   ├── app.js                      # メインレンダラープロセス（1163行）
│   ├── modules/                    # 独立モジュール
│   │   ├── wallpaper-system.js    # 壁紙システム（372行）
│   │   └── config-manager.js      # 設定管理（244行）
│   ├── preload.js                  # プリロードスクリプト
│   ├── voiceService.js            # 音声機能サービス
│   └── vrm-viewer/                # Next.jsビルド済み静的ファイル
│       ├── index.html             # VRMビューワー
│       ├── kotone_claude1.vrm     # デフォルトVRMモデル
│       └── _next/                 # Next.jsアセット
├── ai-kawaii-nextjs/              # Next.jsソースコード
│   ├── src/
│   │   ├── app/                   # App Router
│   │   ├── components/            # VRMViewer等
│   │   └── features/              # LipSync等機能
│   └── public/                    # パブリックアセット
├── assets/
│   └── icons/                     # アプリアイコン
├── dist/                          # 配布ファイル出力
└── docs/                          # ドキュメント
```

### 設計思想・アーキテクチャ

#### 1. ハイブリッドアーキテクチャ
- **Electronメインプロセス**: AIアシスタント統合 (Claude Code / Gemini Code Assist)、音声機能、システム統合
- **Next.js VRMビューワー**: 3Dキャラクター表示・アニメーション（静的ファイル化）
- **PostMessage通信**: プロセス間通信でリアルタイム連携

#### 2. モジュラー設計による保守性向上
- **壁紙システム**: 時間帯別切り替え、ユーザーアップロード、アニメーション制御
- **設定管理**: キャラクター変更、プロジェクト固有設定、ユーザー設定の一元管理
- **責務分離**: 機能ごとの独立モジュールで可読性・メンテナンス性を向上

#### 3. 動的なAIプロンプト管理
- AIアシスタント起動時に、キャラクター設定と作業ディレクトリ内の`.md`ファイルを統合したプロンプトを生成
- Claude Code向けにはホームディレクトリに`CLAUDE.md`を生成し、停止時に削除
- Gemini Code Assist向けには作業ディレクトリに`GEMINI.md`を生成し、停止時に削除

#### 4. 静的ファイル統合による配布最適化
- Next.js開発サーバー依存を排除
- webpack相対パス設定で単体動作実現
- file://プロトコル対応によるセキュリティ確保

#### 5. パフォーマンス最適化
- VRMレンダリング35fps制限
- LipSyncサンプルレート最適化（CPU使用率削減）
- 条件付きレンダリング・アニメーション間引き

#### 6. ユーザビリティ重視
- ワンクリックインストール（DMG配布）
- 設定UI統合（VRM変更・デフォルト読み込み）
- 直感的な操作フロー

## 🐛 トラブルシューティング

### 起動時の問題
**セキュリティ警告が表示される場合：**
1. システム環境設定 → セキュリティとプライバシー
2. 「このまま開く」をクリック
3. または：Control+クリックでコンテキストメニューから「開く」

**VRMキャラクターが表示されない場合：**
- アプリを完全に終了し、再起動
- macOSのセキュリティ設定でファイルアクセス許可確認

### Claude Code関連
**Claude Codeが起動しない場合：**
```bash
# Claude Code確認
claude --version
which claude

# 権限確認
chmod +x $(which claude)
```

### 音声機能
**音声が再生されない場合：**
1. AivisSpeech Engineが起動しているか確認
2. ポート10101が使用可能か確認
3. システムの音声出力設定を確認

### パフォーマンス
**動作が重い場合：**
- VRMフレームレートは自動調整済み（35fps）
- 他のアプリケーションを終了してメモリを確保
- Activity Monitorでシステムリソース確認

## 📄 ライセンス

MIT License

## 🤝 コントリビューション

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## 📞 サポート

- **配布・インストール**: [Distribution Guide](Distribution_Guide_for_macOS.md)
- **問題報告**: GitHubのIssuesで受付
- **機能要望**: GitHubのDiscussionsで受付

---

**🎀 Enjoy your Kawaii AI experience! 🎀**