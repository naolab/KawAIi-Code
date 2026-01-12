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
        this.nextTabNumber = 1;
        this.nextPaneNumber = 1; // 内部ペイン（PTY）用のユニークID
        this.tabOrder = []; // タブの順序を管理する配列
        this.MAX_TABS = 10; // タブの最大数を10個に制限
        this.dragState = null; // タブドラッグの状態管理
        this.onGlobalTabPointerMove = (event) => this.handleTabPointerMove(event);
        this.onGlobalTabPointerUp = (event) => this.handleTabPointerUp(event);
        
        // イベントリスナー重複防止フラグ
        this.isEventListenersInitialized = false;

        // ResizeObserverの初期化（全タブ・全ペイン共通で使用可能）
        this.resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                // 変更があった要素がアクティブなタブのものであればリサイズを実行
                // デバウンス処理はTerminalService側に任せる
                if (this.deps && this.deps.terminalService && typeof this.deps.terminalService.handleResize === 'function') {
                    this.deps.terminalService.handleResize();
                }
            }
        });
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
        debugLog(`[TabManager] handleTabData called:`, { paneId, dataLength: data.length, preview: data.substring(0, 50) });
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
        
        // 音声処理：キャラクターが設定されているか、デフォルトが利用可能な場合
        // pane.characterId === null は「読み上げOFF」を意味する
        let effectiveCharId = pane.characterId;
        let charIdSource = 'pane_setting';
        
        // まだ一度も設定されていない場合（undefined）のみ表示設定のキャラにフォールバック
        if (effectiveCharId === undefined) {
            const cdm = window.characterDisplayManager;
            if (cdm && cdm.currentSettings) {
                // 表示モードに応じて適切なキャラIDを取得
                if (cdm.currentSettings.mode === 'single') {
                    effectiveCharId = cdm.currentSettings.singleCharacter;
                } else if (cdm.currentSettings.mode === 'icon' && cdm.currentSettings.iconCharacters?.length > 0) {
                    // アイコンモードでは最初のキャラを使用（暫定）
                    effectiveCharId = cdm.currentSettings.iconCharacters[0];
                }
            }
            charIdSource = 'display_manager_fallback';
            console.log('[TabManager] Fallback character resolution:', {
                mode: cdm?.currentSettings?.mode,
                singleCharacter: cdm?.currentSettings?.singleCharacter,
                effectiveCharId
            });
        }
        
        // ログ出力でペイン設定状況を可視化
        debugLog(`[TabManager] Pane ${paneId} character resolution:`, {
            paneCharacterId: pane.characterId,
            effectiveCharId: effectiveCharId,
            source: charIdSource,
            isMuted: effectiveCharId === null,
            willProcess: !!(effectiveCharId && this.deps.messageAccumulator)
        });
        
        // effectiveCharId が null の場合は読み上げスキップ
        if (effectiveCharId && this.deps.messageAccumulator) {
            debugLog(`[TabManager] Passing data to MessageAccumulator:`, { paneId, effectiveCharId });
            // メッセージ蓄積とバッファ型スキャンのトリガー
            // data, terminal, characterId を渡す
            this.deps.messageAccumulator.addChunk(data, pane.terminal, effectiveCharId);
            
            // TerminalService.processTerminalData への直接呼び出しは削除（MessageAccumulator経由に一本化）
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

        // 木構造のルートノードを作成
        const layoutRoot = {
            type: 'terminal',
            id: paneId,
            size: 1.0,
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
            layout: 'single', // 後方互換性のため保持
            layoutRoot: layoutRoot,  // 木構造ルート
            isActive: true,
            createdAt: Date.now()
        };
        
        this.activeTabId = tabId;
        this.tabOrder.push(tabId);
        
        // フォーカスを設定
        this.focusPane(paneId);
        
        this.renderTabs();
        
        // ターミナルのサイズを確定させてから起動（プロンプト消失防止）
        if (fitAddon) {
            // DOMへの反映を待つための待機時間を少し多めに取る
            setTimeout(async () => {
                try {
                    // ラッパーが表示されていることを確認
                    if (existingWrapper && existingWrapper.offsetParent !== null) {
                        // 複数回fit()を実行して確実にサイズを確定
                        fitAddon.fit();
                        await new Promise(resolve => setTimeout(resolve, 100));
                        fitAddon.fit();
                        debugLog('📏 Initial tab fit() executed');
                    }

                    // シェル起動前にもう一度待機（DOM反映を確実にする）
                    await new Promise(resolve => setTimeout(resolve, 300));
                    await this.startShellForPane(tabId, paneId);

                    // 起動後にフォーカスを当てる（複数回呼んで確実にする）
                    this.focusPane(paneId);
                    if (terminal) {
                        terminal.focus();
                        // 念のためテキストエリアにもフォーカスを試みる
                        const textarea = terminal.element ? terminal.element.querySelector('.xterm-helper-textarea') : null;
                        if (textarea) textarea.focus();
                    }

                    debugLog('✅ Initial tab activation complete');
                } catch (e) {
                    debugError('📏 Initial tab fit error:', e);
                    await this.startShellForPane(tabId, paneId);
                }
            }, 400); // 待機時間を400msに増加
        } else {
            await this.startShellForPane(tabId, paneId);
        }
    }

    createPaneElement(paneId) {
        const pane = document.createElement('div');
        pane.className = 'terminal-pane';
        pane.setAttribute('data-pane-id', paneId);
        
        // キャラクター選択ボタン
        const charButton = document.createElement('button');
        charButton.className = 'pane-char-button muted';
        charButton.title = 'キャラクター選択';
        // デフォルトはミュートSVG
        charButton.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="white" style="opacity: 0.7;"><path d="M3.63 3.63a.996.996 0 000 1.41L7.29 8.7 7 9H4c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1h3l3.29 3.29c.63.63 1.71.18 1.71-.71v-4.17l4.18 4.18c-.49.37-1.02.68-1.6.91-.36.15-.58.53-.58.95 0 .72.73 1.18 1.39.91.8-.33 1.55-.77 2.22-1.31l1.34 1.34a.996.996 0 101.41-1.41L5.05 3.63a.996.996 0 00-1.42 0zM19 12c0 .82-.15 1.61-.41 2.34l1.53 1.53c.56-1.17.88-2.48.88-3.87 0-3.83-2.4-7.11-5.78-8.4-.59-.23-1.22.23-1.22.86v.19c0 .38.25.71.61.85C17.18 6.54 19 9.06 19 12zm-8.71-6.29l-.17.17L12 7.76V6.41c0-.89-1.08-1.34-1.71-.71z"/></svg>';
        
        charButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openCharSelectPopup(e, paneId);
        });
        pane.appendChild(charButton);

        const container = document.createElement('div');
        container.className = 'xterm-container';
        pane.appendChild(container);
        
        // フォーカスイベント
        pane.addEventListener('mousedown', () => {
            this.focusPane(paneId);
        });

        // ResizeObserverに登録
        if (this.resizeObserver) {
            this.resizeObserver.observe(pane);
        }
        
        return pane;
    }

    focusPane(paneId) {
        const tab = this.tabs[this.activeTabId];
        if (!tab) return;

        // マイグレーション実行
        this.migrateTabLayout(tab);

        if (!tab.layoutRoot) return;

        // 木構造からペインノードを取得
        const paneNode = this.findNodeById(tab.layoutRoot, paneId);
        if (!paneNode || paneNode.type !== 'terminal') return;

        // 全ペインからfocusedクラスを削除
        this.forEachTerminalNode(tab.layoutRoot, (node) => {
            if (node.element) {
                node.element.classList.remove('focused');
            }
        });

        // 対象ペインにfocusedクラスを追加
        if (paneNode.element) {
            paneNode.element.classList.add('focused');
        }

        // アクティブペインIDを更新
        tab.activePaneId = paneId;

        // ターミナルにフォーカス
        if (paneNode.terminal) {
            paneNode.terminal.focus();
        }

        debugLog(`🎯 フォーカス更新: ${paneId}`);
    }

    async createEmptyTab() {
        // タブ数制限チェック
        if (Object.keys(this.tabs).length >= this.MAX_TABS) {
            if (this.deps.showNotification) {
                this.deps.showNotification(`タブの最大数（${this.MAX_TABS}個）に達しています。既存のタブを閉じてから新しいタブを作成してください。`, 'warning');
            } else {
                // フォールバック（通常は発生しない）
                console.warn(`タブの最大数（${this.MAX_TABS}個）に達しています。`);
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

        // 木構造のルートノードを作成
        const layoutRoot = {
            type: 'terminal',
            id: paneId,
            size: 1.0,
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
            layoutRoot: layoutRoot,  // 木構造ルート
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

    /**
     * 選択中のペインを分割（木構造対応）
     * @param {string} direction - 分割方向 ('horizontal' | 'vertical')
     */
    async splitPane(direction = 'horizontal') {
        const tab = this.tabs[this.activeTabId];
        if (!tab) return;

        // マイグレーション実行
        this.migrateTabLayout(tab);

        if (!tab.layoutRoot) {
            debugError('layoutRootが存在しません');
            return;
        }

        // 最大ペイン数チェック
        const terminalCount = this.countTerminalNodes(tab.layoutRoot);
        if (terminalCount >= 4) {
            debugLog('⚠️  最大ペイン数（4個）に達しています');
            if (this.deps.showNotification) {
                this.deps.showNotification('最大ペイン数（4個）に達しています', 'warning');
            } else {
                // フォールバック（通常は発生しない）
                console.warn('最大ペイン数（4個）に達しています');
            }
            return;
        }

        // アクティブペインのノードを取得
        const activePaneNode = this.findNodeById(tab.layoutRoot, tab.activePaneId);
        if (!activePaneNode || activePaneNode.type !== 'terminal') {
            debugError('アクティブペインが見つかりません');
            return;
        }

        debugLog(`📐 ペイン ${tab.activePaneId} を${direction === 'vertical' ? '縦' : '横'}に分割中...`);

        // 新しいペインを作成
        const newPaneId = `pane-${this.nextPaneNumber++}`;
        const newTerminal = new Terminal(TerminalFactory.createConfig());
        const newFitAddon = new FitAddon.FitAddon();
        newTerminal.loadAddon(newFitAddon);
        newTerminal.loadAddon(new WebLinksAddon.WebLinksAddon());

        const newPaneNode = {
            type: 'terminal',
            id: newPaneId,
            size: 0.5,
            terminal: newTerminal,
            fitAddon: newFitAddon,
            element: null,  // renderLayoutNodeで生成される
            isRunning: false,
            eventListeners: []
        };

        // ★ 重要: フラットなリストにも追加してID検索可能にする
        // これがないと handleTabData でペインが見つからずデータが表示されない
        // newPaneNode と同じオブジェクト参照を入れることで状態を共有する
        const flatPane = newPaneNode; 
        tab.panes.push(flatPane);

        // アクティブペインを含むコンテナノードを作成
        const parentNode = this.findParentNode(tab.layoutRoot, activePaneNode.id);
        const originalSize = activePaneNode.size; // 元のサイズを保持
        activePaneNode.size = 0.5;

        const containerNode = {
            type: 'container',
            direction: direction,
            size: originalSize,  // 元のペインのサイズを継承
            children: [activePaneNode, newPaneNode]
        };

        if (parentNode) {
            // アクティブペインを親の子リストから新しいコンテナに置き換え
            const index = parentNode.children.indexOf(activePaneNode);
            // containerNode.sizeは既にoriginalSizeで設定済み
            parentNode.children[index] = containerNode;
        } else {
            // アクティブペインがルート（単一ペイン）の場合、ルートを置き換え
            containerNode.size = 1.0;
            tab.layoutRoot = containerNode;
        }

        // レイアウト全体を再レンダリング
        this.renderTabLayout(tab);

        // DOMとターミナルのサイズが確定するまで待機
        await new Promise(resolve => setTimeout(resolve, 200));

        // 新しいペインでシェル起動
        await this.startShellForPane(tab.id, newPaneId);
        this.focusPane(newPaneId);

        debugLog(`✅ ペイン分割完了`);
    }

    /**
     * 旧splitTabメソッド（後方互換性のため残す）
     * @deprecated splitPane()を使用してください
     */
    async splitTab(direction = 'horizontal') {
        return await this.splitPane(direction);
    }



    async startShellForPane(tabId, paneId) {
        try {
            if (!window.electronAPI || !window.electronAPI.tab) {
                debugError('ElectronAPI.tab not available');
                return false;
            }

            const tab = this.tabs[tabId];
            if (!tab) return false;

            // マイグレーション実行
            this.migrateTabLayout(tab);

            if (!tab.layoutRoot) {
                debugError(`Tab ${tabId} has no layoutRoot`);
                return false;
            }

            // 木構造からペインノードを取得
            const paneNode = this.findNodeById(tab.layoutRoot, paneId);
            if (!paneNode || paneNode.type !== 'terminal') {
                debugError(`Pane ${paneId} not found in tab ${tabId}`);
                return false;
            }

            debugLog(`Starting shell for pane ${paneId} in tab ${tabId}`);

            // クリーンアップ
            if (paneNode.eventListeners) {
                paneNode.eventListeners.forEach(disposable => {
                    if (disposable && typeof disposable.dispose === 'function') {
                        disposable.dispose();
                    }
                });
                paneNode.eventListeners = [];
            }

            // 起動前にサイズを合わせる
            if (paneNode.fitAddon && paneNode.element && paneNode.element.offsetParent) {
                try {
                    paneNode.fitAddon.fit();
                    debugLog(`📏 Fitted pane ${paneId} before start`);
                } catch (e) {
                    debugError(`Error fitting pane ${paneId}:`, e);
                }
            }

            // 現在のターミナルサイズを取得
            // 最小サイズを保証 (cols: 2, rows: 1) - node-ptyの制限
            let cols = paneNode.terminal ? paneNode.terminal.cols : 80;
            let rows = paneNode.terminal ? paneNode.terminal.rows : 24;

            if (cols < 2) cols = 80;
            if (rows < 1) rows = 24;

            debugLog(`🚀 Creating shell for pane ${paneId} with size ${cols}x${rows}`);

            // バックエンドでPTYプロセス作成（paneIdをそのままPtyIDとして使用）
            const result = await window.electronAPI.tab.create(paneId, cols, rows);
            if (!result.success) {
                debugError(`Failed to create pane process: ${result.error}`);
                if (paneNode.terminal) {
                    paneNode.terminal.writeln(`\x1b[31mError: ${result.error}\x1b[0m`);
                }
                return false;
            }

            const terminal = paneNode.terminal;
            paneNode.eventListeners.push(terminal.onData((data) => {
                window.electronAPI.tab.write(paneId, data);
            }));

            paneNode.eventListeners.push(terminal.onResize(({ cols, rows }) => {
                window.electronAPI.tab.resize(paneId, cols, rows);
            }));

            // 起動直後のリサイズは不要になった（作成時に正しいサイズを渡しているため）

            paneNode.isRunning = true;
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
            // ResizeObserverの解除
            if (pane.element && this.resizeObserver) {
                this.resizeObserver.unobserve(pane.element);
            }
        }
        
        // ラッパーDOMの削除
        const wrapper = document.getElementById(`terminal-${tab.id}`);
        if (wrapper && wrapper.parentNode) {
            wrapper.parentNode.removeChild(wrapper);
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

    /**
     * ペインを削除（木構造対応）
     * @param {string} paneId - 削除するペインID
     */
    async deletePane(paneId) {
        const tab = this.tabs[this.activeTabId];
        if (!tab) return;

        // マイグレーション実行
        this.migrateTabLayout(tab);

        if (!tab.layoutRoot) {
            debugError('layoutRootが存在しません');
            return;
        }

        // 削除するペインのノードを取得
        const paneNode = this.findNodeById(tab.layoutRoot, paneId);
        if (!paneNode || paneNode.type !== 'terminal') {
            debugError(`ペイン ${paneId} が見つかりません`);
            return;
        }

        // 最後の1つのペインは削除不可
        const terminalCount = this.countTerminalNodes(tab.layoutRoot);
        if (terminalCount <= 1) {
            debugLog('⚠️  最後のペインは削除できません');
            return;
        }

        debugLog(`🗑️  ペイン ${paneId} を削除中...`);

        // リソースのクリーンアップ
        if (paneNode.isRunning && window.electronAPI?.tab) {
            try {
                await window.electronAPI.tab.delete(paneId);
            } catch (e) {
                debugError('PTYプロセス削除エラー:', e);
            }
        }

        if (paneNode.eventListeners) {
            paneNode.eventListeners.forEach(d => d.dispose?.());
            paneNode.eventListeners = [];
        }

        if (paneNode.terminal) {
            paneNode.terminal.dispose();
        }

        // ResizeObserverの解除
        if (paneNode.element && this.resizeObserver) {
            this.resizeObserver.unobserve(paneNode.element);
        }

        // フラットなリストからも削除
        const paneIndex = tab.panes.findIndex(p => p.id === paneId);
        if (paneIndex !== -1) {
            tab.panes.splice(paneIndex, 1);
        }

        // 木構造から削除
        const parentNode = this.findParentNode(tab.layoutRoot, paneId);

        if (parentNode) {
            // 親から削除
            const index = parentNode.children.findIndex(c => c === paneNode || c.id === paneId);
            if (index !== -1) {
                parentNode.children.splice(index, 1);
            }

            // 親コンテナが子1つだけになった場合は折りたたむ
            if (parentNode.children.length === 1) {
                const sibling = parentNode.children[0];
                sibling.size = parentNode.size;  // 親のサイズを継承

                const grandparent = this.findParentNode(tab.layoutRoot, parentNode);
                if (grandparent) {
                    // 親コンテナを兄弟ノードで置き換え
                    const parentIndex = grandparent.children.indexOf(parentNode);
                    if (parentIndex !== -1) {
                        grandparent.children[parentIndex] = sibling;
                    }
                } else {
                    // 親がルート → 兄弟ノードを新しいルートにする
                    tab.layoutRoot = sibling;
                }
            } else {
                // 残りの子でサイズを再分配
                const totalSize = parentNode.children.reduce((sum, c) => sum + c.size, 0);
                parentNode.children.forEach(c => {
                    c.size = c.size / totalSize;
                });
            }
        } else {
            // 親が見つからない（ルートノード自体を削除しようとしている）
            debugError('ルートペインは削除できません');
            return;
        }

        // アクティブペインの更新
        if (tab.activePaneId === paneId) {
            const firstTerminal = this.findFirstTerminalNode(tab.layoutRoot);
            if (firstTerminal) {
                tab.activePaneId = firstTerminal.id;
            }
        }

        // レイアウト全体を再レンダリング
        this.renderTabLayout(tab);
        this.focusPane(tab.activePaneId);
        this.updateTabUI();

        debugLog(`✅ ペイン削除完了`);
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

    // ========================================
    // キャラクター選択ポップアップ関連
    // ========================================

    openCharSelectPopup(event, paneId) {
        // 既存のポップアップを閉じる
        const existingPopup = document.querySelector('.char-select-popup');
        if (existingPopup) existingPopup.remove();

        const button = event.currentTarget;
        const rect = button.getBoundingClientRect();
        
        const popup = document.createElement('div');
        popup.className = 'char-select-popup';
        
        // ConfigManagerからキャラクターリストを取得
        let characters = [];
        if (this.deps.terminalApp && this.deps.terminalApp.configManager) {
            characters = this.deps.terminalApp.configManager.getCharacters();
        } else if (window.terminalApp && window.terminalApp.configManager) {
            characters = window.terminalApp.configManager.getCharacters();
        }

        // 現在全ペインで使用されている文字IDのリストを取得
        const selectedCharIds = this.getSelectedCharacters();
        const { pane: currentPane } = this.findPaneById(paneId) || {};

        // キャラクターリストを表示
        characters.forEach(char => {
            const item = document.createElement('div');
            item.className = 'char-select-item';
            
            // 既に使用されているキャラかチェック（自分自身が今使っているキャラ以外）
            const isInUse = selectedCharIds.includes(char.id) && (!currentPane || currentPane.characterId !== char.id);
            if (isInUse) {
                item.classList.add('in-use');
                item.title = '他のペインで使用中です';
            }

            const icon = document.createElement('img');
            icon.src = char.icon || '../assets/icons/new-app-icon.png';
            
            const name = document.createElement('span');
            name.textContent = char.name;
            if (isInUse) {
                name.textContent += ' (使用中)';
            }
            
            item.appendChild(icon);
            item.appendChild(name);
            
            // 現在選択中のキャラならハイライト
            if (currentPane && currentPane.characterId === char.id) {
                item.classList.add('active');
            }
            
            if (!isInUse) {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.setPaneCharacter(paneId, char.id);
                    popup.remove();
                });
            } else {
                // 使用中の場合はクリックを無効化するスタイルを適用
                item.style.opacity = '0.5';
                item.style.cursor = 'not-allowed';
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.deps.showNotification) {
                        this.deps.showNotification(`${char.name} は他のペインで使用中です`, 'info');
                    }
                });
            }
            
            popup.appendChild(item);
        });

        // ミュート（OFF）オプション
        const muteItem = document.createElement('div');
        muteItem.className = 'char-select-item mute-item';
        muteItem.innerHTML = `
            <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.05); border-radius: 50%; border: 1px solid var(--theme-border); flex-shrink: 0;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="opacity: 0.6;"><path d="M3.63 3.63a.996.996 0 000 1.41L7.29 8.7 7 9H4c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1h3l3.29 3.29c.63.63 1.71.18 1.71-.71v-4.17l4.18 4.18c-.49.37-1.02.68-1.6.91-.36.15-.58.53-.58.95 0 .72.73 1.18 1.39.91.8-.33 1.55-.77 2.22-1.31l1.34 1.34a.996.996 0 101.41-1.41L5.05 3.63a.996.996 0 00-1.42 0zM19 12c0 .82-.15 1.61-.41 2.34l1.53 1.53c.56-1.17.88-2.48.88-3.87 0-3.83-2.4-7.11-5.78-8.4-.59-.23-1.22.23-1.22.86v.19c0 .38.25.71.61.85C17.18 6.54 19 9.06 19 12zm-8.71-6.29l-.17.17L12 7.76V6.41c0-.89-1.08-1.34-1.71-.71z"/></svg>
            </div>
            <span>読み上げなし</span>
        `;
        muteItem.addEventListener('click', (e) => {
            e.stopPropagation();
            this.setPaneCharacter(paneId, null); // nullでミュート
            popup.remove();
        });
        popup.appendChild(muteItem);

        // ポップアップ配置（ボタンの左下に表示）
        document.body.appendChild(popup);
        
        const popupRect = popup.getBoundingClientRect();
        let left = rect.right - popupRect.width;
        let top = rect.bottom + 5;
        
        // 画面外にはみ出さないように調整
        if (left < 0) left = 10;
        if (top + popupRect.height > window.innerHeight) top = rect.top - popupRect.height - 5;
        
        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;

        // 外部クリックで閉じる処理
        const closeHandler = (e) => {
            if (!popup.contains(e.target) && e.target !== button) {
                popup.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        // 即座に閉じないようにsetTimeout
        setTimeout(() => document.addEventListener('click', closeHandler), 0);
    }

    setPaneCharacter(paneId, characterId) {
        console.log(`[TabManager] setPaneCharacter called:`, { paneId, characterId });
        const result = this.findPaneById(paneId);
        if (!result) {
            console.warn(`[TabManager] Pane not found:`, paneId);
            return;
        }
        
        const { pane } = result;
        const prevCharacterId = pane.characterId;
        pane.characterId = characterId; // キャラIDを設定（nullならOFF）
        
        // UI更新
        this.updatePaneCharButton(pane);
        
        console.log(`[TabManager] 🔊 Pane ${paneId} character changed:`, {
            previous: prevCharacterId === undefined ? 'undefined (will fallback)' : (prevCharacterId || 'Muted'),
            new: characterId || 'Muted'
        });
    }

    updatePaneCharButton(pane) {
        if (!pane || !pane.element) return;
        
        const button = pane.element.querySelector('.pane-char-button');
        if (!button) return;
        
        let char = null;
        if (pane.characterId) {
            // ConfigManagerからキャラ情報を取得
            if (this.deps.terminalApp && this.deps.terminalApp.configManager) {
                char = this.deps.terminalApp.configManager.getCharacterById(pane.characterId);
            } else if (window.terminalApp && window.terminalApp.configManager) {
                char = window.terminalApp.configManager.getCharacterById(pane.characterId);
            }
        }
        
        if (char) {
            // キャラクターが設定されている場合
            button.innerHTML = `<img src="${char.icon || '../assets/icons/new-app-icon.png'}" width="20" height="20" style="border-radius: 50%; object-fit: cover;">`;
            button.classList.remove('muted');
            button.title = `${char.name} が読み上げ中`;
        } else {
            // ミュートの場合、またはキャラが見つからない場合
            if (pane.characterId) pane.characterId = null; // 見つからない場合はクリア
            button.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="white" style="opacity: 0.7;"><path d="M3.63 3.63a.996.996 0 000 1.41L7.29 8.7 7 9H4c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1h3l3.29 3.29c.63.63 1.71.18 1.71-.71v-4.17l4.18 4.18c-.49.37-1.02.68-1.6.91-.36.15-.58.53-.58.95 0 .72.73 1.18 1.39.91.8-.33 1.55-.77 2.22-1.31l1.34 1.34a.996.996 0 101.41-1.41L5.05 3.63a.996.996 0 00-1.42 0zM19 12c0 .82-.15 1.61-.41 2.34l1.53 1.53c.56-1.17.88-2.48.88-3.87 0-3.83-2.4-7.11-5.78-8.4-.59-.23-1.22.23-1.22.86v.19c0 .38.25.71.61.85C17.18 6.54 19 9.06 19 12zm-8.71-6.29l-.17.17L12 7.76V6.41c0-.89-1.08-1.34-1.71-.71z"/></svg>';
            button.classList.add('muted');
            button.title = '読み上げなし（クリックして選択）';
        }
    }

    /**
     * 全てのペインで選択されているキャラクターIDのリストを取得
     */
    getSelectedCharacters() {
        const selectedIds = [];
        Object.values(this.tabs).forEach(tab => {
            if (tab.panes) {
                tab.panes.forEach(pane => {
                    if (pane.characterId) {
                        selectedIds.push(pane.characterId);
                    }
                });
            }
        });
        return selectedIds;
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

    // ========================================
    // 木構造レイアウト用ヘルパーメソッド
    // ========================================

    /**
     * ペインIDでノードを検索
     * @param {Object} node - 検索するノード
     * @param {string} paneId - 検索するペインID
     * @returns {Object|null} - 見つかったノードまたはnull
     */
    findNodeById(node, paneId) {
        if (!node) return null;

        if (node.type === 'terminal' && node.id === paneId) {
            return node;
        }

        if (node.type === 'container' && node.children) {
            for (const child of node.children) {
                const result = this.findNodeById(child, paneId);
                if (result) return result;
            }
        }

        return null;
    }

    /**
     * ノードの親ノードを検索
     * @param {Object} root - ルートノード
     * @param {string} childId - 子ノードのペインID
     * @returns {Object|null} - 親ノードまたはnull
     */
    findParentNode(root, childId) {
        if (!root || root.type !== 'container' || !root.children) {
            return null;
        }

        // 直接の子をチェック
        for (const child of root.children) {
            if ((child.type === 'terminal' && child.id === childId) || child === childId) {
                return root;
            }
        }

        // 再帰的に子孫をチェック
        for (const child of root.children) {
            if (child.type === 'container') {
                const result = this.findParentNode(child, childId);
                if (result) return result;
            }
        }

        return null;
    }

    /**
     * ターミナルノードの数をカウント
     * @param {Object} node - カウントするノード
     * @returns {number} - ターミナルノード数
     */
    countTerminalNodes(node) {
        if (!node) return 0;

        if (node.type === 'terminal') {
            return 1;
        }

        if (node.type === 'container' && node.children) {
            return node.children.reduce((sum, child) => sum + this.countTerminalNodes(child), 0);
        }

        return 0;
    }

    /**
     * 最初のターミナルノードを取得
     * @param {Object} node - 検索するノード
     * @returns {Object|null} - 最初のターミナルノードまたはnull
     */
    findFirstTerminalNode(node) {
        if (!node) return null;

        if (node.type === 'terminal') {
            return node;
        }

        if (node.type === 'container' && node.children && node.children.length > 0) {
            return this.findFirstTerminalNode(node.children[0]);
        }

        return null;
    }

    /**
     * 全ターミナルノードに対してコールバックを実行
     * @param {Object} node - 処理するノード
     * @param {Function} callback - 各ターミナルノードに対して実行する関数
     */
    forEachTerminalNode(node, callback) {
        if (!node) return;

        if (node.type === 'terminal') {
            callback(node);
        } else if (node.type === 'container' && node.children) {
            node.children.forEach(child => this.forEachTerminalNode(child, callback));
        }
    }

    /**
     * 既存のフラット配列構造を木構造に変換（マイグレーション）
     * @param {Object} tab - 変換するタブオブジェクト
     */
    migrateTabLayout(tab) {
        // 既にlayoutRootが存在する場合はスキップ
        if (tab.layoutRoot) {
            return;
        }

        debugLog(`🔄 タブ ${tab.id} を木構造に変換中...`);

        // 単一ペインの場合
        if (!tab.panes || tab.panes.length === 0) {
            debugLog(`⚠️  タブ ${tab.id} にペインが存在しません`);
            return;
        }

        if (tab.panes.length === 1) {
            // ペイン1つ: 単純なターミナルノード
            tab.layoutRoot = {
                type: 'terminal',
                id: tab.panes[0].id,
                size: 1.0,
                terminal: tab.panes[0].terminal,
                fitAddon: tab.panes[0].fitAddon,
                element: tab.panes[0].element,
                isRunning: tab.panes[0].isRunning,
                eventListeners: tab.panes[0].eventListeners || []
            };
        } else {
            // 複数ペイン: コンテナノード作成
            const direction = tab.layout === 'split-v' ? 'vertical' : 'horizontal';
            const paneSize = 1.0 / tab.panes.length;

            tab.layoutRoot = {
                type: 'container',
                direction: direction,
                size: 1.0,
                children: tab.panes.map(pane => ({
                    type: 'terminal',
                    id: pane.id,
                    size: paneSize,
                    terminal: pane.terminal,
                    fitAddon: pane.fitAddon,
                    element: pane.element,
                    isRunning: pane.isRunning,
                    eventListeners: pane.eventListeners || []
                }))
            };
        }

        debugLog(`✅ タブ ${tab.id} の木構造変換完了`);
    }

    // ========================================
    // 木構造レイアウトDOM生成
    // ========================================

    /**
     * 木構造ノードを再帰的にDOMに変換
     * @param {Object} node - レンダリングするノード
     * @param {HTMLElement} parentElement - 親DOM要素
     * @returns {HTMLElement|null} - 生成されたDOM要素
     */
    renderLayoutNode(node, parentElement) {
        if (!node || !parentElement) return null;

        if (node.type === 'terminal') {
            // ターミナルノード: ペイン要素を作成
            let paneElement = node.element;

            // 既存の要素がない場合は新規作成
            if (!paneElement) {
                paneElement = this.createPaneElement(node.id);
                node.element = paneElement;

                // ターミナルを接続
                if (node.terminal) {
                    const xtermContainer = paneElement.querySelector('.xterm-container');
                    if (xtermContainer && !node.terminal.element) {
                        debugLog(`🖥️  ターミナル ${node.id} を DOM に接続中...`);
                        node.terminal.open(xtermContainer);
                        debugLog(`✅ ターミナル ${node.id} 接続完了`);
                    }
                }
            }

            // Flexサイズを設定
            paneElement.style.flex = node.size.toString();
            paneElement.style.minWidth = '0';
            paneElement.style.minHeight = '0';

            parentElement.appendChild(paneElement);
            return paneElement;

        } else if (node.type === 'container') {
            // コンテナノード: コンテナ要素を作成して再帰的に子をレンダリング
            const container = document.createElement('div');
            container.className = 'layout-container';
            container.style.display = 'flex';
            container.style.flexDirection = node.direction === 'vertical' ? 'column' : 'row';
            container.style.flex = node.size.toString();
            container.style.minWidth = '0';
            container.style.minHeight = '0';

            // 子ノードを再帰的にレンダリング + リサイザーを追加
            if (node.children && node.children.length > 0) {
                node.children.forEach((child, index) => {
                    this.renderLayoutNode(child, container);

                    // 最後の子以外にリサイザーを追加
                    if (index < node.children.length - 1) {
                        const resizer = this.createResizer(node.direction, node, index);
                        container.appendChild(resizer);
                    }
                });
            }

            parentElement.appendChild(container);
            return container;
        }

        return null;
    }

    /**
     * タブ全体のレイアウトを再レンダリング
     * @param {Object} tab - レンダリングするタブ
     */
    renderTabLayout(tab) {
        if (!tab) return;

        debugLog(`🎨 タブ ${tab.id} のレイアウトをレンダリング中...`);

        // マイグレーション実行（必要な場合）
        this.migrateTabLayout(tab);

        if (!tab.layoutRoot) {
            debugError(`タブ ${tab.id} にlayoutRootが存在しません`);
            return;
        }

        // ラッパー要素を取得
        const wrapper = document.getElementById(`terminal-${tab.id}`);
        if (!wrapper) {
            debugError(`タブ ${tab.id} のラッパー要素が見つかりません`);
            return;
        }

        // 既存の子要素をクリア
        wrapper.innerHTML = '';

        // 木構造から再帰的にDOMを生成
        this.renderLayoutNode(tab.layoutRoot, wrapper);

        // 全ペインのリサイズ
        setTimeout(() => {
            this.forEachTerminalNode(tab.layoutRoot, (node) => {
                if (node.fitAddon && node.element?.offsetParent) {
                    node.fitAddon.fit();
                    if (node.isRunning && node.terminal) {
                        window.electronAPI.tab.resize(node.id, node.terminal.cols, node.terminal.rows);
                    }
                }
            });
        }, 100);

        debugLog(`✅ タブ ${tab.id} のレイアウトレンダリング完了`);
    }

    /**
     * リサイザー要素を作成
     * @param {string} direction - 分割方向 ('horizontal' | 'vertical')
     * @param {Object} containerNode - 親コンテナノード
     * @param {number} childIndex - リサイザーの前の子のインデックス
     * @returns {HTMLElement} - リサイザー要素
     */
    createResizer(direction, containerNode, childIndex) {
        const resizer = document.createElement('div');
        resizer.className = `layout-resizer ${direction}`;

        let isResizing = false;
        let startPos = 0;
        let startSizes = [];
        let beforeNode = null;
        let afterNode = null;

        const handleMouseDown = (e) => {
            e.preventDefault();
            isResizing = true;
            startPos = direction === 'horizontal' ? e.clientX : e.clientY;
            resizer.classList.add('dragging');

            // 前後のノードを取得
            beforeNode = containerNode.children[childIndex];
            afterNode = containerNode.children[childIndex + 1];

            if (!beforeNode || !afterNode) {
                isResizing = false;
                return;
            }

            // 初期サイズを記録
            startSizes = [beforeNode.size, afterNode.size];

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        };

        const handleMouseMove = (e) => {
            if (!isResizing) return;

            const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
            const delta = currentPos - startPos;

            // コンテナのサイズを取得
            const container = resizer.parentElement;
            if (!container) return;

            const containerSize = direction === 'horizontal'
                ? container.offsetWidth
                : container.offsetHeight;

            // deltaをサイズ比率に変換
            const deltaRatio = delta / containerSize;

            // 最小サイズ制限（10%）
            const minSize = 0.1;
            const newBeforeSize = Math.max(minSize, Math.min(startSizes[0] + startSizes[1] - minSize, startSizes[0] + deltaRatio));
            const newAfterSize = startSizes[0] + startSizes[1] - newBeforeSize;

            // ノードのサイズを更新
            beforeNode.size = newBeforeSize;
            afterNode.size = newAfterSize;

            // DOMに反映
            const beforeElement = beforeNode.element || container.children[childIndex * 2];
            const afterElement = afterNode.element || container.children[(childIndex + 1) * 2];

            if (beforeElement) beforeElement.style.flex = newBeforeSize.toString();
            if (afterElement) afterElement.style.flex = newAfterSize.toString();
        };

        const handleMouseUp = () => {
            if (!isResizing) return;

            isResizing = false;
            resizer.classList.remove('dragging');
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        resizer.addEventListener('mousedown', handleMouseDown);

        return resizer;
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
