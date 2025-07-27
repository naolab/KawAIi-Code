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
        this.draggedTabId = null; // ドラッグ中のタブID
        this.tabOrder = []; // タブの順序を管理する配列
        
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
            name: 'Main',
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
            createdAt: Date.now()
        };
        
        // タブ順序配列に追加
        this.tabOrder.push(tabId);
        
        this.renderTabs();
        this.switchTab(tabId);
        
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

            const aiName = aiType === 'claude' ? 'Claude Code' : 'Claude Code (Dangerous)';
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
        
        // 1. イベントリスナーをクリーンアップ
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
        
        // ドラッグ&ドロップ機能を追加（ResourceManager経由）
        tab.draggable = true;
        this.deps.resourceManager.addEventListener(tab, 'dragstart', (e) => this.handleDragStart(e, tabData.id));
        this.deps.resourceManager.addEventListener(tab, 'dragover', (e) => this.handleDragOver(e));
        this.deps.resourceManager.addEventListener(tab, 'dragleave', (e) => this.handleDragLeave(e));
        this.deps.resourceManager.addEventListener(tab, 'drop', (e) => this.handleDrop(e, tabData.id));
        this.deps.resourceManager.addEventListener(tab, 'dragend', (e) => this.handleDragEnd(e));
        
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
        
        tab.appendChild(star);
        tab.appendChild(name);
        tab.appendChild(closeBtn);
        
        return tab;
    }

    updateTabUI() {
        this.renderTabs();
    }

    // ドラッグ&ドロップハンドラー
    handleDragStart(e, tabId) {
        this.draggedTabId = tabId;
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', e.target.outerHTML);
        debugLog(`Drag started: ${tabId}`);
    }

    handleDragOver(e) {
        if (e.preventDefault) {
            e.preventDefault();
        }
        e.dataTransfer.dropEffect = 'move';
        
        // ドラッグオーバー効果を追加
        const tabElement = e.currentTarget;
        if (tabElement && !tabElement.classList.contains('dragging')) {
            tabElement.classList.add('drag-over');
        }
        
        return false;
    }

    handleDragLeave(e) {
        // マウスが子要素に移動した場合は無視
        if (e.currentTarget.contains(e.relatedTarget)) {
            return;
        }
        e.currentTarget.classList.remove('drag-over');
    }

    handleDrop(e, targetTabId) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }

        // ドラッグオーバー効果を削除
        e.currentTarget.classList.remove('drag-over');

        if (this.draggedTabId && this.draggedTabId !== targetTabId) {
            this.reorderTabs(this.draggedTabId, targetTabId);
            debugLog(`Tab dropped: ${this.draggedTabId} -> ${targetTabId}`);
        }

        return false;
    }

    handleDragEnd(e) {
        // 全てのドラッグ関連クラスを削除
        e.target.classList.remove('dragging');
        const allTabs = document.querySelectorAll('.tab');
        allTabs.forEach(tab => tab.classList.remove('drag-over'));
        
        this.draggedTabId = null;
        debugLog('Drag ended');
    }

    // タブの順序を変更
    reorderTabs(draggedTabId, targetTabId) {
        const draggedIndex = this.tabOrder.indexOf(draggedTabId);
        const targetIndex = this.tabOrder.indexOf(targetTabId);

        if (draggedIndex !== -1 && targetIndex !== -1) {
            // ドラッグ方向を判定
            const isMovingRight = draggedIndex < targetIndex;
            
            // 配列から要素を削除
            this.tabOrder.splice(draggedIndex, 1);
            
            // ドラッグ方向に応じて挿入位置を決定
            const newTargetIndex = this.tabOrder.indexOf(targetTabId);
            
            if (isMovingRight) {
                // 右移動：ターゲットの後に挿入
                this.tabOrder.splice(newTargetIndex + 1, 0, draggedTabId);
                debugLog(`Moving right: ${draggedTabId} inserted after ${targetTabId}`);
            } else {
                // 左移動：ターゲットの前に挿入（従来通り）
                this.tabOrder.splice(newTargetIndex, 0, draggedTabId);
                debugLog(`Moving left: ${draggedTabId} inserted before ${targetTabId}`);
            }

            debugLog(`Tab order updated:`, this.tabOrder);
            this.renderTabs();
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
