/**
 * アプリ起動時のローディング画面
 */
class LoadingScreen {
    constructor() {
        this.element = null;
        this.isVisible = false;
        this.dotCount = 0;
        this.animationInterval = null;
    }

    /**
     * ローディング画面を作成
     */
    create() {
        if (this.element) return;

        this.element = document.createElement('div');
        this.element.id = 'loading-screen';
        this.element.innerHTML = `
            <div class="loading-overlay">
                <div class="loading-content">
                    <div class="loading-text">
                        <span>Now Loading</span>
                        <span class="loading-dots">...</span>
                    </div>
                </div>
            </div>
        `;

        // スタイルを追加
        this.addStyles();
        
        document.body.appendChild(this.element);
    }

    /**
     * スタイルを追加
     */
    addStyles() {
        if (document.getElementById('loading-screen-styles')) return;

        const style = document.createElement('style');
        style.id = 'loading-screen-styles';
        style.textContent = `
            #loading-screen {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #f5f5dc;
                opacity: 0;
                visibility: hidden;
                transition: opacity 0.3s ease, visibility 0.3s ease;
            }

            #loading-screen.visible {
                opacity: 1;
                visibility: visible;
            }

            .loading-overlay {
                background: transparent;
                border-radius: 15px;
                padding: 40px;
                box-shadow: none;
                border: none;
                min-width: 300px;
                text-align: center;
            }

            .loading-content {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 20px;
            }

            .loading-spinner {
                width: 40px;
                height: 40px;
                border: 3px solid rgba(255, 255, 255, 0.1);
                border-top: 3px solid #ff8c42;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }

            .loading-text {
                color: #000000;
                font-size: 24px;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                display: flex;
                align-items: center;
                gap: 5px;
            }

            .loading-dots {
                color: #000000;
                font-weight: bold;
                min-width: 20px;
                text-align: left;
            }

            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        
        document.head.appendChild(style);
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
            this.element.classList.add('visible');
        }, 50);

        // ドットアニメーション開始
        this.startDotAnimation();
    }

    /**
     * ローディング画面を非表示
     */
    hide() {
        if (!this.isVisible || !this.element) return;

        this.isVisible = false;
        this.stopDotAnimation();
        
        this.element.classList.remove('visible');
        
        // フェードアウト完了後に要素を削除
        setTimeout(() => {
            if (this.element && this.element.parentNode) {
                this.element.parentNode.removeChild(this.element);
                this.element = null;
            }
        }, 300);
    }

    /**
     * ドットアニメーション開始
     */
    startDotAnimation() {
        this.stopDotAnimation();
        
        this.animationInterval = setInterval(() => {
            if (!this.element) return;
            
            this.dotCount = (this.dotCount + 1) % 4;
            const dotsElement = this.element.querySelector('.loading-dots');
            if (dotsElement) {
                dotsElement.textContent = '.'.repeat(this.dotCount);
            }
        }, 500);
    }

    /**
     * ドットアニメーション停止
     */
    stopDotAnimation() {
        if (this.animationInterval) {
            clearInterval(this.animationInterval);
            this.animationInterval = null;
        }
    }

    /**
     * クリーンアップ
     */
    destroy() {
        this.hide();
        this.stopDotAnimation();
        
        // スタイルも削除
        const styleElement = document.getElementById('loading-screen-styles');
        if (styleElement) {
            styleElement.remove();
        }
    }
}

// グローバルで使用できるようにエクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LoadingScreen;
} else {
    window.LoadingScreen = LoadingScreen;
}