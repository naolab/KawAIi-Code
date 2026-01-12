# Windows対応調査チェックリスト

## 1. 現行システムの構成
- **Electronメインプロセス**: `main.js` はウィンドウ生成、Next.js/WS サーバー起動、`VoiceService`/`node-pty` 管理、`electron-updater` による自動更新と IPC を担う。mac 用メニューやショートカット制御も内包する（`main.js:1-545`）。
- **Next.js UI と WebSocket**: `ai-kawaii-nextjs` フォルダで `npm run dev` サーバー/`websocket-server.js` を起動し、ポート `3002` でレンダラープロセスにデータを流す仕組み（`main.js:207-289`）。
- **ビルド・パッケージ**: ルートの `package.json` に `electron-builder` や `node-pty` の再ビルド（`postinstall`/`rebuild`）を含む `build`/`build:simple` スクリプトと各 OS ターゲット（`package.json:6-114`）、加えて `build.js` で Next.js ビルド → `electron-builder` を順に実行（`build.js:1-72`）。
- **AI CLI 検出 & 音声**: `src/services/ai-config-service.js` で Claude/Gemini/Codex のインストール先候補を動的生成 (`which` + path テーブル)、`src/voiceService.js` が VoiceVox/Aivis との接続/再試行/タイムアウトを管理（`src/services/ai-config-service.js:32-209`, `src/voiceService.js:1-200`）。
- **ドキュメント/CI**: README は現在 macOS 依存（インストール手順や DMG 前提、`README.md:5-140`）、`dev-docs/plans/auto-update-implementation-plan.md` では macOS ランナーのみで `npm run build` → `publish` を実行中（`dev-docs/plans/auto-update-implementation-plan.md:91-107`）。

## 2. Windows対応の現状
- CLI 検出ロジックに Windows パスが含まれるものの、`which` を使っているので PowerShell/CMD では失敗しやすい（`src/services/ai-config-service.js:41-210`）。
- `package.json` の `build.win` セクションで NSIS x64 をターゲットにしており、`autoUpdater` の `publish` 設定は GitHub Releases へ `.exe`/`latest.yml` を送信する想定（`package.json:71-112`, `main.js:463-545`）、つまりビルド機構そのものは Windows を想定済み。
- ドキュメントと CI は macOS 固定。`README` では mac の CLI インストール方法 (`brew`)／署名済み DMG を記述しており、CI も `runs-on: macos-latest` のみで Windows/NSIS の成果物取得や `latest.yml` 生成が未自動化（`README.md:5-140`, `dev-docs/plans/auto-update-implementation-plan.md:91-107`）。

## 3. Windows対応チェックリスト
- [ ] **CLI discovery を cross-platform に**: `src/services/ai-config-service.js` の `execSync('which ...')` を `where`/`Get-Command` など Windows 互換の手段に置き換え、`PATH` 検索は Node 版 `which` ライブラリや `process.env.PATH` を併用する。現在の構造は `claude`/`codex`/`gemini` で共通化されているので、共通関数として抽出すると取り回しやすい（`src/services/ai-config-service.js:32-209`）。
- [ ] **ネイティブモジュール再ビルドの明示**: `node-pty` の `electron-rebuild -f -w node-pty` は `postinstall` で走るが、Windows 環境向けに `npm run rebuild` を `build` 前に必須にするドキュメント化と CI ステップ（`package.json:6-36`, `build.js:1-72`）。Electron-builder 実行前に `npm run rebuild` を確実に呼ぶため、CI/ローカル手順に明記。
- [ ] **Windowsビルド CI を追加**: `dev-docs/plans/auto-update-implementation-plan.md` で `runs-on: macos-latest`、`npm run build` → `npm run publish` のみ。これに `windows-latest` ジョブを追加し、`npm run rebuild && npx electron-builder --win --x64`（または `npm run build:electron -- --win`) で `.exe`/`latest.yml` を生成・GitHub Release にアップロード。
- [ ] **AutoUpdater 配布資産の Windows 対応**: `main.js:463-545` の `electron-updater` イベントは OS に依存しないが、`publish` 設定で Windows `.exe`/`latest.yml` が GitHub Releases に含まれているか検証。mac 用 `latest-mac.yml` と Windows 用 `latest.yml` 両方を生成するリリースフローを確認する。
- [ ] **Next.js + WebSocket の Windows 実行保証**: `startNextjsServer` が Windows でも `node`/`npm` で `websocket-server.js` → `npm run dev` を起動するか、`PATH` に `node` が存在することを確認。`spawn('npm', ...)` は `.cmd` 拡張子のある Windows でも通るが、`node` が見つからないと失敗するため、Windows 用起動手順をドキュメント化（`main.js:207-289`）。
- [ ] **ドキュメント＆配布ガイド更新**: `README.md` の mac専用インストール手順（`brew`/DMG）を Windows 版（今後 NSIS `.exe`、AI CLI には `choco`/`npm install -g` や `claude.exe`、VOICEVOX/Aivis の Windows パス）と併記し、「対応OS: Windows + macOS + Linux」（元は `README.md:5-140` で macOS 限定）とする。
- [ ] **Windows での QA/手動確認**: 持ち込み可能であれば Windows 端末か Wine 環境を用意して `npm run build`（`electron-builder --win`）→ `dist/*.exe` のインストール→ `electron-updater` で GitHub の `latest.yml` を引く手順を確認し、`ai-config-service` による CLI 起動、`node-pty` が正しく動いているかをチェック（`main.js`, `src/services/ai-config-service.js`, `node_modules/node-pty` 再ビルド）。

