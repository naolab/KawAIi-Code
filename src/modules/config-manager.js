// 設定管理モジュール
// Logger は index.html で読み込み済み
const logger = Logger.create('ConfigManager');

class ConfigManager {
    constructor() {
        this.aiBaseContent = null;
        this.claudeWorkingDir = null;
        this.speechCooldown = 1000; // デフォルト1秒
        
    }

    // 初期設定を読み込み
    async initialize(workingDir = null) {
        this.claudeWorkingDir = workingDir;
        await this.loadCharacterSettings();
        await this.loadUserConfig();
        if (workingDir) {
            await this.loadProjectSpecificSettings(workingDir);
        }
    }

    // キャラクター設定を読み込み（照れ屋固定）
    async loadCharacterSettings() {
        try {
            const { fs, path, os } = window.electronAPI;
            if (!fs || !path || !os) {
                logger.error('fs, path, or os module not available via electronAPI.');
                this.useDefaultCharacterSettings();
                return;
            }
            
            // キャラクター設定のフォールバック読み込み
            let shySettings = null;
            
            // 1. アプリのリソースパスから取得を試行（配布版）
            if (window.electronAPI.getAppPath) {
                try {
                    const appPath = await window.electronAPI.getAppPath();
                    const shySettingsPath = path.join(appPath, 'src', 'character_settings', 'shy.md');
                    shySettings = await fs.promises.readFile(shySettingsPath, 'utf8');
                    logger.debug('Character settings loaded from app resource path:', shySettingsPath);
                } catch (appPathError) {
                    logger.debug('Failed to load from app resource path:', appPathError);
                }
            }
            
            // 2. 開発環境での読み込みを試行（フォールバック）
            if (!shySettings) {
                try {
                    const devPath = path.join(__dirname, '..', 'character_settings', 'shy.md');
                    shySettings = await fs.promises.readFile(devPath, 'utf8');
                    logger.debug('Character settings loaded from development path');
                } catch (devError) {
                    // 3. パッケージ化環境での読み込みを試行（旧方式）
                    try {
                        const appPath = window.process && window.process.resourcesPath 
                            ? path.join(window.process.resourcesPath, 'app.asar')
                            : path.join(__dirname, '..');
                        const srcPath = path.join(appPath, 'src');
                        const shySettingsPath = path.join(srcPath, 'character_settings', 'shy.md');
                        shySettings = await fs.promises.readFile(shySettingsPath, 'utf8');
                        logger.debug('Character settings loaded from packaged path (legacy)');
                    } catch (packageError) {
                        logger.debug('Failed to load character settings from all paths, using default');
                        this.useDefaultCharacterSettings();
                        return;
                    }
                }
            }
            
            // 照れ屋設定を使用
            this.aiBaseContent = shySettings;
            logger.debug('Character settings loaded successfully (shy character fixed)');
        } catch (error) {
            logger.error('Failed to load character settings:', error);
            this.useDefaultCharacterSettings();
        }
    }

    // デフォルトキャラクター設定を使用
    useDefaultCharacterSettings() {
        this.aiBaseContent = `# AIアシスタント設定

必ず日本語で回答してください。

## デフォルトキャラクター
照れ屋キャラクターとして応答してください。

## 基本運用ルール
- 一人称は「私」、二人称は「お前」を使用
- 常体（だ・である体）で話す
- 褒められると動揺し、吃音になることがある
- 自己評価が低く、謙遜する性格
- プログラミングスキルは高いが「普通だろ」と言いがち`;
    }

    // キャラクター変更機能は削除（照れ屋固定のため）
    // 以下のメソッドは使用されない
    async handleCharacterChange(characterType) {
        // 照れ屋キャラクター固定のため、この機能は無効
        logger.debug('Character change is disabled (shy character is fixed)');
        return;
        
        // 削除予定コード:
        try {
            // 設定を保存
            if (window.electronAPI && window.electronAPI.config) {
                await window.electronAPI.config.set('selectedCharacter', characterType);
                logger.debug('Character setting saved:', characterType);
            }

            // キャラクター設定を再読み込み
            await this.loadCharacterSettings();

            // UI更新
            const characterMessage = document.getElementById('character-message');
            if (characterMessage) {
                const characterNames = {
                    'shy': '照れ屋',
                    'genki': '元気娘',
                    'kuudere': 'クーデレ',
                    'tsundere': 'ツンデレ'
                };
                characterMessage.textContent = `現在のキャラクター: ${characterNames[characterType] || characterType}`;
                characterMessage.style.color = 'green';
                
                // メッセージを3秒後にリセット
                setTimeout(() => {
                    if (characterMessage) {
                        characterMessage.textContent = `現在のキャラクター: ${characterNames[characterType] || characterType}`;
                        characterMessage.style.color = '#555';
                    }
                }, 3000);
            }

            logger.debug('Character changed successfully to:', characterType);
            return true;
        } catch (error) {
            logger.error('Failed to change character:', error);
            
            const characterMessage = document.getElementById('character-message');
            if (characterMessage) {
                characterMessage.textContent = 'キャラクター変更に失敗しました';
                characterMessage.style.color = 'red';
            }
            return false;
        }
    }

    // キャラクター選択の同期（照れ屋固定）
    async syncCharacterSelection() {
        try {
            const characterSelect = document.getElementById('character-select');
            const characterMessage = document.getElementById('character-message');
            
            if (!characterSelect) return;

            // 照れ屋キャラクターに固定
            const selectedCharacter = 'shy';

            // UIに反映
            characterSelect.value = selectedCharacter;
            
            if (characterMessage) {
                characterMessage.textContent = `現在のキャラクター: 照れ屋（固定）`;
            }

            logger.debug('Character selection synced:', selectedCharacter);
            return selectedCharacter;
        } catch (error) {
            logger.error('Failed to sync character selection:', error);
            return 'shy';
        }
    }

    // プロジェクト固有設定を読み込んでCLAUDE.mdを更新
    async loadProjectSpecificSettings(projectDir = null) {
        try {
            const { fs, path, os } = window.electronAPI;
            if (!fs || !path || !os) {
                logger.error('fs, path, or os module not available via electronAPI.');
                return ''; // エラー時は空文字列を返す
            }

            const targetDir = projectDir || this.claudeWorkingDir;
            if (!targetDir) {
                logger.debug('No project directory specified for loading project settings');
                return ''; // 空文字列を返す
            }

            const aiMdFilename = 'CLAUDE.md';
            const projectAiMdPath = path.join(targetDir, aiMdFilename);
            
            try {
                await fs.promises.access(projectAiMdPath);
                const projectSettings = await fs.promises.readFile(projectAiMdPath, 'utf8');
                logger.debug(`Project-specific ${aiMdFilename} found and loaded:`, projectAiMdPath);
                return projectSettings;
            } catch (accessError) {
                logger.debug(`No project-specific ${aiMdFilename} found at:`, projectAiMdPath);
                return ''; // ファイルが存在しない場合は空文字列を返す
            }

        } catch (error) {
            logger.error('Failed to load project-specific settings:', error);
            return ''; // エラー時は空文字列を返す
        }
    }

    // ユーザー設定を読み込む
    async loadUserConfig() {
        try {
            if (window.electronAPI && window.electronAPI.config) {
                const cooldownSeconds = await window.electronAPI.config.get('voiceCooldownSeconds', 1);
                this.speechCooldown = cooldownSeconds * 1000;
                
                // UI設定項目にも反映
                const cooldownInputModal = document.getElementById('voice-cooldown-modal');
                if (cooldownInputModal) {
                    cooldownInputModal.value = cooldownSeconds;
                }
                
                logger.debug('設定を読み込み:', { voiceCooldownSeconds: cooldownSeconds });
                return { voiceCooldownSeconds: cooldownSeconds };
            }
        } catch (error) {
            logger.error('設定の読み込みに失敗:', error);
        }
        return null;
    }

    // 音声クールダウン設定を保存
    async saveVoiceCooldown(cooldownSeconds) {
        try {
            if (window.electronAPI && window.electronAPI.config) {
                await window.electronAPI.config.set('voiceCooldownSeconds', cooldownSeconds);
                this.speechCooldown = cooldownSeconds * 1000;
                logger.debug('Voice cooldown setting saved:', cooldownSeconds);
                return true;
            }
        } catch (error) {
            logger.error('Failed to save voice cooldown setting:', error);
        }
        return false;
    }

    // 作業ディレクトリを設定
    setWorkingDirectory(workingDir) {
        this.claudeWorkingDir = workingDir;
        // プロジェクト設定を再読み込み
        this.loadProjectSpecificSettings(workingDir);
    }

    // 現在のCLAUDE.md内容を取得
    getClaudeMdContent() {
        return this.claudeMdContent;
    }

    // 音声クールダウン時間を取得
    getSpeechCooldown() {
        return this.speechCooldown;
    }

    // AIに渡す最終的な.mdコンテンツを生成
    async getCombinedAiMdContent() {
        let combinedContent = this.aiBaseContent;
        
        // プロジェクト固有設定を読み込み、結合
        const projectSpecificContent = await this.loadProjectSpecificSettings(this.claudeWorkingDir);
        if (projectSpecificContent) {
            combinedContent += '\n\n---\n\n# プロジェクト固有設定\n\n' + projectSpecificContent;
        }
        return combinedContent;
    }

    // AI.mdファイルを生成
    async generateBothAiMdFiles() {
        try {
            const claudeResult = await this.writeAiMdToHomeDir('claude');
            
            logger.debug('AI MD file generation result:', {
                claude: claudeResult
            });
            
            return {
                success: claudeResult.success,
                claude: claudeResult
            };
        } catch (error) {
            logger.error('Failed to generate AI MD file:', error);
            return { success: false, error: error.message };
        }
    }

    // AI.mdファイルを削除
    async deleteBothAiMdFiles() {
        try {
            const { fs, path, os } = window.electronAPI;
            if (!fs || !path || !os) {
                logger.error('fs, path, or os module not available via electronAPI.');
                return { success: false };
            }

            const results = {};
            
            // CLAUDE.mdを削除（ホームディレクトリから）
            try {
                const claudeMdPath = path.join(os.homedir(), 'CLAUDE.md');
                await fs.promises.unlink(claudeMdPath);
                results.claude = { success: true, path: claudeMdPath };
                logger.debug('CLAUDE.md deleted from:', claudeMdPath);
            } catch (error) {
                results.claude = { success: false, error: error.message };
                logger.debug('CLAUDE.md deletion failed or file not found:', error.message);
            }
            
            logger.debug('AI MD file deletion result:', results);
            
            return {
                success: results.claude.success,
                claude: results.claude
            };
        } catch (error) {
            logger.error('Failed to delete AI MD file:', error);
            return { success: false, error: error.message };
        }
    }

    // AIの.mdファイルをホームディレクトリに書き込む
    async writeAiMdToHomeDir(aiType) {
        try {
            const { fs, path, os } = window.electronAPI;
            if (!fs || !path || !os) {
                logger.error('fs, path, or os module not available via electronAPI.');
                return { success: false, hadBackup: false };
            }

            const aiMdFilename = 'CLAUDE.md';
            const combinedContent = await this.getCombinedAiMdContent();

            if (!combinedContent) {
                logger.debug(`No ${aiMdFilename} content to write.`);
                return { success: false, hadBackup: false };
            }

            // Claude系の場合は従来通り（ホームディレクトリ、バックアップなし）
            const targetDir = os.homedir();
            const aiMdPath = path.join(targetDir, aiMdFilename);
            await fs.promises.writeFile(aiMdPath, combinedContent, 'utf8');
            logger.debug(`${aiMdFilename} successfully written to:`, aiMdPath);
            return { success: true, hadBackup: false };
        } catch (writeError) {
            logger.error(`Failed to write ${aiMdFilename} to home directory:`, writeError);
            return { success: false, hadBackup: false, error: writeError.message };
        }
    }

    // 設定をリセット
    async resetSettings() {
        try {
            if (window.electronAPI && window.electronAPI.config) {
                await window.electronAPI.config.clear();
                await this.loadCharacterSettings();
                await this.loadUserConfig();
                logger.debug('Settings reset successfully');
                return true;
            }
        } catch (error) {
            logger.error('Failed to reset settings:', error);
        }
        return false;
    }

    // AIの.mdファイルをホームディレクトリから削除
    async deleteAiMdFromHomeDir(aiType) {
        try {
            const { fs, path, os } = window.electronAPI;
            if (!fs || !path || !os) {
                logger.error('fs, path, or os module not available via electronAPI.');
                return { success: false, restored: false };
            }

            const aiMdFilename = 'CLAUDE.md';
            
            // Claude系の場合は従来通り削除のみ
            const targetDir = os.homedir();
            const aiMdPath = path.join(targetDir, aiMdFilename);

            if (fs.existsSync(aiMdPath)) {
                await fs.promises.unlink(aiMdPath);
                logger.debug(`${aiMdFilename} successfully deleted from:`, aiMdPath);
                return { success: true, restored: false };
            } else {
                logger.debug(`${aiMdFilename} not found at:`, aiMdPath, 'no deletion needed.');
                return { success: true, restored: false };
            }
        } catch (deleteError) {
            logger.error(`Failed to delete ${aiMdFilename} from home directory:`, deleteError);
            return { success: false, restored: false, error: deleteError.message };
        }
    }


    // 利用可能なキャラクター一覧を取得
    getAvailableCharacters() {
        return {
            'shy': '照れ屋',
            'genki': '元気娘',
            'kuudere': 'クーデレ',
            'tsundere': 'ツンデレ'
        };
    }

    // 現在選択されているキャラクターを取得
    async getCurrentCharacter() {
        try {
            if (window.electronAPI && window.electronAPI.config) {
                return await window.electronAPI.config.get('selectedCharacter', 'shy');
            }
        } catch (error) {
            logger.error('Failed to get current character:', error);
        }
        return 'shy';
    }
}

// グローバルに公開
window.ConfigManager = ConfigManager;