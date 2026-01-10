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
        this.nextPaneNumber = 1; // 内部ペイン（PTY）用のユニークID
        this.tabOrder = []; // タブの順序を管理する配列
        this.MAX_TABS = 10; // タブの最大数を10個に制限
        this.dragState = null; // タブドラッグの状態管理
        this.onGlobalTabPointerMove = (event) => this.handleTabPointerMove(event);
        this.onGlobalTabPointerUp = (event) => this.handleTabPointerUp(event);
        
        // イベントリスナー重複防止フラグ
        this.isEventListenersInitialized = false;
    }

    async initialize() {
        this.setupEventListeners();
        
        // 初期タブを作成
        if (Object.keys(this.tabs).length === 0) {
            await this.createInitialTab();
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
    
    handleTabData(paneId, data) {
        const result = this.findPaneById(paneId);
        if (!result) {
            debugLog(`Received data for unknown pane: ${paneId}`);
            return;
        }
        
        const { tab, pane } = result;
        
        // ターミナルに出力
        if (pane.terminal) {
            pane.terminal.write(data);
        }
        
        // 音声処理は親タブの最初のアクティブなペインのみ（簡易化のため最初のペインを優先）
        if (this.isParentTab(tab.id) && this.deps.messageAccumulator) {
            this.deps.messageAccumulator.addChunk(data);
            
            if (this.deps.terminalService && this.deps.terminalService.processTerminalData) {
                this.deps.terminalService.processTerminalData(data);
            }
        }
    }
    
    findPaneById(paneId) {
        for (const tabId of this.tabOrder) {
            const tab = this.tabs[tabId];
            const pane = tab.panes.find(p => p.id === paneId);
            if (pane) {
                return { tab, pane };
            }
        }
        return null;
    }
    
    handleTabExit(paneId, exitCode) {
        const result = this.findPaneById(paneId);
        if (!result) {
            debugLog(`Exit event for unknown pane: ${paneId}`);
            return;
        }
        
        const { tab, pane } = result;
        debugLog(`Pane ${paneId} in tab ${tab.id} exited with code: ${exitCode}`);
        pane.isRunning = false;
    }

    async createInitialTab() {
        // 既存のターミナルを最初のタブとして登録
        const tabId = `tab-${this.nextTabNumber++}`;
        const paneId = `pane-${this.nextPaneNumber++}`;
        
        // 既存の#terminal要素をリネームしてコンテナとして再利用
        const existingWrapper = document.getElementById('terminal');
        if (existingWrapper) {
            existingWrapper.id = `terminal-${tabId}`;
            existingWrapper.className = 'terminal-wrapper active';
            existingWrapper.innerHTML = ''; // クリアしてペインを追加できるようにする
        }
        
        // 最初のペインを作成
        const paneElement = this.createPaneElement(paneId);
        if (existingWrapper) {
            existingWrapper.appendChild(paneElement);
        }
        
        const terminal = this.deps.mainTerminal;
        const fitAddon = this.deps.mainFitAddon;
        
        // ターミナルをペインのコンテナに接続（これが唯一のopen呼び出しになるように制御）
        const xtermContainer = paneElement.querySelector('.xterm-container');
        if (xtermContainer) {
            // 前のDOMとの関連付けを念のためリセット（再レンダリングを促す）
            if (terminal.element) {
                terminal.element.innerHTML = '';
            }
            terminal.open(xtermContainer);
        }
        
        const pane = {
            id: paneId,
            terminal: terminal,
            fitAddon: fitAddon,
            element: paneElement,
            isRunning: false,
            eventListeners: []
        };
        
        this.tabs[tabId] = {
            id: tabId,
            name: `Tab #1`,
            panes: [pane],
            activePaneId: paneId,
            layout: 'single', // single, split-h, split-v
            isParent: true,
            isActive: true,
            createdAt: Date.now()
        };
        
        this.activeTabId = tabId;
        this.parentTabId = tabId;
        this.tabOrder.push(tabId);
        
        // フォーカスを設定
        this.focusPane(paneId);
        
        this.renderTabs();
        
        // ターミナルのサイズを確定させてから起動（プロンプト消失防止）
        if (fitAddon) {
            // DOMへの反映を待つための待機時間を少し多めに取る
            setTimeout(async () => {
                try {
                    // 表示されていることを確認してからfit
                    if (existingWrapper && existingWrapper.offsetParent !== null) {
                        fitAddon.fit();
                        debugLog('📏 Initial tab fit() executed');
                    }
                    
                    // シェル起動前にもう一度だけ微小待機（サイズ変更の伝播待ち）
                    await new Promise(resolve => setTimeout(resolve, 100));
                    await this.startShellForPane(tabId, paneId);
                    
                    // 起動後に再度フォーカス（念のため）
                    if (terminal) terminal.focus();
                } catch (e) {
                    debugError('📏 Initial tab fit error:', e);
                    await this.startShellForPane(tabId, paneId);
                }
            }, 100);
        } else {
            await this.startShellForPane(tabId, paneId);
        }
    }

    createPaneElement(paneId) {
        const pane = document.createElement('div');
        pane.className = 'terminal-pane';
        pane.setAttribute('data-pane-id', paneId);
        
        // 閉じるボタン（分割時のみ表示されるようCSSで制御）
        const closeButton = document.createElement('button');
        closeButton.className = 'pane-close-button';
        closeButton.innerHTML = '&times;';
        closeButton.title = 'Close pane';
        closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deletePane(paneId);
        });
        pane.appendChild(closeButton);
        
        const container = document.createElement('div');
        container.className = 'xterm-container';
        pane.appendChild(container);
        
        // フォーカスイベント
        pane.addEventListener('mousedown', () => {
            this.focusPane(paneId);
        });
        
        return pane;
    }

    focusPane(paneId) {
        const result = this.findPaneById(paneId);
        if (!result) return;
        
        const { tab, pane } = result;
        
        // UIの更新
        tab.panes.forEach(p => {
            p.element.classList.remove('focused');
        });
        pane.element.classList.add('focused');
        
        tab.activePaneId = paneId;
        if (pane.terminal) {
            pane.terminal.focus();
        }
    }

    async createEmptyTab() {
        // タブ数制限チェック
        if (Object.keys(this.tabs).length >= this.MAX_TABS) {
            const activeTab = this.tabs[this.activeTabId];
            if (activeTab && activeTab.panes.length > 0) {
                const activePane = activeTab.panes.find(p => p.id === activeTab.activePaneId) || activeTab.panes[0];
                if (activePane.terminal) {
                    activePane.terminal.writeln('\r\n\x1b[33m⚠️ タブの最大数（10個）に達しています。既存のタブを閉じてから新しいタブを作成してください。\x1b[0m');
                }
            }
            return null;
        }
        
        const tabId = `tab-${this.nextTabNumber++}`;
        const paneId = `pane-${this.nextPaneNumber++}`;
        const tabName = `Tab #${this.nextTabNumber - 1}`;
        
        // 新しいターミナルラッパー要素を作成
        const wrapper = document.createElement('div');
        wrapper.id = `terminal-${tabId}`;
        wrapper.className = 'terminal-wrapper';
        wrapper.style.display = 'none';
        
        const terminalContainer = document.getElementById('terminal-container');
        if (terminalContainer) {
            terminalContainer.appendChild(wrapper);
        }
        
        // 最初のペインを作成
        const paneElement = this.createPaneElement(paneId);
        wrapper.appendChild(paneElement);
        
        // 新しいTerminalインスタンスを作成
        const terminal = new Terminal(TerminalFactory.createConfig());
        const fitAddon = new FitAddon.FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(new WebLinksAddon.WebLinksAddon());
        terminal.open(paneElement.querySelector('.xterm-container'));
        
        // タブデータを作成
        const pane = {
            id: paneId,
            terminal: terminal,
            fitAddon: fitAddon,
            element: paneElement,
            isRunning: false,
            eventListeners: []
        };
        
        this.tabs[tabId] = {
            id: tabId,
            name: tabName,
            panes: [pane],
            activePaneId: paneId,
            layout: 'single',
            isParent: false,
            isActive: false,
            createdAt: Date.now()
        };
        
        this.tabOrder.push(tabId);
        
        this.renderTabs();
        this.switchTab(tabId);

        // 新しく作成したタブにシェルを起動
        await this.startShellForPane(tabId, paneId);

        return tabId;
    }

    async splitTab(direction = 'horizontal') {
        const tab = this.tabs[this.activeTabId];
        if (!tab) return;
        
        if (tab.panes.length >= 4) { // 分割数制限
            return;
        }
        
        const paneId = `pane-${this.nextPaneNumber++}`;
        const paneElement = this.createPaneElement(paneId);
        
        const wrapper = document.getElementById(`terminal-${tab.id}`);
        if (!wrapper) return;
        
        // レイアウトの更新
        tab.layout = direction === 'vertical' ? 'split-v' : 'split-h';
        wrapper.classList.remove('split-v', 'split-h');
        wrapper.classList.add(tab.layout);
        
        wrapper.appendChild(paneElement);
        
        const terminal = new Terminal(TerminalFactory.createConfig());
        const fitAddon = new FitAddon.FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(new WebLinksAddon.WebLinksAddon());
        terminal.open(paneElement.querySelector('.xterm-container'));
        
        const pane = {
            id: paneId,
            terminal: terminal,
            fitAddon: fitAddon,
            element: paneElement,
            isRunning: false,
            eventListeners: []
        };
        
        tab.panes.push(pane);
        this.focusPane(paneId);
        
        // シェル起動
        await this.startShellForPane(tab.id, paneId);
        
        // 全ペインのリサイズ
        setTimeout(() => {
            tab.panes.forEach(p => {
                if (p.fitAddon) p.fitAddon.fit();
            });
        }, 100);
    }



    async startShellForPane(tabId, paneId) {
        try {
            if (!window.electronAPI || !window.electronAPI.tab) {
                debugError('ElectronAPI.tab not available');
                return false;
            }

            const tab = this.tabs[tabId];
            if (!tab) return false;
            const pane = tab.panes.find(p => p.id === paneId);
            if (!pane) {
                debugError(`Pane ${paneId} not found in tab ${tabId}`);
                return false;
            }

            debugLog(`Starting shell for pane ${paneId} in tab ${tabId}`);
            
            // クリーンアップ
            if (pane.eventListeners) {
                pane.eventListeners.forEach(disposable => {
                    if (disposable && typeof disposable.dispose === 'function') {
                        disposable.dispose();
                    }
                });
                pane.eventListeners = [];
            }
            
            // 現在のターミナルサイズを取得
            const cols = pane.terminal ? pane.terminal.cols : 80;
            const rows = pane.terminal ? pane.terminal.rows : 24;
            
            // バックエンドでPTYプロセス作成（paneIdをそのままPtyIDとして使用）
            const result = await window.electronAPI.tab.create(paneId, cols, rows);
            if (!result.success) {
                debugError(`Failed to create pane process: ${result.error}`);
                pane.terminal.writeln(`\x1b[31mError: ${result.error}\x1b[0m`);
                return false;
            }
            
            const terminal = pane.terminal;
            pane.eventListeners.push(terminal.onData((data) => {
                window.electronAPI.tab.write(paneId, data);
            }));
            
            pane.eventListeners.push(terminal.onResize(({ cols, rows }) => {
                window.electronAPI.tab.resize(paneId, cols, rows);
            }));
            
            // 起動直後のリサイズは不要になった（作成時に正しいサイズを渡しているため）
            
            pane.isRunning = true;
            this.updateTabUI();
            return true;
        } catch (error) {
            debugError(`Error starting shell for pane ${paneId}:`, error);
            return false;
        }
    }

    async stopShellForTab(tabId) {
        try {
            const tab = this.tabs[tabId];
            if (!tab) return false;

            for (const pane of tab.panes) {
                if (pane.eventListeners) {
                    pane.eventListeners.forEach(disposable => {
                        if (disposable && typeof disposable.dispose === 'function') {
                            disposable.dispose();
                        }
                    });
                    pane.eventListeners = [];
                }

                if (window.electronAPI && window.electronAPI.tab) {
                    await window.electronAPI.tab.delete(pane.id);
                    debugLog(`Shell stopped for pane ${pane.id}`);
                }
                pane.isRunning = false;
            }
            
            this.updateTabUI();
            return true;
        } catch (error) {
            debugError(`Error stopping shells for tab ${tabId}:`, error);
            return false;
        }
    }

    switchTab(tabId) {
        if (!this.tabs[tabId]) return;
        
        // 全てのタブを非表示
        Object.values(this.tabs).forEach(tab => {
            tab.isActive = false;
            const wrapper = document.getElementById(`terminal-${tab.id}`);
            if (wrapper) {
                wrapper.style.display = 'none';
                wrapper.classList.remove('active');
            }
        });
        
        // アクティブタブを表示
        const activeTab = this.tabs[tabId];
        activeTab.isActive = true;
        const activeWrapper = document.getElementById(`terminal-${activeTab.id}`);
        if (activeWrapper) {
            activeWrapper.style.display = 'flex';
            activeWrapper.classList.add('active');
            // レイアウトクラスの適用を保証
            activeWrapper.classList.remove('split-h', 'split-v');
            if (activeTab.layout !== 'single') {
                activeWrapper.classList.add(activeTab.layout);
            }
        }
        
        // アクティブペインにフォーカス
        this.focusPane(activeTab.activePaneId);
        
        // 全ペインのリサイズ
        setTimeout(() => {
            activeTab.panes.forEach(p => {
                if (p.fitAddon) p.fitAddon.fit();
                if (p.isRunning && p.terminal) {
                    window.electronAPI.tab.resize(p.id, p.terminal.cols, p.terminal.rows);
                }
            });
        }, 100);
        
        this.activeTabId = tabId;
        this.updateTabUI();
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
            return;
        }
        
        const tab = this.tabs[tabId];
        
        // 全ペインの停止
        for (const pane of tab.panes) {
            if (pane.eventListeners) {
                pane.eventListeners.forEach(d => d.dispose());
            }
            if (window.electronAPI && window.electronAPI.tab) {
                try {
                    await window.electronAPI.tab.delete(pane.id);
                } catch (e) {}
            }
            if (pane.terminal) {
                pane.terminal.dispose();
            }
        }
        
        // ラッパーDOMの削除
        const wrapper = document.getElementById(`terminal-${tab.id}`);
        if (wrapper && wrapper.parentNode) {
            wrapper.parentNode.removeChild(wrapper);
        }
        
        // 管理データの更新
        if (tab.isParent) {
            const nextParent = this.tabOrder.find(id => id !== tabId);
            if (nextParent) this.setParentTab(nextParent);
        }
        
        if (this.activeTabId === tabId) {
            const nextActive = this.tabOrder.find(id => id !== tabId);
            if (nextActive) this.switchTab(nextActive);
        }
        
        const index = this.tabOrder.indexOf(tabId);
        if (index !== -1) this.tabOrder.splice(index, 1);
        
        delete this.tabs[tabId];
        this.renderTabs();
    }

    async deletePane(paneId) {
        const result = this.findPaneById(paneId);
        if (!result) return;
        
        const { tab, pane } = result;
        
        // 最後の1つのペインは削除させない（代わりにタブ自体を削除すべき）
        if (tab.panes.length <= 1) {
            debugLog('Cannot delete the last pane in a tab. Delete the tab instead.');
            return;
        }
        
        debugLog(`Deleting pane ${paneId} from tab ${tab.id}`);
        
        // プロセスの停止
        if (pane.isRunning && window.electronAPI && window.electronAPI.tab) {
            try {
                await window.electronAPI.tab.delete(pane.id);
            } catch (e) {
                debugError('Error deleting pane process:', e);
            }
        }
        
        // イベントリスナーの解除
        if (pane.eventListeners) {
            pane.eventListeners.forEach(d => d.dispose());
            pane.eventListeners = [];
        }
        
        // ターミナルの破棄
        if (pane.terminal) {
            pane.terminal.dispose();
        }
        
        // DOM要素の削除
        if (pane.element && pane.element.parentNode) {
            pane.element.parentNode.removeChild(pane.element);
        }
        
        // データ構造から削除
        const paneIndex = tab.panes.indexOf(pane);
        if (paneIndex !== -1) {
            tab.panes.splice(paneIndex, 1);
        }
        
        // レイアウトの更新（最後の1つになったらsingleに戻す）
        if (tab.panes.length === 1) {
            tab.layout = 'single';
            const wrapper = document.getElementById(`terminal-${tab.id}`);
            if (wrapper) {
                wrapper.classList.remove('split-h', 'split-v');
            }
        }
        
        // フォーカスの更新（削除されたペインがアクティブだった場合、別のペインへ）
        if (tab.activePaneId === paneId) {
            tab.activePaneId = tab.panes[0].id;
        }
        
        this.focusPane(tab.activePaneId);
        this.updateTabUI();
        
        // 残ったペインのリサイズ
        setTimeout(() => {
            tab.panes.forEach(p => {
                if (p.fitAddon) p.fitAddon.fit();
                if (p.isRunning && p.terminal) {
                    window.electronAPI.tab.resize(p.id, p.terminal.cols, p.terminal.rows);
                }
            });
        }, 100);
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
        
        tab.draggable = false;
        this.deps.resourceManager.addEventListener(tab, 'pointerdown', (e) => this.handleTabPointerDown(e, tabData, tab));
        
        const star = document.createElement('span');
        star.className = `parent-star ${tabData.isParent ? 'active' : 'inactive'}`;
        star.textContent = tabData.isParent ? '★' : '☆';
        star.title = tabData.isParent ? '親タブ（音声処理対象）' : '親タブに設定';
        this.deps.resourceManager.addEventListener(star, 'click', (e) => {
            e.stopPropagation();
            this.setParentTab(tabData.id);
        });
        
        const name = document.createElement('span');
        name.className = 'tab-name';
        name.textContent = tabData.name;
        name.title = 'ダブルクリックで名前を変更';
        this.deps.resourceManager.addEventListener(name, 'dblclick', (e) => {
            e.stopPropagation();
            this.openRenameEditor(tabData.id);
        });
        
        // 分割ボタン
        const splitH = document.createElement('button');
        splitH.className = 'tab-icon-btn';
        splitH.innerHTML = '<span class="icon-split-h"></span>';
        splitH.title = '横に分割';
        splitH.onclick = (e) => { e.stopPropagation(); this.splitTab('horizontal'); };

        const splitV = document.createElement('button');
        splitV.className = 'tab-icon-btn';
        splitV.innerHTML = '<span class="icon-split-v"></span>';
        splitV.title = '縦に分割';
        splitV.onclick = (e) => { e.stopPropagation(); this.splitTab('vertical'); };
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-button';
        closeBtn.textContent = '×';
        this.deps.resourceManager.addEventListener(closeBtn, 'click', async (e) => {
            e.stopPropagation();
            await this.deleteTab(tabData.id);
        });
        
        this.deps.resourceManager.addEventListener(tab, 'click', () => {
            this.switchTab(tabData.id);
        });
        
        tab.appendChild(star);
        tab.appendChild(name);
        tab.appendChild(splitH);
        tab.appendChild(splitV);
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
