/**
 * UMD version of GLTFLoader for VRM support
 */

(function() {
	'use strict';

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
			console.log('GLTFLoader: Starting GLTF parse...');

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
					console.log('GLTFLoader: Registered plugin:', plugin.name);
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
			console.log('GLTFParser: Parsing GLTF data...');
			
			try {
				// バイナリデータかJSONかを判定
				let json;
				if (this.data instanceof ArrayBuffer) {
					// バイナリGLTF (.glb) または VRM
					const magic = new Uint32Array(this.data, 0, 1)[0];
					if (magic === 0x46546C67) { // "glTF" in little-endian
						json = this.parseGLB(this.data);
					} else {
						// VRMファイルとして処理
						json = this.parseVRM(this.data);
					}
				} else {
					// JSON GLTF
					json = typeof this.data === 'string' ? JSON.parse(this.data) : this.data;
				}

				// VRMプラグインがあるかチェック
				if (this.plugins && this.plugins.VRMLoaderPlugin) {
					console.log('GLTFParser: Using VRM plugin');
					this.plugins.VRMLoaderPlugin.parse(json, this.options.path, onLoad, onError);
				} else {
					console.log('GLTFParser: No VRM plugin, creating basic GLTF');
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
			} catch (error) {
				console.error('GLTFParser: Parse error:', error);
				if (onError) {
					onError(error);
				}
			}
		}

		parseGLB(data) {
			// GLBファイルの基本的なパース
			const view = new DataView(data);
			const magic = view.getUint32(0, true);
			const version = view.getUint32(4, true);
			const length = view.getUint32(8, true);
			
			console.log('GLTFParser: GLB file detected', { magic, version, length });
			
			// JSONチャンクを探す
			let offset = 12;
			const chunkLength = view.getUint32(offset, true);
			const chunkType = view.getUint32(offset + 4, true);
			
			if (chunkType === 0x4E4F534A) { // "JSON"
				const jsonData = new Uint8Array(data, offset + 8, chunkLength);
				const jsonString = new TextDecoder().decode(jsonData);
				return JSON.parse(jsonString);
			}
			
			throw new Error('Invalid GLB file: JSON chunk not found');
		}

		parseVRM(data) {
			// VRMファイルの基本的なパース（GLBと同じ構造）
			console.log('GLTFParser: Parsing VRM file');
			return this.parseGLB(data);
		}
	}

	// グローバルに公開
	THREE.GLTFLoader = GLTFLoader;
	console.log('GLTFLoader: Registered to THREE.GLTFLoader');

})();