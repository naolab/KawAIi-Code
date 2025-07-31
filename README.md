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

### ⚠️ 前提条件（必須）

このアプリを使用するには、事前に以下のソフトウェアが必要です：

#### 1. Claude Code のインストール
```bash
# Claude Code（Anthropic公式CLI）をインストール
# 公式サイト: https://claude.ai/cli
# または Homebrew（推奨）
brew install anthropics/claude/claude

# インストール確認
claude --version
```

#### 2. 音声機能（オプション）
音声読み上げを使用する場合、以下のいずれかが必要：
- **AivisSpeech Engine** (無料): [公式サイト](https://aivis-project.com/)からダウンロード
- **Aivis Cloud API** (有料): APIキーを取得して設定画面で設定

### 配布版ダウンロード
1. GoogleドライブまたはGitHub Releasesから最新の`KawAIi-Code-1.0.0-arm64.dmg`をダウンロード

2. **DMGファイルをマウント**  
   ダウンロードした`.dmg`ファイルをダブルクリックしてマウント

3. **アプリをインストール**  
   マウントされたディスクイメージ内の`KawAIi Code.app`をApplicationsフォルダにドラッグ&ドロップ

4. **起動**  
   アプリをダブルクリックして起動

### ✨ 署名付きビルドについて
このアプリは署名付きでビルドされているため、macOSの標準的なDMGインストーラーから直接インストールできます。従来の隔離属性削除手順は不要になりました。

### システム要件
- **macOS 10.15 (Catalina) 以降**
- **Apple Silicon (M1/M2/M3) または Intel 64-bit**
- **Claude Code CLI**（必須）
- **2GB以上の空きディスク容量**
- **4GB以上のRAM推奨**
- **インターネット接続**（Claude Code API通信用）

## 🎯 使い方ガイド

> 🎀 Claude CodeとVRMキャラクターが一緒に作業する新しい開発体験！

### 🚀 クイックスタートガイド

<details>
<summary>📱 <strong>3分で始める KawAIi Code</strong></summary>

#### 最初のAI会話
1. **Claude Code CLI が正常にインストールされていることを確認**
   ```bash
   claude --version
   ```
2. **▶️ 開始ボタン**（右向き三角形）をクリック
3. ターミナル画面でClaude Codeと会話開始！
4. 右側の3Dキャラクター（モネ）がAIの返答に合わせて表情変化

#### 音声機能を有効にする（オプション）
- AivisSpeech Engine を起動 (`127.0.0.1:10101`)
- 音声機能を有効にすると、キャラクターが返答を読み上げます
- 感情に応じた自然な表情変化を楽しめます

</details>

<details>
<summary>⚙️ <strong>初回セットアップ</strong></summary>

#### 音声機能の設定（オプション）
以下のいずれかの方法で音声機能を有効にできます：

**方法1: AivisSpeech Engine（ローカル）**
1. [AivisSpeech公式サイト](https://aivis-project.com/)からダウンロード・インストール
2. AivisSpeech Engine を起動（ポート: `127.0.0.1:10101`）
3. KawAIi Code で音声機能が自動的に有効化

**方法2: Aivis Cloud API（クラウド）**
1. 設定画面から「クラウドAPI使用」を有効化
2. Aivis Cloud APIキーを設定
3. インターネット経由で音声合成を利用

#### 作業ディレクトリの設定
- 設定画面から作業したいプロジェクトフォルダを選択
- Claude Codeがそのフォルダで動作します

</details>

### 📖 機能別詳細ガイド

<details>
<summary>🤖 <strong>Claude Code ガイド</strong></summary>

#### Claude Code 機能
**🔹 通常モード**
- **用途**: 一般的なプログラミング支援、コードレビュー
- **特徴**: 安全性重視、権限チェックあり
- **推奨**: 通常の開発作業全般

**🔹 Dangerous モード**  
- **用途**: システム設定変更、高度な操作
- **特徴**: 権限チェックをスキップ、より自由度が高い
- **注意**: ⚠️ 上級者向け、慎重に使用してください

#### CLAUDE.md設定（手動）
- **設定画面**から`CLAUDE.md`の内容を編集可能
- **「生成」ボタン**で作業ディレクトリに`CLAUDE.md`を作成
- プロジェクト固有のAI指示を設定できます

</details>

<details>
<summary>🎭 <strong>VRMキャラクター活用法</strong></summary>

#### デフォルトキャラクター
- **モネ**: 照れ屋で優しいプログラミングアシスタント
- **表情変化**: AI応答の感情に合わせて自動変更
- **自然な動き**: 待機中も自然な動作

#### カスタムキャラクター
**VRMファイルのアップロード**
1. 右上の **⚙️ 設定** ボタンをクリック
2. **「VRMファイルを選択」** をクリック
3. お好みの `.vrm` ファイルを選択

**対応VRM形式**
- **VRM 0.x**: フル対応
- **VRM 1.0**: 基本対応
- **ファイルサイズ**: 推奨 50MB以下

#### 表情・動作機能
**🔹 感情パターン**
| AI応答内容 | 表情変化 |
|------------|----------|
| 成功・完了 | 😊 喜び |
| エラー・失敗 | 😟 困った表情 |
| 説明・解説 | 🤔 真剣な表情 |
| 褒められた時 | 😳 照れ |

**🔹 音声連動**
- **LipSync**: 音声再生時の口の動き
- **自然な表情**: 読み上げ内容に応じた表情変化

> **🎨 カスタマイズヒント**: VRoidStudio等で作成したオリジナルキャラクターも使用可能！

</details>

<details>
<summary>🔊 <strong>音声機能設定ガイド</strong></summary>

#### 音声機能の選択肢
KawAIi Codeでは2つの音声合成方法を選択できます：

**🔹 AivisSpeech Engine（ローカル）**
1. **AivisSpeech Engine** をダウンロード
   - 公式サイト: [https://aivis-project.com/](https://aivis-project.com/)
   - 対応OS: Windows, macOS, Linux
2. **Engine起動**
   - デフォルト設定でローカルサーバー起動
   - アドレス: `127.0.0.1:10101`
3. **KawAIi Code での確認**
   - 音声機能が自動検出されます
   - AI応答時に音声読み上げ開始

**🔹 Aivis Cloud API（クラウド）**
1. **設定画面を開く**
   - 右上の⚙️設定ボタンをクリック
2. **クラウドAPI設定**
   - 「クラウドAPI使用」をONに変更
   - Aivis Cloud APIキーを入力
3. **利点**
   - ローカルソフト不要
   - インターネット経由で高品質音声合成
   - システムリソース使用量が少ない

> **💡 選択のコツ**: 
> - **ローカル**: 低遅延、オフライン利用可能
> - **クラウド**: 高品質、システム負荷軽減

</details>

<details>
<summary>🎨 <strong>カスタマイズ & 設定</strong></summary>

#### 壁紙システム
**🔹 カスタム壁紙**
1. 設定画面から **「壁紙アップロード」**
2. 対応形式: `JPG`, `PNG`, `MP4` (動画壁紙対応!)
3. 推奨解像度: 1920x1080以上

#### ターミナル設定
**タブ機能**
- **最大4つ** のターミナルを同時実行
- タブ切り替えで複数プロジェクト管理
- 各タブで異なるディレクトリ設定可能

**表示設定**
- **眼のアイコン**: ターミナル表示/非表示切り替え
- **フォントサイズ**: 設定画面で調整可能
- **カラーテーマ**: ダーク/ライトモード対応

#### プロジェクト設定
**作業ディレクトリ**
- プロジェクトごとに異なるディレクトリ設定
- Claude Code起動時に自動でディレクトリ移動
- 設定は自動保存・復元

**プロジェクト固有設定**
- **CLAUDE.md**: 設定画面で内容を編集し、手動で生成
- **設定ファイル**: プロジェクトごとの個別設定保存
- **キャラクター設定**: プロジェクト別キャラクター割り当て

> **🚀 プロTip**: 
> - 複数プロジェクトで異なるキャラクターを使い分け
> - プロジェクト固有のCLAUDE.mdでAI特化
> - タブ機能でフロント・バック同時開発

</details>

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
cd KawAIi-Code

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
KawAIi-Code/
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

# Homebrewでインストールしていない場合
# 公式サイトからダウンロード: https://claude.ai/cli
```

**「Claude Code が見つかりません」エラーの場合：**
1. Claude Code CLI がインストールされていることを確認
2. ターミナルで `claude --version` が実行できることを確認
3. PATHにclaude コマンドが含まれていることを確認

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