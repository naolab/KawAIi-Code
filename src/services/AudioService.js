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
        
        // API設定
        this.baseUrl = 'http://localhost:10101';
        this.cloudApiUrl = 'https://api.aivis-project.com/v1';
        this.voicevoxUrl = 'http://127.0.0.1:50021';
        this.voiceEngine = 'aivis-local'; // aivis-local / aivis-cloud / voicevox
        this.useCloudAPI = false;
        this.cloudApiKey = '';

        // 音声再生状態は統一管理システムを使用（app.js）
        // 注意: updateApiSettings()はTerminalAppManager.jsで明示的に呼ばれる
    }

    // API設定を更新
    async updateApiSettings() {
        try {
            const unifiedConfig = getSafeUnifiedConfig();

            // voiceEngineを取得
            this.voiceEngine = await unifiedConfig.get('voiceEngine', 'aivis-local');
            this.useCloudAPI = this.voiceEngine === 'aivis-cloud';

            if (this.voiceEngine === 'aivis-cloud') {
                this.cloudApiUrl = await unifiedConfig.get('aivisCloudApiUrl', 'https://api.aivis-project.com/v1');
                // APIキーは暗号化されているため、window.electronAPI経由で復号化されたキーを取得
                if (window.electronAPI && window.electronAPI.getCloudApiKey) {
                    this.cloudApiKey = await window.electronAPI.getCloudApiKey();
                    this.debugLog('APIキー取得:', {
                        hasKey: !!this.cloudApiKey,
                        keyLength: this.cloudApiKey ? this.cloudApiKey.length : 0,
                        keyPrefix: this.cloudApiKey ? this.cloudApiKey.substring(0, 10) + '...' : 'なし'
                    });
                }
            }

            if (this.voiceEngine === 'voicevox') {
                this.voicevoxUrl = await unifiedConfig.get('voicevoxEndpoint', 'http://127.0.0.1:50021');
            }

            this.debugLog('API設定を更新:', { voiceEngine: this.voiceEngine, endpoint: this.getApiEndpoint() });
        } catch (error) {
            this.debugError('API設定の更新に失敗:', error);
        }
    }

    // 現在のAPIエンドポイントを取得
    getApiEndpoint() {
        switch (this.voiceEngine) {
            case 'aivis-cloud':
                return this.cloudApiUrl;
            case 'voicevox':
                return this.voicevoxUrl;
            case 'aivis-local':
            default:
                return this.baseUrl;
        }
    }

    // APIリクエストヘッダーを取得
    getRequestHeaders() {
        const headers = {};
        if (this.useCloudAPI && this.cloudApiKey) {
            headers['Authorization'] = `Bearer ${this.cloudApiKey}`;
        }
        return headers;
    }

    // 話者リストを読み込み
    async loadSpeakers() {
        try {
            // API設定を更新
            await this.updateApiSettings();
            const endpoint = this.getApiEndpoint();
            const headers = this.getRequestHeaders();

            const response = await fetch(`${endpoint}/speakers`, { headers });
            const speakersData = await response.json();

            // VoiceVOXの場合は話者リストを変換（階層構造→フラット構造）
            if (this.voiceEngine === 'voicevox') {
                const voicevoxSpeakers = [];
                speakersData.forEach(speaker => {
                    speaker.styles.forEach(style => {
                        voicevoxSpeakers.push({
                            id: style.id,
                            name: `${speaker.name} (${style.name})`,
                            speaker_uuid: speaker.speaker_uuid || null
                        });
                    });
                });
                this.speakers = voicevoxSpeakers;
                this.debugLog('VoiceVOX話者リスト変換完了:', {
                    original: speakersData.length,
                    converted: voicevoxSpeakers.length
                });
            } else {
                this.speakers = speakersData;
            }

            this.debugLog('話者リスト読み込み成功:', this.speakers.length + '人');
            return { success: true, speakers: this.speakers };
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
            let speakerId = await unifiedConfig.get('defaultSpeakerId', this.selectedSpeaker);
            const volume = await unifiedConfig.get('voiceVolume', this.voiceVolume);
            const speed = 1.2; // 読み上げ速度

            // API設定を更新
            await this.updateApiSettings();

            // VoiceVOX使用時は専用の話者IDを使用
            if (this.voiceEngine === 'voicevox') {
                speakerId = await unifiedConfig.get('voicevoxSpeakerId', 0);
            }

            this.debugLog('音声合成開始:', {
                text: text.substring(0, 30) + '...',
                speakerId,
                volume,
                speed,
                voiceEngine: this.voiceEngine,
                useCloudAPI: this.useCloudAPI
            });
            const endpoint = this.getApiEndpoint();
            const headers = {
                ...this.getRequestHeaders(),
                'Content-Type': 'application/json'
            };
            
            this.debugLog('音声合成API詳細:', {
                endpoint,
                headers: this.useCloudAPI ? { 'Authorization': '[設定済み]', 'Content-Type': 'application/json' } : headers,
                useCloudAPI: this.useCloudAPI
            });
            
            if (this.useCloudAPI) {
                // 感情分析実行
                const emotion = this.terminalApp.emotionAnalyzer 
                    ? this.terminalApp.emotionAnalyzer.analyzeEmotion(text)
                    : { primary: 'neutral' };
                
                // SSML強化テキスト処理
                const enhancedText = this.enhanceTextWithSSML(text, emotion);
                
                // 話者選択を取得（クラウドAPI用）
                let cloudSpeakerId = 'default';
                try {
                    const speakerSelect = document.getElementById('speaker-select-modal');
                    if (speakerSelect && speakerSelect.value) {
                        cloudSpeakerId = speakerSelect.value;
                    }
                } catch (error) {
                    this.debugError('話者選択取得エラー:', error);
                }
                
                // 感情に応じたパラメータ構築（話者IDを含む）
                const cloudPayload = await this.buildCloudApiParams(enhancedText.text, emotion, speed, volume, cloudSpeakerId);
                cloudPayload.use_ssml = enhancedText.use_ssml;
                
                // 用途別プリセット適用
                const preset = this.getAudioPreset('realtime');
                Object.assign(cloudPayload, preset);
                
                this.debugLog('クラウドAPI音声合成リクエスト:', cloudPayload);
                
                const synthesisResponse = await fetch(`${endpoint}/tts/synthesize`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(cloudPayload)
                });

                if (!synthesisResponse.ok) {
                    const errorText = await synthesisResponse.text();
                    this.debugError('クラウドAPI音声合成失敗:', {
                        status: synthesisResponse.status,
                        statusText: synthesisResponse.statusText,
                        errorText,
                        endpoint,
                        payload: cloudPayload
                    });
                    
                    // 422エラー（不正スタイル指定）の場合はフォールバック
                    if (synthesisResponse.status === 422 && cloudPayload.style_name) {
                        this.debugLog('スタイル指定エラー、ノーマルスタイルでリトライ');
                        const fallbackPayload = { ...cloudPayload };
                        delete fallbackPayload.style_name;
                        delete fallbackPayload.emotional_intensity;
                        
                        const retryResponse = await fetch(`${endpoint}/tts/synthesize`, {
                            method: 'POST',
                            headers,
                            body: JSON.stringify(fallbackPayload)
                        });
                        
                        if (retryResponse.ok) {
                            const audioData = await retryResponse.arrayBuffer();
                            this.debugLog('フォールバック音声合成成功:', `${audioData.byteLength}バイト`);
                            return audioData;
                        }
                    }
                    
                    throw new Error(`クラウドAPI音声合成失敗: ${synthesisResponse.status} - ${errorText}`);
                }

                const audioData = await synthesisResponse.arrayBuffer();
                
                // 音声データサイズ検証
                if (audioData.byteLength < 100) {
                    this.debugLog('クラウドAPI音声データ不正: サイズが小さすぎます', {
                        size: audioData.byteLength,
                        expectedMinimum: 100
                    });
                    
                    // フォールバック: ローカルエンジンで再試行
                    this.debugLog('ローカルエンジンにフォールバック中...');
                    const originalCloudSetting = this.useCloudAPI;
                    try {
                        this.useCloudAPI = false;
                        const fallbackAudioData = await this.synthesizeTextOnly(text, speakerId, volume, speed);
                        this.debugLog('ローカルエンジンフォールバック成功');
                        return fallbackAudioData;
                    } catch (fallbackError) {
                        this.debugError('ローカルエンジンフォールバックも失敗:', fallbackError.message);
                        throw new Error(`音声データサイズが不正で、ローカルエンジンフォールバックも失敗しました`);
                    } finally {
                        this.useCloudAPI = originalCloudSetting;
                    }
                }
                
                this.debugLog('クラウドAPI音声合成成功:', `${audioData.byteLength}バイト`);
                return audioData;
                
            } else {
                // ローカルAPI用の音声合成処理（従来の処理）
                // 音声クエリを生成
                const queryResponse = await fetch(`${endpoint}/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`, {
                    method: 'POST',
                    headers
                });

                if (!queryResponse.ok) {
                    const errorText = await queryResponse.text();
                    this.debugError('音声クエリ生成失敗:', {
                        status: queryResponse.status,
                        statusText: queryResponse.statusText,
                        errorText,
                        endpoint,
                        useCloudAPI: this.useCloudAPI
                    });
                    throw new Error(`音声クエリ生成失敗: ${queryResponse.status} - ${errorText}`);
                }

                const audioQuery = await queryResponse.json();
                
                // 音量と速度を設定
                audioQuery.volumeScale = volume / 100;
                audioQuery.speedScale = speed;

                // 音声を合成
                const synthesisResponse = await fetch(`${endpoint}/synthesis?speaker=${speakerId}`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(audioQuery)
                });

                if (!synthesisResponse.ok) {
                    const errorText = await synthesisResponse.text();
                    this.debugError('音声合成失敗:', {
                        status: synthesisResponse.status,
                        statusText: synthesisResponse.statusText,
                        errorText,
                        endpoint,
                        useCloudAPI: this.useCloudAPI
                    });
                    throw new Error(`音声合成失敗: ${synthesisResponse.status} - ${errorText}`);
                }

                const audioData = await synthesisResponse.arrayBuffer();
                this.debugLog('音声合成成功:', `${audioData.byteLength}バイト`);
                return audioData;
            }

        } catch (error) {
            this.debugError('音声合成エラー:', error);

            // 音声モデル未設定エラーの場合は、ユーザーに分かりやすいメッセージを表示
            if (error.message.includes('音声モデルが設定されていません')) {
                this.showVoiceModelNotSetError();
            } else if (error.message.includes('無効な音声モデル')) {
                this.showInvalidVoiceModelError();
            }

            return null;
        }
    }

    // 音声モデル未設定エラーの表示
    showVoiceModelNotSetError() {
        // UI に分かりやすいエラーメッセージを表示
        if (window.showToast) {
            window.showToast('⚠️ 音声モデルが設定されていません。設定画面で音声モデルを選択してください。', 'warning', 5000);
        } else {
            console.warn('音声モデルが設定されていません。設定画面で音声モデルを選択してください。');
        }
    }

    // 無効な音声モデルエラーの表示
    showInvalidVoiceModelError() {
        if (window.showToast) {
            window.showToast('❌ 無効な音声モデルが選択されています。設定を確認してください。', 'error', 5000);
        } else {
            console.error('無効な音声モデルが選択されています。設定を確認してください。');
        }
    }

    // 用途別音質プリセット設定
    getAudioPreset(presetName) {
        const AUDIO_PRESETS = {
            // リアルタイム会話用（速度重視）
            realtime: {
                output_format: 'mp3',
                output_bitrate: 128,
                output_sampling_rate: 44100,
                leading_silence_seconds: 0.05,
                trailing_silence_seconds: 0.05
            },
            
            // 高品質音声用（品質重視）
            quality: {
                output_format: 'flac',
                output_sampling_rate: 44100,
                leading_silence_seconds: 0.1,
                trailing_silence_seconds: 0.1
            },
            
            // モバイル・低帯域用（容量重視）
            mobile: {
                output_format: 'aac',
                output_bitrate: 96,
                output_sampling_rate: 22050,
                leading_silence_seconds: 0.02,
                trailing_silence_seconds: 0.02
            }
        };
        
        return AUDIO_PRESETS[presetName] || AUDIO_PRESETS.realtime;
    }

    // クラウドAPIパラメータ構築（話者選択対応版）
    async buildCloudApiParams(text, emotion, speed, volume, speakerId = null) {
        // 選択された話者に応じてmodel_uuidを決定
        let modelUuid = null;

        try {
            if (!speakerId || speakerId === '') {
                // 音声モデルが設定されていない場合はエラー
                throw new Error('音声モデルが設定されていません。設定画面で音声モデルを選択してください。');
            } else {
                // カスタムモデルが選択された場合（speakerIdがUUID）
                // UUID形式チェック
                const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                if (uuidPattern.test(speakerId)) {
                    modelUuid = speakerId;
                    this.debugLog('選択されたカスタムモデルUUID使用:', speakerId);
                } else {
                    throw new Error(`無効な音声モデルが選択されています: ${speakerId}`);
                }
            }
        } catch (error) {
            this.debugError('音声モデル設定エラー:', error);
            throw error; // エラーを上位に伝播
        }

        return {
            model_uuid: modelUuid,
            text: text,
            use_ssml: false,
            output_audio_channels: "mono",
            speaking_rate: speed,
            volume: volume / 100
        };
    }

    // SSML強化テキスト処理（簡素化版）
    enhanceTextWithSSML(text, emotion) {
        // 文字数節約のため、SSML処理を最小限に抑制
        // 基本的な感情パラメータは buildCloudApiParams で処理
        return {
            text: text,
            use_ssml: false
        };
    }

    // 音声データの形式を自動検出
    detectAudioFormat(audioData) {
        if (!audioData || audioData.byteLength < 4) return 'audio/wav';
        
        const view = new Uint8Array(audioData);
        
        // MP3ヘッダー検出 (ID3タグまたはMPEGフレーム)
        if ((view[0] === 0x49 && view[1] === 0x44 && view[2] === 0x33) || // ID3
            (view[0] === 0xFF && (view[1] & 0xE0) === 0xE0)) { // MPEG frame
            return 'audio/mpeg';
        }
        
        // WAVヘッダー検出
        if (view[0] === 0x52 && view[1] === 0x49 && view[2] === 0x46 && view[3] === 0x46) {
            return 'audio/wav';
        }
        
        // OGGヘッダー検出
        if (view[0] === 0x4F && view[1] === 0x67 && view[2] === 0x67 && view[3] === 0x53) {
            return 'audio/ogg';
        }
        
        // デフォルトはWAV
        return 'audio/wav';
    }

    // 音声データの音量を増幅
    amplifyAudioData(audioData, gainFactor = 1.5) {
        try {
            const format = this.detectAudioFormat(audioData);
            this.debugLog('🎧 音量増幅処理開始:', { format, gainFactor, dataSize: audioData.byteLength });
            
            // WAVファイルの場合の処理
            if (format === 'audio/wav') {
                const view = new DataView(audioData);
                const newBuffer = new ArrayBuffer(audioData.byteLength);
                const newView = new DataView(newBuffer);
                
                // WAVヘッダーをコピー（最初の44バイト）
                for (let i = 0; i < 44; i++) {
                    newView.setUint8(i, view.getUint8(i));
                }
                
                // 音声データ部分を増幅（16bit PCM想定）
                for (let i = 44; i < audioData.byteLength; i += 2) {
                    const sample = view.getInt16(i, true); // リトルエンディアン
                    const amplified = Math.max(-32768, Math.min(32767, sample * gainFactor));
                    newView.setInt16(i, amplified, true);
                }
                
                this.debugLog('✅ WAV音量増幅完了');
                return newBuffer;
            }
            
            // MP3やその他の形式の場合は、Web Audio APIを使った増幅を試みる
            // ただし、リアルタイム処理には適さないため、ゲイン調整で対応
            this.debugLog(`⚠️ ${format}形式のため音量増幅をスキップ（Web Audio APIでのリアルタイム処理が必要）`);
            return audioData;
        } catch (error) {
            this.debugError('音量増幅エラー:', error);
            return audioData; // エラー時は元データを返す
        }
    }

    // アプリ内音声再生
    async playAppInternalAudio(audioData, text) {
        if (!audioData) {
            this.debugLog('音声再生スキップ: 音声データなし');
            return;
        }

        try {
            this.debugLog('アプリ内音声再生開始:', {
                text: text ? text.substring(0, 30) + '...' : '',
                dataSize: audioData.byteLength
            });

            // API音声の場合は音量を増幅
            let processedAudioData = audioData;
            
            this.debugLog('🔍 音量増幅デバッグ:', {
                useCloudAPI: this.useCloudAPI,
                audioFormat: this.detectAudioFormat(audioData),
                dataSize: audioData.byteLength
            });
            
            if (this.useCloudAPI) {
                const originalFormat = this.detectAudioFormat(audioData);
                // Cloud APIのMP3音声は増幅処理をスキップして、そのまま使用
                // （MP3の振幅調整は複雑なため、VRM側で対応する方が良い）
                this.debugLog('🔊 Cloud API音声（MP3）検出:', {
                    originalFormat: originalFormat,
                    originalSize: audioData.byteLength,
                    note: 'MP3音声はそのまま使用（VRM側で振幅調整）'
                });
                // 将来的にMP3の振幅増幅を実装する場合はここに処理を追加
            } else {
                this.debugLog('🎵 ローカル音声のため増幅スキップ');
            }

            // VRMリップシンク用に音声データを送信
            if (this.terminalApp.vrmIntegrationService) {
                // Cloud APIの場合は振幅増幅フラグを付けて送信
                if (this.useCloudAPI) {
                    this.terminalApp.vrmIntegrationService.sendAudioToVRM(processedAudioData, { amplifyLipSync: true });
                } else {
                    this.terminalApp.vrmIntegrationService.sendAudioToVRM(processedAudioData);
                }
            }

            // 既存音声の安全なクリーンアップ
            await this.cleanupCurrentAudio();

            // 動的MIMEタイプ検出でBlobを作成してAudioオブジェクトで再生
            const mimeType = this.detectAudioFormat(processedAudioData);
            const audioBlob = new Blob([processedAudioData], { type: mimeType });
            
            this.debugLog('音声形式検出:', { mimeType, dataSize: processedAudioData.byteLength });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            
            // API音声の場合は再生音量も増幅（MP3対応）
            if (this.useCloudAPI) {
                audio.volume = 1.0; // API音声は最大音量で再生
                this.debugLog('🔊 API音声の再生音量を最大に設定 (MP3対応)');
            } else {
                // ローカル音声は通常の音量設定を適用
                try {
                    const unifiedConfig = getSafeUnifiedConfig();
                    const volumeValue = await unifiedConfig.get('voiceVolume', 50);
                    const safeVolume = isNaN(volumeValue) ? 50 : volumeValue;
                    audio.volume = Math.max(0, Math.min(1, safeVolume / 100));
                    this.debugLog('🎵 ローカル音声の音量設定:', { volumeValue, safeVolume, finalVolume: audio.volume });
                } catch (error) {
                    this.debugError('音量設定取得エラー:', error);
                    audio.volume = 0.5; // デフォルト値
                }
            }
            
            // 音声再生状態を更新
            this.terminalApp.voicePlayingState.isPlaying = true;
            this.terminalApp.voicePlayingState.currentAudio = audio;
            this.terminalApp.voicePlayingState.currentAudioUrl = audioUrl;

            // 音声を再生
            await audio.play();
            this.debugLog('アプリ内音声再生開始完了');

            // 再生完了を待機（改善版）
            await this.waitForAudioCompletion(audio, audioUrl);

        } catch (error) {
            this.debugError('アプリ内音声再生エラー:', error);
            // エラー時も確実にクリーンアップ
            await this.cleanupCurrentAudio();
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
            const mimeType = this.detectAudioFormat(arrayBuffer);
            const audioBlob = new Blob([arrayBuffer], { type: mimeType });
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
            // API設定を更新
            await this.updateApiSettings();
            const endpoint = this.getApiEndpoint();
            const headers = this.getRequestHeaders();

            // エンジンごとに接続テストエンドポイントを切り替え
            switch (this.voiceEngine) {
                case 'aivis-cloud':
                    // クラウドAPIの場合は/speakersエンドポイントで接続テスト
                    try {
                        const testEndpoint = `${endpoint}/speakers`;
                        const response = await fetch(testEndpoint, { headers });

                        if (response.ok) {
                            this.connectionStatus = 'connected';
                            this.terminalApp.connectionStatus = 'connected';
                            this.debugLog('クラウドAPI接続成功');
                            return { success: true };
                        } else {
                            const errorText = await response.text();
                            this.connectionStatus = 'disconnected';
                            this.terminalApp.connectionStatus = 'disconnected';
                            this.debugLog('クラウドAPI接続失敗:', {
                                status: response.status,
                                statusText: response.statusText,
                                errorText
                            });
                            return { success: false, error: `API接続失敗: ${response.status} - ${errorText}` };
                        }
                    } catch (error) {
                        this.connectionStatus = 'error';
                        this.terminalApp.connectionStatus = 'error';
                        this.debugLog('クラウドAPI接続エラー:', error.message);
                        return { success: false, error: error.message };
                    }

                case 'voicevox':
                    // VoiceVOXの場合は/versionエンドポイントで接続テスト
                    try {
                        const testEndpoint = `${endpoint}/version`;
                        const response = await fetch(testEndpoint);

                        if (response.ok) {
                            const versionData = await response.json();
                            this.connectionStatus = 'connected';
                            this.terminalApp.connectionStatus = 'connected';
                            this.debugLog('VoiceVOX接続成功:', versionData);
                            return { success: true, version: versionData };
                        } else {
                            this.connectionStatus = 'disconnected';
                            this.terminalApp.connectionStatus = 'disconnected';
                            this.debugLog('VoiceVOX接続失敗:', response.status);
                            return { success: false, error: `VoiceVOX接続失敗: ${response.status}` };
                        }
                    } catch (error) {
                        this.connectionStatus = 'error';
                        this.terminalApp.connectionStatus = 'error';
                        this.debugLog('VoiceVOX接続エラー:', error.message);
                        return { success: false, error: error.message };
                    }

                case 'aivis-local':
                default:
                    // AivisSpeech(ローカル)の場合は/versionエンドポイントで接続テスト
                    const testEndpoint = `${endpoint}/version`;
                    const response = await fetch(testEndpoint, { headers });
                    if (response.ok) {
                        this.connectionStatus = 'connected';
                        this.terminalApp.connectionStatus = 'connected';
                        this.debugLog('AivisSpeech(ローカル)接続成功');
                        return { success: true };
                    } else {
                        this.connectionStatus = 'disconnected';
                        this.terminalApp.connectionStatus = 'disconnected';
                        return { success: false, error: 'サービスが応答しません' };
                    }
            }
        } catch (error) {
            this.connectionStatus = 'error';
            this.terminalApp.connectionStatus = 'error';
            this.debugLog('音声合成サービス接続エラー:', error.message);
            return { success: false, error: error.message };
        }
    }

    // 音声再生を停止
    async stopAudio() {
        try {
            await this.cleanupCurrentAudio();
            this.debugLog('音声再生を停止');
        } catch (error) {
            this.debugError('音声停止エラー:', error);
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
                    // VoiceVOX形式（フラット）かAivisSpeech形式（階層）かで分岐
                    const defaultSpeakerId = this.speakers[0].styles
                        ? this.speakers[0].styles[0].id  // AivisSpeech形式
                        : this.speakers[0].id;            // VoiceVOX形式
                    this.selectedSpeaker = defaultSpeakerId;
                    this.terminalApp.selectedSpeaker = defaultSpeakerId;
                    speakerSelectModal.value = defaultSpeakerId;
                    this.debugLog('話者IDが無効、デフォルトに設定:', defaultSpeakerId);
                }
            } else {
                // 対象IDがない場合は最初の話者を選択
                // VoiceVOX形式（フラット）かAivisSpeech形式（階層）かで分岐
                const defaultSpeakerId = this.speakers[0].styles
                    ? this.speakers[0].styles[0].id  // AivisSpeech形式
                    : this.speakers[0].id;            // VoiceVOX形式
                this.selectedSpeaker = defaultSpeakerId;
                this.terminalApp.selectedSpeaker = defaultSpeakerId;
                speakerSelectModal.value = defaultSpeakerId;
                this.debugLog('話者IDが未設定、デフォルトに設定:', defaultSpeakerId);
            }
        }
    }

    // 音声停止（統合版）
    async stopVoice() {
        try {
            // 現在再生中の音声を安全に停止
            await this.cleanupCurrentAudio();
            
            // 再生状態をリセット
            this.terminalApp.voicePlayingState.queue = [];
            
            this.debugLog('音声停止完了');
            return { success: true };
        } catch (error) {
            this.debugError('音声停止エラー:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * テキストを音声合成して再生（UIEventManager用）
     */
    async speakText(text) {
        if (!text || text.trim() === '') {
            this.debugLog('音声読み上げスキップ: 空のテキスト');
            return { success: false, error: 'Empty text' };
        }

        try {
            // 音声合成
            const audioData = await this.synthesizeTextOnly(text);
            if (!audioData) {
                return { success: false, error: 'Synthesis failed' };
            }

            // 音声再生
            await this.playAppInternalAudio(audioData, text);
            return { success: true };
        } catch (error) {
            this.debugError('音声読み上げエラー:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 現在の音声を安全にクリーンアップ（メモリリーク対策強化版）
     */
    async cleanupCurrentAudio() {
        const currentState = this.terminalApp.voicePlayingState;
        
        // 既に停止中または再生中でない場合でもBlobURLクリーンアップは実行
        this.debugLog('🧹 音声クリーンアップ開始:', {
            hasAudio: !!currentState.currentAudio,
            hasUrl: !!currentState.currentAudioUrl,
            hasEndedHandler: !!currentState.currentEndedHandler,
            hasErrorHandler: !!currentState.currentErrorHandler
        });
        
        try {
            // Audio要素の完全停止とイベントリスナー削除
            if (currentState.currentAudio) {
                // 全イベントリスナーを削除（メモリリーク防止）
                if (currentState.currentEndedHandler) {
                    currentState.currentAudio.removeEventListener('ended', currentState.currentEndedHandler);
                    currentState.currentEndedHandler = null;
                }
                if (currentState.currentErrorHandler) {
                    currentState.currentAudio.removeEventListener('error', currentState.currentErrorHandler);
                    currentState.currentErrorHandler = null;
                }
                
                // その他の可能なイベントリスナーも削除
                ['loadstart', 'loadeddata', 'canplay', 'play', 'pause', 'abort', 'stalled'].forEach(eventType => {
                    try {
                        currentState.currentAudio.removeEventListener(eventType, () => {});
                    } catch (e) {
                        // イベントリスナーが存在しない場合は無視
                    }
                });
                
                // 音声を完全停止
                try {
                    currentState.currentAudio.pause();
                    currentState.currentAudio.currentTime = 0;
                    currentState.currentAudio.src = '';
                    currentState.currentAudio.load(); // リソースを解放
                } catch (audioError) {
                    this.debugError('Audio要素停止時エラー:', audioError);
                }
                
                // VRMに中断通知
                if (this.terminalApp.vrmIntegrationService) {
                    this.terminalApp.vrmIntegrationService.notifyAudioStateToVRM('interrupted');
                }
            }
            
        } catch (error) {
            this.debugError('音声停止時エラー（継続）:', error);
            // エラーが発生しても処理を継続
        }
        
        // 【重要】Blob URLを確実にクリーンアップ（メモリリーク対策）
        if (currentState.currentAudioUrl) {
            try {
                URL.revokeObjectURL(currentState.currentAudioUrl);
                this.debugLog('✅ Blob URL解放完了:', currentState.currentAudioUrl.substring(0, 50) + '...');
            } catch (error) {
                this.debugError('❌ Blob URLクリーンアップエラー:', error);
            }
        }
        
        // 状態を完全にリセット（ガベージコレクション促進）
        currentState.currentAudio = null;
        currentState.currentAudioUrl = null;
        currentState.currentEndedHandler = null;
        currentState.currentErrorHandler = null;
        currentState.isPlaying = false;
        
        this.debugLog('🧹 音声クリーンアップ完了');
    }

    /**
     * 音声完了の確実な待機
     */
    async waitForAudioCompletion(audio, audioUrl) {
        return new Promise((resolve) => {
            let isResolved = false;
            
            const cleanup = () => {
                if (isResolved) return;
                isResolved = true;
                
                // イベントリスナーを削除
                audio.removeEventListener('ended', endedHandler);
                audio.removeEventListener('error', errorHandler);
                
                // 状態をリセット
                this.terminalApp.voicePlayingState.isPlaying = false;
                this.terminalApp.voicePlayingState.currentAudio = null;
                this.terminalApp.voicePlayingState.currentAudioUrl = null;
                this.terminalApp.voicePlayingState.currentEndedHandler = null;
                this.terminalApp.voicePlayingState.currentErrorHandler = null;
                
                // Blob URLを解放
                try {
                    URL.revokeObjectURL(audioUrl);
                } catch (error) {
                    this.debugError('Blob URL解放エラー:', error);
                }
                
                resolve();
            };
            
            const endedHandler = () => {
                this.debugLog('アプリ内音声再生完了');
                
                // 音声終了をVRMビューワーに通知
                if (this.terminalApp.vrmIntegrationService) {
                    this.terminalApp.vrmIntegrationService.notifyAudioStateToVRM('ended');
                }
                
                cleanup();
            };
            
            const errorHandler = (error) => {
                this.debugError('アプリ内音声再生エラー:', error);
                
                // エラー時もVRMビューワーに通知
                if (this.terminalApp.vrmIntegrationService) {
                    this.terminalApp.vrmIntegrationService.notifyAudioStateToVRM('error');
                }
                
                cleanup();
            };
            
            // イベントハンドラーを保存（クリーンアップ用）
            this.terminalApp.voicePlayingState.currentEndedHandler = endedHandler;
            this.terminalApp.voicePlayingState.currentErrorHandler = errorHandler;
            
            // イベントリスナーを設定
            audio.addEventListener('ended', endedHandler);
            audio.addEventListener('error', errorHandler);
            
            // タイムアウト設定（30秒で強制終了）
            setTimeout(() => {
                if (!isResolved) {
                    this.debugLog('音声再生タイムアウト - 強制終了');
                    cleanup();
                }
            }, 30000);
        });
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