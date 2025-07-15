const fs = require('fs');
const path = require('path');

class AIConfigService {
    constructor() {
        this.aiConfigs = {
            claude: {
                name: 'Claude Code',
                possiblePaths: [
                    process.env.CLAUDE_PATH,
                    '/opt/homebrew/bin/claude',
                    '/usr/local/bin/claude',
                    '/usr/bin/claude',
                    'claude'
                ].filter(p => p)
            },
            'claude-dangerous': {
                name: 'Claude Code (Dangerous)',
                possiblePaths: [
                    process.env.CLAUDE_PATH,
                    '/opt/homebrew/bin/claude',
                    '/usr/local/bin/claude',
                    '/usr/bin/claude',
                    'claude'
                ].filter(p => p),
                arguments: ['--dangerously-skip-permissions']
            }
        };
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