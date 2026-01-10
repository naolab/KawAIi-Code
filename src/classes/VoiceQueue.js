/**
 * 音声キューイングシステム
 * - 音声テキストの順次処理
 * - 音声再生の競合回避
 * - 読み上げ間隔の制御
 * - 重複読み上げの防止
 */

// SimpleDuplicateCheckerの読み込み
if (typeof SimpleDuplicateChecker === 'undefined') {
    if (typeof require !== 'undefined') {
        try {
            const SimpleDuplicateChecker = require('./SimpleDuplicateChecker');
            global.SimpleDuplicateChecker = SimpleDuplicateChecker;
        } catch (e) {
            console.error('SimpleDuplicateChecker読み込みエラー:', e);
        }
    } else if (typeof window !== 'undefined' && !window.SimpleDuplicateChecker) {
        console.error('SimpleDuplicateChecker not found - 重複チェック機能が無効になります');
    }
}

class VoiceQueue {
    constructor(terminalApp) {
        this.terminalApp = terminalApp;
        this.queue = [];
        this.isProcessing = false;
        this.debugLog = debugLog;
        
        // 重複チェッカーの初期化
        this.duplicateChecker = null;
        this.initializeDuplicateChecker();
    }
    
    /**
     * 重複チェッカーの初期化
     */
    initializeDuplicateChecker() {
        try {
            if (typeof SimpleDuplicateChecker !== 'undefined') {
                this.duplicateChecker = new SimpleDuplicateChecker();
                this.duplicateChecker.setDebugMode(false); // 本番用: デバッグログを無効化
                this.debugLog('🛡️ VoiceQueue: 重複チェッカー初期化完了');
            } else {
                this.debugLog('⚠️ VoiceQueue: SimpleDuplicateChecker未利用 - 重複チェック無効');
            }
        } catch (error) {
            this.debugLog('❌ VoiceQueue: 重複チェッカー初期化エラー:', error);
            this.duplicateChecker = null;
        }
    }
    
    /**
     * 現在のタブが親タブかどうかを判定
     * @returns {boolean} 親タブの場合true
     */
    isCurrentTabParent() {
        const tabManager = this.terminalApp.tabManager;
        if (!tabManager) {
            this.debugLog('🎵 TabManager未設定 - 音声キューをスキップ（安全側）');
            return false; // 安全優先: 不明な場合は音声処理をスキップ
        }
        
        if (!tabManager.parentTabId) {
            this.debugLog('🎵 親タブID未設定 - 音声キューをスキップ（安全側）');
            return false; // 安全優先: 不明な場合は音声処理をスキップ
        }
        
        const activeTabId = tabManager.activeTabId;
        const parentTabId = tabManager.parentTabId;
        const isParent = activeTabId === parentTabId;
        
        this.debugLog(`🎵 親タブ判定: アクティブ=${activeTabId}, 親=${parentTabId}, 一致=${isParent}`);
        return isParent;
    }
    
    // キューに音声テキストを追加
    async addToQueue(text, characterId = null) {
        // 重複チェック（最優先で実行）
        if (this.duplicateChecker && this.duplicateChecker.isDuplicate(text)) {
            this.debugLog('🚫 重複テキストのため音声キューをスキップ:', { 
                text: text.substring(0, 30) + '...',
                textLength: text.length 
            });
            return;
        }
        
        // 親タブ判定は廃止（キャラクター設定がある場合のみ呼ばれるため）
        
        // キューサイズ制限チェック（メモリリーク対策強化版）
        const MAX_QUEUE_SIZE = 10;
        
        if (this.queue.length >= MAX_QUEUE_SIZE) {
            // 古いエントリを削除して新しいものを追加（メモリリーク対策）
            const removedItems = this.queue.splice(0, this.queue.length - MAX_QUEUE_SIZE + 1);
            this.debugLog('🎵 キュー容量超過のため古いエントリを一括削除:', { 
                removedCount: removedItems.length,
                queueLength: this.queue.length 
            });
            
            // 削除されたアイテムを明示的にnullにしてガベージコレクションを促進
            removedItems.forEach((item, index) => {
                removedItems[index] = null;
            });
            removedItems.length = 0;
        }
        
        // オブジェクトとして保存
        this.queue.push({ text, characterId });
        this.debugLog('🎵 音声キューに追加:', { text: text.substring(0, 30) + '...', characterId, queueLength: this.queue.length });
        
        // 重複チェッカーに読み上げ予定としてマーク
        if (this.duplicateChecker) {
            this.duplicateChecker.markAsSpoken(text);
            this.debugLog('✅ 重複チェッカーに読み上げ予定としてマーク完了');
        }
        
        if (!this.isProcessing) {
            await this.processQueue();
        }
    }
    
    // キューを順次処理
    async processQueue() {
        this.isProcessing = true;
        this.debugLog('🎵 音声キュー処理開始:', { queueLength: this.queue.length });
        
        while (this.queue.length > 0) {
            // 音声無効時はキュー全体をクリア（効率化）
            if (!this.terminalApp.voiceEnabled) {
                const clearedCount = this.queue.length;
                this.queue = [];
                this.debugLog('🎵 音声無効のためキューをクリア:', { clearedCount });
                break;
            }
            
            const item = this.queue.shift();
            // 後方互換性（文字列の場合）とオブジェクトの場合を考慮
            const text = typeof item === 'string' ? item : item.text;
            const characterId = typeof item === 'object' ? item.characterId : null;
            
            await this.speakTextSequentially(text, characterId);
        }
        
        this.isProcessing = false;
        this.debugLog('🎵 音声キュー処理完了');
    }
    
    // 順次音声再生
    async speakTextSequentially(text, characterId = null) {
        try {
            // 音声無効時は全処理をスキップ（パフォーマンス最適化）
            if (!this.terminalApp.voiceEnabled) {
                this.debugLog('🎵 音声無効のため全処理をスキップ:', text.substring(0, 30) + '...');
                return;
            }
            
            this.debugLog('🎵 順次音声再生開始:', { text: text.substring(0, 30) + '...', characterId });
            
            // 音声読み上げ実行（ハイブリッドシステム）
            if (this.terminalApp.voiceEnabled) {
                // 音声再生状態を設定
                this.terminalApp.voicePlayingState.isPlaying = true;
                
                // キャラクター設定の取得
                let speakerId = null;
                let volume = null;
                let intervalSeconds = 0.5; // デフォルト
                
                if (characterId && this.terminalApp.configManager) {
                    const char = this.terminalApp.configManager.getCharacterById(characterId);
                    if (char && char.voice) {
                        speakerId = char.voice.speakerId;
                        volume = char.voice.volume; // 0-100
                        intervalSeconds = char.voice.interval !== undefined ? char.voice.interval : 1.0;
                    }
                }
                
                // 設定がない場合はConfigManagerのデフォルト値を使用（AudioService内で処理されるためnullでOK）
                // ただしintervalはここで制御するため取得必要
                if (!characterId) {
                    intervalSeconds = await getSafeUnifiedConfig().get('voiceIntervalSeconds', 0.5);
                }

                // 音声合成のみ（再生なし）
                // AudioServiceを直接呼び出してオーバーライドパラメータを渡す
                // synthesizeTextOnly(text, overrideSpeakerId, overrideVolume, overrideSpeed, overridePitch)
                const audioData = await this.terminalApp.audioService.synthesizeTextOnly(
                    text, 
                    speakerId, 
                    volume, 
                    null, // speed (UIから削除されたためnull)
                    null  // pitch (UIから削除されたためnull)
                );
                
                if (audioData) {
                    // 合成した音声をplayAppInternalAudioで再生
                    await this.terminalApp.playAppInternalAudio(audioData, text);
                    
                    // 音声再生完了まで待機
                    await this.waitForVoiceComplete();
                    
                    // 読み上げ間隔制御
                    const intervalMs = intervalSeconds * 1000;
                    
                    if (intervalMs > 0) {
                        this.debugLog(`⏱️ 読み上げ間隔待機: ${intervalSeconds}秒`);
                        await new Promise(resolve => setTimeout(resolve, intervalMs));
                    }
                } else {
                    this.debugLog('❌ 音声合成に失敗しました');
                }
            }
            
            this.debugLog('🎵 順次音声再生完了:', text.substring(0, 30) + '...');
            
        } catch (error) {
            this.debugLog('❌ 順次音声再生エラー:', error);
        } finally {
            // 音声再生状態をリセット
            this.terminalApp.voicePlayingState.isPlaying = false;
        }
    }
    
    // 音声完了待機（統一管理版）
    async waitForVoiceComplete() {
        return new Promise(resolve => {
            const checkComplete = () => {
                // 統一された音声状態管理システムで全音声をチェック
                const isAnyPlaying = this.terminalApp.voicePlayingState.isAnyPlaying();
                
                if (!isAnyPlaying) {
                    this.debugLog('🎵 音声再生完了を確認');
                    resolve();
                } else {
                    setTimeout(checkComplete, 250);
                }
            };
            checkComplete();
        });
    }
    
    // キューをクリア（メモリリーク対策強化版）
    clear() {
        // 既存のキューアイテムを明示的にnullにしてメモリリークを防止
        this.queue.forEach((item, index) => {
            this.queue[index] = null;
        });
        this.queue.length = 0;
        this.queue = [];
        this.isProcessing = false;
        this.debugLog('🎵 音声キューを完全クリア（メモリリーク対策済み）');
    }
    
    // キューの状態を取得
    getStatus() {
        const duplicateStats = this.duplicateChecker ? this.duplicateChecker.getStats() : null;
        
        return {
            queueLength: this.queue.length,
            isProcessing: this.isProcessing,
            voicePlayingState: this.terminalApp.voicePlayingState,
            duplicateChecker: {
                enabled: !!this.duplicateChecker,
                stats: duplicateStats
            }
        };
    }
}

// ブラウザ環境での利用
if (typeof window !== 'undefined') {
    window.VoiceQueue = VoiceQueue;
}

// Node.js環境での利用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VoiceQueue;
}