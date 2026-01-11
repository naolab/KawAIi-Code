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

        // VRMビューワーが準備完了するまで少し待つ
        setTimeout(async () => {
            // 起動時に現在の設定をVRMビューワーに適用
            await this.notifyVRMViewer();
        }, 2000);

        console.log('✅ CharacterDisplayManager initialized');
    }

    setupDOMReferences() {
        // ラジオボタン
        this.elements.modeSingle = document.getElementById('display-mode-single');
        this.elements.modeIcon = document.getElementById('display-mode-icon');
        this.elements.modeMulti = document.getElementById('display-mode-multi');

        // 設定エリア
        this.elements.singleSettings = document.getElementById('single-mode-settings');
        this.elements.iconSettings = document.getElementById('icon-mode-settings');
        this.elements.multiSettings = document.getElementById('multi-mode-settings');

        // セレクト・チェックボックスコンテナ
        this.elements.singleSelect = document.getElementById('single-character-select');
        this.elements.iconCheckboxes = document.getElementById('icon-character-checkboxes');
        this.elements.multiCheckboxes = document.getElementById('multi-character-checkboxes');

        // 保存ボタン
        this.elements.saveBtn = document.getElementById('save-display-settings-btn');
        this.elements.saveStatus = document.getElementById('display-settings-save-status');

        // キャラクター切り替えボタン (オーバーレイUI)
        this.elements.charChangeBtn = document.getElementById('character-change-btn');
        this.elements.charIcon = document.getElementById('current-char-icon');

        // アイコン表示エリア
        this.elements.iconDisplayArea = document.getElementById('icon-display-area');
        this.elements.vrmIframe = document.getElementById('vrm-iframe');
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
    }

    async loadCharacterLists() {
        try {
            // ConfigManagerからキャラクターリストを取得
            const configManager = window.terminalApp?.configManager;
            if (!configManager) {
                console.warn('ConfigManager not found, using default character');
                return;
            }

            const characters = configManager.getCharacters();

            // シングルモード用のセレクトを生成
            this.populateSingleSelect(characters);

            // アイコンモード用のチェックボックスを生成
            this.populateCheckboxes(this.elements.iconCheckboxes, characters, 'icon');

            // マルチモード用のチェックボックスを生成
            this.populateCheckboxes(this.elements.multiCheckboxes, characters, 'multi');

        } catch (error) {
            console.error('Failed to load character lists:', error);
        }
    }

    populateSingleSelect(characters) {
        if (!this.elements.singleSelect) return;

        // 既存のオプションをクリア
        this.elements.singleSelect.innerHTML = '';

        // キャラクターリストからオプションを生成
        characters.forEach(char => {
            const option = document.createElement('option');
            option.value = char.id;
            option.textContent = char.name || char.id;
            this.elements.singleSelect.appendChild(option);
        });

        // 現在の設定を選択状態にする
        this.elements.singleSelect.value = this.currentSettings.singleCharacter;
    }

    populateCheckboxes(container, characters, mode) {
        if (!container) return;

        // 既存のチェックボックスをクリア
        container.innerHTML = '';

        // キャラクターリストからチェックボックスを生成
        characters.forEach(char => {
            const label = document.createElement('label');
            label.className = 'radio-label';
            label.style.cursor = 'pointer';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = char.id;
            checkbox.dataset.mode = mode;

            // 現在の設定でチェック状態を設定
            const selectedChars = mode === 'icon'
                ? this.currentSettings.iconCharacters
                : this.currentSettings.multiCharacters;
            checkbox.checked = selectedChars.includes(char.id);

            // マルチモードの場合は最大4体制限
            if (mode === 'multi') {
                checkbox.addEventListener('change', (e) => this.onMultiCheckboxChange(e));
            }

            const span = document.createElement('span');
            span.textContent = char.name || char.id;

            label.appendChild(checkbox);
            label.appendChild(span);
            container.appendChild(label);
        });
    }

    onMultiCheckboxChange(event) {
        // マルチモードの場合、最大4体までに制限
        const checkboxes = this.elements.multiCheckboxes.querySelectorAll('input[type="checkbox"]');
        const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;

        if (checkedCount > 4) {
            event.target.checked = false;
            alert('マルチキャラモードは最大4体までです');
        }
    }

    onModeChange() {
        // 選択されたモードを取得
        let selectedMode = 'single';
        if (this.elements.modeIcon?.checked) selectedMode = 'icon';
        if (this.elements.modeMulti?.checked) selectedMode = 'multi';

        // 内部状態を更新（重要：他関数の動作の基準になるため）
        this.currentSettings.mode = selectedMode;

        // 設定エリアの表示・非表示を切り替え
        if (this.elements.singleSettings) this.elements.singleSettings.style.display = selectedMode === 'single' ? 'block' : 'none';
        if (this.elements.iconSettings) this.elements.iconSettings.style.display = selectedMode === 'icon' ? 'block' : 'none';
        if (this.elements.multiSettings) this.elements.multiSettings.style.display = selectedMode === 'multi' ? 'block' : 'none';

        // VRM / アイコン表示エリアの切り替え
        if (this.elements.vrmIframe) {
            this.elements.vrmIframe.style.display = selectedMode === 'single' ? 'block' : 'none';
        }
        if (this.elements.iconDisplayArea) {
            // グリッドレイアウトはCSSで制御するため、displayはgridに設定
            this.elements.iconDisplayArea.style.display = selectedMode === 'icon' ? 'grid' : 'none';
            if (selectedMode === 'icon') {
                this.updateIconDisplay();
            }
        }

        // キャラクター切り替えボタンの表示制御（シングル/アイコンモードで表示）
        if (this.elements.charChangeBtn) {
            this.elements.charChangeBtn.style.display = (selectedMode === 'single' || selectedMode === 'icon') ? 'flex' : 'none';
        }

        // モード変更をVRMビューワーに通知
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

            // 設定画面要素が存在し、表示されている場合のみDOMから値を取得
            // （キャラクター切り替えポップアップからの変更時はDOMを見ない）
            const settingsModal = document.getElementById('settings-modal');
            if (settingsModal && settingsModal.style.display !== 'none') {
                settings.mode = this.getSelectedMode();
                if (this.elements.singleSelect) settings.singleCharacter = this.elements.singleSelect.value;
                if (this.elements.iconCheckboxes) settings.iconCharacters = this.getCheckedCharacters('icon');
                if (this.elements.multiCheckboxes) settings.multiCharacters = this.getCheckedCharacters('multi');
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

    getCheckedCharacters(mode) {
        const container = mode === 'icon' ? this.elements.iconCheckboxes : this.elements.multiCheckboxes;
        if (!container) return [];

        const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
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

        // 設定画面のセレクトボックスも同期
        if (this.elements.singleSelect) {
            this.elements.singleSelect.value = this.currentSettings.singleCharacter;
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
        // VRMビューワーに表示設定変更を通知
        const iframe = document.getElementById('vrm-iframe');
        if (!iframe || !iframe.contentWindow) return;

        // シングルキャラモードの場合、VRMファイルを読み込んで送信
        if (this.currentSettings.mode === 'single') {
            await this.loadAndSendSingleCharacter();
        }
        // アイコンモード・マルチモードは後で実装
        else {
            iframe.contentWindow.postMessage({
                type: 'displaySettingsChanged',
                settings: this.currentSettings
            }, '*');
        }

        console.log('Notified VRM viewer of display settings change');
    }

    async loadAndSendSingleCharacter() {
        try {
            const characterId = this.currentSettings.singleCharacter;
            console.log('loadAndSendSingleCharacter: Target ID =', characterId);

            if (!characterId) {
                console.warn('No character selected for single mode');
                return;
            }

            // ConfigManagerからキャラクター情報を取得
            const configManager = window.terminalApp?.configManager;
            if (!configManager) {
                console.error('ConfigManager not found');
                return;
            }

            const character = configManager.getCharacterById(characterId);
            console.log('loadAndSendSingleCharacter: Character Data =', character);

            if (!character) {
                console.error('Character not found:', characterId);
                return;
            }

            // アイコンを更新
            this.updateCharacterIcon();

            // VRMファイルパスを取得 (データ構造の互換性維持)
            const vrmPath = character.vrmPath || character.model?.path;
            console.log('loadAndSendSingleCharacter: VRM Path =', vrmPath);

            if (!vrmPath) {
                console.warn('Character has no VRM path:', characterId);
                // デフォルトVRMを読み込む
                this.sendLoadDefaultVRM();
                return;
            }

            console.log('Loading VRM file via Electron API:', vrmPath);

            // ElectronAPIでVRMファイルを読み込む
            const result = await window.electronAPI.vrm.loadFile(vrmPath);
            console.log('loadAndSendSingleCharacter: API Result =', result.success ? 'Success' : 'Failure', result.error || '');

            if (!result.success) {
                console.error('Failed to load VRM file:', result.error);
                // エラー時はデフォルトVRMにフォールバック
                this.sendLoadDefaultVRM();
                return;
            }

            // VRMビューワーにpostMessage
            const iframe = document.getElementById('vrm-iframe');
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({
                    type: 'loadVRM',
                    fileData: result.data,
                    fileName: result.filename || vrmPath
                }, '*');

                console.log('Sent VRM data to viewer:', vrmPath);
            } else {
                console.error('VRM iframe not found or not ready');
            }

        } catch (error) {
            console.error('Error loading single character VRM:', error);
            // エラー時はデフォルトVRMにフォールバック
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
            this.elements.iconDisplayArea.appendChild(node);
        });
    }

    /**
     * 喋っている状態をセット
     */
    setSpeakingState(charId, isSpeaking) {
        // アイコンモード用のハイライト (アイコンエリアに存在する場合)
        const circle = document.getElementById(`icon-circle-${charId}`);
        if (circle) {
            if (isSpeaking) {
                circle.classList.add('is-speaking');
            } else {
                circle.classList.remove('is-speaking');
            }
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
            const isActive = this.currentSettings.mode === 'single'
                ? (char.id === this.currentSettings.singleCharacter)
                : (this.currentSettings.iconCharacters.includes(char.id));

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
    handleCharacterSelect(charId) {
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
                // 選択されていなければ追加
                this.currentSettings.iconCharacters.push(charId);
            }
            // ポップアップを閉じずに選択状態のみ更新
            this.updateCharacterSelectPopupActiveStates();
        }
        
        // 設定画面のセレクトボックスも同期
        if (this.elements.singleSelect) {
            this.elements.singleSelect.value = this.currentSettings.singleCharacter;
        }

        // 保存と反映
        this.saveSettings();
        
        // アイコン表示の更新などを実行
        this.updateCharacterIcon();
        if (this.currentSettings.mode === 'icon') {
            this.updateIconDisplay();
        }
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

            const isActive = this.currentSettings.mode === 'single'
                ? (char.id === this.currentSettings.singleCharacter)
                : (this.currentSettings.iconCharacters.includes(char.id));

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
