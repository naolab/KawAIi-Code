// 統一設定管理システム - フェーズ1: 基盤実装

// デバッグログ制御
const UnifiedConfig_isDev = false; // 本番環境では無効化
const UnifiedConfig_debugLog = UnifiedConfig_isDev ? console.log : () => {};
const UnifiedConfig_infoLog = UnifiedConfig_isDev ? console.log : () => {};
const UnifiedConfig_errorLog = console.error;

// Storage Adapter インターフェース
class StorageAdapter {
    async get(key, defaultValue = undefined) {
        throw new Error('get method must be implemented');
    }
    
    async set(key, value) {
        throw new Error('set method must be implemented');
    }
    
    async has(key) {
        throw new Error('has method must be implemented');
    }
    
    async remove(key) {
        throw new Error('remove method must be implemented');
    }
    
    async clear() {
        throw new Error('clear method must be implemented');
    }
}

// メモリ ストレージ アダプター（ランタイム設定用）
class MemoryAdapter extends StorageAdapter {
    constructor() {
        super();
        this.store = new Map();
    }
    
    async get(key, defaultValue = undefined) {
        return this.store.has(key) ? this.store.get(key) : defaultValue;
    }
    
    async set(key, value) {
        this.store.set(key, value);
        UnifiedConfig_debugLog('MemoryAdapter: Set', { key, value });
    }
    
    async has(key) {
        return this.store.has(key);
    }
    
    async remove(key) {
        const result = this.store.delete(key);
        UnifiedConfig_debugLog('MemoryAdapter: Remove', { key, result });
        return result;
    }
    
    async clear() {
        this.store.clear();
        UnifiedConfig_debugLog('MemoryAdapter: Cleared all data');
    }
}

// ローカルストレージ アダプター（UI状態用）
class LocalStorageAdapter extends StorageAdapter {
    constructor(prefix = 'kawaii_') {
        super();
        this.prefix = prefix;
    }
    
    _getKey(key) {
        return `${this.prefix}${key}`;
    }
    
    async get(key, defaultValue = undefined) {
        try {
            const item = localStorage.getItem(this._getKey(key));
            if (item === null) return defaultValue;
            return JSON.parse(item);
        } catch (error) {
            UnifiedConfig_errorLog('LocalStorageAdapter: Get error', { key, error });
            return defaultValue;
        }
    }
    
    async set(key, value) {
        try {
            localStorage.setItem(this._getKey(key), JSON.stringify(value));
            UnifiedConfig_debugLog('LocalStorageAdapter: Set', { key, value });
        } catch (error) {
            UnifiedConfig_errorLog('LocalStorageAdapter: Set error', { key, value, error });
        }
    }
    
    async has(key) {
        return localStorage.getItem(this._getKey(key)) !== null;
    }
    
    async remove(key) {
        try {
            localStorage.removeItem(this._getKey(key));
            UnifiedConfig_debugLog('LocalStorageAdapter: Remove', { key });
            return true;
        } catch (error) {
            UnifiedConfig_errorLog('LocalStorageAdapter: Remove error', { key, error });
            return false;
        }
    }
    
    async clear() {
        try {
            const keys = Object.keys(localStorage).filter(k => k.startsWith(this.prefix));
            keys.forEach(key => localStorage.removeItem(key));
            UnifiedConfig_debugLog('LocalStorageAdapter: Cleared prefixed data', { count: keys.length });
        } catch (error) {
            UnifiedConfig_errorLog('LocalStorageAdapter: Clear error', error);
        }
    }
}

// Electron Store アダプター（永続設定用）
class ElectronStoreAdapter extends StorageAdapter {
    constructor() {
        super();
        this.isElectron = typeof window !== 'undefined' && window.electronAPI;
        this.config = null;
        this.initialized = false;
    }
    
    async initialize() {
        if (this.initialized) return;
        
        if (this.isElectron && window.electronAPI.getAppConfig) {
            try {
                this.config = await window.electronAPI.getAppConfig();
                this.initialized = true;
                UnifiedConfig_debugLog('ElectronStoreAdapter: Initialized with config', this.config);
            } catch (error) {
                UnifiedConfig_errorLog('ElectronStoreAdapter: Initialization error', error);
            }
        } else {
            // Electron環境でない場合はメモリフォールバック
            this.config = {};
            this.initialized = true;
            UnifiedConfig_debugLog('ElectronStoreAdapter: Fallback to memory store');
        }
    }
    
    async get(key, defaultValue = undefined) {
        await this.initialize();
        const value = this.config?.[key];
        return value !== undefined ? value : defaultValue;
    }
    
    async set(key, value) {
        await this.initialize();
        if (this.config) {
            this.config[key] = value;
            
            // Electronに保存を依頼
            if (this.isElectron && window.electronAPI.setAppConfig) {
                try {
                    await window.electronAPI.setAppConfig(key, value);
                    UnifiedConfig_debugLog('ElectronStoreAdapter: Set', { key, value });
                } catch (error) {
                    UnifiedConfig_errorLog('ElectronStoreAdapter: Set error', { key, value, error });
                }
            }
        }
    }
    
    async has(key) {
        await this.initialize();
        return this.config && key in this.config;
    }
    
    async remove(key) {
        await this.initialize();
        if (this.config && key in this.config) {
            delete this.config[key];
            
            // Electronに削除を依頼
            if (this.isElectron && window.electronAPI.removeAppConfig) {
                try {
                    await window.electronAPI.removeAppConfig(key);
                    UnifiedConfig_debugLog('ElectronStoreAdapter: Remove', { key });
                    return true;
                } catch (error) {
                    UnifiedConfig_errorLog('ElectronStoreAdapter: Remove error', { key, error });
                }
            }
        }
        return false;
    }
    
    async clear() {
        await this.initialize();
        if (this.config) {
            this.config = {};
            
            // Electronに全削除を依頼
            if (this.isElectron && window.electronAPI.clearAppConfig) {
                try {
                    await window.electronAPI.clearAppConfig();
                    UnifiedConfig_debugLog('ElectronStoreAdapter: Cleared all data');
                } catch (error) {
                    UnifiedConfig_errorLog('ElectronStoreAdapter: Clear error', error);
                }
            }
        }
    }
}

// 統一設定管理クラス
class UnifiedConfigManager {
    constructor() {
        this.hierarchy = [
            'runtime',      // 実行時設定（最高優先度）
            'user',         // ユーザー設定
            'ui',           // UI状態
            'default'       // デフォルト設定（最低優先度）
        ];
        
        this.adapters = {
            runtime: new MemoryAdapter(),
            user: new ElectronStoreAdapter(),
            ui: new LocalStorageAdapter(),
            default: new MemoryAdapter()
        };
        
        this.defaultConfig = {
            // システム設定
            claudeWorkingDir: null,
            voiceSynthesisEnabled: true,
            defaultSpeakerId: null,
            voiceCooldownSeconds: 1,
            voiceIntervalSeconds: 0.5,
            useHooks: false, // デフォルトはアプリ内監視モード
            claudeMdAutoGenerate: true, // CLAUDE.md自動生成（デフォルトON）
            
            // UI設定
            voiceEnabled: true,
            selectedSpeaker: 0,
            wallpaperAnimationEnabled: true,
            selectedWallpaperChoice: 'default',
            lastUploadedWallpaper: null,
            
            // その他
            speechHistoryKey: 'kawaii_speech_history'
        };
        
        this.initialized = false;
    }
    
    async initialize() {
        if (this.initialized) return;
        
        try {
            // デフォルト設定をロード
            for (const [key, value] of Object.entries(this.defaultConfig)) {
                await this.adapters.default.set(key, value);
            }
            
            // Electron Store アダプターを初期化
            await this.adapters.user.initialize();
            
            this.initialized = true;
            UnifiedConfig_infoLog('UnifiedConfigManager: Initialized successfully');
        } catch (error) {
            UnifiedConfig_errorLog('UnifiedConfigManager: Initialization error', error);
        }
    }
    
    async get(key, defaultValue = undefined) {
        await this.initialize();
        
        // 優先順位に従って設定を取得
        for (const level of this.hierarchy) {
            const adapter = this.adapters[level];
            if (await adapter.has(key)) {
                const value = await adapter.get(key);
                UnifiedConfig_debugLog('UnifiedConfigManager: Get', { key, value, level });
                return value;
            }
        }
        
        UnifiedConfig_debugLog('UnifiedConfigManager: Get (not found)', { key, defaultValue });
        return defaultValue;
    }
    
    async set(key, value, level = 'auto') {
        await this.initialize();
        
        // 設定レベルを自動決定
        if (level === 'auto') {
            level = this._determineLevel(key);
        }
        
        const adapter = this.adapters[level];
        if (adapter) {
            await adapter.set(key, value);
            UnifiedConfig_infoLog('UnifiedConfigManager: Set', { key, value, level });
        } else {
            UnifiedConfig_errorLog('UnifiedConfigManager: Invalid level', { key, value, level });
        }
    }
    
    async has(key) {
        await this.initialize();
        
        for (const level of this.hierarchy) {
            if (await this.adapters[level].has(key)) {
                return true;
            }
        }
        return false;
    }
    
    async remove(key, level = 'auto') {
        await this.initialize();
        
        if (level === 'auto') {
            // 全レベルから削除
            let removed = false;
            for (const levelName of this.hierarchy) {
                if (await this.adapters[levelName].remove(key)) {
                    removed = true;
                }
            }
            return removed;
        } else {
            const adapter = this.adapters[level];
            return adapter ? await adapter.remove(key) : false;
        }
    }
    
    _determineLevel(key) {
        // システム設定
        if (['claudeWorkingDir', 'voiceSynthesisEnabled', 'defaultSpeakerId', 'voiceCooldownSeconds', 'voiceIntervalSeconds', 'claudeMdAutoGenerate'].includes(key)) {
            return 'user';
        }
        
        // UI状態
        if (['voiceEnabled', 'selectedSpeaker', 'wallpaperAnimationEnabled', 'selectedWallpaperChoice', 'lastUploadedWallpaper', 'speechHistoryKey'].includes(key)) {
            return 'ui';
        }
        
        // 一時的な設定
        return 'runtime';
    }
    
    // マイグレーション機能は削除済み

    // 全設定のクリア（開発・テスト用）
    async clearAllConfig() {
        await this.initialize();
        
        for (const level of this.hierarchy) {
            if (level !== 'default') { // デフォルト設定は保持
                await this.adapters[level].clear();
            }
        }
        
        UnifiedConfig_infoLog('All configuration cleared (except defaults)');
    }
}

// グローバル インスタンス
const unifiedConfig = new UnifiedConfigManager();

// ブラウザ環境での初期化とグローバル公開
if (typeof window !== 'undefined') {
    // グローバルスコープで利用可能にする
    window.unifiedConfig = unifiedConfig;
    
    // DOM読み込み後に初期化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            unifiedConfig.initialize();
        });
    } else {
        unifiedConfig.initialize();
    }
}

// Node.js環境用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UnifiedConfigManager, unifiedConfig };
}