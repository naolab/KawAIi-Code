// シンプルなVRM表示（Three.js不要）

class SimpleVRMDisplay {
    constructor() {
        this.container = null;
        this.init();
    }

    async init() {
        this.container = document.getElementById('vrm-character');
        if (!this.container) {
            console.error('VRM character container not found');
            return;
        }

        console.log('Simple VRM Display 初期化開始');

        // VRMファイルを画像として表示（一時的な解決策）
        await this.displayPlaceholder();

        // 将来的にはVRMビューワーを実装
        this.setupBasicAnimation();
    }

    async displayPlaceholder() {
        // VRMファイルの代わりにプレースホルダー画像を表示
        const imageDiv = document.createElement('div');
        imageDiv.style.cssText = `
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #FFB366, #FF8C42);
            border-radius: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: white;
            text-align: center;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            box-shadow: 0 10px 30px rgba(255, 140, 66, 0.3);
        `;

        imageDiv.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 20px;">🌟</div>
            <div style="font-size: 24px; font-weight: bold; margin-bottom: 10px;">ことね</div>
            <div style="font-size: 16px; opacity: 0.9;">VRMキャラクター準備中...</div>
            <div style="font-size: 14px; opacity: 0.7; margin-top: 10px;">Three.jsセットアップ完了後に表示</div>
        `;

        this.container.appendChild(imageDiv);
        console.log('VRM placeholder displayed');
    }

    setupBasicAnimation() {
        // 簡単なアニメーション効果
        const placeholder = this.container.querySelector('div');
        if (placeholder) {
            let scale = 1;
            let direction = 1;
            
            setInterval(() => {
                scale += direction * 0.01;
                if (scale >= 1.05) direction = -1;
                if (scale <= 0.95) direction = 1;
                
                placeholder.style.transform = `scale(${scale})`;
            }, 100);
        }
    }

    // 表情変更（将来の拡張用）
    setExpression(expressionName) {
        console.log(`Expression changed to: ${expressionName}`);
        // 将来的にVRM表情を実装
    }

    // 瞬きアニメーション（将来の拡張用）
    blink() {
        console.log('Blink animation');
        // 将来的にVRM瞬きを実装
    }
}

// グローバルに設定
window.SimpleVRMDisplay = SimpleVRMDisplay;