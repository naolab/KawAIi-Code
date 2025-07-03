// ターミナル設定の統一ファクトリー
class TerminalFactory {
    static createConfig() {
        return {
            fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
            fontSize: 14,
            lineHeight: 1.3,
            cursorBlink: true,
            cursorStyle: 'block',
            theme: {
                background: '#F0EAD6',
                foreground: '#4A3728',
                cursor: '#D2691E',
                cursorAccent: '#FFFEF7',
                selectionBackground: 'rgba(210, 105, 30, 0.2)',
                selectionForeground: '#5D4E3A',
                black: '#3C2E1F',
                red: '#A0522D',
                green: '#8B7355',
                yellow: '#B8860B',
                blue: '#708090',
                magenta: '#CD853F',
                cyan: '#5F9EA0',
                white: '#8B7D6B',
                brightBlack: '#696969',
                brightRed: '#CD853F',
                brightGreen: '#8B7355',
                brightYellow: '#B8860B',
                brightBlue: '#4682B4',
                brightMagenta: '#A0522D',
                brightCyan: '#2F4F4F',
                brightWhite: '#5D4E3A'
            },
            allowTransparency: false,
            convertEol: true,
            scrollback: AppConstants.TERMINAL.SCROLLBACK,
            tabStopWidth: 4,
            fastScrollModifier: 'shift',
            fastScrollSensitivity: 5,
            rendererType: 'canvas',
            smoothScrollDuration: 0,
            windowsMode: false,
            macOptionIsMeta: true
        };
    }
}

// Node.js環境とブラウザ環境の両方に対応
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TerminalFactory;
} else {
    window.TerminalFactory = TerminalFactory;
}