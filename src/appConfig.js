const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

class AppConfig {
    constructor() {
        this.configPath = path.join(os.homedir(), '.kawaii-code-config', 'config.json');
        this.config = {};
        this.ensureConfigDirectoryExists();
    }

    ensureConfigDirectoryExists() {
        const dir = path.dirname(this.configPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    async loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = await fs.promises.readFile(this.configPath, 'utf8');
                this.config = JSON.parse(data);
                console.log('AppConfig: 設定をロードしました', this.config);
            } else {
                this.config = this.getDefaultConfig();
                await this.saveConfig();
                console.log('AppConfig: デフォルト設定を作成しました', this.config);
            }
        } catch (error) {
            console.error('AppConfig: 設定のロードまたは作成に失敗しました', error);
            this.config = this.getDefaultConfig(); // エラー時はデフォルトにフォールバック
        }
        return this.config;
    }

    async saveConfig() {
        try {
            await fs.promises.writeFile(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
            console.log('AppConfig: 設定を保存しました', this.config);
        } catch (error) {
            console.error('AppConfig: 設定の保存に失敗しました', error);
        }
    }

    get(key, defaultValue = undefined) {
        return this.config[key] !== undefined ? this.config[key] : defaultValue;
    }

    async set(key, value) {
        this.config[key] = value;
        await this.saveConfig();
    }

    getDefaultConfig() {
        return {
            claudeWorkingDir: os.homedir(), // デフォルトはユーザーのホームディレクトリ
            voiceSynthesisEnabled: true,
            defaultSpeakerId: null,
            voiceCooldownSeconds: 1,
            voiceEnabled: true,
            selectedSpeaker: 0,
            voiceVolume: 50,
            voiceIntervalSeconds: 1,
            useHooks: false, // 配布版では常時無効
            currentCharacter: 'shy', // 照れ屋キャラクターに固定
            // Aivis Cloud API設定
            useCloudAPI: false, // デフォルトはローカルエンジン使用
            aivisCloudApiKey: '', // APIキー（暗号化して保存）
            aivisCloudApiUrl: 'https://api.aivis-project.com/v1', // クラウドAPIエンドポイント
            // その他のデフォルト設定
        };
    }

    getClaudeWorkingDir() {
        return this.config.claudeWorkingDir || os.homedir();
    }

    setClaudeWorkingDir(dir) {
        this.config.claudeWorkingDir = dir;
        this.saveConfig();
    }

    // APIキーの暗号化・復号化メソッド
    encryptApiKey(apiKey) {
        if (!apiKey) return '';
        const algorithm = 'aes-256-cbc';
        const key = crypto.createHash('sha256').update('kawaii-voice-app').digest();
        const iv = Buffer.alloc(16, 0); // 簡易的な固定IV
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(apiKey, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    }

    decryptApiKey(encryptedKey) {
        if (!encryptedKey) return '';
        try {
            const algorithm = 'aes-256-cbc';
            const key = crypto.createHash('sha256').update('kawaii-voice-app').digest();
            const iv = Buffer.alloc(16, 0);
            const decipher = crypto.createDecipheriv(algorithm, key, iv);
            let decrypted = decipher.update(encryptedKey, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (error) {
            console.error('APIキーの復号化に失敗:', error);
            return '';
        }
    }

    // Cloud API関連のgetter/setter
    async setCloudApiKey(apiKey) {
        const encrypted = this.encryptApiKey(apiKey);
        await this.set('aivisCloudApiKey', encrypted);
    }

    getCloudApiKey() {
        const encrypted = this.get('aivisCloudApiKey', '');
        return this.decryptApiKey(encrypted);
    }
}

const appConfig = new AppConfig();

// 注意: 自動初期化は削除しました
// main.jsで明示的に初期化を行うことで、重複初期化とウィンドウ重複起動を回避

module.exports = appConfig; 