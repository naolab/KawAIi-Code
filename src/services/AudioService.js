/**
 * 音声処理サービス
 * - 音声合成（AivisSpeech）
 * - 音声再生管理
 * - 話者管理
 * - 音声設定管理
 */

class AudioService {
    constructor(terminalApp) {
        this.terminalApp = terminalApp;
        this.speakers = [];
        this.selectedSpeaker = 888753760; // デフォルト話者ID
        this.connectionStatus = 'disconnected';
        this.voiceVolume = 25;
        this.debugLog = debugLog;
        this.debugError = debugError;
        
        // 音声再生状態の管理
        this.voicePlayingState = {
            isPlaying: false,
            currentAudio: null,
            queue: []
        };
    }

    // 話者リストを読み込み
    async loadSpeakers() {
        try {
            const response = await fetch('http://localhost:50021/speakers');
            const speakersData = await response.json();
            this.speakers = speakersData;
            this.debugLog('話者リスト読み込み成功:', speakersData.length + '人');
            return { success: true, speakers: speakersData };
        } catch (error) {
            this.debugError('話者リスト読み込み失敗:', error);
            return { success: false, error: error.message };
        }
    }

    // 音声合成のみ実行（再生は別途）
    async synthesizeTextOnly(text) {
        if (!text || text.trim() === '') {
            this.debugLog('音声合成スキップ: 空のテキスト');
            return null;
        }

        try {
            const unifiedConfig = getSafeUnifiedConfig();
            const speakerId = await unifiedConfig.get('defaultSpeakerId', this.selectedSpeaker);
            const volume = await unifiedConfig.get('voiceVolume', this.voiceVolume);
            const speed = 1.2; // 読み上げ速度

            this.debugLog('音声合成開始:', {
                text: text.substring(0, 30) + '...',
                speakerId,
                volume,
                speed
            });

            // 音声クエリを生成
            const queryResponse = await fetch(`http://localhost:50021/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            if (!queryResponse.ok) {
                throw new Error(`音声クエリ生成失敗: ${queryResponse.status}`);
            }

            const audioQuery = await queryResponse.json();
            
            // 音量と速度を設定
            audioQuery.volumeScale = volume / 100;
            audioQuery.speedScale = speed;

            // 音声を合成
            const synthesisResponse = await fetch(`http://localhost:50021/synthesis?speaker=${speakerId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(audioQuery)
            });

            if (!synthesisResponse.ok) {
                throw new Error(`音声合成失敗: ${synthesisResponse.status}`);
            }

            const audioData = await synthesisResponse.arrayBuffer();
            this.debugLog('音声合成成功:', `${audioData.byteLength}バイト`);
            
            return audioData;

        } catch (error) {
            this.debugError('音声合成エラー:', error);
            return null;
        }
    }

    // アプリ内音声再生
    async playAppInternalAudio(audioData, text) {
        if (!audioData) {
            this.debugLog('音声再生スキップ: 音声データなし');
            return;
        }

        try {
            this.debugLog('アプリ内音声再生開始:', text ? text.substring(0, 30) + '...' : '');

            // 既存の音声が再生中の場合は停止
            if (this.voicePlayingState.currentAudio) {
                this.voicePlayingState.currentAudio.pause();
                this.voicePlayingState.currentAudio = null;
            }

            // Blobを作成してAudioオブジェクトで再生
            const audioBlob = new Blob([audioData], { type: 'audio/wav' });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            
            // 音声再生状態を更新
            this.voicePlayingState.isPlaying = true;
            this.voicePlayingState.currentAudio = audio;

            // 音声を再生
            await audio.play();
            this.debugLog('アプリ内音声再生開始完了');

            // 再生完了を待機
            await new Promise((resolve) => {
                audio.addEventListener('ended', () => {
                    this.debugLog('アプリ内音声再生完了');
                    this.voicePlayingState.isPlaying = false;
                    this.voicePlayingState.currentAudio = null;
                    URL.revokeObjectURL(audioUrl);
                    resolve();
                });

                audio.addEventListener('error', (error) => {
                    this.debugError('アプリ内音声再生エラー:', error);
                    this.voicePlayingState.isPlaying = false;
                    this.voicePlayingState.currentAudio = null;
                    URL.revokeObjectURL(audioUrl);
                    resolve();
                });
            });

        } catch (error) {
            this.debugError('アプリ内音声再生エラー:', error);
            this.voicePlayingState.isPlaying = false;
            this.voicePlayingState.currentAudio = null;
        }
    }

    // 音声再生完了を待機
    async waitForPlaybackComplete() {
        return new Promise(resolve => {
            const checkComplete = () => {
                if (!this.voicePlayingState.isPlaying) {
                    this.debugLog('🎵 音声再生完了を確認');
                    resolve();
                } else {
                    setTimeout(checkComplete, 250);
                }
            };
            checkComplete();
        });
    }

    // 音声設定を更新
    async updateAudioSettings(settings) {
        if (settings.speakerId !== undefined) {
            this.selectedSpeaker = settings.speakerId;
            this.debugLog('話者IDを更新:', settings.speakerId);
        }
        
        if (settings.volume !== undefined) {
            this.voiceVolume = settings.volume;
            this.debugLog('音量を更新:', settings.volume);
        }
    }

    // 音声再生を停止
    stopAudio() {
        if (this.voicePlayingState.currentAudio) {
            this.voicePlayingState.currentAudio.pause();
            this.voicePlayingState.currentAudio = null;
            this.voicePlayingState.isPlaying = false;
            this.debugLog('音声再生を停止');
        }
    }

    // 音声サービスの状態を取得
    getStatus() {
        return {
            speakers: this.speakers,
            selectedSpeaker: this.selectedSpeaker,
            connectionStatus: this.connectionStatus,
            voiceVolume: this.voiceVolume,
            voicePlayingState: this.voicePlayingState
        };
    }

    // 音声合成サービスとの接続テスト
    async testConnection() {
        try {
            const response = await fetch('http://localhost:50021/version');
            if (response.ok) {
                this.connectionStatus = 'connected';
                this.debugLog('音声合成サービス接続成功');
                return { success: true };
            } else {
                this.connectionStatus = 'disconnected';
                return { success: false, error: 'サービスが応答しません' };
            }
        } catch (error) {
            this.connectionStatus = 'error';
            this.debugError('音声合成サービス接続エラー:', error);
            return { success: false, error: error.message };
        }
    }

    // 音声再生を停止
    stopAudio() {
        if (this.voicePlayingState.currentAudio) {
            this.voicePlayingState.currentAudio.pause();
            this.voicePlayingState.currentAudio = null;
            this.voicePlayingState.isPlaying = false;
            this.debugLog('音声再生を停止');
        }
    }
}

// ブラウザ環境での利用
if (typeof window !== 'undefined') {
    window.AudioService = AudioService;
}

// Node.js環境での利用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioService;
}