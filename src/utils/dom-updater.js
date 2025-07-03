/**
 * DOM操作最適化ユーティリティ
 * - XSS対策のためのセキュアなDOM操作
 * - 差分更新による高速化
 * - メモリリーク対策
 */
class DOMUpdater {
    
    /**
     * セキュアな音声メッセージ追加（innerHTML回避）
     */
    static addVoiceMessage(speaker, text, chatMessagesElement) {
        if (!chatMessagesElement) return null;

        // エスケープ処理
        const escapedSpeaker = this.escapeHtml(speaker);
        const escapedText = this.escapeHtml(text);
        
        // DOM要素を直接作成（innerHTML回避）
        const messageDiv = document.createElement('div');
        messageDiv.className = 'voice-message';
        
        const speakerDiv = document.createElement('div');
        speakerDiv.className = 'voice-speaker';
        speakerDiv.textContent = escapedSpeaker;
        
        const textP = document.createElement('p');
        textP.className = 'voice-text';
        textP.textContent = escapedText;
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'voice-time';
        timeDiv.textContent = new Date().toLocaleTimeString('ja-JP', { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        });
        
        messageDiv.appendChild(speakerDiv);
        messageDiv.appendChild(textP);
        messageDiv.appendChild(timeDiv);
        
        chatMessagesElement.appendChild(messageDiv);
        
        // メモリ最適化：履歴制限
        this.limitChildElements(chatMessagesElement, 20);
        
        return messageDiv;
    }
    
    /**
     * 話者選択の差分更新（全削除・再作成回避）
     */
    static updateSpeakerOptions(selectElement, speakers, selectedSpeakerId = null) {
        if (!selectElement || !Array.isArray(speakers)) return;
        
        // 現在のオプションのマップを作成
        const currentOptions = new Map();
        Array.from(selectElement.options).forEach(option => {
            currentOptions.set(option.value, option);
        });
        
        // 新しいオプションのマップを作成
        const newOptions = new Map();
        speakers.forEach(speaker => {
            speaker.styles.forEach(style => {
                const value = style.id.toString();
                const text = `${speaker.name} (${style.name})`;
                newOptions.set(value, { text, element: null });
            });
        });
        
        // 差分更新：不要なオプションを削除
        currentOptions.forEach((option, value) => {
            if (!newOptions.has(value)) {
                selectElement.removeChild(option);
            }
        });
        
        // 差分更新：新しいオプションを追加
        newOptions.forEach((optionData, value) => {
            if (!currentOptions.has(value)) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = optionData.text;
                selectElement.appendChild(option);
            }
        });
        
        // 選択状態を設定
        if (selectedSpeakerId !== null) {
            selectElement.value = selectedSpeakerId.toString();
        }
    }
    
    /**
     * タブリストの差分更新（全削除・再作成回避）
     */
    static updateTabList(tabBarElement, tabs, tabOrder, activeTabId, createTabElementFn) {
        if (!tabBarElement || !Array.isArray(tabOrder)) return;
        
        // 新規タブボタンを除く既存のタブ要素を取得
        const existingTabs = Array.from(tabBarElement.querySelectorAll('.tab'));
        const newTabButton = document.getElementById('new-tab-button');
        
        // 現在のタブ順序を取得
        const currentOrder = existingTabs.map(tab => tab.getAttribute('data-tab-id'));
        
        // 順序が変わったかチェック
        const orderChanged = !this.arraysEqual(currentOrder, tabOrder);
        
        if (orderChanged) {
            // 順序が変わった場合のみ全再構築
            existingTabs.forEach(tab => tab.remove());
            
            tabOrder.forEach(tabId => {
                if (tabs[tabId]) {
                    const tabElement = createTabElementFn(tabs[tabId]);
                    tabBarElement.insertBefore(tabElement, newTabButton);
                }
            });
        } else {
            // 順序が同じ場合は状態のみ更新
            existingTabs.forEach(tabElement => {
                const tabId = tabElement.getAttribute('data-tab-id');
                const tabData = tabs[tabId];
                
                if (tabData) {
                    // アクティブ状態の更新
                    if (tabData.isActive) {
                        tabElement.classList.add('active');
                    } else {
                        tabElement.classList.remove('active');
                    }
                    
                    // タブ名の更新（変更された場合のみ）
                    const nameElement = tabElement.querySelector('.tab-name');
                    if (nameElement && nameElement.textContent !== tabData.name) {
                        nameElement.textContent = tabData.name;
                    }
                }
            });
        }
    }
    
    /**
     * 子要素数を制限（古い要素から削除）
     */
    static limitChildElements(parentElement, maxCount) {
        while (parentElement.children.length > maxCount) {
            parentElement.removeChild(parentElement.firstChild);
        }
    }
    
    /**
     * HTMLエスケープ（XSS対策）
     */
    static escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * 配列の等価比較
     */
    static arraysEqual(arr1, arr2) {
        if (arr1.length !== arr2.length) return false;
        return arr1.every((value, index) => value === arr2[index]);
    }
    
    /**
     * 通知要素のリサイクル機能（メモリ最適化）
     */
    static showNotification(message, type = 'info', duration = 3000) {
        // 既存の通知要素を再利用
        let notification = document.querySelector('.notification-reusable');
        
        if (!notification) {
            notification = document.createElement('div');
            notification.className = 'notification-reusable';
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 20px;
                border-radius: 6px;
                color: white;
                font-weight: 500;
                z-index: 10000;
                opacity: 0;
                transition: opacity 0.3s ease;
                pointer-events: none;
            `;
            document.body.appendChild(notification);
        }
        
        // 既存のタイマーをクリア
        if (notification.timeoutId) {
            clearTimeout(notification.timeoutId);
        }
        
        // スタイルを更新
        const colors = {
            success: '#22c55e',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };
        
        notification.style.backgroundColor = colors[type] || colors.info;
        notification.textContent = message;
        notification.style.opacity = '1';
        
        // 自動非表示
        notification.timeoutId = setTimeout(() => {
            notification.style.opacity = '0';
        }, duration);
        
        return notification;
    }
}

// ブラウザ環境での利用
if (typeof window !== 'undefined') {
    window.DOMUpdater = DOMUpdater;
}

// Node.js環境での利用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DOMUpdater;
}