/**
 * ES Module version of GLTFLoader for VRM support
 */

import * as THREE from './three.min.js';

class GLTFLoader extends THREE.Loader {
	constructor(manager) {
		super(manager);
		this.dracoLoader = null;
		this.ktx2Loader = null;
		this.meshoptDecoder = null;
		this.pluginCallbacks = [];
	}

	load(url, onLoad, onProgress, onError) {
		const scope = this;
		let resourcePath;

		if (this.resourcePath !== '') {
			resourcePath = this.resourcePath;
		} else if (this.path !== '') {
			resourcePath = this.path;
		} else {
			resourcePath = THREE.LoaderUtils.extractUrlBase(url);
		}

		this.manager.itemStart(url);

		const _onError = function(e) {
			if (onError) {
				onError(e);
			} else {
				console.error(e);
			}
			scope.manager.itemError(url);
			scope.manager.itemEnd(url);
		};

		const loader = new THREE.FileLoader(this.manager);
		loader.setPath(this.path);
		loader.setResponseType('arraybuffer');
		loader.setRequestHeader(this.requestHeader);
		loader.setWithCredentials(this.withCredentials);

		loader.load(url, function(data) {
			try {
				scope.parse(data, resourcePath, function(gltf) {
					onLoad(gltf);
					scope.manager.itemEnd(url);
				}, _onError);
			} catch (e) {
				_onError(e);
			}
		}, onProgress, _onError);
	}

	setDRACOLoader(dracoLoader) {
		this.dracoLoader = dracoLoader;
		return this;
	}

	setKTX2Loader(ktx2Loader) {
		this.ktx2Loader = ktx2Loader;
		return this;
	}

	setMeshoptDecoder(meshoptDecoder) {
		this.meshoptDecoder = meshoptDecoder;
		return this;
	}

	register(callback) {
		if (this.pluginCallbacks.indexOf(callback) === -1) {
			this.pluginCallbacks.push(callback);
		}
		return this;
	}

	unregister(callback) {
		if (this.pluginCallbacks.indexOf(callback) !== -1) {
			this.pluginCallbacks.splice(this.pluginCallbacks.indexOf(callback), 1);
		}
		return this;
	}

	parse(data, path, onLoad, onError) {
		console.log('Starting GLTF parse...');

		// 基本的なパーサーを作成
		const parser = new GLTFParser(data, {
			path: path || this.resourcePath || '',
			crossOrigin: this.crossOrigin,
			requestHeader: this.requestHeader,
			manager: this.manager,
			ktx2Loader: this.ktx2Loader,
			meshoptDecoder: this.meshoptDecoder
		});

		// プラグインを設定
		const plugins = {};
		for (let i = 0; i < this.pluginCallbacks.length; i++) {
			const plugin = this.pluginCallbacks[i](parser);
			if (plugin.name) {
				plugins[plugin.name] = plugin;
			}
		}

		parser.setPlugins(plugins);
		parser.parse(onLoad, onError);
	}
}

// シンプルなGLTFParser実装
class GLTFParser {
	constructor(data, options) {
		this.data = data;
		this.options = options || {};
		this.plugins = {};
		this.fileLoader = new THREE.FileLoader();
	}

	setPlugins(plugins) {
		this.plugins = plugins;
	}

	parse(onLoad, onError) {
		// VRMプラグインがあるかチェック
		if (this.plugins && this.plugins.VRMLoaderPlugin) {
			// VRMローダープラグインに処理を委任
			try {
				this.plugins.VRMLoaderPlugin.parse(this.data, this.options.path, onLoad, onError);
			} catch (error) {
				console.error('VRM plugin error:', error);
				if (onError) onError(error);
			}
		} else {
			// 基本的なGLTF構造を返す
			const gltf = {
				scene: new THREE.Group(),
				scenes: [],
				cameras: [],
				animations: [],
				asset: { version: '2.0' },
				userData: {}
			};
			
			if (onLoad) {
				onLoad(gltf);
			}
		}
	}
}

export { GLTFLoader };