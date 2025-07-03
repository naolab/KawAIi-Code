// 設定管理モジュール
// Logger は index.html で読み込み済み
const logger = Logger.create('ConfigManager');

class ConfigManager {
    constructor() {
        this.aiBaseContent = null;
        this.claudeWorkingDir = null;
        this.speechCooldown = 1000; // デフォルト1秒
        
        // バックアップ状態管理
        this.backupState = {
            claude: { hasBackup: false },
            gemini: { hasBackup: false, workingDir: null }
        };
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

    // キャラクター設定を読み込み
    async loadCharacterSettings() {
        try {
            const { fs, path, os } = window.electronAPI;
            if (!fs || !path || !os) {
                logger.error('fs, path, or os module not available via electronAPI.');
                return;
            }
            
            // アプリのsrcディレクトリへの直接パスを構築（パッケージ化対応）
            const appPath = window.process && window.process.resourcesPath 
                ? path.join(window.process.resourcesPath, 'app.asar')
                : path.join(__dirname, '..');
            const srcPath = path.join(appPath, 'src');
            
            // 基本設定を読み込み
            const baseSettingsPath = path.join(srcPath, 'character_settings', 'base_settings.md');
            const baseSettings = await fs.promises.readFile(baseSettingsPath, 'utf8');
            
            // 全てのキャラクター設定ファイルを読み込み
            const characterSettingsDir = path.join(srcPath, 'character_settings');
            const characterFiles = await fs.promises.readdir(characterSettingsDir);
            
            // .mdファイルのみをフィルタリング（base_settings.md以外）
            const characterMdFiles = characterFiles.filter(file => 
                file.endsWith('.md') && file !== 'base_settings.md'
            );
            
            let allCharacterSettings = '';
            
            // 照れ屋キャラクターを最初に追加（デフォルト）
            const shyFile = characterMdFiles.find(file => file === 'shy.md');
            if (shyFile) {
                const shyPath = path.join(characterSettingsDir, shyFile);
                const shyContent = await fs.promises.readFile(shyPath, 'utf8');
                allCharacterSettings += '\n\n---\n\n' + shyContent;
                logger.debug('Loaded default character: shy');
            }
            
            // 他のキャラクター設定を追加
            for (const file of characterMdFiles) {
                if (file !== 'shy.md') { // 照れ屋は既に追加済み
                    const characterPath = path.join(characterSettingsDir, file);
                    const characterContent = await fs.promises.readFile(characterPath, 'utf8');
                    allCharacterSettings += '\n\n---\n\n' + characterContent;
                    logger.debug('Loaded character:', file.replace('.md', ''));
                }
            }
            
            // 設定を統合
            this.aiBaseContent = baseSettings + allCharacterSettings;
            
            // CLAUDE.mdのファイル書き込みは、Claude Code起動時にのみ行うため、ここでは行わない
            // 内容はthis.claudeMdContentに保持される
            
            logger.debug('Character settings loaded successfully (shy character)');
        } catch (error) {
            logger.error('Failed to load character settings:', error);
            // フォールバック: 簡単なデフォルト設定
            this.claudeMdContent = `# AIアシスタント設定\n\n必ず日本語で回答してください。\n\n## デフォルトキャラクター\n照れ屋キャラクターとして応答してください。`;
        }
    }

    // キャラクター変更を処理
    async handleCharacterChange(characterType) {
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

    // キャラクター選択の同期
    async syncCharacterSelection() {
        try {
            const characterSelect = document.getElementById('character-select');
            const characterMessage = document.getElementById('character-message');
            
            if (!characterSelect) return;

            // 保存された設定を読み込み
            let selectedCharacter = 'shy'; // デフォルト
            if (window.electronAPI && window.electronAPI.config) {
                try {
                    selectedCharacter = await window.electronAPI.config.get('selectedCharacter', 'shy');
                } catch (configError) {
                    logger.error('Failed to get character config:', configError);
                }
            }

            // UIに反映
            characterSelect.value = selectedCharacter;
            
            if (characterMessage) {
                const characterNames = {
                    'shy': '照れ屋',
                    'genki': '元気娘',
                    'kuudere': 'クーデレ',
                    'tsundere': 'ツンデレ'
                };
                characterMessage.textContent = `現在のキャラクター: ${characterNames[selectedCharacter] || selectedCharacter}`;
            }

            logger.debug('Character selection synced:', selectedCharacter);
            return selectedCharacter;
        } catch (error) {
            logger.error('Failed to sync character selection:', error);
            return 'shy';
        }
    }

    // プロジェクト固有設定を読み込んでCLAUDE.mdを更新
    async loadProjectSpecificSettings(projectDir = null, aiType = 'claude') {
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

            const aiMdFilename = aiType === 'claude' ? 'CLAUDE.md' : 'GEMINI.md';
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
    async getCombinedAiMdContent(aiType) {
        let combinedContent = this.aiBaseContent;
        
        // プロジェクト固有設定を読み込み、結合
        const projectSpecificContent = await this.loadProjectSpecificSettings(this.claudeWorkingDir, aiType);
        if (projectSpecificContent) {
            combinedContent += '\n\n---\n\n# プロジェクト固有設定\n\n' + projectSpecificContent;
        }
        return combinedContent;
    }

    // 両方のAI.mdファイルを同時に生成
    async generateBothAiMdFiles() {
        try {
            const claudeResult = await this.writeAiMdToHomeDir('claude');
            const geminiResult = await this.writeAiMdToHomeDir('gemini');
            
            logger.debug('Both AI MD files generation result:', {
                claude: claudeResult,
                gemini: geminiResult
            });
            
            return {
                success: claudeResult.success && geminiResult.success,
                claude: claudeResult,
                gemini: geminiResult
            };
        } catch (error) {
            logger.error('Failed to generate both AI MD files:', error);
            return { success: false, error: error.message };
        }
    }

    // 両方のAI.mdファイルを同時に削除
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
            
            // GEMINI.mdを削除（作業ディレクトリから）
            if (this.claudeWorkingDir) {
                try {
                    const geminiMdPath = path.join(this.claudeWorkingDir, 'GEMINI.md');
                    await fs.promises.unlink(geminiMdPath);
                    results.gemini = { success: true, path: geminiMdPath };
                    logger.debug('GEMINI.md deleted from:', geminiMdPath);
                } catch (error) {
                    results.gemini = { success: false, error: error.message };
                    logger.debug('GEMINI.md deletion failed or file not found:', error.message);
                }
            } else {
                results.gemini = { success: false, error: 'Working directory not set' };
            }
            
            logger.debug('Both AI MD files deletion result:', results);
            
            return {
                success: results.claude.success || results.gemini.success, // 少なくとも1つ成功すれば成功
                claude: results.claude,
                gemini: results.gemini
            };
        } catch (error) {
            logger.error('Failed to delete both AI MD files:', error);
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

            const aiMdFilename = aiType === 'claude' ? 'CLAUDE.md' : 'GEMINI.md';
            const combinedContent = await this.getCombinedAiMdContent(aiType);

            if (!combinedContent) {
                logger.debug(`No ${aiMdFilename} content to write.`);
                return { success: false, hadBackup: false };
            }

            let targetDir;
            if (aiType === 'gemini') {
                targetDir = this.claudeWorkingDir; // Geminiの場合は作業ディレクトリ
                if (!targetDir) {
                    logger.error('Gemini MD write: claudeWorkingDir is not set.');
                    return { success: false, hadBackup: false };
                }
                
                // Geminiの場合はバックアップ機能を使用
                return await this.createAiMdWithBackup(aiType, combinedContent, targetDir);
            } else {
                // Claudeの場合は従来通り（ホームディレクトリ、バックアップなし）
                targetDir = os.homedir();
                const aiMdPath = path.join(targetDir, aiMdFilename);
                await fs.promises.writeFile(aiMdPath, combinedContent, 'utf8');
                logger.debug(`${aiMdFilename} successfully written to:`, aiMdPath);
                return { success: true, hadBackup: false };
            }
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

    // AIの.mdファイルをホームディレクトリから削除/復元
    async deleteAiMdFromHomeDir(aiType) {
        try {
            const { fs, path, os } = window.electronAPI;
            if (!fs || !path || !os) {
                logger.error('fs, path, or os module not available via electronAPI.');
                return { success: false, restored: false };
            }

            const aiMdFilename = aiType === 'claude' ? 'CLAUDE.md' : 'GEMINI.md';
            
            let targetDir;
            if (aiType === 'gemini') {
                targetDir = this.claudeWorkingDir; // Geminiの場合は作業ディレクトリ
                if (!targetDir) {
                    logger.error('Gemini MD delete: claudeWorkingDir is not set.');
                    return { success: false, restored: false };
                }
                
                // Geminiの場合はバックアップから復元
                return await this.restoreAiMdFromBackup(aiType, targetDir);
            } else {
                // Claudeの場合は従来通り削除のみ
                targetDir = os.homedir();
                const aiMdPath = path.join(targetDir, aiMdFilename);

                if (fs.existsSync(aiMdPath)) {
                    await fs.promises.unlink(aiMdPath);
                    logger.debug(`${aiMdFilename} successfully deleted from:`, aiMdPath);
                    return { success: true, restored: false };
                } else {
                    logger.debug(`${aiMdFilename} not found at:`, aiMdPath, 'no deletion needed.');
                    return { success: true, restored: false };
                }
            }
        } catch (deleteError) {
            logger.error(`Failed to delete ${aiMdFilename} from home directory:`, deleteError);
            return { success: false, restored: false, error: deleteError.message };
        }
    }

    // AIの.mdファイルをバックアップ付きで作成
    async createAiMdWithBackup(aiType, content, targetDir) {
        try {
            const { fs, path } = window.electronAPI;
            if (!fs || !path) {
                logger.error('fs or path module not available via electronAPI.');
                return false;
            }

            const aiMdFilename = aiType === 'claude' ? 'CLAUDE.md' : 'GEMINI.md';
            const aiMdPath = path.join(targetDir, aiMdFilename);
            const backupPath = path.join(targetDir, aiMdFilename + '.backup');

            // 既存ファイルのバックアップ作成
            if (fs.existsSync(aiMdPath)) {
                await fs.promises.copyFile(aiMdPath, backupPath);
                this.backupState[aiType].hasBackup = true;
                this.backupState[aiType].workingDir = targetDir;
                logger.debug(`${aiMdFilename} backed up to:`, backupPath);
            } else {
                this.backupState[aiType].hasBackup = false;
                logger.debug(`No existing ${aiMdFilename} found, no backup needed.`);
            }

            // 新しいファイル作成
            await fs.promises.writeFile(aiMdPath, content, 'utf8');
            logger.debug(`${aiMdFilename} created successfully at:`, aiMdPath);
            
            return {
                success: true,
                hadBackup: this.backupState[aiType].hasBackup
            };
        } catch (error) {
            logger.error(`Failed to create ${aiType} MD with backup:`, error);
            return { success: false, error: error.message };
        }
    }

    // AIの.mdファイルをバックアップから復元
    async restoreAiMdFromBackup(aiType, targetDir) {
        try {
            const { fs, path } = window.electronAPI;
            if (!fs || !path) {
                logger.error('fs or path module not available via electronAPI.');
                return { success: false, restored: false };
            }

            const aiMdFilename = aiType === 'claude' ? 'CLAUDE.md' : 'GEMINI.md';
            const aiMdPath = path.join(targetDir, aiMdFilename);
            const backupPath = path.join(targetDir, aiMdFilename + '.backup');

            // 作成したファイルを削除
            if (fs.existsSync(aiMdPath)) {
                await fs.promises.unlink(aiMdPath);
                logger.debug(`${aiMdFilename} deleted from:`, aiMdPath);
            }

            // バックアップから復元
            if (this.backupState[aiType].hasBackup && fs.existsSync(backupPath)) {
                await fs.promises.rename(backupPath, aiMdPath);
                logger.debug(`${aiMdFilename} restored from backup:`, aiMdPath);
                
                // バックアップ状態をリセット
                this.backupState[aiType].hasBackup = false;
                this.backupState[aiType].workingDir = null;
                
                return { success: true, restored: true };
            } else {
                logger.debug(`No backup found for ${aiMdFilename}, file simply deleted.`);
                return { success: true, restored: false };
            }
        } catch (error) {
            logger.error(`Failed to restore ${aiType} MD from backup:`, error);
            return { success: false, restored: false, error: error.message };
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