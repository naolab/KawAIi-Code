// VRMローダーの簡易実装
import * as THREE from './three.min.js';

export class VRMLoaderPlugin {
    constructor(parser) {
        this.parser = parser;
        this.name = 'VRMLoaderPlugin';
    }

    parse(data, path, onLoad, onError) {
        try {
            // 基本的なVRM構造を作成
            const gltf = {
                scene: new THREE.Group(),
                scenes: [],
                cameras: [],
                animations: [],
                asset: { version: '2.0' },
                userData: {
                    vrm: {
                        scene: new THREE.Group(),
                        meta: {},
                        humanoid: {},
                        expressionManager: {},
                        update: () => {}
                    }
                }
            };
            
            if (onLoad) {
                onLoad(gltf);
            }
        } catch (error) {
            console.error('VRM parse error:', error);
            if (onError) {
                onError(error);
            }
        }
    }
}

// グローバルに公開
window.VRMLoaderPlugin = VRMLoaderPlugin; 