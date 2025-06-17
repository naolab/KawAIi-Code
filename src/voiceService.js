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

    async synthesizeText(text, speaker = 0) {
        if (!this.isConnected) {
            throw new Error('AivisSpeech Engine not connected');
        }

        try {
            // Step 1: Get audio query
            const queryResponse = await axios.post(
                `${this.baseUrl}/audio_query`,
                null,
                {
                    params: { text, speaker },
                    headers: { 'accept': 'application/json' }
                }
            );

            // Step 2: Synthesize audio
            const audioResponse = await axios.post(
                `${this.baseUrl}/synthesis`,
                queryResponse.data,
                {
                    params: { speaker },
                    headers: { 
                        'accept': 'audio/wav',
                        'Content-Type': 'application/json' 
                    },
                    responseType: 'arraybuffer'
                }
            );

            return audioResponse.data;
        } catch (error) {
            console.error('Voice synthesis error:', error);
            throw error;
        }
    }

    async speakText(text, speaker = 0) {
        try {
            const audioData = await this.synthesizeText(text, speaker);
            // 音声データはメインプロセスからレンダラープロセスに送信
            return { success: true, audioData };
        } catch (error) {
            console.error('Text-to-speech error:', error);
            throw error;
        }
    }

    // キューシステムは削除（レンダラープロセスで管理）
    
    stopAudio() {
        // レンダラープロセスに停止信号を送信
        return { success: true };
    }

    clearQueue() {
        // レンダラープロセスに停止信号を送信
        return { success: true };
    }

    // Parse terminal output to extract text for TTS
    parseTerminalOutput(data) {
        console.log('Raw terminal data:', JSON.stringify(data));
        
        // Remove ANSI escape codes and control sequences
        const cleanText = data
            .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // ANSI escape sequences
            .replace(/\x1b\[[0-9;]*[HfABCDEFGJKSTmhlp]/g, '') // More ANSI codes
            .replace(/[\x00-\x1f\x7f-\x9f]/g, ' ') // Control characters
            .replace(/\r?\n/g, ' ') // Newlines
            .replace(/\s+/g, ' '); // Multiple spaces
        
        const trimmed = cleanText.trim();
        console.log('Cleaned text:', JSON.stringify(trimmed));
        
        // Skip empty or very short texts
        if (trimmed.length < 5) {
            console.log('Skipped: too short');
            return null;
        }

        // Skip UI elements and decorative patterns
        const skipPatterns = [
            /^[\$#>]\s*$/,
            /^[\w@-]+:.*[\$#>]\s*$/,
            /^\s*$/,
            /^[│├└╭╯╰┌┐┬┴┼─═║╔╗╚╝╠╣╦╩╬]*\s*$/, // Box drawing characters
            /^[⚒↓⭐✶✻✢·✳⏺]+\s*$/, // Special symbols only
            /^(musing|thinking|cerebrating|welcome to claude code)/i, // AI status messages
            /^\[[\d\w;]*m/, // Remaining ANSI codes
            /tokens.*interrupt/i, // Token status
            /^\/help.*setup/i, // Help messages
            /^cwd:/i, // Current directory
            /^\?\s*for shortcuts/i, // Shortcuts help
            /^loading|waiting|processing/i, // Status messages
            /^\d+\s*ms$/, // Time measurements
            /^[\.\-=\+─]{3,}$/, // Lines of symbols
            /^Try\s+".*"\s*$/, // Try suggestions
        ];

        for (const pattern of skipPatterns) {
            if (pattern.test(trimmed)) {
                console.log('Skipped by pattern:', pattern);
                return null;
            }
        }

        // Extract actual conversation content (starts with ⏺ first, before UI check)
        if (trimmed.includes('⏺')) {
            console.log('Found ⏺ symbol');
            // Extract everything after ⏺ until UI elements appear
            const conversationMatch = trimmed.match(/⏺\s*([^╭╯│]+)/);
            if (conversationMatch && conversationMatch[1]) {
                let conversation = conversationMatch[1]
                    .replace(/\s*(✢|✳|✶|✻|✽|·)\s*Spinning.*$/, '') // Remove spinning indicators
                    .replace(/\s*\(\d+s\s*·.*$/, '') // Remove time indicators
                    .replace(/\s*tokens.*interrupt.*$/, '') // Remove token info
                    .trim();
                
                console.log('Extracted conversation:', conversation);
                
                // Only return if it's actual conversation content
                if (conversation.length > 10 && (
                    /[あ-んア-ヶ一-龯]/.test(conversation) || // Contains Japanese
                    conversation.includes('。') ||
                    conversation.includes('！') ||
                    conversation.includes('？') ||
                    conversation.includes('~') ||
                    conversation.includes('✨')
                )) {
                    console.log('Returning conversation:', conversation);
                    return conversation;
                }
            }
            console.log('⏺ found but conversation not extracted');
            return null;
        }

        // Skip input prompts and UI elements
        if (trimmed.includes('│') || trimmed.includes('╭') || trimmed.includes('╯') || 
            trimmed.includes('Welcome to Claude Code') || trimmed.startsWith('>')) {
            console.log('Skipped: UI element');
            return null;
        }

        // Only return meaningful conversation content
        if (/[あ-んア-ヶ一-龯]/.test(trimmed) && trimmed.length > 15) {
            console.log('Returning Japanese text:', trimmed);
            return trimmed;
        }

        console.log('No match found, skipping');
        return null;
    }
}

module.exports = VoiceService;