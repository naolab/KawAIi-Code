/**
 * キャラクター表示管理モジュール
 * - 表示モードの管理（シングル/アイコン/マルチ）
 * - キャラクター選択の管理
 * - 設定の保存・読み込み
 */

class CharacterDisplayManager {
    constructor() {
        this.storageKey = 'kawaii-code-character-display-settings';

        // デフォルト設定
        this.defaultSettings = {
            mode: 'single', // 'single' | 'icon' | 'multi'
            singleCharacter: 'char_mona', // シングルモード用
            iconCharacters: ['char_mona'], // アイコンモード用
            multiCharacters: ['char_mona'] // マルチモード用
        };

        this.currentSettings = { ...this.defaultSettings };

        // DOM要素への参照
        this.elements = {
            // ラジオボタン
            modeSingle: null,
            modeIcon: null,
            modeMulti: null,

            // 設定エリア
            singleSettings: null,
            iconSettings: null,
            multiSettings: null,

            // セレクト・チェックボックス
            singleSelect: null,
            iconCheckboxes: null,
            multiCheckboxes: null,

            // 保存ボタン
            saveBtn: null,
            saveStatus: null
        };

        this.iframes = new Map(); // charId -> iframe elements for multi/single mode
        this.viewerReadyStates = new Map(); // charId -> promise resolve function
        
        this.init();
    }

    async init() {
        // DOM要素を取得
        this.setupDOMReferences();

        // ConfigManagerの準備を待機
        const configManager = window.terminalApp?.configManager;
        if (!configManager) {
            console.warn('[CharacterDisplayManager] ConfigManager not ready, retrying in 500ms...');
            setTimeout(() => this.init(), 500);
            return;
        }

        // 設定を読み込み
        await this.loadSettings();

        // イベントリスナーを設定
        this.setupEventListeners();

        // キャラクターリストを読み込み
        await this.loadCharacterLists();

        // 現在の設定を反映
        this.applySettings();

        // VRMビューワーが準備完了するまで待つ（1秒に短縮し、各要素でもチェックを走らせる）
        setTimeout(async () => {
            // 起動時に現在の設定をVRMビューワーに適用
            await this.notifyVRMViewer();
        }, 1000);

        console.log('✅ CharacterDisplayManager initialized');
    }

    setupDOMReferences() {
        // ラジオボタン
        this.elements.modeSingle = document.getElementById('display-mode-single');
        this.elements.modeIcon = document.getElementById('display-mode-icon');
        this.elements.modeMulti = document.getElementById('display-mode-multi');

        // 保存ボタン
        this.elements.saveBtn = document.getElementById('save-display-settings-btn');
        this.elements.saveStatus = document.getElementById('display-settings-save-status');

        // キャラクター切り替えボタン (オーバーレイUI)
        this.elements.charChangeBtn = document.getElementById('character-change-btn');
        this.elements.charIcon = document.getElementById('current-char-icon');

        // アイコン表示エリア
        this.elements.iconDisplayArea = document.getElementById('icon-display-area');
        
        // メインのVRM iframe
        const mainIframe = document.getElementById('vrm-iframe');
        this.elements.vrmIframe = mainIframe;
        if (mainIframe) {
            // シングルモード用のiframeとしてあらかじめ追加しておく
            // ※IDが確定しない初期化時はとりあえずnullキーまたは特別なキーで管理するか、
            // applySettings内で紐付け直す。
        }
    }

    setupEventListeners() {
        // ラジオボタンの変更イベント
        [this.elements.modeSingle, this.elements.modeIcon, this.elements.modeMulti].forEach(radio => {
            if (radio) {
                radio.addEventListener('change', () => this.onModeChange());
            }
        });

        // 保存ボタン
        if (this.elements.saveBtn) {
            this.elements.saveBtn.addEventListener('click', () => this.saveSettings());
        }

        // キャラクター切り替えボタン
        if (this.elements.charChangeBtn) {
            this.elements.charChangeBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // バブリング防止
                this.showCharacterSelectPopup();
            });
        }

        // 画面クリックでポップアップを閉じる
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.character-select-overlay') && 
                !e.target.closest('.character-change-btn')) {
                this.closeCharacterSelectPopup();
            }
        });

        // VRMビューワー（iframe）からの準備完了通知を待機
        window.addEventListener('message', (event) => {
            if (event.data?.type === 'vrm-viewer-ready') {
                const charId = event.data.charId || 'main';
                console.log(`[CDM] Received vrm-viewer-ready from ${charId}`);
                
                // 待機中のPromiseを解決
                if (this.viewerReadyStates.has(charId)) {
                    const resolve = this.viewerReadyStates.get(charId);
                    resolve(true);
                    this.viewerReadyStates.delete(charId);
                }
            }
        });
    }

    /**
     * キャラクターリストの取得（ポップアップ用）
     */
    async loadCharacterLists() {
        // 現在はポップアップ表示時に動的に生成するため、ここでは何もしない、
        // もしくは将来のキャッシュ用に残しておく
        const configManager = window.terminalApp?.configManager;
        if (configManager) {
            configManager.getCharacters();
        }
    }


    onModeChange() {
        // 選択されたモードを取得
        let selectedMode = 'single';
        if (this.elements.modeIcon?.checked) selectedMode = 'icon';
        if (this.elements.modeMulti?.checked) selectedMode = 'multi';

        // 内部状態を更新
        this.currentSettings.mode = selectedMode;

        // VRM / アイコン表示エリアの切り替え
        if (this.elements.vrmIframe) {
            this.elements.vrmIframe.style.display = selectedMode === 'single' ? 'block' : 'none';
        }

        if (this.elements.iconDisplayArea) {
            // アイコンモードまたはマルチモードの時に表示（両方 grid を使う）
            const isGridMode = selectedMode === 'icon' || selectedMode === 'multi';
            this.elements.iconDisplayArea.style.display = isGridMode ? 'grid' : 'none';
            
            if (selectedMode === 'icon') {
                this.updateIconDisplay();
            } else if (selectedMode === 'multi') {
                this.updateMultiDisplay();
            }
        }

        // キャラクター切り替えボタンの表示制御
        if (this.elements.charChangeBtn) {
            this.elements.charChangeBtn.style.display = 'flex';
        }

        // 描画状態の同期（一時停止・再開）
        this.syncAllRenderStates();

        // モード変更を通知
        this.notifyVRMViewer();
    }

    async loadSettings() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                this.currentSettings = { ...this.defaultSettings, ...JSON.parse(saved) };
                console.log('Loaded character display settings:', this.currentSettings);
            }
        } catch (error) {
            console.error('Failed to load character display settings:', error);
        }
    }

    async saveSettings() {
        try {
            // 現在のUIの状態から設定を取得
            // ※UI操作からの保存時は、現在値が反映されていることを前提とする
            // 設定画面が開かれていない場合は、内部stateを優先する
            
            const settings = { ...this.currentSettings };

            const settingsModal = document.getElementById('settings-modal');
            if (settingsModal && settingsModal.style.display !== 'none') {
                settings.mode = this.getSelectedMode();
                // キャラクター選択はポップアップ側で currentSettings に直接反映されているため
                // ここで DOM から取得し直す必要はない
            }

            // LocalStorageに保存
            localStorage.setItem(this.storageKey, JSON.stringify(settings));
            this.currentSettings = settings;

            // 保存完了メッセージを表示
            this.showSaveStatus();

            // VRMビューワーに通知
            this.notifyVRMViewer();

            console.log('Saved character display settings:', settings);
        } catch (error) {
            console.error('Failed to save character display settings:', error);
            // alert('設定の保存に失敗しました'); // 頻繁に出るとうざいので抑制
        }
    }

    getSelectedMode() {
        if (this.elements.modeIcon?.checked) return 'icon';
        if (this.elements.modeMulti?.checked) return 'multi';
        return 'single';
    }


    applySettings() {
        // ラジオボタンの選択状態を設定
        if (this.currentSettings.mode === 'single' && this.elements.modeSingle) {
            this.elements.modeSingle.checked = true;
        } else if (this.currentSettings.mode === 'icon' && this.elements.modeIcon) {
            this.elements.modeIcon.checked = true;
        } else if (this.currentSettings.mode === 'multi' && this.elements.modeMulti) {
            this.elements.modeMulti.checked = true;
        }


        // 設定エリアの表示を更新
        this.onModeChange();

        // アイコンを更新
        this.updateCharacterIcon();
        this.updateIconDisplay();
    }

    showSaveStatus() {
        if (!this.elements.saveStatus) return;

        this.elements.saveStatus.style.display = 'inline';
        setTimeout(() => {
            this.elements.saveStatus.style.display = 'none';
        }, 2000);
    }

    async notifyVRMViewer() {
        // iframe マッピングを更新
        this.updateIframeMap();

        // モード別の通知
        if (this.currentSettings.mode === 'single') {
            await this.loadAndSendSingleCharacter();
        } else if (this.currentSettings.mode === 'multi') {
            await this.loadAndSendMultiCharacters();
        } else {
            // アイコンモードなどの場合
            this.postToAllViewers({
                type: 'displaySettingsChanged',
                settings: this.currentSettings
            });
        }

        console.log(`Notified VRM viewer(s) of display settings change (Mode: ${this.currentSettings.mode})`);
    }

    /**
     * 現在のモードと設定に基づいて iframe マッピングを最新にする
     */
    updateIframeMap() {
        this.iframes.clear();

        if (this.currentSettings.mode === 'single') {
            const charId = this.currentSettings.singleCharacter;
            if (charId && this.elements.vrmIframe) {
                this.iframes.set(charId, this.elements.vrmIframe);
            }
        } else if (this.currentSettings.mode === 'multi') {
            const charIds = this.currentSettings.multiCharacters || [];
            charIds.forEach(id => {
                const iframe = document.getElementById(`vrm-iframe-${id}`);
                if (iframe) {
                    this.iframes.set(id, iframe);
                }
            });
        }
    }

    /**
     * 全ビューワーに対して描画の一時停止/再開を同期
     */
    syncAllRenderStates() {
        const mode = this.currentSettings.mode;

        // 全てのiframeに対して一旦停止または再開を判断
        // 基本的に display:none のものは停止させるのが安全
        
        // 1. メインiframe (Singleキャラ)
        if (this.elements.vrmIframe) {
            const shouldRun = (mode === 'single');
            this.elements.vrmIframe.contentWindow?.postMessage({
                type: shouldRun ? 'resumeRender' : 'suspendRender'
            }, '*');
        }

        // 2. マルチモードの各iframe
        const multiIds = this.currentSettings.multiCharacters || [];
        multiIds.forEach(id => {
            const iframe = document.getElementById(`vrm-iframe-${id}`);
            if (iframe) {
                const shouldRun = (mode === 'multi');
                iframe.contentWindow?.postMessage({
                    type: shouldRun ? 'resumeRender' : 'suspendRender'
                }, '*');
            }
        });
    }

    /**
     * 特定のキャラクターのビューワーにメッセージ送信
     */
    postToViewerById(charId, message) {
        const iframe = this.iframes.get(charId);
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage(message, '*');
            return true;
        }
        return false;
    }

    /**
     * すべての（生きている）ビューワーにメッセージ送信
     */
    postToAllViewers(message) {
        // メインiframe
        if (this.elements.vrmIframe && this.elements.vrmIframe.contentWindow) {
            this.elements.vrmIframe.contentWindow.postMessage(message, '*');
        }

        // マルチ用iframes
        const multiIds = this.currentSettings.multiCharacters || [];
        multiIds.forEach(id => {
            const iframe = document.getElementById(`vrm-iframe-${id}`);
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage(message, '*');
            }
        });
    }

    async loadAndSendSingleCharacter() {
        try {
            const characterId = this.currentSettings.singleCharacter;
            if (!characterId) return;

            // IDに基づいてロードと送信を行う（共通化されたロジックを使用）
            await this.loadAndSendCharacterById(characterId);
            
            // アイコンのみ個別に更新
            this.updateCharacterIcon();
            
        } catch (error) {
            console.error('Error in loadAndSendSingleCharacter:', error);
            this.sendLoadDefaultVRM();
        }
    }

    sendLoadDefaultVRM() {
        const iframe = document.getElementById('vrm-iframe');
        if (!iframe || !iframe.contentWindow) return;

        iframe.contentWindow.postMessage({
            type: 'loadDefaultVRM'
        }, '*');

        console.log('Sent loadDefaultVRM message');
    }

    /**
     * 現在のキャラクターのアイコンを更新
     */
    updateCharacterIcon() {
        if (!this.elements.charIcon) return;

        const configManager = window.terminalApp?.configManager;
        if (!configManager) return;

        const charId = this.currentSettings.singleCharacter;
        const character = configManager.getCharacterById(charId);

        if (character) {
            // char.icon (優先) または char.iconPath を使用
            const iconUrl = character.icon || character.iconPath || '../assets/icons/new-app-icon.png';
            this.elements.charIcon.src = iconUrl;
        } else {
            // デフォルトアイコン
            this.elements.charIcon.src = '../assets/icons/new-app-icon.png';
        }
    }
    /**
     * アイコン表示エリアを更新
     */
    updateIconDisplay() {
        if (!this.elements.iconDisplayArea || this.currentSettings.mode !== 'icon') return;

        const configManager = window.terminalApp?.configManager;
        if (!configManager) return;

        // 既存のアイコンをクリア
        this.elements.iconDisplayArea.innerHTML = '';

        // 設定されたすべてのキャラクターを表示
        const charIds = this.currentSettings.iconCharacters || [];
        
        // カード数に応じたレイアウト用のdata属性を設定
        this.elements.iconDisplayArea.setAttribute('data-count', Math.min(charIds.length, 4).toString());
        
        charIds.forEach(id => {
            const char = configManager.getCharacterById(id);
            if (!char) return;

            const node = document.createElement('div');
            node.className = 'icon-character-node';
            node.id = `icon-node-${id}`;

            const circle = document.createElement('div');
            circle.className = 'icon-character-circle';
            circle.id = `icon-circle-${id}`;

            const img = document.createElement('img');
            img.src = char.icon || char.iconPath || '../assets/icons/new-app-icon.png';
            circle.appendChild(img);

            node.appendChild(circle);

            // キャラクター名を追加 (Badge style)
            const nameLabel = document.createElement('div');
            nameLabel.className = 'icon-character-name';
            nameLabel.textContent = char.name || 'Unknown';
            node.appendChild(nameLabel);

            this.elements.iconDisplayArea.appendChild(node);
        });
    }

    /**
     * マルチVRM表示エリアを更新
     */
    updateMultiDisplay() {
        if (!this.elements.iconDisplayArea || this.currentSettings.mode !== 'multi') return;

        const configManager = window.terminalApp?.configManager;
        if (!configManager) return;

        // 既存のコンテンツをクリア
        this.elements.iconDisplayArea.innerHTML = '';

        // 設定されたすべてのキャラクターを表示
        const charIds = this.currentSettings.multiCharacters || [];
        
        // カード数に応じたレイアウト用のdata属性を設定
        this.elements.iconDisplayArea.setAttribute('data-count', Math.min(charIds.length, 4).toString());
        
        charIds.forEach(id => {
            const char = configManager.getCharacterById(id);
            if (!char) return;

            const node = document.createElement('div');
            node.className = 'vrm-character-node';
            node.id = `vrm-node-${id}`;

            // VRM Viewer iframeを追加
            const iframe = document.createElement('iframe');
            iframe.className = 'vrm-character-iframe';
            iframe.id = `vrm-iframe-${id}`;
            // パラメータとしてキャラクターIDを付与
            iframe.src = `../ai-kawaii-nextjs/out/index.html?charId=${id}`;
            
            node.appendChild(iframe);

            // キャラクター名を追加 (Badge style)
            const nameLabel = document.createElement('div');
            nameLabel.className = 'icon-character-name'; // アイコンモードと同じスタイルを使用
            nameLabel.textContent = char.name || 'Unknown';
            node.appendChild(nameLabel);

            this.elements.iconDisplayArea.appendChild(node);
        });

        // iframe生成後にマッピングを更新し、レンダリング状態を同期
        this.updateIframeMap();
        this.syncAllRenderStates();
    }

    async loadAndSendMultiCharacters() {
        const charIds = this.currentSettings.multiCharacters || [];
        // 並列でロードを開始して効率化
        await Promise.all(charIds.map(id => this.loadAndSendCharacterById(id)));
    }

    async loadAndSendCharacterById(charId) {
        try {
            console.log(`[CDM] Starting loadAndSendCharacterById for ${charId}`);
            const configManager = window.terminalApp?.configManager;
            if (!configManager) return;

            const character = configManager.getCharacterById(charId);
            if (!character) {
                console.error(`[CDM] Character not found for ID: ${charId}`);
                return;
            }

            const vrmPath = character.vrmPath || character.model?.path;
            if (!vrmPath) {
                console.warn(`[CDM] No VRM path for character: ${charId}`);
                return;
            }

            console.log(`[CDM] Loading VRM file from: ${vrmPath}`);
            const result = await window.electronAPI.vrm.loadFile(vrmPath);
            if (!result.success) {
                console.error(`[CDM] Failed to load VRM file: ${result.error}`);
                return;
            }

            // iframeが読み込まれるのを待つ
            const iframe = this.iframes.get(charId);
            if (iframe) {
                console.log(`[CDM] Waiting for viewer-ready message from ${charId}...`);
                
                // ビューワーに対して「準備できたか？」と問いかける（再送を促すHandshake）
                if (iframe.contentWindow) {
                    iframe.contentWindow.postMessage({ type: 'checkReady' }, '*');
                }

                // Next.jsのハイドレーション（Ready通知）を待機（最大8秒）
                const isReady = await new Promise(resolve => {
                    // シングルモードの場合は 'main'、マルチモードの場合は charId で待機
                    const waitId = (this.currentSettings.mode === 'single') ? 'main' : charId; 
                    this.viewerReadyStates.set(waitId, resolve);
                    
                    setTimeout(() => {
                        if (this.viewerReadyStates.has(waitId)) {
                            this.viewerReadyStates.delete(waitId);
                            resolve(false);
                        }
                    }, 8000);
                });

                if (!isReady) {
                    console.warn(`[CDM] Viewer for character ${charId} timed out or no ready message, attempting to send anyway.`);
                } else {
                    console.log(`[CDM] Viewer ${charId} is ready.`);
                }
            }

            console.log(`[CDM] Sending loadVRM message to ${charId}`);
            const sent = this.postToViewerById(charId, {
                type: 'loadVRM',
                fileData: result.data,
                fileName: result.filename || vrmPath
            });

            if (!sent) {
                console.error(`[CDM] Failed to send loadVRM message to ${charId}`);
            }
        } catch (error) {
            console.error('[CDM] Error in loadAndSendCharacterById:', error);
        }
    }

    /**
     * 喋っている状態をセット
     */
    setSpeakingState(charId, isSpeaking) {
        // アイコンモード用のハイライト
        const iconCircle = document.getElementById(`icon-circle-${charId}`);
        if (iconCircle) {
            if (isSpeaking) iconCircle.classList.add('is-speaking');
            else iconCircle.classList.remove('is-speaking');
        }

        // マルチモード用のハイライト
        const vrmNode = document.getElementById(`vrm-node-${charId}`);
        if (vrmNode) {
            if (isSpeaking) vrmNode.classList.add('is-speaking');
            else vrmNode.classList.remove('is-speaking');
        }

        // シングルモードのメインボタン（シングルキャラ or アイコンモードでもメインに設定されているキャラ）
        // ユーザーの利便性のため、現在メインボタンが担当しているキャラであればモードに関わらず光らせる
        const isMainSpeaker = (this.currentSettings.mode === 'single' && charId === this.currentSettings.singleCharacter);
        
        if (isMainSpeaker) {
            const btn = document.getElementById('character-change-btn');
            if (btn) {
                if (isSpeaking) {
                    btn.classList.add('is-speaking');
                } else {
                    btn.classList.remove('is-speaking');
                }
            }
        }
    }

    /**
     * キャラクター選択ポップアップを表示
     */
    showCharacterSelectPopup() {
        // 既に表示されていたら閉じる
        if (document.querySelector('.character-select-overlay')) {
            this.closeCharacterSelectPopup();
            return;
        }

        const configManager = window.terminalApp?.configManager;
        if (!configManager) return;

        const characters = configManager.getCharacters();
        if (!characters || characters.length === 0) return;

        // ポップアップコンテナ作成
        const popup = document.createElement('div');
        popup.className = 'character-select-overlay';

        // キャラクターリスト生成
        characters.forEach(char => {
            const item = document.createElement('div');
            item.className = 'character-select-item';
            
            // アクティブ状態の判定
            let isActive = false;
            if (this.currentSettings.mode === 'single') {
                isActive = (char.id === this.currentSettings.singleCharacter);
            } else if (this.currentSettings.mode === 'icon') {
                isActive = (this.currentSettings.iconCharacters?.includes(char.id));
            } else if (this.currentSettings.mode === 'multi') {
                isActive = (this.currentSettings.multiCharacters?.includes(char.id));
            }

            if (isActive) {
                item.classList.add('active');
            }

            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleCharacterSelect(char.id);
            });

            // アイコン
            const icon = document.createElement('img');
            icon.className = 'character-select-icon';
            icon.src = char.icon || char.iconPath || '../assets/icons/new-app-icon.png';
            item.appendChild(icon);

            // 情報
            const info = document.createElement('div');
            info.className = 'character-select-info';
            
            const name = document.createElement('div');
            name.className = 'character-select-name';
            name.textContent = char.name || char.id;
            info.appendChild(name);

            item.appendChild(info);
            popup.appendChild(item);
        });

        // character-section 内に追加（相対位置用）
        const charSection = document.querySelector('.character-main');
        if (charSection) {
            charSection.appendChild(popup);
        }
    }

    /**
     * キャラクター選択ポップアップを閉じる
     */
    closeCharacterSelectPopup() {
        const popup = document.querySelector('.character-select-overlay');
        if (popup) {
            popup.remove();
        }
    }

    /**
     * キャラクター選択時の処理
     */
    async handleCharacterSelect(charId) {
        if (this.currentSettings.mode === 'single') {
            // シングルモード：入れ替え
            this.currentSettings.singleCharacter = charId;
            this.closeCharacterSelectPopup();
        } else if (this.currentSettings.mode === 'icon') {
            // アイコンモード：トグル（追加・削除）
            if (!this.currentSettings.iconCharacters) {
                this.currentSettings.iconCharacters = [];
            }
            const index = this.currentSettings.iconCharacters.indexOf(charId);
            if (index > -1) {
                // 既に選択されていれば削除（ただし最低1体は残す）
                if (this.currentSettings.iconCharacters.length > 1) {
                    this.currentSettings.iconCharacters.splice(index, 1);
                }
            } else {
                // 最大4体まで
                if (this.currentSettings.iconCharacters.length < 4) {
                    this.currentSettings.iconCharacters.push(charId);
                } else {
                    alert('表示できるのは最大4体までです');
                }
            }
            // ポップアップを閉じずに選択状態のみ更新
            this.updateCharacterSelectPopupActiveStates();
        } else if (this.currentSettings.mode === 'multi') {
            // マルチモード：トグル（追加・削除）
            if (!this.currentSettings.multiCharacters) {
                this.currentSettings.multiCharacters = [];
            }
            const index = this.currentSettings.multiCharacters.indexOf(charId);
            if (index > -1) {
                // 既に選択されていれば削除（ただし最低1体は残す）
                if (this.currentSettings.multiCharacters.length > 1) {
                    this.currentSettings.multiCharacters.splice(index, 1);
                }
            } else {
                // 最大4体まで
                if (this.currentSettings.multiCharacters.length < 4) {
                    this.currentSettings.multiCharacters.push(charId);
                } else {
                    alert('表示できるのは最大4体までです');
                }
            }
            // ポップアップを閉じずに選択状態のみ更新
            this.updateCharacterSelectPopupActiveStates();
        }
        
        // 保存と反映
        this.saveSettings();
        
        // 表示の更新を実行
        this.updateCharacterIcon();
        if (this.currentSettings.mode === 'icon') {
            this.updateIconDisplay();
        } else if (this.currentSettings.mode === 'multi') {
            this.updateMultiDisplay();
        }

        // 重要: 設定変更をVRMビューワーに通知してVRMを再ロードさせる
        await this.notifyVRMViewer();
    }

    /**
     * ポップアップ内の選択状態（activeクラス）のみを更新
     */
    updateCharacterSelectPopupActiveStates() {
        const popup = document.querySelector('.character-select-overlay');
        if (!popup) return;

        const configManager = window.terminalApp?.configManager;
        if (!configManager) return;
        
        const characters = configManager.getCharacters();
        const items = popup.querySelectorAll('.character-select-item');

        items.forEach((item, index) => {
            const char = characters[index];
            if (!char) return;

            let isActive = false;
            if (this.currentSettings.mode === 'single') {
                isActive = (char.id === this.currentSettings.singleCharacter);
            } else if (this.currentSettings.mode === 'icon') {
                isActive = (this.currentSettings.iconCharacters?.includes(char.id));
            } else if (this.currentSettings.mode === 'multi') {
                isActive = (this.currentSettings.multiCharacters?.includes(char.id));
            }

            if (isActive) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    // 現在の設定を取得（外部から参照用）
    getSettings() {
        return { ...this.currentSettings };
    }
}

// グローバルに公開
window.CharacterDisplayManager = CharacterDisplayManager;
