// 壁紙システム管理モジュール

// デバッグログ制御（本番環境では無効化）
const WallpaperSystem_isDev = !window.location.protocol.startsWith('file:') || process.env.NODE_ENV === 'development';
const WallpaperSystem_debugLog = WallpaperSystem_isDev ? console.log : () => {};
const WallpaperSystem_debugError = console.error; // エラーは常に出力

// 統一設定管理システム（グローバル参照）
// unifiedConfigはunified-config-manager.jsで既にグローバルに定義済み

class WallpaperSystem {
    constructor() {
        this.wallpaperTimer = null;
        this.currentWallpaperOption = 'default';
        this.currentAppliedWallpaperFileName = null;
        this.wallpaperAnimationEnabled = true;
        this.messageCallback = null; // 音声メッセージ用コールバック
        
        // 統一設定システムから設定を復元
        this.initializeAsync();
    }

    // 非同期初期化
    async initializeAsync() {
        await this.loadSettings();
    }

    // 統一設定システムから設定を読み込み
    async loadSettings() {
        this.wallpaperAnimationEnabled = await unifiedConfig.get('wallpaperAnimationEnabled', this.wallpaperAnimationEnabled);
    }

    // 音声メッセージ用コールバックを設定
    setMessageCallback(callback) {
        this.messageCallback = callback;
    }

    // 音声メッセージを送信
    addVoiceMessage(character, message) {
        if (this.messageCallback) {
            this.messageCallback(character, message);
        }
    }

    // 壁紙システムの初期化
    setupWallpaperSystem() {
        this.loadWallpaperList();
        this.setupWallpaperListeners();
        this.syncUIElements();
    }

    // UI要素と設定を同期
    syncUIElements() {
        const wallpaperAnimationToggle = document.getElementById('wallpaper-animation-toggle');
        if (wallpaperAnimationToggle) {
            wallpaperAnimationToggle.checked = this.wallpaperAnimationEnabled;
        }
    }

    // 壁紙リストを読み込み
    async loadWallpaperList() {
        try {
            const response = await window.electronAPI.wallpaper.getWallpaperList();
            if (response.success) {
                const defaultRadio = document.getElementById('wallpaper-default-radio');
                const uploadedRadio = document.getElementById('wallpaper-uploaded-radio');
                const uploadedWallpaperNameSpan = document.getElementById('uploaded-wallpaper-name');
                
                let lastUploadedWallpaper = null;
                if (response.wallpapers.length > 0) {
                    // 常に最新のアップロードされた壁紙を取得
                    lastUploadedWallpaper = response.wallpapers[response.wallpapers.length - 1];
                }

                const savedWallpaperChoice = await unifiedConfig.get('selectedWallpaperChoice'); // 'default' or 'uploaded'
                const savedUploadedWallpaper = await unifiedConfig.get('lastUploadedWallpaper'); // ファイル名

                // UIを初期化
                if (defaultRadio) defaultRadio.checked = false;
                if (uploadedRadio) uploadedRadio.checked = false;
                if (uploadedWallpaperNameSpan) uploadedWallpaperNameSpan.textContent = '';

                if (uploadedRadio && lastUploadedWallpaper && (savedWallpaperChoice === 'uploaded' || (savedWallpaperChoice === null && savedUploadedWallpaper))) {
                    // アップロードされた壁紙が存在し、それが選択されていた、または以前アップロード済みの場合
                    uploadedRadio.checked = true;
                    if (uploadedWallpaperNameSpan) {
                        uploadedWallpaperNameSpan.textContent = `現在の壁紙: ${lastUploadedWallpaper.name}`;
                    }
                    this.currentWallpaperOption = 'uploaded';
                    this.applyWallpaper(lastUploadedWallpaper.filename);
                    await unifiedConfig.set('selectedWallpaperChoice', 'uploaded');
                    await unifiedConfig.set('lastUploadedWallpaper', lastUploadedWallpaper.filename);
                    this.stopWallpaperTimer(); // アップロード済み壁紙が選択されたらタイマーを停止
                } else if (defaultRadio) {
                    // それ以外の場合はデフォルト壁紙を選択
                    defaultRadio.checked = true;
                    this.currentWallpaperOption = 'default';
                    this.applyWallpaper('default');
                    await unifiedConfig.set('selectedWallpaperChoice', 'default');
                    await unifiedConfig.remove('lastUploadedWallpaper'); // デフォルト選択時はクリア
                    this.startWallpaperTimer(); // デフォルト壁紙が選択されたらタイマーを開始
                }

                // アップロードした壁紙がない場合は、「アップロードした壁紙を使用する」を選択不可にする
                if (uploadedRadio && !lastUploadedWallpaper) {
                    uploadedRadio.disabled = true;
                } else if (uploadedRadio) {
                    uploadedRadio.disabled = false;
                }

            }
        } catch (error) {
            WallpaperSystem_debugError('壁紙リスト読み込みエラー:', error);
            // エラー時はデフォルト選択にするなど、適切なフォールバック処理
            const defaultRadio = document.getElementById('wallpaper-default-radio');
            if (defaultRadio) defaultRadio.checked = true;
            this.currentWallpaperOption = 'default';
            this.applyWallpaper('default');
            await unifiedConfig.set('selectedWallpaperChoice', 'default');
            await unifiedConfig.remove('lastUploadedWallpaper');
        }
    }

    // 壁紙関連のイベントリスナーを設定
    setupWallpaperListeners() {
        const defaultRadio = document.getElementById('wallpaper-default-radio');
        const uploadedRadio = document.getElementById('wallpaper-uploaded-radio');
        const uploadBtn = document.getElementById('upload-wallpaper-btn');
        const uploadInput = document.getElementById('wallpaper-upload');
        const uploadedWallpaperNameSpan = document.getElementById('uploaded-wallpaper-name');

        if (defaultRadio) {
            defaultRadio.addEventListener('change', async () => {
                if (defaultRadio.checked) {
                    this.currentWallpaperOption = 'default';
                    this.applyWallpaper('default');
                    await unifiedConfig.set('selectedWallpaperChoice', 'default');
                    await unifiedConfig.remove('lastUploadedWallpaper');
                    if (uploadedWallpaperNameSpan) uploadedWallpaperNameSpan.textContent = '';
                    this.startWallpaperTimer(); // デフォルト壁紙が選択されたらタイマーを開始
                }
            });
        }

        if (uploadedRadio) {
            uploadedRadio.addEventListener('change', async () => {
                if (uploadedRadio.checked) {
                    this.stopWallpaperTimer(); // アップロード済み壁紙が選択されたらタイマーを停止
                    const response = await window.electronAPI.wallpaper.getWallpaperList();
                    if (response.success && response.wallpapers.length > 0) {
                        // 最新のアップロードされた壁紙を適用
                        const latestWallpaper = response.wallpapers[response.wallpapers.length - 1];
                        this.currentWallpaperOption = 'uploaded';
                        this.applyWallpaper(latestWallpaper.filename);
                        await unifiedConfig.set('selectedWallpaperChoice', 'uploaded');
                        await unifiedConfig.set('lastUploadedWallpaper', latestWallpaper.filename);
                        if (uploadedWallpaperNameSpan) {
                            uploadedWallpaperNameSpan.textContent = `現在の壁紙: ${latestWallpaper.name}`;
                        }
                    } else {
                        // アップロードされた壁紙がない場合は、強制的にデフォルトに戻す
                        if (defaultRadio) defaultRadio.checked = true;
                        this.currentWallpaperOption = 'default';
                        this.applyWallpaper('default');
                        await unifiedConfig.set('selectedWallpaperChoice', 'default');
                        await unifiedConfig.remove('lastUploadedWallpaper');
                        if (uploadedWallpaperNameSpan) uploadedWallpaperNameSpan.textContent = '';
                        this.addVoiceMessage('ニコ', 'アップロードされた壁紙がないため、デフォルト壁紙に戻したよ！');
                        this.startWallpaperTimer(); // デフォルト壁紙に戻るのでタイマーを開始
                    }
                }
            });
        }

        if (uploadBtn && uploadInput) {
            uploadBtn.addEventListener('click', () => {
                uploadInput.click();
            });

            uploadInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    const response = await this.uploadWallpaper(file);
                    if (response.success) {
                        // アップロード成功後、自動選択は行わず、loadWallpaperListでUIを更新
                        // loadWallpaperListがlocalStorageと現在の壁紙の状態に基づいて適切にラジオボタンを設定する
                        uploadedRadio.disabled = false; // アップロード済み壁紙が利用可能になったので有効化
                        this.stopWallpaperTimer(); // アップロード時はタイマーを停止 (loadWallpaperListで再開される可能性あり)
                    }
                }
            });
        }

        // 壁紙アニメーション切り替えボタン
        const wallpaperAnimationToggle = document.getElementById('wallpaper-animation-toggle');
        if (wallpaperAnimationToggle) {
            wallpaperAnimationToggle.addEventListener('change', async () => {
                await this.setWallpaperAnimationEnabled(wallpaperAnimationToggle.checked);
            });
        }
    }

    // 壁紙を適用
    async applyWallpaper() {
        const body = document.body;

        const currentHour = new Date().getHours();
        let baseFileName = '';

        // 時間帯に応じたベースファイル名決定
        if (currentHour >= 4 && currentHour < 6) {
            baseFileName = 'default_morning_evening';
        } else if (currentHour >= 6 && currentHour < 17) {
            baseFileName = 'default_noon';
        } else if (currentHour >= 17 && currentHour < 19) {
            baseFileName = 'default_morning_evening';
        } else if (currentHour >= 19 && currentHour <= 23) { // 19:00 - 23:59
            baseFileName = 'default_night';
        } else { // 0:00 - 3:59
            baseFileName = 'default_latenight';
        }

        let newWallpaperPath = null;

        if (this.currentWallpaperOption === 'default') {
            if (this.wallpaperAnimationEnabled) {
                newWallpaperPath = `assets/wallpapers/default/${baseFileName}.mp4`;
            } else {
                newWallpaperPath = `assets/wallpapers/default/${baseFileName}.jpg`;
            }
        } else if (this.currentWallpaperOption === 'uploaded') {
            // ユーザー壁紙の場合は、最新のアップロードされた壁紙のパスを取得する
            const response = await window.electronAPI.wallpaper.getWallpaperList();
            if (response.success && response.wallpapers.length > 0) {
                const latestWallpaper = response.wallpapers[response.wallpapers.length - 1];
                const userDataPathResponse = await window.electronAPI.getUserDataPath();
                if (userDataPathResponse.success) {
                    newWallpaperPath = `file://${userDataPathResponse.path}/wallpapers/user/${latestWallpaper.filename}`;
                }
            } else {
                // アップロードされた壁紙がない場合はデフォルトに戻す（再帰呼び出しを防ぐため直接処理）
                this.currentWallpaperOption = 'default';
                await unifiedConfig.set('wallpaperOption', 'default');
                document.getElementById('wallpaper-default-radio').checked = true;
                this.addVoiceMessage('ニコ', 'アップロードされた壁紙がないため、デフォルト壁紙に戻したよ！');
                // ここでnewWallpaperPathを更新し、下の比較ロジックで再適用されるようにする
                if (this.wallpaperAnimationEnabled) {
                    newWallpaperPath = `assets/wallpapers/default/${baseFileName}.mp4`;
                } else {
                    newWallpaperPath = `assets/wallpapers/default/${baseFileName}.jpg`;
                }
            }
        }

        // 現在適用されている壁紙と新しい壁紙のパスが同じなら何もしない
        if (newWallpaperPath === this.currentAppliedWallpaperFileName) {
            WallpaperSystem_debugLog(`現在の壁紙は既に適用済みです: ${newWallpaperPath}`);
            return;
        }

        // 異なる場合は、既存の要素をクリアして新しい壁紙を適用
        // 既存の動画要素をクリア
        const existingVideo = document.getElementById('wallpaper-video');
        if (existingVideo) {
            existingVideo.remove();
            WallpaperSystem_debugLog('既存の動画壁紙を削除しました。');
        }
        // 既存の静止画背景をクリア
        body.style.background = '';
        body.style.backgroundAttachment = '';

        if (this.currentWallpaperOption === 'default') {
            if (this.wallpaperAnimationEnabled) {
                // 動画壁紙を適用
                const video = document.createElement('video');
                video.id = 'wallpaper-video';
                video.src = newWallpaperPath; // newWallpaperPathを使用
                video.loop = true;
                video.autoplay = true;
                video.muted = true;
                video.playsInline = true; // iOSなどで自動再生を有効にするため

                video.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    object-fit: cover;
                    z-index: -1;
                    margin: 0;
                    padding: 0;
                `;
                body.prepend(video); // bodyの最初に挿入
                WallpaperSystem_debugLog(`動画壁紙を適用: ${newWallpaperPath}`);
            } else {
                // 静止画壁紙を適用
                body.style.background = `url('${newWallpaperPath}') center/cover fixed`; // newWallpaperPathを使用
                body.style.backgroundAttachment = 'fixed';
                WallpaperSystem_debugLog(`静止画壁紙を適用: ${newWallpaperPath}`);
            }
            this.startWallpaperTimer(); // デフォルト壁紙なのでタイマーを開始
        } else if (this.currentWallpaperOption === 'uploaded') {
            // ユーザー壁紙
            this.stopWallpaperTimer(); // アップロード済み壁紙なのでタイマーを停止

            try {
                body.style.background = `url('${newWallpaperPath}') center/cover fixed`; // newWallpaperPathを使用
                body.style.backgroundAttachment = 'fixed';
                WallpaperSystem_debugLog(`アップロード済み壁紙を適用: ${newWallpaperPath}`);
            } catch (error) {
                WallpaperSystem_debugError('壁紙適用エラー（ユーザー壁紙）:', error);
                this.currentWallpaperOption = 'default';
                await unifiedConfig.set('wallpaperOption', 'default');
                document.getElementById('wallpaper-default-radio').checked = true;
                this.applyWallpaper(); // フォールバック
                this.addVoiceMessage('ニコ', 'アップロードされた壁紙の読み込み中にエラーが発生したため、デフォルト壁紙に戻したよ！');
            }
        }

        // 現在適用されている壁紙のファイル名を更新
        this.currentAppliedWallpaperFileName = newWallpaperPath;
    }

    // 壁紙をアップロード
    async uploadWallpaper(file) {
        try {
            // ファイルサイズチェック（5MB制限）
            if (file.size > 5 * 1024 * 1024) {
                alert('ファイルサイズが大きすぎます（5MB以下にしてください）');
                return { success: false, error: 'ファイルサイズが大きすぎます' };
            }

            // ファイル形式チェック
            const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
            if (!allowedTypes.includes(file.type)) {
                alert('対応していないファイル形式です（PNG、JPEG、GIF、WebPのみ）');
                return { success: false, error: '対応していないファイル形式です' };
            }

            // ★ 既存のユーザー壁紙をすべて削除
            const existingWallpapersResponse = await window.electronAPI.wallpaper.getWallpaperList();
            if (existingWallpapersResponse.success && existingWallpapersResponse.wallpapers.length > 0) {
                for (const wp of existingWallpapersResponse.wallpapers) {
                    const deleteResult = await window.electronAPI.wallpaper.deleteWallpaper(wp.filename);
                    if (!deleteResult.success) {
                        WallpaperSystem_debugError(`既存の壁紙 ${wp.filename} の削除に失敗しました:`, deleteResult.error);
                    }
                }
                WallpaperSystem_debugLog('既存のユーザー壁紙をすべて削除しました。');
            }

            // ファイルの内容をArrayBufferとして読み込む
            const reader = new FileReader();
            const fileDataPromise = new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result);
                reader.onerror = error => reject(error);
                reader.readAsArrayBuffer(file);
            });
            const arrayBuffer = await fileDataPromise;

            // IPCで送信するために必要なデータのみを抽出
            const serializableFileData = {
                name: file.name,
                type: file.type,
                data: Array.from(new Uint8Array(arrayBuffer)) // ArrayBufferをArrayに変換して送信
            };

            const response = await window.electronAPI.wallpaper.uploadWallpaper(serializableFileData);
            if (response.success) {
                // 成功メッセージ
                this.addVoiceMessage('ニコ', '壁紙がアップロードできたよ〜！✨');

                // 壁紙リストを再読み込みし、UIの状態を更新
                // 自動選択は行わず、loadWallpaperListで既存のlocalStorage設定に基づいて状態を決定させる
                await this.loadWallpaperList();

                return { success: true, filename: response.filename, name: response.name };
            } else {
                alert('壁紙のアップロードに失敗しました');
                return { success: false, error: response.error || '不明なエラー' };
            }
        } catch (error) {
            WallpaperSystem_debugError('壁紙アップロードエラー:', error);
            alert('壁紙のアップロードに失敗しました');
            return { success: false, error: error.message };
        }
    }

    // 壁紙タイマーを開始
    startWallpaperTimer() {
        if (this.wallpaperTimer) {
            clearInterval(this.wallpaperTimer);
        }
        // 1分ごとに壁紙をチェックして適用（デバッグ用、本番は1時間ごとなど調整可能）
        this.wallpaperTimer = setInterval(() => {
            const defaultRadio = document.getElementById('wallpaper-default-radio');
            if (defaultRadio && defaultRadio.checked) {
                WallpaperSystem_debugLog('Wallpaper timer triggered: Applying default wallpaper.');
                this.applyWallpaper();
            }
        }, 60 * 1000); // 1分ごと
        WallpaperSystem_debugLog('Wallpaper timer started.');
    }

    // 壁紙タイマーを停止
    stopWallpaperTimer() {
        if (this.wallpaperTimer) {
            clearInterval(this.wallpaperTimer);
            this.wallpaperTimer = null;
            WallpaperSystem_debugLog('Wallpaper timer stopped.');
        }
    }

    // 壁紙アニメーション設定
    async setWallpaperAnimationEnabled(enabled) {
        this.wallpaperAnimationEnabled = enabled;
        await unifiedConfig.set('wallpaperAnimationEnabled', enabled);
        // 現在の壁紙に変更を反映
        if (this.currentWallpaperOption === 'default') {
            this.applyWallpaper();
        }
    }

    // 現在の壁紙設定を取得
    getCurrentWallpaperOption() {
        return this.currentWallpaperOption;
    }

    // 壁紙設定を変更
    setCurrentWallpaperOption(option) {
        this.currentWallpaperOption = option;
    }
}

// グローバルに公開
window.WallpaperSystem = WallpaperSystem;