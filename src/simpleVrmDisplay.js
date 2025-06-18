// シンプルなVRMキャラクター表示（Canvas2D使用）

class SimpleVRMDisplay {
    constructor() {
        this.container = null;
        this.canvas = null;
        this.ctx = null;
        this.animationId = null;
        this.characterImage = null;
        this.blinkState = 0;
        this.blinkTimer = 0;
        this.swayOffset = 0;
        
        this.init();
    }

    async init() {
        this.container = document.getElementById('vrm-character');
        if (!this.container) {
            console.error('VRM character container not found');
            return;
        }

        console.log('Simple VRM Display 初期化開始');

        try {
            // Canvas要素を作成
            this.setupCanvas();
            
            // キャラクター画像を作成
            await this.createCharacterImage();
            
            // アニメーションを開始
            this.startAnimation();
            
            console.log('Simple VRM Display 初期化完了');
        } catch (error) {
            console.error('Simple VRM Display 初期化エラー:', error);
            this.showError();
        }
    }

    setupCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.container.clientWidth;
        this.canvas.height = this.container.clientHeight;
        this.canvas.style.cssText = `
            width: 100%;
            height: 100%;
            border-radius: 20px;
        `;
        
        this.ctx = this.canvas.getContext('2d');
        this.container.appendChild(this.canvas);

        // リサイズ対応
        window.addEventListener('resize', () => this.onResize());
    }

    async createCharacterImage() {
        // キャラクターの基本描画
        return new Promise((resolve) => {
            // 仮想的なキャラクター画像を作成
            this.characterImage = {
                body: this.createBodyGradient(),
                face: this.createFaceGradient(),
                hair: this.createHairGradient(),
                eyes: this.createEyeGradient()
            };
            resolve();
        });
    }

    createBodyGradient() {
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        gradient.addColorStop(0, '#FFE4E1');
        gradient.addColorStop(1, '#FFF8F0');
        return gradient;
    }

    createFaceGradient() {
        const gradient = this.ctx.createRadialGradient(
            this.canvas.width / 2, this.canvas.height * 0.3, 10,
            this.canvas.width / 2, this.canvas.height * 0.3, 80
        );
        gradient.addColorStop(0, '#FFEBEB');
        gradient.addColorStop(1, '#FFD7D7');
        return gradient;
    }

    createHairGradient() {
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height * 0.4);
        gradient.addColorStop(0, '#D2691E');
        gradient.addColorStop(1, '#CD853F');
        return gradient;
    }

    createEyeGradient() {
        const gradient = this.ctx.createRadialGradient(0, 0, 5, 0, 0, 15);
        gradient.addColorStop(0, '#8B4513');
        gradient.addColorStop(1, '#A0522D');
        return gradient;
    }

    startAnimation() {
        const animate = () => {
            this.update();
            this.draw();
            this.animationId = requestAnimationFrame(animate);
        };
        animate();

        // 自動瞬き
        this.startAutoBlinking();
    }

    update() {
        // 時間経過
        this.swayOffset += 0.02;
        
        // 瞬きアニメーション更新
        if (this.blinkTimer > 0) {
            this.blinkTimer--;
            this.blinkState = this.blinkTimer > 5 ? 1 : this.blinkTimer / 5;
        }
    }

    draw() {
        // キャンバスクリア
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        // 軽い揺れエフェクト
        const sway = Math.sin(this.swayOffset) * 2;
        
        this.ctx.save();
        this.ctx.translate(sway, 0);

        // 体を描画
        this.drawBody(centerX, centerY);
        
        // 顔を描画
        this.drawFace(centerX, centerY - 50);
        
        // 髪を描画
        this.drawHair(centerX, centerY - 100);
        
        // 目を描画
        this.drawEyes(centerX, centerY - 60);

        // 名前とステータス
        this.drawStatus();

        this.ctx.restore();
    }

    drawBody(x, y) {
        this.ctx.fillStyle = this.characterImage.body;
        this.ctx.beginPath();
        this.ctx.ellipse(x, y + 80, 60, 120, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // 服装（シンプルなTシャツ）
        this.ctx.fillStyle = '#FFB366';
        this.ctx.beginPath();
        this.ctx.ellipse(x, y + 60, 50, 80, 0, 0, Math.PI * 2);
        this.ctx.fill();
    }

    drawFace(x, y) {
        this.ctx.fillStyle = this.characterImage.face;
        this.ctx.beginPath();
        this.ctx.ellipse(x, y, 50, 60, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // 頬の赤み
        this.ctx.fillStyle = 'rgba(255, 182, 193, 0.5)';
        this.ctx.beginPath();
        this.ctx.ellipse(x - 25, y + 10, 8, 6, 0, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.ellipse(x + 25, y + 10, 8, 6, 0, 0, Math.PI * 2);
        this.ctx.fill();
    }

    drawHair(x, y) {
        this.ctx.fillStyle = this.characterImage.hair;
        
        // 前髪
        this.ctx.beginPath();
        this.ctx.ellipse(x, y, 60, 40, 0, 0, Math.PI);
        this.ctx.fill();

        // サイドの髪
        this.ctx.beginPath();
        this.ctx.ellipse(x - 40, y + 20, 25, 50, -0.3, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.ellipse(x + 40, y + 20, 25, 50, 0.3, 0, Math.PI * 2);
        this.ctx.fill();
    }

    drawEyes(x, y) {
        const eyeHeight = this.blinkState === 0 ? 12 : 12 * (1 - this.blinkState);
        
        // 左目
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.beginPath();
        this.ctx.ellipse(x - 15, y, 10, eyeHeight, 0, 0, Math.PI * 2);
        this.ctx.fill();
        
        if (eyeHeight > 6) {
            this.ctx.fillStyle = this.characterImage.eyes;
            this.ctx.beginPath();
            this.ctx.ellipse(x - 15, y, 6, eyeHeight * 0.7, 0, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // 右目
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.beginPath();
        this.ctx.ellipse(x + 15, y, 10, eyeHeight, 0, 0, Math.PI * 2);
        this.ctx.fill();
        
        if (eyeHeight > 6) {
            this.ctx.fillStyle = this.characterImage.eyes;
            this.ctx.beginPath();
            this.ctx.ellipse(x + 15, y, 6, eyeHeight * 0.7, 0, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // 口
        this.ctx.strokeStyle = '#FF8C42';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(x, y + 25, 8, 0, Math.PI);
        this.ctx.stroke();
    }

    drawStatus() {
        const x = this.canvas.width / 2;
        const y = this.canvas.height - 60;

        // 背景
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        this.ctx.beginPath();
        this.ctx.roundRect(x - 80, y - 25, 160, 50, 25);
        this.ctx.fill();

        // 名前
        this.ctx.fillStyle = '#FF8C42';
        this.ctx.font = 'bold 16px -apple-system, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('ことね', x, y - 5);

        // ステータス
        this.ctx.fillStyle = '#FFB366';
        this.ctx.font = '12px -apple-system, sans-serif';
        this.ctx.fillText('元気いっぱい！✨', x, y + 12);
    }

    blink() {
        this.blinkTimer = 10; // 10フレーム分の瞬き
    }

    startAutoBlinking() {
        const blinkInterval = () => {
            this.blink();
            setTimeout(blinkInterval, 3000 + Math.random() * 3000); // 3-6秒間隔
        };
        setTimeout(blinkInterval, 2000); // 2秒後に開始
    }

    onResize() {
        if (this.canvas && this.container) {
            this.canvas.width = this.container.clientWidth;
            this.canvas.height = this.container.clientHeight;
            
            // グラデーションを再作成
            if (this.characterImage) {
                this.characterImage.body = this.createBodyGradient();
                this.characterImage.face = this.createFaceGradient();
                this.characterImage.hair = this.createHairGradient();
                this.characterImage.eyes = this.createEyeGradient();
            }
        }
    }

    showError() {
        if (!this.container) return;

        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #ff6b6b, #ee5a52);
            border-radius: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: white;
            text-align: center;
            font-family: -apple-system, sans-serif;
        `;

        errorDiv.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
            <div style="font-size: 18px; font-weight: bold;">表示エラー</div>
        `;

        this.container.appendChild(errorDiv);
    }

    dispose() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    }
}

// グローバルに設定
window.SimpleVRMDisplay = SimpleVRMDisplay;