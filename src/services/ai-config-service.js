const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class AIConfigService {
    constructor() {
        this.aiConfigs = {
            claude: {
                name: 'Claude Code',
                possiblePaths: this.generateClaudePaths()
            },
            'claude-dangerous': {
                name: 'Claude Code (Dangerous)',
                possiblePaths: this.generateClaudePaths(),
                arguments: ['--dangerously-skip-permissions']
            }
        };
    }

    /**
     * Claude Codeの可能なパスを動的に生成
     * @returns {string[]} 検索するパスの配列
     */
    generateClaudePaths() {
        const paths = [];
        
        // 1. 環境変数を最優先
        if (process.env.CLAUDE_PATH) {
            paths.push(process.env.CLAUDE_PATH);
        }
        
        // 2. whichコマンドで現在のPATHから検索
        try {
            const whichResult = execSync('which claude 2>/dev/null', { 
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'] // stderrを無視
            }).trim();
            if (whichResult && !paths.includes(whichResult)) {
                paths.push(whichResult);
            }
        } catch (e) {
            // whichコマンドが失敗した場合は続行
        }
        
        // 3. プラットフォーム別の既知のパス
        if (process.platform === 'darwin') {
            // macOS
            paths.push(
                '/opt/homebrew/bin/claude',  // Apple Silicon
                '/usr/local/bin/claude',     // Intel Mac
                '/usr/bin/claude'
            );
        } else if (process.platform === 'win32') {
            // Windows
            paths.push(
                'C:\\Program Files\\Claude\\claude.exe',
                'C:\\Program Files (x86)\\Claude\\claude.exe',
                path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Claude', 'claude.exe'),
                'claude.exe'
            );
        } else if (process.platform === 'linux') {
            // Linux
            paths.push(
                '/usr/local/bin/claude',
                '/usr/bin/claude',
                '/opt/claude/bin/claude',
                path.join(process.env.HOME || '', '.local', 'bin', 'claude')
            );
        }
        
        // 4. 最後の手段としてPATH上の claude
        if (!paths.includes('claude')) {
            paths.push('claude');
        }
        
        // 重複を除去してフィルタ
        return [...new Set(paths)].filter(p => p);
    }

    getConfig(aiType) {
        return this.aiConfigs[aiType] || null;
    }

    getAllConfigs() {
        return this.aiConfigs;
    }

    getSupportedAITypes() {
        return Object.keys(this.aiConfigs);
    }

    isValidAIType(aiType) {
        return this.aiConfigs.hasOwnProperty(aiType);
    }

    async findExecutablePath(aiType) {
        const config = this.getConfig(aiType);
        if (!config) {
            throw new Error(`Unknown AI type: ${aiType}`);
        }

        for (const possiblePath of config.possiblePaths) {
            try {
                await fs.promises.access(possiblePath, fs.constants.F_OK | fs.constants.X_OK);
                return possiblePath;
            } catch {
                // Continue to next path
            }
        }

        throw new Error(`${config.name} executable not found in any of the expected paths: ${config.possiblePaths.join(', ')}`);
    }

    getName(aiType) {
        const config = this.getConfig(aiType);
        return config ? config.name : null;
    }
}

module.exports = AIConfigService;