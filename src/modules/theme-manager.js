/**
 * テーマ管理システム
 * アプリ全体のカラーテーマを管理
 */

class ThemeManager {
    constructor() {
        this.themes = {
            orange: {
                name: 'オレンジ',
                colors: {
                    primary: '#FF8C42',
                    primaryLight: '#FFB366',
                    primaryDark: '#E67E22',
                    primaryDarker: '#FF6B35',
                    accent: '#FF6347',
                    bgPrimary: '#FFF8F0',
                    bgSecondary: '#FFF5F0',
                    bgTertiary: '#F0EAD6',
                    textPrimary: '#4A3728',
                    textSecondary: '#2D1F17'
                }
            },
            pink: {
                name: 'ピンク',
                colors: {
                    primary: '#FF8FAD',
                    primaryLight: '#FFA8C0',
                    primaryDark: '#FF7A9A',
                    primaryDarker: '#FF6687',
                    accent: '#FF7BA0',
                    bgPrimary: '#FFF2F6',
                    bgSecondary: '#FFEDF2',
                    bgTertiary: '#FFE8EE',
                    textPrimary: '#4A2530',
                    textSecondary: '#2D1520'
                }
            },
            blue: {
                name: 'ブルー',
                colors: {
                    primary: '#7AB8FF',
                    primaryLight: '#94C7FF',
                    primaryDark: '#66AAFF',
                    primaryDarker: '#529CFF',
                    accent: '#85BEFF',
                    bgPrimary: '#F2F7FF',
                    bgSecondary: '#EDF4FF',
                    bgTertiary: '#E8F1FF',
                    textPrimary: '#1F2F4A',
                    textSecondary: '#12202D'
                }
            },
            green: {
                name: 'グリーン',
                colors: {
                    primary: '#7AC87A',
                    primaryLight: '#94D494',
                    primaryDark: '#66BB66',
                    primaryDarker: '#52A852',
                    accent: '#85CC85',
                    bgPrimary: '#F2FFF2',
                    bgSecondary: '#EDFEED',
                    bgTertiary: '#E8FCE8',
                    textPrimary: '#254A25',
                    textSecondary: '#152D15'
                }
            },
            purple: {
                name: 'パープル',
                colors: {
                    primary: '#B882D1',
                    primaryLight: '#C799DC',
                    primaryDark: '#A966C7',
                    primaryDarker: '#9A52B8',
                    accent: '#BD8BD6',
                    bgPrimary: '#FDF2FF',
                    bgSecondary: '#FBEDFF',
                    bgTertiary: '#F9E8FF',
                    textPrimary: '#3A254A',
                    textSecondary: '#25152D'
                }
            }
        };

        this.currentTheme = 'orange'; // デフォルトテーマ
        this.init();
    }

    /**
     * 初期化
     */
    async init() {
        try {
            // 保存されたテーマを読み込み
            const savedTheme = await this.loadTheme();
            if (savedTheme && this.themes[savedTheme]) {
                this.currentTheme = savedTheme;
            }

            // UI初期化
            this.initUI();
            
            // 現在のテーマを適用
            this.applyTheme(this.currentTheme);
            
            // 初期テーマ適用後、少し遅延してiframe側にも通知
            setTimeout(() => {
                if (this.themes[this.currentTheme]) {
                    this.notifyIframeThemeChange(this.themes[this.currentTheme].colors);
                }
            }, 1000);

        } catch (error) {
            console.error('ThemeManager初期化エラー:', error);
        }
    }

    /**
     * UI初期化
     */
    initUI() {
        // テーマオプションにクリックイベントを追加
        document.querySelectorAll('.theme-option').forEach(option => {
            option.addEventListener('click', (e) => {
                const themeId = option.getAttribute('data-theme');
                if (themeId && this.themes[themeId]) {
                    this.setTheme(themeId);
                }
            });
        });

        // 現在のテーマを表示に反映
        this.updateUI();
    }

    /**
     * テーマを設定
     */
    async setTheme(themeId) {
        if (!this.themes[themeId]) {
            console.error('無効なテーマID:', themeId);
            return false;
        }

        try {
            this.currentTheme = themeId;
            
            // テーマを適用
            this.applyTheme(themeId);
            
            // UI更新
            this.updateUI();
            
            // 設定を保存
            await this.saveTheme(themeId);

            console.log(`テーマ変更: ${this.themes[themeId].name}`);
            return true;

        } catch (error) {
            console.error('テーマ設定エラー:', error);
            return false;
        }
    }

    /**
     * テーマを適用（CSS変数を更新）
     */
    applyTheme(themeId) {
        const theme = this.themes[themeId];
        if (!theme) return;

        const root = document.documentElement;
        const colors = theme.colors;

        // CSS変数を更新
        root.style.setProperty('--theme-primary', colors.primary);
        root.style.setProperty('--theme-primary-light', colors.primaryLight);
        root.style.setProperty('--theme-primary-dark', colors.primaryDark);
        root.style.setProperty('--theme-primary-darker', colors.primaryDarker);
        root.style.setProperty('--theme-accent', colors.accent);
        root.style.setProperty('--theme-bg-primary', colors.bgPrimary);
        root.style.setProperty('--theme-bg-secondary', colors.bgSecondary);
        root.style.setProperty('--theme-bg-tertiary', colors.bgTertiary);
        root.style.setProperty('--theme-text-primary', colors.textPrimary);
        root.style.setProperty('--theme-text-secondary', colors.textSecondary);

        // 透明度バリエーションを更新（primaryカラーベース）
        const primaryRgb = this.hexToRgb(colors.primary);
        if (primaryRgb) {
            const { r, g, b } = primaryRgb;
            root.style.setProperty('--theme-primary-alpha-10', `rgba(${r}, ${g}, ${b}, 0.1)`);
            root.style.setProperty('--theme-primary-alpha-15', `rgba(${r}, ${g}, ${b}, 0.15)`);
            root.style.setProperty('--theme-primary-alpha-20', `rgba(${r}, ${g}, ${b}, 0.2)`);
            root.style.setProperty('--theme-primary-alpha-30', `rgba(${r}, ${g}, ${b}, 0.3)`);
            root.style.setProperty('--theme-primary-alpha-40', `rgba(${r}, ${g}, ${b}, 0.4)`);
            root.style.setProperty('--theme-primary-alpha-50', `rgba(${r}, ${g}, ${b}, 0.5)`);
            root.style.setProperty('--theme-primary-alpha-60', `rgba(${r}, ${g}, ${b}, 0.6)`);
            root.style.setProperty('--theme-primary-alpha-80', `rgba(${r}, ${g}, ${b}, 0.8)`);
            root.style.setProperty('--theme-primary-alpha-90', `rgba(${r}, ${g}, ${b}, 0.9)`);
        }

        // primary-lightカラーの透明度バリエーション
        const lightRgb = this.hexToRgb(colors.primaryLight);
        if (lightRgb) {
            const { r, g, b } = lightRgb;
            root.style.setProperty('--theme-light-alpha-10', `rgba(${r}, ${g}, ${b}, 0.1)`);
            root.style.setProperty('--theme-light-alpha-20', `rgba(${r}, ${g}, ${b}, 0.2)`);
            root.style.setProperty('--theme-light-alpha-30', `rgba(${r}, ${g}, ${b}, 0.3)`);
            root.style.setProperty('--theme-light-alpha-50', `rgba(${r}, ${g}, ${b}, 0.5)`);
            root.style.setProperty('--theme-light-alpha-90', `rgba(${r}, ${g}, ${b}, 0.9)`);
        }

        // Next.js iframe側にテーマ変更を通知
        this.notifyIframeThemeChange(theme.colors);
    }

    /**
     * iframe側にテーマ変更を通知
     */
    notifyIframeThemeChange(colors) {
        try {
            const vrmIframe = document.getElementById('vrm-iframe');
            if (vrmIframe && vrmIframe.contentWindow) {
                vrmIframe.contentWindow.postMessage({
                    type: 'theme-change',
                    colors: colors
                }, '*');
            }
        } catch (error) {
            console.warn('iframe テーマ通知エラー:', error);
        }
    }

    /**
     * UI更新（選択状態とテーマ名表示）
     */
    updateUI() {
        // 全ての選択状態をリセット
        document.querySelectorAll('.theme-option').forEach(option => {
            option.classList.remove('active');
        });

        // 現在のテーマを選択状態に
        const currentOption = document.querySelector(`[data-theme="${this.currentTheme}"]`);
        if (currentOption) {
            currentOption.classList.add('active');
        }

        // テーマ名を表示（削除済み）
    }

    /**
     * 16進カラーをRGBに変換
     */
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    /**
     * テーマ設定を保存
     */
    async saveTheme(themeId) {
        try {
            if (window.electronAPI?.setAppConfig) {
                await window.electronAPI.setAppConfig('currentTheme', themeId);
            } else {
                // フォールバック: localStorage
                localStorage.setItem('kawaii-code-theme', themeId);
            }
        } catch (error) {
            console.error('テーマ保存エラー:', error);
            // フォールバック: localStorage
            localStorage.setItem('kawaii-code-theme', themeId);
        }
    }

    /**
     * テーマ設定を読み込み
     */
    async loadTheme() {
        try {
            if (window.electronAPI?.getAppConfig) {
                const config = await window.electronAPI.getAppConfig();
                return config?.currentTheme || 'orange';
            } else {
                // フォールバック: localStorage
                return localStorage.getItem('kawaii-code-theme') || 'orange';
            }
        } catch (error) {
            console.error('テーマ読み込みエラー:', error);
            // フォールバック: localStorage
            return localStorage.getItem('kawaii-code-theme') || 'orange';
        }
    }

    /**
     * 現在のテーマを取得
     */
    getCurrentTheme() {
        return this.currentTheme;
    }

    /**
     * 利用可能なテーマ一覧を取得
     */
    getAvailableThemes() {
        return Object.keys(this.themes).map(id => ({
            id,
            name: this.themes[id].name,
            colors: this.themes[id].colors
        }));
    }
}

// グローバルインスタンス
window.themeManager = null;

// DOM読み込み完了後に初期化
document.addEventListener('DOMContentLoaded', () => {
    window.themeManager = new ThemeManager();
});