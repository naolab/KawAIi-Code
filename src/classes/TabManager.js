/**
 * タブ管理クラス
 * - 複数ターミナルタブの管理
 * - タブの作成、切り替え、削除
 * - AI起動・停止制御
 * - ドラッグ&ドロップ機能
 */

class TabManager {
    constructor(dependencies) {
        this.deps = dependencies;
        this.tabs = {};
        this.activeTabId = null;
       this.parentTabId = null;
       this.nextTabNumber = 1;
       this.tabOrder = []; // タブの順序を管理する配列
       this.MAX_TABS = 10; // タブの最大数を10個に制限
        this.dragState = null; // タブドラッグの状態管理
        this.onGlobalTabPointerMove = (event) => this.handleTabPointerMove(event);
        this.onGlobalTabPointerUp = (event) => this.handleTabPointerUp(event);
        
        // イベントリスナー重複防止フラグ
        this.isEventListenersInitialized = false;
    }

    initialize() {
        this.setupEventListeners();
        
        // 初期タブを作成
        if (Object.keys(this.tabs).length === 0) {
            this.createInitialTab();
        }
    }

    setupEventListeners() {
        // 重複初期化の防止
        if (this.isEventListenersInitialized) {
            debugLog('🛡️ TabManager イベントリスナー重複初期化をスキップ');
            return;
        }

        // 新規タブボタン
        const newTabButton = document.getElementById('new-tab-button');
        if (newTabButton) {
            newTabButton.addEventListener('click', () => {
                this.createEmptyTab();
            });
        }
        
        // タブ別データ受信処理
        if (window.electronAPI && window.electronAPI.tab) {
            window.electronAPI.tab.onData((tabId, data) => {
                this.handleTabData(tabId, data);
            });
            
            window.electronAPI.tab.onExit((tabId, exitCode) => {
                this.handleTabExit(tabId, exitCode);
            });
        }

        // 初期化完了フラグを設定
        this.isEventListenersInitialized = true;
        debugLog('🛡️ TabManager イベントリスナー初期化完了（重複防止済み）');
    }
    
    handleTabData(tabId, data) {
        const tab = this.tabs[tabId];
        if (!tab) {
            debugLog(`Received data for unknown tab: ${tabId}`);
            return;
        }
        
        // ターミナルに出力（全タブ）
        if (tab.terminal) {
            tab.terminal.write(data);
        }
        
        // 音声処理は親タブのみ（Phase 2A: 事前フィルタリング改善）
        if (this.isParentTab(tabId) && this.deps.messageAccumulator) {
            debugLog(`🎵 親タブ${tabId}のデータを音声処理パイプラインに送信:`, data.substring(0, 50) + '...');
            this.deps.messageAccumulator.addChunk(data);
            
            // タブシステム使用時も音声処理を確実に実行
            if (this.deps.terminalService && this.deps.terminalService.processTerminalData) {
                debugLog(`🎤 親タブ${tabId}の音声処理を直接実行`);
                this.deps.terminalService.processTerminalData(data);
            }
        } else if (!this.isParentTab(tabId)) {
            debugLog(`🔇 非親タブ${tabId}のデータは音声処理をスキップ:`, data.substring(0, 30) + '...');
        }
    }
    
    handleTabExit(tabId, exitCode) {
        const tab = this.tabs[tabId];
        if (!tab) {
            debugLog(`Tab exit event for unknown tab: ${tabId}`);
            return;
        }
        
        debugLog(`Tab ${tabId} process exited with code: ${exitCode}`);
        
        // 停止時のメッセージを削除（シンプル化）
        // if (tab.terminal) {
        //     if (exitCode === 0) {
        //         tab.terminal.writeln('\r\n\x1b[90m[プロセス正常終了] 新しいタブを作成してください\x1b[0m');
        //     } else {
        //         tab.terminal.writeln(`\r\n\x1b[31m[プロセス異常終了: ${exitCode}] 新しいタブを作成してください\x1b[0m`);
        //     }
        // }
    }

    createInitialTab() {
        // 既存のターミナルを最初のタブとして登録
        const tabId = `tab-${this.nextTabNumber++}`;
        
        // 既存の#terminal要素をリネームして統一化
        const existingTerminal = document.getElementById('terminal');
        const newTerminalId = `terminal-${tabId}`;
        if (existingTerminal) {
            existingTerminal.id = newTerminalId;
            existingTerminal.className = 'terminal-wrapper active';
        }
        
        this.tabs[tabId] = {
            id: tabId,
            name: `Tab #${tabId.split('-')[1]}`,
            aiType: null,
            isParent: true,
            isActive: true,
            isRunning: false, // 初期状態はAI未起動
            terminal: this.deps.mainTerminal,
            fitAddon: this.deps.mainFitAddon,
            element: existingTerminal, // リネーム後の要素を参照
            createdAt: Date.now()
        };
        
        this.activeTabId = tabId;
        this.parentTabId = tabId;
        
        // タブ順序配列に追加
        this.tabOrder.push(tabId);
        
        this.renderTabs();
    }

    createEmptyTab() {
        // タブ数制限チェック
        if (Object.keys(this.tabs).length >= this.MAX_TABS) {
            // ターミナルに警告メッセージを表示
            const activeTab = this.tabs[this.activeTabId];
            if (activeTab && activeTab.terminal) {
                activeTab.terminal.writeln('\r\n\x1b[33m⚠️ タブの最大数（10個）に達しています。既存のタブを閉じてから新しいタブを作成してください。\x1b[0m');
            }
            return null;
        }
        
        const tabId = `tab-${this.nextTabNumber++}`;
        const tabName = `Tab #${this.nextTabNumber - 1}`;
        
        // 新しいターミナル要素を作成
        const terminalElement = document.createElement('div');
        terminalElement.id = `terminal-${tabId}`;
        terminalElement.className = 'terminal-wrapper';
        terminalElement.style.display = 'none'; // 初期状態は非表示
        
        const terminalContainer = document.getElementById('terminal-container');
        if (terminalContainer) {
            terminalContainer.appendChild(terminalElement);
        }
        
        // 新しいTerminalインスタンスを作成
        const terminal = new Terminal(TerminalFactory.createConfig());
        const fitAddon = new FitAddon.FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(new WebLinksAddon.WebLinksAddon());
        terminal.open(terminalElement);
        
        // ターミナルサイズ調整を遅延実行（確実にDOM要素が準備されてから）
        setTimeout(() => {
            fitAddon.fit();
        }, 50);
        
        // 初期メッセージを削除（シンプル化）
        // terminal.writeln(`\x1b[90m🎀 KawAIi Code - New Tab 🎀\x1b[0m`);
        
        // タブデータを作成（AIは未起動状態）
        this.tabs[tabId] = {
            id: tabId,
            name: tabName,
            aiType: null, // AI未起動
            isParent: false,
            isActive: false,
            isRunning: false, // AI起動状態フラグ追加
            terminal: terminal,
            fitAddon: fitAddon,
            element: terminalElement,
            createdAt: Date.now(),
            lightRefreshInterval: null // 軽量リフレッシュ用インターバル
        };
        
        // タブ順序配列に追加
        this.tabOrder.push(tabId);
        
        this.renderTabs();
        this.switchTab(tabId);

        // 新しく作成したタブに軽量リフレッシュを開始
        this.startTabLightRefresh(tabId);

        return tabId;
    }



    async startAIForTab(tabId, aiType) {
        try {
            if (!window.electronAPI || !window.electronAPI.tab) {
                debugError('ElectronAPI.tab not available');
                return false;
            }

            const tab = this.tabs[tabId];
            if (!tab) {
                debugError(`Tab ${tabId} not found`);
                return false;
            }

            let aiName;
            if (aiType === 'claude') {
                aiName = 'Claude Code';
            } else if (aiType === 'claude-dangerous') {
                aiName = 'Claude Code (Dangerous)';
            } else if (aiType === 'gemini') {
                aiName = 'Gemini CLI';
            } else {
                aiName = aiType; // フォールバック
            }
            debugLog(`Starting ${aiName} for tab ${tabId}`);
            
            // 既存のイベントリスナーをクリーンアップ（重複防止）
            if (tab.eventListeners) {
                tab.eventListeners.forEach(disposable => {
                    if (disposable && typeof disposable.dispose === 'function') {
                        disposable.dispose();
                    }
                });
                tab.eventListeners = [];
            } else {
                tab.eventListeners = [];
            }
            
            // バックエンドでPTYプロセス作成
            const result = await window.electronAPI.tab.create(tabId, aiType);
            if (!result.success) {
                debugError(`Failed to create tab process: ${result.error}`);
                tab.terminal.writeln(`\x1b[31mError: ${result.error}\x1b[0m`);
                return false;
            }
            
            // ターミナルをプロセスに接続
            const terminal = tab.terminal;
            
            // 初期化メッセージ
            terminal.writeln(`\x1b[90m${aiName} ready.\x1b[0m`);
            
            // ユーザー入力をプロセスに送信（重複防止）
            const onDataListener = terminal.onData((data) => {
                window.electronAPI.tab.write(tabId, data);
            });
            tab.eventListeners.push(onDataListener);
            
            // リサイズ処理（重複防止）
            const onResizeListener = terminal.onResize(({ cols, rows }) => {
                window.electronAPI.tab.resize(tabId, cols, rows);
            });
            tab.eventListeners.push(onResizeListener);
            
            // ターミナルサイズを適切に調整（AI起動後に実行）
            setTimeout(() => {
                // デバウンス処理付きリサイズ制御
                this.deps.handleResize();
                
                if (tab.fitAddon && tab.terminal) {
                    tab.fitAddon.fit();
                    // バックエンドプロセスにも新しいサイズを通知
                    window.electronAPI.tab.resize(tabId, tab.terminal.cols, tab.terminal.rows);
                    debugLog(`Tab ${tabId} resized to ${tab.terminal.cols}x${tab.terminal.rows}`);
                }
            }, 200); // Claude Codeの初期化完了を待つ
            
            // UI状態を更新
            this.updateTabUI();
            if (this.deps && this.deps.updateButtons) {
                this.deps.updateButtons();
            }
            
            debugLog(`Tab ${tabId} AI startup completed`);
            return true;
        } catch (error) {
            debugError(`Error starting AI for tab ${tabId}:`, error);
            if (this.tabs[tabId]) {
                this.tabs[tabId].terminal.writeln(`\x1b[31mError: ${error.message}\x1b[0m`);
            }
            return false;
        }
    }

    async stopAIForTab(tabId) {
        try {
            const tab = this.tabs[tabId];
            if (!tab) {
                debugError(`Tab ${tabId} not found`);
                return false;
            }

            // イベントリスナーをクリーンアップ
            if (tab.eventListeners) {
                tab.eventListeners.forEach(disposable => {
                    if (disposable && typeof disposable.dispose === 'function') {
                        disposable.dispose();
                    }
                });
                tab.eventListeners = [];
            }

            if (window.electronAPI && window.electronAPI.tab) {
                await window.electronAPI.tab.delete(tabId);
                debugLog(`AI stopped for tab ${tabId}`);
            }

            // タブ状態を更新
            tab.aiType = null;
            tab.isRunning = false;
            tab.name = `Tab #${tabId.split('-')[1]}`;

            // ターミナルをクリア（メッセージなし）
            if (tab.terminal) {
                tab.terminal.clear();
                // 冗長メッセージを削除（シンプル化）
                // tab.terminal.writeln(`\x1b[90m🎀 KawAIi Code - Tab Ready 🎀\x1b[0m`);
            }
            
            // UI状態を更新
            this.updateTabUI();
            if (this.deps && this.deps.updateButtons) {
                this.deps.updateButtons();
            }

            return true;
        } catch (error) {
            debugError(`Error stopping AI for tab ${tabId}:`, error);
            return false;
        }
    }

    switchTab(tabId) {
        if (!this.tabs[tabId]) return;
        
        // 全てのタブを非表示（確実な表示制御）
        Object.values(this.tabs).forEach(tab => {
            tab.isActive = false;
            if (tab.element) {
                tab.element.style.display = 'none';
                tab.element.classList.remove('active');
            }
        });
        
        // アクティブタブを表示
        const activeTab = this.tabs[tabId];
        activeTab.isActive = true;
        if (activeTab.element) {
            activeTab.element.style.display = 'block';
            activeTab.element.classList.add('active');
        }
        activeTab.terminal.focus();
        
        // ターミナルサイズを調整
        if (activeTab.fitAddon) {
            setTimeout(() => {
                // デバウンス処理付きリサイズ制御
                this.deps.handleResize();
                
                activeTab.fitAddon.fit();
                // AI起動中のタブの場合、バックエンドプロセスにもリサイズを通知
                if (activeTab.isRunning && activeTab.terminal) {
                    window.electronAPI.tab.resize(tabId, activeTab.terminal.cols, activeTab.terminal.rows);
                    debugLog(`Active tab ${tabId} resized to ${activeTab.terminal.cols}x${activeTab.terminal.rows}`);
                }
            }, 100); // Claude Codeの表示が落ち着くまで少し待つ
        }
        
        this.activeTabId = tabId;
        this.updateTabUI();
        
        // ボタン状態を更新（アクティブタブ変更時）
        if (this.deps && this.deps.updateButtons) {
            this.deps.updateButtons();
        }
    }

    /**
     * 指定されたタブが親タブかどうかを判定
     * @param {string} tabId - 判定対象のタブID
     * @returns {boolean} 親タブの場合true
     */
    isParentTab(tabId) {
        return this.parentTabId === tabId;
    }

    setParentTab(tabId) {
        if (!this.tabs[tabId]) return;
        
        // 現在の親タブを解除
        if (this.parentTabId && this.tabs[this.parentTabId]) {
            this.tabs[this.parentTabId].isParent = false;
        }
        
        // 新しい親タブを設定
        this.parentTabId = tabId;
        this.tabs[tabId].isParent = true;
        
        debugLog(`🌟 親タブを${tabId}に設定完了`);
        this.updateTabUI();
    }

    async deleteTab(tabId) {
        if (!this.tabs[tabId] || Object.keys(this.tabs).length === 1) {
            return; // 最後のタブは削除不可
        }
        
        const tab = this.tabs[tabId];
        
        // 1. 軽量リフレッシュインターバルを停止
        this.stopTabLightRefresh(tabId);

        // 2. イベントリスナーをクリーンアップ
        if (tab.eventListeners) {
            tab.eventListeners.forEach(disposable => {
                if (disposable && typeof disposable.dispose === 'function') {
                    disposable.dispose();
                }
            });
            tab.eventListeners = [];
        }
        
        // 2. PTYプロセスの終了処理
        if (window.electronAPI && window.electronAPI.tab) {
            try {
                await window.electronAPI.tab.delete(tabId);
                debugLog(`PTY process for tab ${tabId} terminated`);
            } catch (error) {
                debugError(`Failed to terminate PTY process for tab ${tabId}:`, error);
            }
        }
        
        // 3. ターミナルの前処理
        
        // 3. ターミナルインスタンスの破棄
        if (tab.terminal) {
            try {
                tab.terminal.dispose();
                debugLog(`Terminal instance for tab ${tabId} disposed`);
            } catch (error) {
                debugError(`Error disposing terminal for tab ${tabId}:`, error);
            }
        }
        
        // 4. DOM要素の削除
        if (tab.element && tab.element.parentNode) {
            tab.element.parentNode.removeChild(tab.element);
            debugLog(`DOM element for tab ${tabId} removed`);
        }
        
        // 5. 親タブ変更時の処理
        if (tab.isParent) {
            const remainingTabs = Object.keys(this.tabs).filter(id => id !== tabId);
            if (remainingTabs.length > 0) {
                this.setParentTab(remainingTabs[0]);
                debugLog(`Parent tab switched from ${tabId} to ${remainingTabs[0]}`);
            }
        }
        
        // 6. アクティブタブの場合、他のタブに切り替え
        if (this.activeTabId === tabId) {
            const remainingTabs = Object.keys(this.tabs).filter(id => id !== tabId);
            if (remainingTabs.length > 0) {
                this.switchTab(remainingTabs[0]);
                debugLog(`Active tab switched from ${tabId} to ${remainingTabs[0]}`);
            }
        }
        
        // 7. タブ順序配列から削除
        const orderIndex = this.tabOrder.indexOf(tabId);
        if (orderIndex !== -1) {
            this.tabOrder.splice(orderIndex, 1);
        }
        
        // 8. タブデータ削除
        delete this.tabs[tabId];
        debugLog(`Tab data for ${tabId} deleted`);
        
        this.renderTabs();
    }

    renderTabs() {
        const tabBar = document.getElementById('tab-bar');
        if (!tabBar) return;
        
        // タブリストの更新
        this.updateTabListElements(tabBar, this.tabs, this.tabOrder, this.activeTabId);
    }

    // タブリストの更新（DOMUpdaterの代替）
    updateTabListElements(tabBarElement, tabs, tabOrder, activeTabId) {
        if (!tabBarElement || !Array.isArray(tabOrder)) return;
        
        // 新規タブボタンを除く既存のタブ要素を削除
        const existingTabs = Array.from(tabBarElement.querySelectorAll('.tab'));
        existingTabs.forEach(tab => tab.remove());
        
        // 新規タブボタンを取得
        const newTabButton = document.getElementById('new-tab-button');
        
        // 新しいタブを順序通りに追加
        tabOrder.forEach(tabId => {
            if (tabs[tabId]) {
                const tabElement = this.createTabElement(tabs[tabId]);
                tabBarElement.insertBefore(tabElement, newTabButton);
            }
        });
    }

    createTabElement(tabData) {
        const tab = document.createElement('div');
        tab.className = `tab ${tabData.isActive ? 'active' : ''}`;
        tab.setAttribute('data-tab-id', tabData.id);
        
        // カスタムドラッグを設定（横方向のみ）
        tab.draggable = false;
        this.deps.resourceManager.addEventListener(tab, 'pointerdown', (e) => this.handleTabPointerDown(e, tabData, tab));
        
        // 星マーク
        const star = document.createElement('span');
        star.className = `parent-star ${tabData.isParent ? 'active' : 'inactive'}`;
        star.textContent = tabData.isParent ? '★' : '☆';
        this.deps.resourceManager.addEventListener(star, 'click', (e) => {
            e.stopPropagation();
            this.setParentTab(tabData.id);
        });
        
        // タブ名
        const name = document.createElement('span');
        name.className = 'tab-name';
        name.textContent = tabData.name;
        // タブ名のリネーム（ダブルクリック → インライン編集）
        name.title = 'ダブルクリックで名前を変更';
        // クリックで親のタブ切替を抑制
        this.deps.resourceManager.addEventListener(name, 'mousedown', (e) => {
            e.stopPropagation();
        });
        this.deps.resourceManager.addEventListener(name, 'dblclick', (e) => {
            e.stopPropagation();
            this.openRenameEditor(tabData.id);
        });
        
        // 閉じるボタン
        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-button';
        closeBtn.textContent = '×';
        this.deps.resourceManager.addEventListener(closeBtn, 'click', async (e) => {
            e.stopPropagation();
            await this.deleteTab(tabData.id);
        });
        
        // タブクリックイベント（ResourceManager経由）
        this.deps.resourceManager.addEventListener(tab, 'click', () => {
            this.switchTab(tabData.id);
        });
        // 右クリックでリネーム（インライン編集）
        this.deps.resourceManager.addEventListener(tab, 'contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.openRenameEditor(tabData.id);
        });
        
        tab.appendChild(star);
        tab.appendChild(name);
        tab.appendChild(closeBtn);
        
        return tab;
    }

    updateTabUI() {
        this.renderTabs();
    }

    // インラインリネームエディタを開く
    openRenameEditor(tabId) {
        const tabEl = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
        if (!tabEl) return;

        const nameEl = tabEl.querySelector('.tab-name');
        if (!nameEl) return;

        // 既存エディタがあれば無視
        if (tabEl.querySelector('input.tab-name-editor')) return;

        const current = this.tabs[tabId]?.name || '';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'tab-name-editor';
        input.value = current;
        input.style.width = '100%';
        input.style.boxSizing = 'border-box';
        input.style.border = '1px solid rgba(255,255,255,0.4)';
        input.style.background = 'rgba(0,0,0,0.15)';
        input.style.color = '#fff';
        input.style.fontSize = '13px';
        input.style.borderRadius = '4px';
        input.style.padding = '2px 4px';

        // 置換
        tabEl.replaceChild(input, nameEl);
        input.focus();
        input.select();

        const commit = () => {
            const trimmed = input.value.trim();
            if (trimmed.length > 0) {
                this.tabs[tabId].name = trimmed;
            }
            this.updateTabUI();
        };

        const cancel = () => {
            this.updateTabUI();
        };

        // イベント
        this.deps.resourceManager.addEventListener(input, 'keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                commit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
            }
        });
        this.deps.resourceManager.addEventListener(input, 'blur', () => {
            commit();
        });
    }

    /**
     * タブのカスタムドラッグ開始処理
     */
    handleTabPointerDown(event, tabData, tabElement) {
        if (event.button !== 0 || !tabElement) {
            return;
        }

        // 閉じるボタンやスタークリック時はドラッグ無効
        if (event.target.closest('.close-button, .parent-star, .tab-name-editor')) {
            return;
        }

        const tabBar = document.getElementById('tab-bar');
        if (!tabBar) {
            return;
        }

        // 既存ドラッグがある場合はキャンセル
        if (this.dragState && this.dragState.active) {
            this.cleanupActiveTabDrag();
        }

        this.dragState = {
            tabId: tabData.id,
            tabElement,
            tabBar,
            startClientX: event.clientX,
            startClientY: event.clientY,
            active: false,
            pointerOffsetX: 0,
            initialLeft: 0,
            currentLeft: 0,
            initialTop: 0,
            tabWidth: 0,
            tabHeight: 0,
            minLeft: 0,
            maxLeft: 0,
            placeholder: null,
            tabBarRect: tabBar.getBoundingClientRect(),
            consumeClickHandler: null
        };

        window.addEventListener('pointermove', this.onGlobalTabPointerMove);
        window.addEventListener('pointerup', this.onGlobalTabPointerUp);
        window.addEventListener('pointercancel', this.onGlobalTabPointerUp);
    }

    /**
     * ドラッグを本格開始する（しきい値を超えたタイミングで発火）
     */
    activateTabDrag(state, triggerEvent) {
        const { tabElement, tabBar } = state;
        if (!tabElement || !tabBar) {
            return;
        }

        const tabRect = tabElement.getBoundingClientRect();
        const tabBarRect = tabBar.getBoundingClientRect();

        const placeholder = document.createElement('div');
        placeholder.className = 'tab-placeholder';
        placeholder.style.width = `${tabRect.width}px`;
        placeholder.style.height = `${tabRect.height}px`;

        tabBar.insertBefore(placeholder, tabElement);
        tabBar.appendChild(tabElement);

        const scrollLeft = tabBar.scrollLeft;
        const initialLeft = tabRect.left - tabBarRect.left + scrollLeft;

        state.active = true;
        state.placeholder = placeholder;
        state.pointerOffsetX = triggerEvent.clientX - tabRect.left;
        state.initialLeft = initialLeft;
        state.currentLeft = initialLeft;
        state.initialTop = tabRect.top - tabBarRect.top;
        state.tabWidth = tabRect.width;
        state.tabHeight = tabRect.height;
        state.tabBarRect = tabBarRect;

        const newTabButton = document.getElementById('new-tab-button');
        if (newTabButton) {
            const newTabRect = newTabButton.getBoundingClientRect();
            state.maxLeft = Math.max(
                0,
                (newTabRect.left - tabBarRect.left + scrollLeft) - tabRect.width
            );
        } else {
            state.maxLeft = Math.max(0, tabBar.scrollWidth - tabRect.width);
        }
        state.minLeft = 0;

        tabElement.classList.add('dragging');
        tabElement.style.position = 'absolute';
        tabElement.style.zIndex = '200';
        tabElement.style.width = `${tabRect.width}px`;
        tabElement.style.height = `${tabRect.height}px`;
        tabElement.style.pointerEvents = 'none';
        tabElement.style.left = `${initialLeft}px`;
        tabElement.style.top = `${state.initialTop}px`;

        state.consumeClickHandler = (clickEvent) => {
            clickEvent.stopPropagation();
            clickEvent.preventDefault();
        };
        tabElement.addEventListener('click', state.consumeClickHandler, true);
    }

    /**
     * ドラッグ中のポインタ移動処理
     */
    handleTabPointerMove(event) {
        const state = this.dragState;
        if (!state) {
            return;
        }

        if (!state.active) {
            const deltaX = Math.abs(event.clientX - state.startClientX);
            const deltaY = Math.abs(event.clientY - state.startClientY);
            if (deltaX < 4 && deltaY < 4) {
                return;
            }
            this.activateTabDrag(state, event);
        }

        if (!state.active) {
            return;
        }

        this.updateTabDragPosition(state, event);
    }

    /**
     * タブ位置を更新し、プレースホルダーを移動
     */
    updateTabDragPosition(state, event) {
        const { tabBar, tabElement } = state;
        if (!tabBar || !tabElement) {
            return;
        }

        const scrollLeft = tabBar.scrollLeft;
        const rawLeft = event.clientX - state.tabBarRect.left + scrollLeft - state.pointerOffsetX;
        const clampedLeft = Math.max(state.minLeft, Math.min(state.maxLeft, rawLeft));
        state.currentLeft = clampedLeft;

        tabElement.style.left = `${clampedLeft}px`;

        const dragCenter =
            clampedLeft - scrollLeft + state.tabBarRect.left + state.tabWidth / 2;

        this.updateTabPlaceholderPosition(state, dragCenter);
    }

    /**
     * プレースホルダーの挿入位置を更新
     */
    updateTabPlaceholderPosition(state, dragCenterX) {
        const { tabBar, placeholder, tabElement } = state;
        if (!tabBar || !placeholder) {
            return;
        }

        const siblings = Array.from(tabBar.querySelectorAll('.tab')).filter(
            (tab) => tab !== tabElement
        );

        let inserted = false;
        for (const sibling of siblings) {
            const rect = sibling.getBoundingClientRect();
            const center = rect.left + rect.width / 2;
            if (dragCenterX < center) {
                if (sibling.previousSibling !== placeholder) {
                    tabBar.insertBefore(placeholder, sibling);
                }
                inserted = true;
                break;
            }
        }

        if (!inserted) {
            const newTabButton = document.getElementById('new-tab-button');
            if (newTabButton && newTabButton.parentElement === tabBar) {
                if (newTabButton.previousSibling !== placeholder) {
                    tabBar.insertBefore(placeholder, newTabButton);
                }
            } else if (placeholder.parentElement !== tabBar || placeholder.nextSibling) {
                tabBar.appendChild(placeholder);
            }
        }
    }

    /**
     * ドラッグ終了処理
     */
    handleTabPointerUp() {
        const state = this.dragState;
        if (!state) {
            return;
        }

        window.removeEventListener('pointermove', this.onGlobalTabPointerMove);
        window.removeEventListener('pointerup', this.onGlobalTabPointerUp);
        window.removeEventListener('pointercancel', this.onGlobalTabPointerUp);

        if (!state.active) {
            this.cleanupActiveTabDrag(state);
            this.dragState = null;
            return;
        }

        const { tabBar } = state;

        this.cleanupActiveTabDrag(state);

        const newOrder = this.calculateDomTabOrder(tabBar);
        if (newOrder && newOrder.length) {
            this.applyTabOrder(newOrder);
        } else {
            this.renderTabs();
        }

        this.dragState = null;
    }

    /**
     * ドラッグ状態のクリーンアップ
     */
    cleanupActiveTabDrag(state = this.dragState) {
        if (!state) {
            return;
        }

        const { tabElement, placeholder, consumeClickHandler } = state;

        if (tabElement) {
            if (consumeClickHandler) {
                tabElement.removeEventListener('click', consumeClickHandler, true);
            }

            tabElement.classList.remove('dragging');
            tabElement.style.position = '';
            tabElement.style.zIndex = '';
            tabElement.style.width = '';
            tabElement.style.height = '';
            tabElement.style.pointerEvents = '';
            tabElement.style.left = '';
            tabElement.style.top = '';
        }

        if (placeholder && placeholder.parentElement) {
            placeholder.parentElement.replaceChild(tabElement, placeholder);
        }
    }

    /**
     * DOM上のタブ順を取得
     */
    calculateDomTabOrder(tabBar) {
        if (!tabBar) {
            return null;
        }

        return Array.from(tabBar.querySelectorAll('.tab'))
            .map((tab) => tab.getAttribute('data-tab-id'))
            .filter(Boolean);
    }

    /**
     * DOM順に基づきタブ順を適用
     */
    applyTabOrder(newOrder) {
        const sanitized = newOrder.filter((tabId) => this.tabs[tabId]);

        const isSameOrder =
            sanitized.length === this.tabOrder.length &&
            sanitized.every((tabId, index) => tabId === this.tabOrder[index]);

        if (isSameOrder) {
            this.renderTabs();
            return;
        }

        this.tabOrder = sanitized;
        debugLog('Tab order updated (DOM sync):', this.tabOrder);
        this.renderTabs();
    }

    /**
     * タブ用軽量リフレッシュを開始（10秒間隔）
     */
    startTabLightRefresh(tabId) {
        const tab = this.tabs[tabId];
        if (!tab) return;

        // 既存のインターバルをクリア
        if (tab.lightRefreshInterval) {
            clearInterval(tab.lightRefreshInterval);
        }

        // 10秒間隔で軽量リフレッシュを実行
        tab.lightRefreshInterval = setInterval(() => {
            this.performTabLightRefresh(tabId);
        }, 10000); // 10秒 = 10,000ms

        debugLog(`🔄 タブ ${tabId} の軽量リフレッシュ開始 (10秒間隔)`);
    }

    /**
     * タブ用軽量リフレッシュを停止
     */
    stopTabLightRefresh(tabId) {
        const tab = this.tabs[tabId];
        if (!tab) return;

        if (tab.lightRefreshInterval) {
            clearInterval(tab.lightRefreshInterval);
            tab.lightRefreshInterval = null;
            debugLog(`🔄 タブ ${tabId} の軽量リフレッシュ停止`);
        }
    }

    /**
     * タブ用軽量リフレッシュを実行
     */
    performTabLightRefresh(tabId) {
        try {
            const tab = this.tabs[tabId];
            if (!tab) return;

            // ターミナルとfitAddonが存在し、かつアクティブなタブで画面がフォーカスされている場合のみ実行
            if (tab.fitAddon && tab.terminal && tab.terminal.element &&
                tab.isActive && document.hasFocus() && tab.terminal.element.offsetParent) {

                // 軽量なサイズ調整のみ実行
                tab.fitAddon.fit();

                debugLog(`🔄 タブ ${tabId} 軽量リフレッシュ実行完了`);
            }
        } catch (error) {
            debugLog(`❌ タブ ${tabId} 軽量リフレッシュエラー:`, error.message);
        }
    }
}


// ブラウザ環境での利用
if (typeof window !== 'undefined') {
    window.TabManager = TabManager;
}

// Node.js環境での利用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TabManager;
}
