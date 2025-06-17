const axios = require('axios');

class VoiceService {
    constructor() {
        this.baseUrl = 'http://127.0.0.1:10101';
        this.audioQueue = [];
        this.isPlaying = false;
        this.audioContext = null;
        this.currentAudio = null;
        this.isConnected = false;
        this.speakers = [];
    }

    async checkConnection() {
        try {
            const response = await axios.get(`${this.baseUrl}/version`, { timeout: 3000 });
            this.isConnected = true;
            return { success: true, version: response.data.version };
        } catch (error) {
            this.isConnected = false;
            return { success: false, error: 'AivisSpeech Engine not running' };
        }
    }

    async getSpeakers() {
        try {
            const response = await axios.get(`${this.baseUrl}/speakers`);
            this.speakers = response.data;
            return this.speakers;
        } catch (error) {
            console.error('Failed to get speakers:', error);
            return [];
        }
    }

    async synthesizeText(text, speaker = 0, style = 0) {
        if (!this.isConnected) {
            throw new Error('AivisSpeech Engine not connected');
        }

        try {
            // Step 1: Get audio query
            const queryResponse = await axios.post(
                `${this.baseUrl}/audio_query`,
                { text },
                {
                    params: { speaker, style },
                    headers: { 'Content-Type': 'application/json' }
                }
            );

            // Step 2: Synthesize audio
            const audioResponse = await axios.post(
                `${this.baseUrl}/synthesis`,
                queryResponse.data,
                {
                    params: { speaker, style },
                    headers: { 'Content-Type': 'application/json' },
                    responseType: 'arraybuffer'
                }
            );

            return audioResponse.data;
        } catch (error) {
            console.error('Voice synthesis error:', error);
            throw error;
        }
    }

    async playAudio(audioData) {
        return new Promise((resolve, reject) => {
            try {
                // Create audio context if not exists
                if (!this.audioContext) {
                    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                }

                // Decode audio data
                this.audioContext.decodeAudioData(audioData)
                    .then(audioBuffer => {
                        const source = this.audioContext.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(this.audioContext.destination);
                        
                        source.onended = () => {
                            this.currentAudio = null;
                            this.isPlaying = false;
                            resolve();
                        };

                        this.currentAudio = source;
                        this.isPlaying = true;
                        source.start();
                    })
                    .catch(reject);
            } catch (error) {
                reject(error);
            }
        });
    }

    async speakText(text, speaker = 0, style = 0) {
        try {
            const audioData = await this.synthesizeText(text, speaker, style);
            await this.playAudio(audioData);
        } catch (error) {
            console.error('Text-to-speech error:', error);
            throw error;
        }
    }

    queueText(text, speaker = 0, style = 0) {
        this.audioQueue.push({ text, speaker, style });
        if (!this.isPlaying) {
            this.processQueue();
        }
    }

    async processQueue() {
        if (this.audioQueue.length === 0 || this.isPlaying) {
            return;
        }

        const { text, speaker, style } = this.audioQueue.shift();
        try {
            await this.speakText(text, speaker, style);
            // Process next item in queue
            this.processQueue();
        } catch (error) {
            console.error('Queue processing error:', error);
            // Continue with next item even if current fails
            this.processQueue();
        }
    }

    stopAudio() {
        if (this.currentAudio) {
            this.currentAudio.stop();
            this.currentAudio = null;
            this.isPlaying = false;
        }
    }

    clearQueue() {
        this.audioQueue = [];
    }

    // Parse terminal output to extract text for TTS
    parseTerminalOutput(data) {
        // Remove ANSI escape codes
        const cleanText = data.replace(/\x1b\[[0-9;]*m/g, '');
        
        // Remove control characters
        const textOnly = cleanText.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
        
        // Clean up whitespace
        const trimmed = textOnly.trim();
        
        // Skip empty or very short texts
        if (trimmed.length < 3) {
            return null;
        }

        // Skip common terminal prompts
        const skipPatterns = [
            /^[\$#>]\s*$/,
            /^[\w@-]+:.*[\$#>]\s*$/,
            /^\s*$/
        ];

        for (const pattern of skipPatterns) {
            if (pattern.test(trimmed)) {
                return null;
            }
        }

        return trimmed;
    }
}

module.exports = VoiceService;