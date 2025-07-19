class Logger {
    static create(moduleName = 'App') {
        // 配布版判定（Electronパッケージ版では常にproduction扱い）
        const isProduction = (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') ||
                             (typeof window !== 'undefined' && window.location.protocol === 'file:');
        const isDev = !isProduction;
        
        return {
            debug: isDev ? console.log.bind(console, `[${moduleName}]`) : () => {},
            info: isDev ? console.log.bind(console, `[${moduleName}]`) : () => {},  // 配布版では無効化
            error: console.error.bind(console, `[${moduleName}]`),
            warn: isDev ? console.warn.bind(console, `[${moduleName}]`) : () => {},  // 配布版では無効化
            trace: isDev ? console.trace.bind(console, `[${moduleName}]`) : () => {}
        };
    }
}

// Node.js環境とブラウザ環境の両方に対応
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Logger;
} else {
    window.Logger = Logger;
}