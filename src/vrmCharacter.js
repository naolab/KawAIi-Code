// CDNからThree.jsとthree-vrmを読み込み

class VRMCharacter {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.vrm = null;
        this.mixer = null;
        this.clock = new THREE.Clock();
        
        this.init();
    }

    async init() {
        // シーンの設定
        this.scene = new THREE.Scene();
        this.scene.background = null; // 透明背景

        // カメラの設定（上半身用）
        this.camera = new THREE.PerspectiveCamera(
            30, // FOV
            this.container.clientWidth / this.container.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 1.2, 2.5); // 上半身を映すポジション
        this.camera.lookAt(0, 1.2, 0);

        // レンダラーの設定
        this.renderer = new THREE.WebGLRenderer({
            alpha: true, // 透明背景を有効に
            antialias: true
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // ライティング設定
        this.setupLighting();

        // VRMモデルをロード
        await this.loadVRM('/kotone_claude1.vrm');

        // アニメーションループ開始
        this.animate();

        // リサイズ対応
        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupLighting() {
        // メインライト（少し左から）
        const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
        mainLight.position.set(-1, 2, 1);
        mainLight.castShadow = true;
        this.scene.add(mainLight);

        // 環境光（全体を明るく）
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        // リムライト（輪郭を強調）
        const rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
        rimLight.position.set(1, 1, -1);
        this.scene.add(rimLight);
    }

    async loadVRM(url) {
        const loader = new THREE.GLTFLoader();
        loader.register((parser) => new THREE_VRM.VRMLoaderPlugin(parser));

        try {
            const gltf = await loader.loadAsync(url);
            this.vrm = gltf.userData.vrm;

            if (this.vrm) {
                // VRMをシーンに追加
                this.scene.add(this.vrm.scene);

                // VRMの位置調整（上半身を映すため）
                this.vrm.scene.position.set(0, 0, 0);
                this.vrm.scene.rotation.set(0, 0.2, 0); // 少し左向き

                // アニメーションミキサー設定
                this.mixer = new THREE.AnimationMixer(this.vrm.scene);

                console.log('VRMモデルが正常に読み込まれました');
            }
        } catch (error) {
            console.error('VRMモデルの読み込みに失敗しました:', error);
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const deltaTime = this.clock.getDelta();

        // VRMアップデート
        if (this.vrm) {
            this.vrm.update(deltaTime);
        }

        // アニメーションミキサーアップデート
        if (this.mixer) {
            this.mixer.update(deltaTime);
        }

        // レンダリング
        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        if (this.camera && this.renderer) {
            this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        }
    }

    // 表情変更メソッド（将来の拡張用）
    setExpression(expressionName, weight) {
        if (this.vrm && this.vrm.expressionManager) {
            this.vrm.expressionManager.setValue(expressionName, weight);
        }
    }

    // 瞬きアニメーション（将来の拡張用）
    blink() {
        if (this.vrm && this.vrm.expressionManager) {
            this.vrm.expressionManager.setValue('blink', 1.0);
            setTimeout(() => {
                this.vrm.expressionManager.setValue('blink', 0.0);
            }, 150);
        }
    }

    dispose() {
        if (this.renderer) {
            this.renderer.dispose();
        }
        if (this.vrm) {
            this.vrm.dispose();
        }
    }
}

module.exports = VRMCharacter;