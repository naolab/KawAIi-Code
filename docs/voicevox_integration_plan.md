# VoiceVOX対応実装計画

## 現状整理
- Electronメインプロセスの `src/voiceService.js` が AivisSpeech ローカルエンジン（`/audio_query`→`/synthesis`）と Aivis Cloud API（`/tts/synthesize`）を切り替えて呼び出している。
- レンダラ側の `src/services/AudioService.js` も同じフローでUI連携・感情分析・再生管理を行っている。
- 設定ストレージ（`appConfig` と統一設定マネージャ）は `useCloudAPI` ブール値のみを持ち、エンジンは2択前提になっている。
- `scripts/voice-synthesis-hook.js` はローカルAivis用の簡易実装を持ち、フック経由で音声合成を実行している。

## VoiceVOX対応の目的
- AivisSpeechローカル・Aivis Cloudに加えて VoiceVOX（ローカルエンジン）を等価な選択肢として扱えるようにする。
- 既存の感情分析・再生パイプラインを最大限再利用しつつ、VoiceVOX固有のパラメータ（話者ID、スタイルID、`speedScale` など）を尊重する。
- アプリ再起動なしでエンジンを切り替え、UIから接続状態を確認できるようにする。

## 実装ステップ

### 1. 設定レイヤーの拡張
- `appConfig` と統一設定マネージャに `voiceEngine`（例: `aivis-local` / `aivis-cloud` / `voicevox`）と `voicevoxEndpoint`（既定 `http://127.0.0.1:50021`）を追加する。
- 既存設定の移行ロジックを用意し、`useCloudAPI` が true の場合は `voiceEngine = aivis-cloud`、それ以外は `aivis-local` とみなす。
- `src/preload.js` を含むIPC経路を更新し、新しいフィールドの取得・保存を可能にする（APIキーの暗号化仕様は踏襲）。

### 2. UIの改修
- `src/index.html` と `src/modules/ui-event-manager.js` のエンジン選択ラジオを3択化し、VoiceVOX選択時にエンドポイント入力欄や話者再取得ボタン、接続ステータス表示を出し分ける。
- 選択内容を統一設定に保存し、既存の通知コンポーネントを再利用してテスト結果やエラーを表示する。
- 話者セレクトボックスを VoiceVOX のレスポンス構造（`{ speaker: number, styles: [...] }`）に対応させ、Aivisのデータ形式とも両立させる。

### 3. Electronメインプロセス（`src/voiceService.js`）
- `voiceEngine` に応じた分岐（もしくは戦略クラス）を導入し、以下のAPI呼び出しを切り替える。
  - **VoiceVOX:** `POST /audio_query` → `POST /synthesis`（JSONボディ＋`speaker`クエリ）。
  - **Aivis Local:** 現行フローを維持。
  - **Aivis Cloud:** 現行クラウドフローを維持。
- ヘルスチェックをエンジンごとに `/version`（Aivis）または `/speakers`（VoiceVOX）、クラウドは `/health` を利用する形に一般化する。
- VoiceVOXの話者リストをレンダラ側が扱いやすい形に整形しつつ、既存のリトライ・タイムアウト制御を流用する。

### 4. レンダラ音声パイプライン（`src/services/AudioService.js`）
- メインプロセス同様に `voiceEngine` を参照してリクエスト先を切り替えるよう `updateApiSettings()` と合成処理を刷新する。
- VoiceVOX向けの合成処理を追加し、`speedScale`、`volumeScale`、`intonationScale` などを設定可能にする（必要に応じてポーズ・音素調整も検討）。
- 合成結果（WAV想定）を既存の再生・VRMリップシンク処理で扱えるよう、フォーマット検出や増幅処理を確認する。

### 5. フックスクリプト（`scripts/voice-synthesis-hook.js`）
- 新たな `voiceEngine` 設定を読み込み、Aivis用フローとVoiceVOX用フローを切り替える。
- 重複テキスト抑制・感情分析など既存機能を活かしつつ、VoiceVOXエンドポイントの上書き設定にも対応する。

### 6. IPC・ターミナル連携
- `main.js` の `ipcMain` ハンドラを更新し、VoiceVOX利用時も話者一覧取得・合成要求が通るようにする。
- `VoiceQueue` や `TerminalAppManager` などの音声キュー処理が新エンジンでも動作するか確認し、必要に応じて待機時間・並列制御を調整する。

### 7. テストと検証
- **自動テスト:** VoiceVOXのレスポンスをモックし、ペイロード構築・タイムアウト・リトライの挙動を検証する。
- **手動テスト:**
  - エンジン切替と話者リスト更新がUIで正しく動作することを確認。
  - VoiceVOXが生成したWAVの再生・リップシンクが問題ないか確認。
  - Aivisクラウド/ローカルの既存フローに回帰不具合が出ていないか再チェック。

### 8. ドキュメント整備
- READMEにVoiceVOX導入手順（インストール、エンジン起動ポート）を追記する。
- 設定項目、よくあるエラー（ポート競合、話者ID不一致など）、エンジンごとの差異をまとめる。
- CHANGELOGを更新し、VoiceVOX利用時は公式アプリの常駐が必要である旨をUIにも注記する。

## リスクと検討課題
- VoiceVOXの話者・スタイル構造がAivisと異なるため、UI向けフォーマットの整理が必要。
- WAV出力サイズにより音量増幅ロジックへ影響が出る可能性があるため、処理互換性を事前に検証する。
- VoiceVOXのレスポンス速度やバッファ処理が異なる場合、キュー制御やクールダウン値の調整が必要になるかもしれない。

## 次のアクションチェックリスト
- [ ] 設定スキーマ拡張と移行実装
- [ ] VoiceService / AudioService のエンジン切替リファクタ
- [ ] UIコントロールと保存ロジックの更新
- [ ] VoiceVOX向け合成・話者取得の実装
- [ ] フック処理のVoiceVOX対応
- [ ] 回帰テストとドキュメント更新
