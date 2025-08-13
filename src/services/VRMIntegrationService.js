/**
 * VRM連携サービス
 * - VRM音声データ送信
 * - VRM感情データ送信
 * - VRM音声状態通知
 * - VRMビューワーとの通信管理
 */

class VRMIntegrationService {
    constructor(terminalApp) {
        this.terminalApp = terminalApp;
        this.debugLog = debugLog;
        this.debugError = debugError;
        
        // VRMビューワーの状態管理
        this.vrmViewerReady = false;
        this.vrmIframeElement = null;
        this.retryCount = 0;
        
        // 通信タイムアウト設定
        this.messageTimeout = 5000; // 5秒
        
        // 初期化
        this.init();
    }

    // 初期化
    init() {
        // VRMビューワーの準備状態を定期的にチェック
        this.checkVRMViewerReady();
        
        // iframe要素の監視
        this.setupIframeWatcher();
    }

    // VRMビューワーの準備状態をチェック
    checkVRMViewerReady() {
        const iframe = document.getElementById('vrm-iframe');
        if (iframe && iframe.contentWindow) {
            // 既に準備完了している場合は重複ログを避ける
            if (!this.vrmViewerReady) {
                this.vrmIframeElement = iframe;
                this.vrmViewerReady = true;
                this.debugLog('🎭 VRMビューワー準備完了');
            }
        } else {
            this.vrmViewerReady = false;
            this.vrmIframeElement = null;
            // 再チェック回数を制限
            if (!this.retryCount) this.retryCount = 0;
            if (this.retryCount < 5) {
                this.retryCount++;
                setTimeout(() => this.checkVRMViewerReady(), 1000);
            }
        }
    }

    // iframe要素の監視を設定
    setupIframeWatcher() {
        // MutationObserverのデバウンス処理
        let mutationTimeout;
        
        // DOMの変更を監視
        const observer = new MutationObserver((mutations) => {
            // 既に準備完了している場合は監視を停止
            if (this.vrmViewerReady) {
                return;
            }
            
            // デバウンス処理（100ms以内の連続呼び出しを制限）
            clearTimeout(mutationTimeout);
            mutationTimeout = setTimeout(() => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        // iframe要素の追加/削除を検知
                        this.checkVRMViewerReady();
                    }
                });
            }, 100);
        });

        // document全体を監視
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        this.debugLog('🎭 VRMビューワー監視を開始');
    }

    // VRMビューワーに音声データを送信
    sendAudioToVRM(audioData, options = {}) {
        if (!this.vrmViewerReady || !this.vrmIframeElement) {
            this.debugLog('🎭 VRMビューワー未準備 - 音声データ送信スキップ');
            return false;
        }

        try {
            // ArrayBufferをArray形式に変換（既存の実装と互換性を保つため）
            const audioArray = Array.from(new Uint8Array(audioData));
            
            const message = {
                type: 'lipSync',
                audioData: audioArray,
                format: 'wav',
                timestamp: Date.now(),
                // Cloud APIの場合は振幅増幅フラグを追加
                amplifyLipSync: options.amplifyLipSync || false
            };

            // postMessageでVRMビューワーに送信
            this.vrmIframeElement.contentWindow.postMessage(message, '*');
            
            this.debugLog('🎭 VRM音声データ送信完了:', {
                dataSize: audioData.byteLength,
                timestamp: message.timestamp
            });
            
            return true;
            
        } catch (error) {
            this.debugError('🎭 VRM音声データ送信エラー:', error);
            return false;
        }
    }

    // 感情データをVRMビューワーに送信
    sendEmotionToVRM(emotion) {
        if (!this.vrmViewerReady || !this.vrmIframeElement) {
            this.debugLog('🎭 VRMビューワー未準備 - 感情データ送信スキップ');
            return false;
        }

        try {
            const message = {
                type: 'emotion',
                emotion: emotion,
                timestamp: Date.now()
            };

            // postMessageでVRMビューワーに送信
            this.vrmIframeElement.contentWindow.postMessage(message, '*');
            
            this.debugLog('🎭 VRM感情データ送信完了:', {
                emotion: emotion,
                timestamp: message.timestamp
            });
            
            return true;
            
        } catch (error) {
            this.debugError('🎭 VRM感情データ送信エラー:', error);
            return false;
        }
    }

    // 音声状態をVRMビューワーに通知
    notifyAudioStateToVRM(state) {
        if (!this.vrmViewerReady || !this.vrmIframeElement) {
            this.debugLog('🎭 VRMビューワー未準備 - 音声状態通知スキップ');
            return false;
        }

        try {
            const message = {
                type: 'audioState',
                state: state, // 'playing', 'ended', 'error'
                timestamp: Date.now()
            };

            // postMessageでVRMビューワーに送信
            this.vrmIframeElement.contentWindow.postMessage(message, '*');
            
            this.debugLog('🎭 VRM音声状態通知完了:', {
                state: state,
                timestamp: message.timestamp
            });
            
            return true;
            
        } catch (error) {
            this.debugError('🎭 VRM音声状態通知エラー:', error);
            return false;
        }
    }

    // VRMビューワーからの応答を受信
    handleVRMMessage(event) {
        try {
            const message = event.data;
            
            if (message.type === 'vrm-ready') {
                this.vrmViewerReady = true;
                this.debugLog('🎭 VRMビューワー準備完了通知を受信');
            } else if (message.type === 'vrm-error') {
                this.debugError('🎭 VRMビューワーエラー:', message.error);
            } else if (message.type === 'vrm-audio-processed') {
                this.debugLog('🎭 VRM音声処理完了:', message.data);
            } else if (message.type === 'vrm-emotion-processed') {
                this.debugLog('🎭 VRM感情処理完了:', message.data);
            }
            
        } catch (error) {
            this.debugError('🎭 VRMメッセージ処理エラー:', error);
        }
    }

    // ArrayBufferをBase64に変換
    arrayBufferToBase64(arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        
        return btoa(binary);
    }

    // Base64をArrayBufferに変換
    base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        return bytes.buffer;
    }

    // VRMビューワーに複数のデータを一括送信
    sendBatchToVRM(audioData, emotion, audioState) {
        if (!this.vrmViewerReady || !this.vrmIframeElement) {
            this.debugLog('🎭 VRMビューワー未準備 - 一括送信スキップ');
            return false;
        }

        try {
            const message = {
                type: 'batch-data',
                data: {
                    audio: audioData ? this.arrayBufferToBase64(audioData) : null,
                    emotion: emotion,
                    audioState: audioState
                },
                timestamp: Date.now()
            };

            this.vrmIframeElement.contentWindow.postMessage(message, '*');
            
            this.debugLog('🎭 VRM一括データ送信完了:', {
                hasAudio: !!audioData,
                hasEmotion: !!emotion,
                audioState: audioState,
                timestamp: message.timestamp
            });
            
            return true;
            
        } catch (error) {
            this.debugError('🎭 VRM一括データ送信エラー:', error);
            return false;
        }
    }

    // VRMビューワーのリセット
    resetVRMViewer() {
        if (!this.vrmViewerReady || !this.vrmIframeElement) {
            this.debugLog('🎭 VRMビューワー未準備 - リセットスキップ');
            return false;
        }

        try {
            const message = {
                type: 'reset-vrm',
                timestamp: Date.now()
            };

            this.vrmIframeElement.contentWindow.postMessage(message, '*');
            
            this.debugLog('🎭 VRMビューワーリセット完了');
            return true;
            
        } catch (error) {
            this.debugError('🎭 VRMビューワーリセットエラー:', error);
            return false;
        }
    }

    // サービスの状態を取得
    getStatus() {
        return {
            vrmViewerReady: this.vrmViewerReady,
            hasIframe: !!this.vrmIframeElement,
            messageTimeout: this.messageTimeout
        };
    }

    // サービスの停止
    stop() {
        this.vrmViewerReady = false;
        this.vrmIframeElement = null;
        this.debugLog('🎭 VRM連携サービスを停止');
    }
}

// ブラウザ環境での利用
if (typeof window !== 'undefined') {
    window.VRMIntegrationService = VRMIntegrationService;
    
    // グローバルメッセージハンドラーを設定
    window.addEventListener('message', (event) => {
        if (window.vrmIntegrationService) {
            window.vrmIntegrationService.handleVRMMessage(event);
        }
    });
}

// Node.js環境での利用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VRMIntegrationService;
}