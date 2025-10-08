/**
 * アプリ起動時のローディング画面（シンプル版）
 */
class LoadingScreen {
    constructor() {
        this.element = null;
        this.isVisible = false;

        // 定数
        this.BACKGROUND_COLOR = '#ffffff';
        this.Z_INDEX = 9999;
        this.TRANSITION_DURATION = 300; // ms
        this.FADE_IN_DELAY = 50; // ms
        this.STYLE_ID = 'loading-screen-styles';
        this.ELEMENT_ID = 'loading-screen';
    }

    /**
     * ローディング画面を作成
     */
    create() {
        if (this.element) return;

        this.element = document.createElement('div');
        this.element.id = this.ELEMENT_ID;

        // スタイルを追加
        this.addStyles();

        document.body.appendChild(this.element);
    }

    /**
     * スタイルを追加
     */
    addStyles() {
        if (document.getElementById(this.STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = this.STYLE_ID;
        style.textContent = `
            html, body {
                background: ${this.BACKGROUND_COLOR} !important;
            }

            #${this.ELEMENT_ID} {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                width: 100vw;
                height: 100vh;
                margin: 0;
                padding: 0;
                z-index: ${this.Z_INDEX};
                display: flex;
                align-items: center;
                justify-content: center;
                background: ${this.BACKGROUND_COLOR};
                opacity: 0;
                visibility: hidden;
                transition: opacity ${this.TRANSITION_DURATION / 1000}s ease, visibility ${this.TRANSITION_DURATION / 1000}s ease;
            }

            #${this.ELEMENT_ID}.visible {
                opacity: 1;
                visibility: visible;
            }
        `;

        document.head.appendChild(style);
    }

    /**
     * スタイルを削除
     */
    removeStyles() {
        const styleElement = document.getElementById(this.STYLE_ID);
        if (styleElement) {
            styleElement.remove();
        }
    }

    /**
     * ローディング画面を表示
     */
    show() {
        if (this.isVisible) return;

        this.create();
        this.isVisible = true;

        // 少し遅延してからフェードイン
        setTimeout(() => {
            if (this.element) {
                this.element.classList.add('visible');
            }
        }, this.FADE_IN_DELAY);
    }

    /**
     * ローディング画面を非表示
     */
    hide() {
        if (!this.isVisible || !this.element) return;

        this.isVisible = false;

        // フェードアウト開始前にスタイルを削除（背景を先に戻す）
        this.removeStyles();

        this.element.classList.remove('visible');

        // フェードアウト完了後に要素を削除
        setTimeout(() => {
            if (this.element && this.element.parentNode) {
                this.element.parentNode.removeChild(this.element);
                this.element = null;
            }
        }, this.TRANSITION_DURATION);
    }

    /**
     * クリーンアップ
     */
    destroy() {
        this.hide();
        this.removeStyles();
    }
}

// グローバルで使用できるようにエクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LoadingScreen;
} else {
    window.LoadingScreen = LoadingScreen;
}
