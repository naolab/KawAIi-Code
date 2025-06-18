// VRMビューワー（UMD版、ChatVRMロジック使用）

class VRMViewer {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.vrm = null;
        this.mixer = null;
        this.clock = new THREE.Clock();
        this.animationId = null;
        this.isInitialized = false;
        this.initAttempts = 0;
        this.maxInitAttempts = 10;
        
        // アニメーション関連
        this.blinkStartTime = Date.now() + 1000; // 1秒後に瞬き開始
        this.nextBlinkTime = this.blinkStartTime + Math.random() * 4000 + 2000; // 2-6秒後
        this.isBlinking = false;
        
        this.init();
    }

    async init() {
        // Three.jsの読み込み確認
        if (typeof THREE === 'undefined') {
            this.initAttempts++;
            if (this.initAttempts <= this.maxInitAttempts) {
                console.log(`Three.js読み込み待機中... (試行 ${this.initAttempts}/${this.maxInitAttempts})`);
                setTimeout(() => this.init(), 200);
                return;
            } else {
                console.error('Three.js読み込み失敗 - 最大試行回数に達しました');
                return;
            }
        }

        // Three-VRMの読み込み確認
        if (typeof THREE.VRM === 'undefined') {
            console.error('Three-VRM読み込み失敗');
            return;
        }

        console.log('VRMViewer初期化開始');
        console.log('Three.js バージョン:', THREE.REVISION);
        console.log('Three-VRM 読み込み成功');

        this.container = document.getElementById(this.containerId);
        if (!this.container) {
            console.error('Container not found:', this.containerId);
            return;
        }

        this.setupScene();
        this.setupCamera();
        this.setupRenderer();
        this.setupLights();
        
        // VRMファイルを読み込み
        await this.loadVRM();
        
        this.animate();
        this.isInitialized = true;
        console.log('VRMViewer初期化完了');
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // 空色背景
    }

    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(
            75,
            this.container.clientWidth / this.container.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 1.5, 3);
        this.camera.lookAt(0, 1, 0);
    }

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);
    }

    setupLights() {
        // 環境光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        // 指向性光源
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 1, 1);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);
    }

    async loadVRM() {
        try {
            console.log('VRMファイル読み込み開始: kotone_claude1.vrm');
            
            // ChatVRMと同じ方法でGLTFLoaderを設定
            const loader = new THREE.GLTFLoader();
            
            // VRMLoaderPluginを登録（Three-VRM v1.0.9）
            loader.register((parser) => new THREE.VRMLoaderPlugin(parser));

            // VRMファイルを読み込み
            const gltf = await new Promise((resolve, reject) => {
                loader.load(
                    './kotone_claude1.vrm',
                    (gltf) => resolve(gltf),
                    (progress) => {
                        const percent = (progress.loaded / progress.total * 100).toFixed(2);
                        console.log(`VRM読み込み進行: ${percent}%`);
                    },
                    (error) => reject(error)
                );
            });
            
            console.log('GLTF読み込み完了');

            // ChatVRMと同じ方法でVRMを取得
            const vrm = (this.vrm = gltf.userData.vrm);
            
            if (!vrm) {
                throw new Error('VRMデータが見つかりません');
            }
            
            vrm.scene.name = "VRMRoot";

            console.log('VRM情報:', {
                name: vrm.meta?.title || 'Unknown',
                author: vrm.meta?.author || 'Unknown',
                version: vrm.meta?.version || 'Unknown'
            });

            // ChatVRMと同じ初期化処理
            THREE.VRMUtils.rotateVRM0(vrm);
            this.mixer = new THREE.AnimationMixer(vrm.scene);

            // VRMをシーンに追加
            this.scene.add(vrm.scene);
            
            // VRMの位置調整
            vrm.scene.position.y = 0;
            
            console.log('VRMファイル読み込み成功');

        } catch (error) {
            console.error('VRMファイル読み込み失敗:', error);
            console.log('代替として簡易キャラクターを作成します');
            this.createSimpleCharacter();
        }
    }

    createSimpleCharacter() {
        // 簡易キャラクター作成（VRM読み込み失敗時のフォールバック）
        const group = new THREE.Group();

        // 体（青い箱）
        const bodyGeometry = new THREE.BoxGeometry(0.6, 1.0, 0.3);
        const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x4169E1 });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.5;
        group.add(body);

        // 頭（肌色の球体）
        const headGeometry = new THREE.SphereGeometry(0.25, 32, 32);
        const headMaterial = new THREE.MeshLambertMaterial({ color: 0xFFDBB3 });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.25;
        group.add(head);

        // 目（白い球体）
        const eyeGeometry = new THREE.SphereGeometry(0.06, 16, 16);
        const eyeMaterial = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
        
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.08, 1.3, 0.2);
        group.add(leftEye);
        
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.08, 1.3, 0.2);
        group.add(rightEye);

        // 瞳（黒い球体）
        const pupilGeometry = new THREE.SphereGeometry(0.03, 16, 16);
        const pupilMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 });
        
        const leftPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
        leftPupil.position.set(-0.08, 1.3, 0.23);
        group.add(leftPupil);
        
        const rightPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
        rightPupil.position.set(0.08, 1.3, 0.23);
        group.add(rightPupil);

        this.character = group;
        this.character.eyes = [leftEye, rightEye];
        this.character.pupils = [leftPupil, rightPupil];
        
        this.scene.add(this.character);
        
        console.log('簡易キャラクター作成完了');
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());

        const deltaTime = this.clock.getDelta();
        const elapsedTime = this.clock.getElapsedTime();
        const currentTime = Date.now();

        // VRMアニメーション
        if (this.vrm) {
            // VRMの浮遊アニメーション
            this.vrm.scene.position.y = Math.sin(elapsedTime * 2) * 0.1;
            
            // VRMの回転アニメーション
            this.vrm.scene.rotation.y = Math.sin(elapsedTime * 0.5) * 0.1;

            // VRMの瞬きアニメーション
            if (this.vrm.expressionManager && currentTime > this.blinkStartTime) {
                if (!this.isBlinking && currentTime > this.nextBlinkTime) {
                    this.startBlink();
                }
            }

            // VRMのアップデート（ChatVRMと同じ）
            this.vrm.update(deltaTime);
            if (this.mixer) {
                this.mixer.update(deltaTime);
            }
        }

        // 簡易キャラクターのアニメーション（フォールバック用）
        if (this.character) {
            // 浮遊アニメーション
            this.character.position.y = Math.sin(elapsedTime * 2) * 0.1;
            
            // 回転アニメーション  
            this.character.rotation.y = Math.sin(elapsedTime * 0.5) * 0.1;

            // 瞬きアニメーション
            if (currentTime > this.blinkStartTime && !this.isBlinking && currentTime > this.nextBlinkTime) {
                this.startSimpleBlink();
            }
        }

        this.renderer.render(this.scene, this.camera);
    }

    startBlink() {
        if (!this.vrm || !this.vrm.expressionManager) return;
        
        this.isBlinking = true;
        console.log('VRM瞬き開始');
        
        // Three-VRM v1.0.9のAPIを使用
        try {
            this.vrm.expressionManager.setValue('blink', 1.0);
        } catch (error) {
            console.log('瞬きBlendShape設定失敗:', error);
        }
        
        setTimeout(() => {
            try {
                this.vrm.expressionManager.setValue('blink', 0.0);
            } catch (error) {
                console.log('瞬きBlendShape解除失敗:', error);
            }
            this.isBlinking = false;
            this.nextBlinkTime = Date.now() + Math.random() * 4000 + 2000;
            console.log('VRM瞬き終了');
        }, 300);
    }

    startSimpleBlink() {
        if (!this.character || !this.character.eyes) return;
        
        this.isBlinking = true;
        console.log('簡易瞬き開始');
        
        this.character.eyes.forEach(eye => {
            eye.scale.y = 0.1;
        });
        this.character.pupils.forEach(pupil => {
            pupil.scale.y = 0.1;
        });
        
        setTimeout(() => {
            this.character.eyes.forEach(eye => {
                eye.scale.y = 1.0;
            });
            this.character.pupils.forEach(pupil => {
                pupil.scale.y = 1.0;
            });
            this.isBlinking = false;
            this.nextBlinkTime = Date.now() + Math.random() * 4000 + 2000;
            console.log('簡易瞬き終了');
        }, 300);
    }

    resize() {
        if (!this.isInitialized) return;
        
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        if (this.renderer && this.container) {
            this.container.removeChild(this.renderer.domElement);
        }
        
        // VRMリソースの解放（ChatVRMと同じ）
        if (this.vrm) {
            THREE.VRMUtils.deepDispose(this.vrm.scene);
            this.vrm = null;
        }
    }
}

// グローバルに公開
window.VRMViewer = VRMViewer;