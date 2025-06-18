// VRMビューワー（Three.js + @pixiv/three-vrm使用）

class VRMViewer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.vrm = null;
        this.mixer = null;
        this.clock = new THREE.Clock();
        this.container = null;
        this.loader = null;
        
        this.init();
    }

    async init() {
        this.container = document.getElementById('vrm-character');
        if (!this.container) {
            console.error('VRM character container not found');
            return;
        }

        console.log('VRMViewer初期化開始');

        try {
            // Three.jsの基本セットアップ
            this.setupThreeJS();
            
            // VRMファイルを読み込み
            await this.loadVRM('../kotone_claude1.vrm');
            
            // アニメーションループ開始
            this.animate();
            
            console.log('VRMViewer初期化完了');
        } catch (error) {
            console.error('VRMViewer初期化エラー:', error);
            this.showError(error.message);
        }
    }

    setupThreeJS() {
        // シーンの作成
        this.scene = new THREE.Scene();
        
        // カメラの設定（上半身を映すポジション）
        this.camera = new THREE.PerspectiveCamera(
            35, // FOV
            this.container.clientWidth / this.container.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(0.5, 1.3, 2.0); // 少し右から上半身を映す
        this.camera.lookAt(0, 1.2, 0);

        // レンダラーの作成
        this.renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
            preserveDrawingBuffer: true
        });

        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        this.container.appendChild(this.renderer.domElement);

        // ライティングの設定
        this.setupLights();

        // リサイズ対応
        window.addEventListener('resize', () => this.onWindowResize());

        console.log('Three.jsセットアップ完了');
    }

    setupLights() {
        // 主光源（キーライト）
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
        keyLight.position.set(-1, 2, 2);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 1024;
        keyLight.shadow.mapSize.height = 1024;
        this.scene.add(keyLight);

        // 補助光源（フィルライト）
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
        fillLight.position.set(1, 1, 1);
        this.scene.add(fillLight);

        // 環境光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);

        // リムライト（輪郭強調）
        const rimLight = new THREE.DirectionalLight(0xffeaa7, 0.4);
        rimLight.position.set(0, 0, -1);
        this.scene.add(rimLight);

        console.log('ライティング設定完了');
    }

    async loadVRM(vrmPath) {
        return new Promise((resolve, reject) => {
            // GLTFLoaderを作成
            this.loader = new THREE.GLTFLoader();
            
            // VRMLoaderPluginを登録
            this.loader.register((parser) => {
                return new THREE_VRM.VRMLoaderPlugin(parser);
            });

            console.log('VRMファイル読み込み開始:', vrmPath);

            this.loader.load(
                vrmPath,
                (gltf) => {
                    console.log('GLTFロード成功:', gltf);
                    
                    // VRMデータを取得
                    const vrm = gltf.userData.vrm;
                    if (!vrm) {
                        console.error('VRMデータが見つかりません');
                        reject(new Error('VRMデータが見つかりません'));
                        return;
                    }

                    this.vrm = vrm;
                    console.log('VRMオブジェクト:', this.vrm);

                    // VRMをシーンに追加
                    this.scene.add(vrm.scene);

                    // キャラクターの位置調整
                    vrm.scene.position.set(0, 0, 0);
                    vrm.scene.rotation.set(0, 0.3, 0); // 少し左を向く

                    // スケール調整（必要に応じて）
                    vrm.scene.scale.setScalar(1.0);

                    // アニメーションミキサーの設定
                    this.mixer = new THREE.AnimationMixer(vrm.scene);

                    // 自動瞬きを開始
                    this.startAutoBlinking();

                    console.log('VRMキャラクター表示完了');
                    resolve();
                },
                (progress) => {
                    const percentage = (progress.loaded / progress.total * 100).toFixed(1);
                    console.log(`VRM読み込み進捗: ${percentage}%`);
                },
                (error) => {
                    console.error('VRM読み込みエラー:', error);
                    reject(error);
                }
            );
        });
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const deltaTime = this.clock.getDelta();

        // VRMの更新
        if (this.vrm) {
            this.vrm.update(deltaTime);
        }

        // アニメーションミキサーの更新
        if (this.mixer) {
            this.mixer.update(deltaTime);
        }

        // レンダリング
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    onWindowResize() {
        if (!this.camera || !this.renderer || !this.container) return;

        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }

    // 表情変更
    setExpression(expressionName, weight = 1.0) {
        if (this.vrm && this.vrm.expressionManager) {
            this.vrm.expressionManager.setValue(expressionName, weight);
            console.log(`表情変更: ${expressionName} = ${weight}`);
        }
    }

    // 瞬きアニメーション
    blink() {
        if (this.vrm && this.vrm.expressionManager) {
            this.setExpression('blink', 1.0);
            setTimeout(() => {
                this.setExpression('blink', 0.0);
            }, 150);
        }
    }

    // 自動瞬き
    startAutoBlinking() {
        const blinkInterval = () => {
            this.blink();
            setTimeout(blinkInterval, 2000 + Math.random() * 4000); // 2-6秒間隔
        };
        setTimeout(blinkInterval, 1000); // 1秒後に開始
        console.log('自動瞬き開始');
    }

    // 話している時の口の動き
    speakAnimation(text) {
        if (this.vrm && this.vrm.expressionManager) {
            // 簡単な口パクアニメーション
            const duration = text.length * 50; // 文字数に基づく長さ
            
            // 口を開く
            this.setExpression('aa', 0.7);
            
            setTimeout(() => {
                this.setExpression('aa', 0.0);
            }, duration);
        }
    }

    showError(message) {
        if (!this.container) return;

        this.container.innerHTML = '';

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
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            padding: 20px;
            box-shadow: 0 10px 30px rgba(255, 107, 107, 0.3);
        `;

        errorDiv.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
            <div style="font-size: 18px; font-weight: bold; margin-bottom: 10px;">VRM読み込みエラー</div>
            <div style="font-size: 14px; opacity: 0.9; line-height: 1.4; max-width: 300px;">${message}</div>
            <div style="font-size: 12px; opacity: 0.7; margin-top: 15px;">WebGLとVRMファイルを確認してください</div>
        `;

        this.container.appendChild(errorDiv);
    }

    dispose() {
        if (this.renderer) {
            this.renderer.dispose();
        }
        if (this.vrm) {
            this.vrm.dispose();
        }
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    }
}

// グローバルに設定
window.VRMViewer = VRMViewer;