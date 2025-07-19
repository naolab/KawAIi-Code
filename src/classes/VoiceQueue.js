/**
 * 音声キューイングシステム
 * - 音声テキストの順次処理
 * - 音声再生の競合回避
 * - 読み上げ間隔の制御
 */

class VoiceQueue {
    constructor(terminalApp) {
        this.terminalApp = terminalApp;
        this.queue = [];
        this.isProcessing = false;
        this.debugLog = debugLog;
    }
    
    // キューに音声テキストを追加
    async addToQueue(text) {
        this.queue.push(text);
        this.debugLog('🎵 音声キューに追加:', { text: text.substring(0, 30) + '...', queueLength: this.queue.length });
        
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
            
            const text = this.queue.shift();
            await this.speakTextSequentially(text);
        }
        
        this.isProcessing = false;
        this.debugLog('🎵 音声キュー処理完了');
    }
    
    // 順次音声再生
    async speakTextSequentially(text) {
        try {
            // 音声無効時は全処理をスキップ（パフォーマンス最適化）
            if (!this.terminalApp.voiceEnabled) {
                this.debugLog('🎵 音声無効のため全処理をスキップ:', text.substring(0, 30) + '...');
                return;
            }
            
            this.debugLog('🎵 順次音声再生開始:', text.substring(0, 30) + '...');
            
            // 音声読み上げ実行（ハイブリッドシステム）
            if (this.terminalApp.voiceEnabled) {
                // 音声再生状態を設定
                this.terminalApp.voicePlayingState.isPlaying = true;
                
                // 音声合成のみ（再生なし）
                const audioData = await this.terminalApp.synthesizeTextOnly(text);
                
                if (audioData) {
                    // 合成した音声をplayAppInternalAudioで再生
                    await this.terminalApp.playAppInternalAudio(audioData, text);
                    
                    // 音声再生完了まで待機
                    await this.waitForVoiceComplete();
                    
                    // 読み上げ間隔制御
                    const intervalSeconds = await getSafeUnifiedConfig().get('voiceIntervalSeconds', 1);
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
    
    // キューをクリア
    clear() {
        this.queue = [];
        this.isProcessing = false;
        this.debugLog('🎵 音声キューをクリア');
    }
    
    // キューの状態を取得
    getStatus() {
        return {
            queueLength: this.queue.length,
            isProcessing: this.isProcessing,
            voicePlayingState: this.terminalApp.voicePlayingState
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