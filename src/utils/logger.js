class Logger {
    static create(moduleName = 'App') {
        const isProduction = typeof process !== 'undefined' ? process.env.NODE_ENV === 'production' : false;
        const isDev = !isProduction;
        
        return {
            debug: isDev ? console.log.bind(console, `[${moduleName}]`) : () => {},
            info: console.log.bind(console, `[${moduleName}]`),
            error: console.error.bind(console, `[${moduleName}]`),
            warn: console.warn.bind(console, `[${moduleName}]`),
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