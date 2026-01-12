# パフォーマンス調査報告書 & リファクタリング計画

本ドキュメントは、KawAIi Code
のパフォーマンスボトルネックの特定と、それらを改善するための段階的なリファクタリング計画をまとめたものです。

## 1. 調査結果 (Audit Findings)

### 1.1 バックグラウンドプロセスとポーリング

- **`HookService.js`**: 500ms間隔の `setInterval` 内で同期的な `fs.existsSync`
  を使用しています。これにより、メインプロセスまたはレンダラープロセスで微小なスタッタリング（カクつき）が発生し、不要なCPUウェイクアップを招いています。
- **`AudioService.js`**: 音声合成リクエストや話者リスト読み込みのたびに
  `updateApiSettings()`（非同期の設定読み込みを含む）を呼び出しており、冗長な処理が発生しています。
- **`TerminalAppManager.js`**:
  音声機能が無効な状態でも、3秒間隔で音声エンジンへの接続確認を継続しています。

### 1.2 レガシーコードと冗長なモジュール

- **`index.html`**:
  `speech-history-manager.js`（VoiceQueueに統合済みで非推奨）や、使用されていない
  `ConsentService.js` が依然として読み込まれています。
- **`TerminalAppManager.js`**: 削除済みの `speechHistory`
  に関連するコメントアウトされたコードが散見されます。

### 1.3 レンダリングパフォーマンス

- **`useThreeScene.ts`**: 既に35fps制限や `isRenderingRef`
  による描画停止ロジックが実装されており、比較的良好に最適化されています。
- **`CharacterDisplayManager.js`**:
  iframeの表示/非表示を適切に管理していますが、マルチモード時に非表示のキャラクターに対しても描画停止を通知する余地があります。

## 2. リファクタリング計画 (Proposed Phases)

### Phase 1: サービスの最適化 (Background Service Optimization)

1. **`HookService.js` の非同期化**:
   - `setInterval` + `fs.existsSync` を廃止し、`fs.watch`
     によるイベント駆動の監視に移行。
2. **`AudioService.js` の設定キャッシュ化**:
   - 設定変更時のみ `updateApiSettings` を実行するように変更。
3. **`TerminalAppManager.js` の監視間隔調整**:
   - 音声無効時は接続監視を停止、または間隔を大幅に延長。

### Phase 2: クリーンアップとレガシー削除 (Cleanup & Legacy Removal)

1. **`index.html` の整理**:
   - `speech-history-manager.js` および `ConsentService.js` の script
     タグを削除。
2. **コードの整理**:
   - `TerminalAppManager.js`
     等のコメントアウトされた不要な初期化コードを完全に削除。

### Phase 3: イベントリスナーの最適化 (Event Listener Optimization)

1. **中央集約型メッセージハンドリング**:
   - `window.addEventListener('message', ...)`
     が各所に分散しているため、可能な限り1つのディスパッチャーに統合。

## 3. 検証計画 (Verification)

### 自動/半自動検証

- **CPU使用率の監視**: Electron DevTools の Performance タブで、`HookService`
  修正前後の CPU 使用率と UI スレッドのアイドル時間を比較。
- **設定読み込みの動作確認**: 起動時や設定変更時に正しく `AudioService`
  が最新設定を参照できるか確認。

### 手動検証

- **キャラクター表示と音声**:
  リファクタリング後も全キャラクターの表示、リップシンク、音声合成が正常に機能することを確認。
- **ターミナル操作**:
  ポーリング削減によりターミナルの入力応答性が向上しているか（あるいは損なわれていないか）を確認。
