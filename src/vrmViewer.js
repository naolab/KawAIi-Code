// VRMビューワー（グローバル版）
// Three.jsはCDNから読み込み

class VRMViewer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.character = null;
        this.mixer = null;
        this.clock = null;
        this.container = null;
        this.animationId = null;
        
        // アニメーション用
        this.blinkTimer = 0;
        this.blinkInterval = 1000; // 最初の瞬きを1秒後に設定
        this.isBlinking = false;
        
        this.initAttempts = 0;
        
        this.init();
    }

    init() {
        console.log('VRMViewer初期化開始');
        
        // Three.jsが読み込まれるまで待機（最大10回まで）
        if (typeof THREE === 'undefined') {
            if (!this.initAttempts) this.initAttempts = 0;
            this.initAttempts++;
            
            if (this.initAttempts > 10) {
                console.error('Three.jsの読み込みに失敗しました');
                this.showError('Three.jsライブラリが読み込めませんでした');
                return;
            }
            
            console.log(`Three.jsを読み込み中... (${this.initAttempts}/10)`);
            setTimeout(() => this.init(), 200);
            return;
        }
        
        console.log('Three.js読み込み完了、初期化を開始します');
        console.log('Three.js version:', THREE.REVISION);
        this.clock = new THREE.Clock();
        
        // コンテナを取得
        this.container = document.getElementById('vrm-character');
        if (!this.container) {
            console.error('VRMコンテナが見つかりません');
            return;
        }

        // シーンの設定
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // スカイブルー

        // カメラの設定
        this.camera = new THREE.PerspectiveCamera(
            50,
            this.container.clientWidth / this.container.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 1, 3);

        // レンダラーの設定
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // ライトの設定
        this.setupLights();

        // キャラクターを作成
        this.createSimpleCharacter();

        // アニメーション開始
        this.animate();

        // リサイズイベント
        window.addEventListener('resize', () => this.onWindowResize());

        console.log('VRMViewer初期化完了');
    }

    setupLights() {
        // 環境光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        // 指向性ライト
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 1, 0.5);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 1024;
        directionalLight.shadow.mapSize.height = 1024;
        this.scene.add(directionalLight);
    }

    async loadVRM(filename) {
        try {
            console.log('キャラクター読み込み開始:', filename);

            // 既存のキャラクターを削除
            if (this.character) {
                this.scene.remove(this.character);
            }

            // 簡易的なキャラクターを表示
            this.createSimpleCharacter();

            console.log('簡易キャラクター表示完了');
        } catch (error) {
            console.error('キャラクター表示エラー:', error);
            this.showError(error.message);
        }
    }

    createSimpleCharacter() {
        // キャラクターグループを作成
        this.character = new THREE.Group();

        // 体（箱）
        const bodyGeometry = new THREE.BoxGeometry(0.6, 1.0, 0.3);
        const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x4A90E2 });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.5;
        body.castShadow = true;
        this.character.add(body);

        // 頭（スフィア）
        const headGeometry = new THREE.SphereGeometry(0.25, 16, 16);
        const headMaterial = new THREE.MeshLambertMaterial({ color: 0xFFDBB5 });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.25;
        head.castShadow = true;
        this.character.add(head);

        // 目（左）
        const eyeGeometry = new THREE.SphereGeometry(0.06, 8, 8); // サイズを2倍に
        const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF }); // 白い目
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.12, 1.32, 0.22); // より外側、上側、前側に
        this.character.add(leftEye);

        // 左の瞳
        const pupilGeometry = new THREE.SphereGeometry(0.03, 8, 8);
        const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const leftPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
        leftPupil.position.set(-0.12, 1.32, 0.25); // 目より少し前に
        this.character.add(leftPupil);

        // 目（右）
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.12, 1.32, 0.22); // より外側、上側、前側に
        this.character.add(rightEye);

        // 右の瞳
        const rightPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
        rightPupil.position.set(0.12, 1.32, 0.25); // 目より少し前に
        this.character.add(rightPupil);

        // 参照を保存（アニメーション用）
        this.leftEye = leftEye;
        this.rightEye = rightEye;
        this.leftPupil = leftPupil;
        this.rightPupil = rightPupil;
        this.head = head;
        this.body = body;

        // 初期状態で目が見えることを確認
        console.log('目の位置 - 左:', leftEye.position, '右:', rightEye.position);
        console.log('目のスケール - 左:', leftEye.scale, '右:', rightEye.scale);

        // シーンに追加
        this.scene.add(this.character);

        console.log('簡易キャラクター作成完了');
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());

        const deltaTime = this.clock.getDelta();
        const elapsedTime = this.clock.getElapsedTime();

        if (this.character) {
            // 浮遊アニメーション
            const floatY = Math.sin(elapsedTime * 2) * 0.1;
            this.character.position.y = floatY;

            // 回転アニメーション
            const rotationY = Math.sin(elapsedTime * 0.5) * 0.1;
            this.character.rotation.y = rotationY;

            // 瞬きアニメーション
            this.updateBlinking(deltaTime);
            
            // デバッグ用（最初の5秒間のみ）
            if (elapsedTime < 5) {
                if (Math.floor(elapsedTime * 10) % 10 === 0) { // 0.1秒ごとに表示
                    console.log(`アニメーション動作中: floatY=${floatY.toFixed(3)}, rotationY=${rotationY.toFixed(3)}, deltaTime=${deltaTime.toFixed(3)}`);
                }
            } else if (elapsedTime === 5) {
                console.log('アニメーションログを停止します');
            }
        }

        this.renderer.render(this.scene, this.camera);
    }

    updateBlinking(deltaTime) {
        this.blinkTimer += deltaTime * 1000;

        if (!this.isBlinking && this.blinkTimer >= this.blinkInterval) {
            // 瞬き開始
            console.log('瞬き開始！');
            this.isBlinking = true;
            this.blinkTimer = 0;
            this.blinkInterval = Math.random() * 4000 + 2000; // 次の瞬きまでの間隔をリセット

            // 目と瞳を細くする
            if (this.leftEye && this.rightEye && this.leftPupil && this.rightPupil) {
                console.log('目を細くします');
                this.leftEye.scale.y = 0.1;
                this.rightEye.scale.y = 0.1;
                this.leftPupil.scale.y = 0.1;
                this.rightPupil.scale.y = 0.1;
            }

            // 300ms後に目を開く（少し長めに）
            setTimeout(() => {
                if (this.leftEye && this.rightEye && this.leftPupil && this.rightPupil) {
                    console.log('目を開きます');
                    this.leftEye.scale.y = 1;
                    this.rightEye.scale.y = 1;
                    this.leftPupil.scale.y = 1;
                    this.rightPupil.scale.y = 1;
                }
                this.isBlinking = false;
            }, 300);
        }
    }

    // 表情変更（瞬き）
    changeExpression(expression) {
        console.log('表情変更:', expression);
        
        if (expression === 'blink' && this.leftEye && this.rightEye && this.leftPupil && this.rightPupil) {
            // 手動瞬き
            this.leftEye.scale.y = 0.1;
            this.rightEye.scale.y = 0.1;
            this.leftPupil.scale.y = 0.1;
            this.rightPupil.scale.y = 0.1;
            
            setTimeout(() => {
                this.leftEye.scale.y = 1;
                this.rightEye.scale.y = 1;
                this.leftPupil.scale.y = 1;
                this.rightPupil.scale.y = 1;
            }, 300);
        }
    }

    onWindowResize() {
        if (!this.container || !this.camera || !this.renderer) return;

        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    showError(message) {
        console.error('VRMViewer エラー:', message);
        
        // エラー表示用の簡単なテキスト
        const errorDiv = document.createElement('div');
        errorDiv.style.position = 'absolute';
        errorDiv.style.top = '50%';
        errorDiv.style.left = '50%';
        errorDiv.style.transform = 'translate(-50%, -50%)';
        errorDiv.style.color = 'red';
        errorDiv.style.fontSize = '14px';
        errorDiv.style.textAlign = 'center';
        errorDiv.innerHTML = `キャラクター読み込みエラー:<br>${message}`;
        
        if (this.container) {
            this.container.appendChild(errorDiv);
        }
    }

    dispose() {
        if (this.renderer) {
            this.renderer.dispose();
        }
        if (this.character) {
            this.scene.remove(this.character);
        }
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    }
}

// グローバルに公開してapp.jsから使用できるようにする
window.VRMViewer = VRMViewer;