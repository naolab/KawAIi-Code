const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const isWindows = process.platform === 'win32';
const lookupCommands = isWindows ? ['where'] : ['which'];

function collectLookupPaths(names) {
    const resolved = new Set();

    for (const name of names) {
        for (const lookup of lookupCommands) {
            try {
                const output = execSync(`${lookup} ${name}`, {
                    encoding: 'utf8',
                    stdio: ['pipe', 'pipe', 'ignore']
                }).trim();

                output.split(/\r?\n/).forEach((line) => {
                    const trimmed = line.trim();
                    if (!trimmed) {
                        return;
                    }

                    if (lookup === 'where' && trimmed.toLowerCase().startsWith('info:')) {
                        return;
                    }

                    resolved.add(trimmed);
                });
            } catch {
                // ignore lookup failures
            }
        }
    }

    return [...resolved];
}

function pushUniquePaths(target, ...items) {
    for (const item of items) {
        if (!item) {
            continue;
        }

        if (!target.includes(item)) {
            target.push(item);
        }
    }
}

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
            },
            'gemini': {
                name: 'Gemini CLI',
                possiblePaths: this.generateGeminiPaths()
            },
            'codex': {
                name: 'OpenAI Codex',
                possiblePaths: this.generateCodexPaths()
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
        
        // 2. PATH環境から実行可能ファイルを探索
        const candidates = isWindows ? ['claude.exe', 'claude'] : ['claude'];
        pushUniquePaths(paths, ...collectLookupPaths(candidates));
        
        // 3. プラットフォーム別の既知のパス
        if (process.platform === 'darwin') {
            // macOS
            paths.push(
                '/opt/homebrew/bin/claude',  // Apple Silicon
                '/usr/local/bin/claude',     // Intel Mac
                '/usr/bin/claude'
            );
        } else if (isWindows) {
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
        pushUniquePaths(paths, 'claude');
        
        // 重複を除去してフィルタ
        return [...new Set(paths)].filter(p => p);
    }

    /**
     * Codex CLIの可能なパスを動的に生成
     * @returns {string[]} 検索するパスの配列
     */
    generateCodexPaths() {
        const paths = [];
        
        // 1. 環境変数を最優先
        if (process.env.CODEX_PATH) {
            paths.push(process.env.CODEX_PATH);
        }
        
        const candidates = isWindows ? ['codex.cmd', 'codex.exe', 'codex'] : ['codex'];
        pushUniquePaths(paths, ...collectLookupPaths(candidates));
        
        // 3. プラットフォーム別の既知のパス
        if (process.platform === 'darwin') {
            // macOS
            paths.push(
                '/opt/homebrew/bin/codex',  // Apple Silicon (Homebrew)
                '/usr/local/bin/codex',     // Intel Mac (Homebrew)
                '/usr/bin/codex',
                path.join(process.env.HOME || '', '.npm-global', 'bin', 'codex')  // npm global
            );
        } else if (isWindows) {
            // Windows
            paths.push(
                'C:\\Program Files\\nodejs\\codex.cmd',
                'C:\\Program Files (x86)\\nodejs\\codex.cmd',
                path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming', 'npm', 'codex.cmd'),
                'codex.cmd',
                'codex.exe'
            );
        } else if (process.platform === 'linux') {
            // Linux
            paths.push(
                '/usr/local/bin/codex',
                '/usr/bin/codex',
                '/opt/codex/bin/codex',
                path.join(process.env.HOME || '', '.local', 'bin', 'codex'),
                path.join(process.env.HOME || '', '.npm-global', 'bin', 'codex')
            );
        }
        
        // 4. 最後の手段としてPATH上の codex
        pushUniquePaths(paths, 'codex');
        
        // 重複を除去してフィルタ
        return [...new Set(paths)].filter(p => p);
    }

    /**
     * Gemini CLIの可能なパスを動的に生成
     * @returns {string[]} 検索するパスの配列
     */
    generateGeminiPaths() {
        const paths = [];
        
        // 1. 環境変数を最優先
        if (process.env.GEMINI_PATH) {
            paths.push(process.env.GEMINI_PATH);
        }
        
        const candidates = isWindows ? ['gemini.cmd', 'gemini.exe', 'gemini'] : ['gemini'];
        pushUniquePaths(paths, ...collectLookupPaths(candidates));
        
        // 3. プラットフォーム別の既知のパス
        if (process.platform === 'darwin') {
            // macOS
            paths.push(
                '/opt/homebrew/bin/gemini',  // Apple Silicon
                '/usr/local/bin/gemini',     // Intel Mac
                '/usr/bin/gemini'
            );
        } else if (isWindows) {
            // Windows
            paths.push(
                'C:\\Program Files\\nodejs\\gemini.cmd',
                'C:\\Program Files (x86)\\nodejs\\gemini.cmd',
                path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming', 'npm', 'gemini.cmd'),
                'gemini.cmd',
                'gemini.exe'
            );
        } else if (process.platform === 'linux') {
            // Linux
            paths.push(
                '/usr/local/bin/gemini',
                '/usr/bin/gemini',
                '/opt/gemini/bin/gemini',
                path.join(process.env.HOME || '', '.local', 'bin', 'gemini'),
                path.join(process.env.HOME || '', '.npm-global', 'bin', 'gemini')
            );
        }
        
        // 4. 最後の手段としてPATH上の gemini
        pushUniquePaths(paths, 'gemini');
        
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
