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
        
        // 音声再生状態は統一管理システムを使用（app.js）
    }

    // 話者リストを読み込み
    async loadSpeakers() {
        try {
            const response = await fetch('http://localhost:10101/speakers');
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
            const queryResponse = await fetch(`http://localhost:10101/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`, {
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
            const synthesisResponse = await fetch(`http://localhost:10101/synthesis?speaker=${speakerId}`, {
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
            if (this.terminalApp.voicePlayingState.currentAudio) {
                this.terminalApp.voicePlayingState.currentAudio.pause();
                this.terminalApp.voicePlayingState.currentAudio = null;
            }

            // Blobを作成してAudioオブジェクトで再生
            const audioBlob = new Blob([audioData], { type: 'audio/wav' });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            
            // 音声再生状態を更新
            this.terminalApp.voicePlayingState.isPlaying = true;
            this.terminalApp.voicePlayingState.currentAudio = audio;

            // 音声を再生
            await audio.play();
            this.debugLog('アプリ内音声再生開始完了');

            // 再生完了を待機
            await new Promise((resolve) => {
                audio.addEventListener('ended', () => {
                    this.debugLog('アプリ内音声再生完了');
                    this.terminalApp.voicePlayingState.isPlaying = false;
                    this.terminalApp.voicePlayingState.currentAudio = null;
                    URL.revokeObjectURL(audioUrl);
                    resolve();
                });

                audio.addEventListener('error', (error) => {
                    this.debugError('アプリ内音声再生エラー:', error);
                    this.terminalApp.voicePlayingState.isPlaying = false;
                    this.terminalApp.voicePlayingState.currentAudio = null;
                    URL.revokeObjectURL(audioUrl);
                    resolve();
                });
            });

        } catch (error) {
            this.debugError('アプリ内音声再生エラー:', error);
            this.terminalApp.voicePlayingState.isPlaying = false;
            this.terminalApp.voicePlayingState.currentAudio = null;
        }
    }

    // 音声再生完了を待機
    async waitForPlaybackComplete() {
        return new Promise(resolve => {
            const checkComplete = () => {
                if (!this.terminalApp.voicePlayingState.isPlaying) {
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

    // アプリ内監視モード用の音声再生メソッド
    async playAudio(audioData) {
        try {
            this.debugLog('🎵 アプリ内監視モード音声再生開始');
            
            // 音声データの形式を検証
            if (!audioData || audioData.length === 0) {
                this.debugLog('❌ 音声データが無効です');
                return;
            }
            
            // Bufferから音声データを再生するためBlobを作成
            // ArrayBufferに変換してから処理
            let arrayBuffer;
            if (audioData.buffer) {
                // BufferやTypedArrayの場合
                arrayBuffer = audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength);
            } else if (audioData instanceof ArrayBuffer) {
                // 既にArrayBufferの場合
                arrayBuffer = audioData;
            } else {
                // その他の場合はそのまま使用
                arrayBuffer = audioData;
            }
            
            // 音声データの形式を検証
            const audioBlob = new Blob([arrayBuffer], { type: 'audio/wav' });
            if (audioBlob.size === 0) {
                this.debugLog('❌ 音声Blobが空です');
                return;
            }
            
            const audioUrl = URL.createObjectURL(audioBlob);
            
            this.debugLog('🎵 音声Blob作成完了:', {
                bufferSize: audioData.length,
                blobSize: audioBlob.size,
                blobType: audioBlob.type
            });
            
            // VRMリップシンク用に音声データを送信
            if (this.terminalApp.vrmIntegrationService) {
                this.terminalApp.vrmIntegrationService.sendAudioToVRM(audioData);
            }
            
            // 音声再生
            const audio = new Audio();
            const unifiedConfig = getSafeUnifiedConfig();
            const volumeValue = await unifiedConfig.get('voiceVolume', 50);
            const safeVolume = isNaN(volumeValue) ? 50 : volumeValue;
            audio.volume = Math.max(0, Math.min(1, safeVolume / 100));
            
            this.debugLog('🔊 音量設定:', { volumeValue, safeVolume, finalVolume: audio.volume });
            
            // イベントハンドラーを先に設定
            audio.onended = () => {
                this.debugLog('🔊 アプリ内監視音声再生完了');
                
                // 音声終了をVRMビューワーに通知
                if (this.terminalApp.vrmIntegrationService) {
                    this.terminalApp.vrmIntegrationService.notifyAudioStateToVRM('ended');
                }
                
                // URLオブジェクトを解放
                URL.revokeObjectURL(audioUrl);
            };
            
            audio.onerror = (error) => {
                this.debugLog('❌ アプリ内監視音声再生エラー:', error);
                this.debugLog('❌ エラー詳細:', {
                    error: error,
                    audioSrc: audio.src,
                    audioReadyState: audio.readyState,
                    audioNetworkState: audio.networkState
                });
                URL.revokeObjectURL(audioUrl);
                
                // フォールバック処理: 音声再生に失敗した場合でもVRMには通知
                if (this.terminalApp.vrmIntegrationService) {
                    this.terminalApp.vrmIntegrationService.notifyAudioStateToVRM('error');
                }
            };
            
            audio.onloadeddata = () => {
                this.debugLog('🎵 音声データロード完了');
            };
            
            audio.oncanplay = () => {
                this.debugLog('🎵 音声再生準備完了');
            };
            
            // 音声データを設定
            audio.src = audioUrl;
            
            this.debugLog('🎵 音声再生開始:', {
                src: audioUrl,
                volume: audio.volume,
                duration: audio.duration
            });
            
            // 音声再生を試行し、失敗した場合はフォールバック処理
            try {
                await audio.play();
            } catch (playError) {
                this.debugLog('❌ 音声再生play()エラー:', playError);
                URL.revokeObjectURL(audioUrl);
                if (this.terminalApp.vrmIntegrationService) {
                    this.terminalApp.vrmIntegrationService.notifyAudioStateToVRM('error');
                }
                
                // 再試行機能: 一度だけ再試行
                setTimeout(async () => {
                    try {
                        this.debugLog('🔄 音声再生再試行');
                        const retryAudio = new Audio(audioUrl);
                        retryAudio.volume = audio.volume;
                        retryAudio.onended = audio.onended;
                        retryAudio.onerror = audio.onerror;
                        await retryAudio.play();
                    } catch (retryError) {
                        this.debugLog('❌ 音声再生再試行も失敗:', retryError);
                        URL.revokeObjectURL(audioUrl);
                    }
                }, 500);
            }
            
        } catch (error) {
            this.debugLog('❌ アプリ内監視音声再生処理エラー:', error);
            // エラー発生時もVRMに通知
            if (this.terminalApp.vrmIntegrationService) {
                this.terminalApp.vrmIntegrationService.notifyAudioStateToVRM('error');
            }
        }
    }

    // アプリ内監視モード専用: テキストを表示しながら音声を再生
    async playAudioWithText(audioData, text) {
        try {
            // 音声再生を実行
            await this.playAudio(audioData);
            
            // チャットにテキストを表示
            if (text && this.terminalApp.addVoiceMessage) {
                this.terminalApp.addVoiceMessage('shy', text);
                this.debugLog('💬 アプリ内監視モードテキスト表示:', text);
            }
            
        } catch (error) {
            this.debugLog('❌ アプリ内監視音声+テキスト再生エラー:', error);
        }
    }

    // 音声サービスの状態を取得
    getStatus() {
        return {
            speakers: this.speakers,
            selectedSpeaker: this.selectedSpeaker,
            connectionStatus: this.connectionStatus,
            voiceVolume: this.voiceVolume,
            voicePlayingState: this.terminalApp.voicePlayingState
        };
    }

    // 音声合成サービスとの接続テスト
    async testConnection() {
        try {
            const response = await fetch('http://localhost:10101/version');
            if (response.ok) {
                // 統一された状態管理: AudioServiceとTerminalApp両方を更新
                this.connectionStatus = 'connected';
                this.terminalApp.connectionStatus = 'connected';
                this.debugLog('音声合成サービス接続成功');
                return { success: true };
            } else {
                this.connectionStatus = 'disconnected';
                this.terminalApp.connectionStatus = 'disconnected';
                return { success: false, error: 'サービスが応答しません' };
            }
        } catch (error) {
            this.connectionStatus = 'error';
            this.terminalApp.connectionStatus = 'error';
            this.debugLog('音声合成サービス接続エラー:', error.message);
            return { success: false, error: error.message };
        }
    }

    // 音声再生を停止
    stopAudio() {
        if (this.terminalApp.voicePlayingState.currentAudio) {
            this.terminalApp.voicePlayingState.currentAudio.pause();
            this.terminalApp.voicePlayingState.currentAudio = null;
            this.terminalApp.voicePlayingState.isPlaying = false;
            this.debugLog('音声再生を停止');
        }
    }

    // 話者選択の更新
    async updateSpeakerSelect() {
        const speakerSelectModal = document.getElementById('speaker-select-modal');
        if (speakerSelectModal && this.speakers.length > 0) {
            // 話者選択の更新
            if (this.terminalApp.uiEventManager) {
                this.terminalApp.uiEventManager.updateSpeakerSelectOptions(speakerSelectModal, this.speakers, this.selectedSpeaker);
            }
            
            // 現在選択中の話者IDを保持（リセットしない）
            let targetSpeakerId = this.selectedSpeaker;
            
            // 初回起動時など、まだ話者が選択されていない場合のみデフォルト設定を読み込み
            if (!targetSpeakerId || (targetSpeakerId === 0 && !this.terminalApp.speakerInitialized)) {
                if (window.electronAPI && window.electronAPI.config) {
                    try {
                        targetSpeakerId = await window.electronAPI.config.get('defaultSpeakerId');
                        this.terminalApp.speakerInitialized = true; // 初期化フラグを設定
                    } catch (error) {
                        this.debugError('保存済み話者ID取得エラー:', error);
                    }
                }
            }
            
            // 対象の話者IDが有効な場合はそれを選択、そうでなければ最初の話者を選択
            if (targetSpeakerId !== null && targetSpeakerId !== undefined && targetSpeakerId !== 0) {
                // 対象IDが話者リストに存在するかチェック
                const validOption = Array.from(speakerSelectModal.options).find(option => 
                    parseInt(option.value) === targetSpeakerId
                );
                if (validOption) {
                    this.selectedSpeaker = targetSpeakerId;
                    this.terminalApp.selectedSpeaker = targetSpeakerId;
                    speakerSelectModal.value = targetSpeakerId;
                    this.debugLog('話者IDを復元:', targetSpeakerId);
                } else {
                    // 対象IDが無効な場合は最初の話者を選択
                    this.selectedSpeaker = this.speakers[0].styles[0].id;
                    this.terminalApp.selectedSpeaker = this.selectedSpeaker;
                    speakerSelectModal.value = this.selectedSpeaker;
                    this.debugLog('話者IDが無効、デフォルトに設定:', this.selectedSpeaker);
                }
            } else {
                // 対象IDがない場合は最初の話者を選択
                this.selectedSpeaker = this.speakers[0].styles[0].id;
                this.terminalApp.selectedSpeaker = this.selectedSpeaker;
                speakerSelectModal.value = this.selectedSpeaker;
                this.debugLog('話者IDが未設定、デフォルトに設定:', this.selectedSpeaker);
            }
        }
    }

    // 音声停止（統合版）
    async stopVoice() {
        try {
            // 現在再生中の音声を停止
            if (this.terminalApp.voicePlayingState.currentAudio) {
                this.terminalApp.voicePlayingState.currentAudio.pause();
                this.terminalApp.voicePlayingState.currentAudio = null;
            }
            
            // 再生状態をリセット
            this.terminalApp.voicePlayingState.isPlaying = false;
            this.terminalApp.voicePlayingState.queue = [];
            
            this.debugLog('音声停止完了');
            return { success: true };
        } catch (error) {
            this.debugError('音声停止エラー:', error);
            return { success: false, error: error.message };
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