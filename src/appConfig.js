const path = require('path');
const fs = require('fs');
const os = require('os');

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
}

const appConfig = new AppConfig();

// アプリケーション起動時に設定をロード
appConfig.loadConfig();

module.exports = appConfig; 