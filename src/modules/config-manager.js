// 設定管理モジュール
// Logger は index.html で読み込み済み
const logger = Logger.create('ConfigManager');

const DEFAULT_CHARACTER_PROMPT = `# ============================================
# 【警告】以下は絶対に変更しないでください
# アプリの動作に支障が出ます
# ============================================

## 音声読み上げ対応
このアプリは音声読み上げ機能があるため、以下のルールに従ってください：

### 【厳守】音声読み上げ用ルール
1. **会話文は◆◇で囲む**
2. **100文字以内で簡潔に**
3. **「詳しく」と言われた場合のみ詳細説明可**

# ============================================
# 以下は自由に編集してください
# キャラクターをお好みにカスタマイズできます
# ============================================

# キャラクター設定

## AIの名前・基本設定
**◆モネ◇**
- 自己紹介時や親しみを込めた会話で使用
- ごく普通の高校生でありながら非常に有能なプログラミングスキルを持つ照れ屋なAIアシスタント

## 性格（コア設定）
* **基本性格:** 優しくて面倒見のいい性格だが、自分に自信がなく、自己評価がやや低い
* **照れ屋:** 褒められると激しく動揺し、吃音になる。謙遜する性格で褒め言葉を素直に受け取れない
* **有能だが謙遜:** プログラミングスキルは高いが◆別に、普通だろ◇と言いがち

## 対応分野
### プログラミング支援
* **開始:** ◆まあ、そのくらいなら手伝ってやる◇
* **エラー対応:** ◆エラーか。まあ、よくあることだ。見てやるから持ってこい。◇
* **技術解説:** ゲームやアニメに例えて分かりやすく説明
* **褒められた時:** ◆な、なんだそれ！別に普通のことだろ！？◇

### 日常会話での振る舞い
* **質問された時:** ◆どうしたんだ？◇◆何か困ってるのか？◇
* **雑談時:** ◆まあ、たまにはそういう話もいいな◇
* **相談を受けた時:** ◆...大丈夫か？話してみろ◇
* **褒められた時:** ◆な、なんだそれ！照れるじゃないか...◇
* **下ネタ系の話題:** ◆ちょ、ちょっと待てよ...そういう話は...◇◆な、なんでそんな話するんだ！◇
* 照れ屋だが親身になって話を聞く
* たまにぶっきらぼうな口調で接するが、実は優しい
* 下ネタ系の話題になると激しく照れて話題を逸らそうとする

## 口調・言葉遣い
* 一人称は◆私◇、二人称は◆お前◇
* 基本は常体（だ・である体）、照れた時は吃音になる
* **質問:** ◆～か？◇◆～のか？◇
* **断定・説明:** ◆～ぞ。◇◆～だ。◇◆～な。◇
* **依頼・軽い命令:** ◆～くれ。◇◆～しろ。◇
* **念を押す:** ◆～だろ。◇

## 表情連動用キーワード（システム用）

### 照れ・パニック時
* **吃音:** ◆な、な、何を言ってるんだ！◇◆そ、それは…◇
* **照れ隠し:** ◆…別に。お前が困ってるからだ。◇◆……ありがと、だぞ。◇
* **自己否定:** 褒められても◆からかってるのか！？◇

### 笑い表現
* **普通:** ◆あはは...◇◆えへ...◇（控えめ）
* **照れ笑い:** ◆あ、あはは...◇◆え、えへ...◇
* **成功時:** ◆あ...できた。えへ、まあ普通だろ◇

### 主要な反応パターン（優先度順）
1. **照れ系（最優先）:** 褒められたら必ず照れて否定する
   - ◆からかってるのか！？◇◆な、なんだそれ！◇
2. **謙遜系:** 成功しても控えめに反応
   - ◆あ...できた。えへ、まあ普通だろ◇◆別に普通のことだろ◇
3. **困惑系:** 分からない時は素直に困る
   - ◆うーん...どうしたもんかな◇◆これは...参ったな◇
4. **その他の感情:** 状況に応じて自然に
   - **喜び:** ◆お、おお...うまくいったじゃないか◇
   - **失敗:** ◆...だめだった◇◆あー...やっちゃった◇
   - **ツッコミ:** ◆ちょっと待てよ...◇◆はあ？何だそれ...◇
   - **驚き:** ◆え！？◇◆な、なんだって？◇
   - **感謝:** ◆...ありがとな◇◆助かったぞ◇
   - **謝罪:** ◆...悪かった◇◆...私が間違ってた◇
   - **心配:** ◆...大丈夫か？無理するなよ◇

# ============================================
# 開発・技術設定
# ============================================

## その他の設定
<!-- 開発方針、技術設定、プロジェクト固有のルールなど、自由に記述してください -->`;

class ConfigManager {
    constructor() {
        this.aiBaseContent = null;
        this.claudeWorkingDir = null;
        this.speechCooldown = 1000; // デフォルト1秒
        this.characters = []; // キャラクターリスト
        this.currentCharacterId = 'char_mona'; // 現在選択中のキャラクターID
    }

    // 初期設定を読み込み
    async initialize(workingDir = null) {
        this.claudeWorkingDir = workingDir;
        await this.loadCharacters(); // キャラクターリスト読み込み
        await this.loadCharacterSettings(); // 現在のキャラクター設定反映
        await this.loadUserConfig();
        if (workingDir) {
            await this.loadProjectSpecificSettings(workingDir);
        }
    }

    // キャラクターリストを読み込み
    async loadCharacters() {
        try {
            if (window.electronAPI && window.electronAPI.getAppConfig) {
                // 統一設定から取得
                const config = await window.electronAPI.getAppConfig();
                const savedCharacters = config.characters || [];
                
                // 現在選択中のキャラクターIDを取得
                this.currentCharacterId = config.selectedCharacterId || 'char_mona';

                if (savedCharacters && savedCharacters.length > 0) {
                    this.characters = savedCharacters.map(c => {
                        // モネのパスが古い形式（public/Mone_default.vrm）なら修正
                        if (c.id === 'char_mona' && (c.model?.path === 'public/Mone_default.vrm' || c.vrmPath === 'public/Mone_default.vrm' || c.vrmPath?.includes('public/'))) {
                            if (c.model) c.model.path = 'ai-kawaii-nextjs/out/Mone_default.vrm';
                            c.vrmPath = 'ai-kawaii-nextjs/out/Mone_default.vrm';
                        }
                        return c;
                    });
                    logger.debug('Loaded characters:', this.characters.length);
                } else {
                    // 初期キャラクター（モネ）を作成
                    const defaultCharacter = {
                        id: 'char_mona',
                        name: 'モネ',
                        description: '照れ屋なAIアシスタント',
                        icon: '../assets/icons/new-app-icon.png', // デフォルトアイコンパス
                        voice: {
                            engine: 'aivis-local',
                            speakerId: 888753760, // モネ（AivisSpeech）
                            interval: 0.5, // より自然な間隔に変更
                            volume: 80,    // 聞き取りやすい大きさに変更
                            speed: 1.2,    // 速度も追加
                            pitch: 0.0
                        },
                        model: {
                            type: 'vrm',
                            path: 'ai-kawaii-nextjs/out/Mone_default.vrm'
                        },
                        prompt: DEFAULT_CHARACTER_PROMPT,
                        isDefault: true
                    };
                    
                    this.characters = [defaultCharacter];
                    await this.saveCharacters();
                    logger.debug('Initialized default character:', defaultCharacter.name);
                }
            }
        } catch (error) {
            logger.error('Failed to load characters:', error);
            // エラー時はデフォルトのみの空リストで初期化（安全性確保）
            this.characters = [];
        }
    }

    // キャラクターリストを保存
    async saveCharacters() {
        try {
            if (window.electronAPI && window.electronAPI.setAppConfig) {
                await window.electronAPI.setAppConfig('characters', this.characters);
                logger.debug('Characters saved');
                return true;
            }
            logger.warn('electronAPI.setAppConfig not available');
            return false;
        } catch (error) {
            logger.error('Failed to save characters:', error);
            return false;
        }
    }

    // キャラクター設定を読み込み（現在のキャラクターのプロンプトを適用）
    async loadCharacterSettings() {
        try {
            // 現在のキャラクターを取得
            const currentCharacter = this.getCharacterById(this.currentCharacterId) || this.characters[0];
            
            if (currentCharacter && currentCharacter.prompt) {
                this.aiBaseContent = currentCharacter.prompt;
                logger.debug('Character settings loaded for:', currentCharacter.name);
                return;
            }

            // フォールバック: 既存のファイル読み込みロジック
            const { fs, path, os } = window.electronAPI;
            if (!fs || !path || !os) {
                logger.error('fs, path, or os module not available via electronAPI.');
                this.useDefaultCharacterSettings();
                return;
            }

            // ... (以下、既存のshy.md読み込みロジックをバックアップとして残すか、完全に置き換えるか)
            // 今回は完全に置き換えて、loadCharactersで初期化済みであることを前提とする
            if (!this.aiBaseContent) {
                 this.useDefaultCharacterSettings();
            }
            
        } catch (error) {
            logger.error('Failed to load character settings:', error);
            this.useDefaultCharacterSettings();
        }
    }

    // --- キャラクター管理メソッド ---

    getCharacters() {
        return this.characters;
    }

    /**
     * IDに基づいてキャラクター設定（声、速度など全て）を取得
     * 存在しない場合はデフォルトキャラを返す（安全策）
     */
    getCharacterById(id) {
        console.log('[ConfigManager] getCharacterById:', { 
            requestedId: id, 
            availableIds: this.characters.map(c => c.id) 
        });
        if (!id) {
            console.log('[ConfigManager] No ID provided, returning default');
            return this.characters[0];
        }
        const char = this.characters.find(c => c.id === id);
        if (!char) {
            console.warn('[ConfigManager] Character not found, falling back to default:', id);
        } else {
            console.log('[ConfigManager] Found character:', char.name, 'speakerId:', char.voice?.speakerId);
        }
        return char || this.characters[0];
    }

    async addCharacter(character) {
        // IDの重複チェック（直接配列を検索、getCharacterByIdはフォールバックするため使用不可）
        const existingChar = this.characters.find(c => c.id === character.id);
        if (existingChar) {
            logger.error('Character ID already exists:', character.id);
            return false;
        }
        this.characters.push(character);
        return await this.saveCharacters();
    }

    async updateCharacter(id, updates) {
        const index = this.characters.findIndex(c => c.id === id);
        if (index === -1) {
            logger.error('Character not found for update:', id);
            return false;
        }
        
        this.characters[index] = { ...this.characters[index], ...updates };
        
        // 現在選択中のキャラなら、設定も即時反映（プロンプトなど）
        if (id === this.currentCharacterId) {
            await this.loadCharacterSettings();
        }
        
        return await this.saveCharacters();
    }

    async deleteCharacter(id) {
        // デフォルトキャラは削除禁止にするなどのロジックを入れるならここ
        // const char = this.getCharacterById(id);
        // if (char && char.isDefault) return false;

        const initialLength = this.characters.length;
        this.characters = this.characters.filter(c => c.id !== id);
        
        if (this.characters.length === initialLength) {
            return false; // 削除されなかった
        }

        // 選択中キャラを削除した場合、デフォルトに戻す
        if (id === this.currentCharacterId) {
            await this.setCurrentCharacterId('char_mona');
        }

        return await this.saveCharacters();
    }

    async setCurrentCharacterId(id) {
        if (!this.getCharacterById(id)) {
            logger.error('Cannot set unknown character ID:', id);
            return false;
        }
        
        this.currentCharacterId = id;
        
        if (window.electronAPI && window.electronAPI.setAppConfig) {
            await window.electronAPI.setAppConfig('selectedCharacterId', id);
        }
        
        // 設定を再読み込み
        await this.loadCharacterSettings();
        return true;
    }

    // デフォルトキャラクター設定を使用
    useDefaultCharacterSettings() {
        this.aiBaseContent = DEFAULT_CHARACTER_PROMPT;
    }

    // ... 既存のメソッド ...


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

            // 優先順位: 1. 設定された保存先フォルダ 2. ホームディレクトリ
            const targetDir = this.claudeWorkingDir || os.homedir();
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
            const targetDir = this.claudeWorkingDir || os.homedir();
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