# 🔄 KawAIi Code 自動アップデート ガイド

## 📱 ユーザー向け使い方

### 自動更新の基本動作
- **1時間ごと**に自動で更新をチェック
- 新バージョンがあると**自動ダウンロード**開始
- ダウンロード完了後、**再起動ボタン**が表示される
- 基本的に**何もする必要なし**

### 手動で更新をチェックする方法
1. アプリ右上の⚙️**設定**アイコンをクリック
2. **自動更新**セクションを確認
3. **「更新をチェック」**ボタンをクリック

### 更新の適用方法
1. 新バージョンのダウンロードが完了すると**「再起動して更新」**ボタンが表示
2. ボタンをクリックでアプリが再起動し、更新が適用される

---

## 🚀 開発者向け リリース手順

### 新バージョンをリリースする手順

#### 1. バージョン番号を更新
```json
// package.json
{
  "version": "1.0.0-beta" → "1.0.1-beta"
}
```

#### 2. アプリをビルド
```bash
npm run build
```

#### 3. GitHub Releasesで公開
1. GitHubリポジトリの**Releases**タブを開く
2. **「Create a new release」**をクリック
3. 以下を設定：
   - **Tag version**: `v1.0.1-beta` (package.jsonと一致させる)
   - **Release title**: `v1.0.1-beta`
   - **Description**: 変更内容を記述
   - **Pre-release**: ベータ版の場合はチェック

#### 4. ファイルをアップロード
`dist/` フォルダ内の以下のファイルをすべてアップロード：
```
📁 dist/
├── KawAIi Code-1.0.1-beta.dmg          # Mac用インストーラー
├── KawAIi Code Setup 1.0.1-beta.exe    # Windows用インストーラー
├── latest-mac.yml                       # Mac用更新情報（重要！）
├── latest.yml                           # Windows用更新情報（重要！）
└── その他生成されたファイル
```

#### 5. リリースを公開
**「Publish release」**をクリック

### ⚠️ 重要な注意点

1. **バージョン番号の一致**
   - `package.json` の `version` と GitHub Release の `tag` は必ず一致させる
   
2. **latest-*.yml ファイル**
   - これがないと自動更新が動作しません
   - 必ずアップロードしてください

3. **ベータ版の場合**
   - **Pre-release** にチェックを入れる
   - バージョン番号に `-beta` サフィックスを付ける

---

## 🔧 技術的な仕組み

### electron-updaterの動作
1. **GitHub Releases API**から最新バージョンをチェック
2. 新しいバージョンがあれば**latest-*.yml**から詳細情報を取得
3. **バックグラウンドでダウンロード**
4. ユーザーの操作で**再起動→更新適用**

### 設定ファイル（package.json）
```json
{
  "build": {
    "publish": [{
      "provider": "github",
      "owner": "naolab",
      "repo": "KawAIi-Code"
    }]
  }
}
```

---

## 📝 バージョニング規則

### ベータ版
```
v1.0.0-beta → v1.0.1-beta → v1.0.2-beta
```

### 正式版
```
v1.0.0 → v1.0.1 → v1.1.0 → v2.0.0
```

### セマンティックバージョニング
- **パッチ** (1.0.0 → 1.0.1): バグ修正
- **マイナー** (1.0.0 → 1.1.0): 新機能追加
- **メジャー** (1.0.0 → 2.0.0): 破壊的変更

---

## 🆘 トラブルシューティング

### 更新が検出されない場合
1. **latest-*.yml** ファイルがアップロードされているか確認
2. **package.json** と **GitHub Release tag** が一致しているか確認
3. **Pre-release** 設定が正しいか確認

### 開発モードでテストしたい場合
```bash
# 本番ビルドでテスト
npm run build:electron
```

---

## 📚 参考リンク

- [electron-updater公式ドキュメント](https://www.electron.build/auto-update)
- [GitHub Releases API](https://docs.github.com/en/rest/releases)
- [セマンティックバージョニング](https://semver.org/lang/ja/)