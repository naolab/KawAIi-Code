// 設定管理モジュール

// デバッグログ制御（本番環境では無効化）
const ConfigManager_isDev = !window.location.protocol.startsWith('file:') || process.env.NODE_ENV === 'development';
const ConfigManager_debugLog = ConfigManager_isDev ? console.log : () => {};
const ConfigManager_debugError = ConfigManager_isDev ? console.error : console.error; // エラーは常に出力

class ConfigManager {
    constructor() {
        this.claudeMdContent = null;
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

    // キャラクター設定を読み込み
    async loadCharacterSettings() {
        try {
            const { fs, path, os } = window.electronAPI;
            if (!fs || !path || !os) {
                ConfigManager_debugError('fs, path, or os module not available via electronAPI.');
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
                ConfigManager_debugLog('Loaded default character: shy');
            }
            
            // 他のキャラクター設定を追加
            for (const file of characterMdFiles) {
                if (file !== 'shy.md') { // 照れ屋は既に追加済み
                    const characterPath = path.join(characterSettingsDir, file);
                    const characterContent = await fs.promises.readFile(characterPath, 'utf8');
                    allCharacterSettings += '\n\n---\n\n' + characterContent;
                    ConfigManager_debugLog('Loaded character:', file.replace('.md', ''));
                }
            }
            
            // 設定を統合
            this.claudeMdContent = baseSettings + allCharacterSettings;
            
            // ホームディレクトリにCLAUDE.mdファイルを作成または更新
            try {
                const homeDir = os.homedir();
                const claudeMdPath = path.join(homeDir, 'CLAUDE.md');
                await fs.promises.writeFile(claudeMdPath, this.claudeMdContent, 'utf8');
                ConfigManager_debugLog('CLAUDE.md file created/updated at:', claudeMdPath);
            } catch (writeError) {
                ConfigManager_debugError('Failed to write CLAUDE.md to home directory:', writeError);
            }
            
            ConfigManager_debugLog('Character settings loaded successfully (shy character)');
        } catch (error) {
            ConfigManager_debugError('Failed to load character settings:', error);
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
                ConfigManager_debugLog('Character setting saved:', characterType);
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

            ConfigManager_debugLog('Character changed successfully to:', characterType);
            return true;
        } catch (error) {
            ConfigManager_debugError('Failed to change character:', error);
            
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
                    ConfigManager_debugError('Failed to get character config:', configError);
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

            ConfigManager_debugLog('Character selection synced:', selectedCharacter);
            return selectedCharacter;
        } catch (error) {
            ConfigManager_debugError('Failed to sync character selection:', error);
            return 'shy';
        }
    }

    // プロジェクト固有設定を読み込んでCLAUDE.mdを更新
    async loadProjectSpecificSettings(projectDir = null) {
        try {
            const { fs, path, os } = window.electronAPI;
            if (!fs || !path || !os) {
                ConfigManager_debugError('fs, path, or os module not available via electronAPI.');
                return;
            }

            // プロジェクトディレクトリが指定されていない場合は、現在設定されている作業ディレクトリを使用
            const targetDir = projectDir || this.claudeWorkingDir;
            if (!targetDir) {
                ConfigManager_debugLog('No project directory specified for loading project settings');
                return;
            }

            // 基本的なキャラクター設定が読み込まれていない場合は先に読み込む
            if (!this.claudeMdContent) {
                await this.loadCharacterSettings();
                return; // loadCharacterSettingsが完了した後にこのメソッドを呼び直す必要はない
            }

            // 現在の基本設定を保持（プロジェクト設定を除く）
            let baseContent = this.claudeMdContent;
            const projectSectionIndex = baseContent.indexOf('\n\n---\n\n# プロジェクト固有設定\n\n');
            if (projectSectionIndex !== -1) {
                baseContent = baseContent.substring(0, projectSectionIndex);
            }

            // プロジェクトディレクトリのCLAUDE.mdをチェック
            const projectClaudeMdPath = path.join(targetDir, 'CLAUDE.md');
            
            try {
                await fs.promises.access(projectClaudeMdPath);
                const projectSettings = await fs.promises.readFile(projectClaudeMdPath, 'utf8');
                this.claudeMdContent = baseContent + '\n\n---\n\n# プロジェクト固有設定\n\n' + projectSettings;
                ConfigManager_debugLog('Project-specific CLAUDE.md found and merged:', projectClaudeMdPath);
            } catch (accessError) {
                // ファイルが存在しない場合は基本設定のみ
                this.claudeMdContent = baseContent;
                ConfigManager_debugLog('No project-specific CLAUDE.md found at:', projectClaudeMdPath);
            }

            // ホームディレクトリのCLAUDE.mdを更新
            try {
                const homeDir = os.homedir();
                const claudeMdPath = path.join(homeDir, 'CLAUDE.md');
                await fs.promises.writeFile(claudeMdPath, this.claudeMdContent, 'utf8');
                ConfigManager_debugLog('CLAUDE.md file updated with project settings at:', claudeMdPath);
            } catch (writeError) {
                ConfigManager_debugError('Failed to write CLAUDE.md to home directory:', writeError);
            }

        } catch (error) {
            ConfigManager_debugError('Failed to load project-specific settings:', error);
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
                
                ConfigManager_debugLog('設定を読み込み:', { voiceCooldownSeconds: cooldownSeconds });
                return { voiceCooldownSeconds: cooldownSeconds };
            }
        } catch (error) {
            ConfigManager_debugError('設定の読み込みに失敗:', error);
        }
        return null;
    }

    // 音声クールダウン設定を保存
    async saveVoiceCooldown(cooldownSeconds) {
        try {
            if (window.electronAPI && window.electronAPI.config) {
                await window.electronAPI.config.set('voiceCooldownSeconds', cooldownSeconds);
                this.speechCooldown = cooldownSeconds * 1000;
                ConfigManager_debugLog('Voice cooldown setting saved:', cooldownSeconds);
                return true;
            }
        } catch (error) {
            ConfigManager_debugError('Failed to save voice cooldown setting:', error);
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

    // 設定をリセット
    async resetSettings() {
        try {
            if (window.electronAPI && window.electronAPI.config) {
                await window.electronAPI.config.clear();
                await this.loadCharacterSettings();
                await this.loadUserConfig();
                ConfigManager_debugLog('Settings reset successfully');
                return true;
            }
        } catch (error) {
            ConfigManager_debugError('Failed to reset settings:', error);
        }
        return false;
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
            ConfigManager_debugError('Failed to get current character:', error);
        }
        return 'shy';
    }
}

// グローバルに公開
window.ConfigManager = ConfigManager;