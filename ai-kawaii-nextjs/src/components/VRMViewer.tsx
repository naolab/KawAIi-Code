'use client'

import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { EmoteController } from '@/features/emoteController/emoteController'
import { loadVRMAnimation } from '@/lib/loadVRMAnimation'

interface VRMViewerProps {
  className?: string
}

export default function VRMViewer({ className }: VRMViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vrmInfo, setVrmInfo] = useState<string>('')
  
  // Three.jsの基本要素
  const sceneRef = useRef<THREE.Scene>()
  const rendererRef = useRef<THREE.WebGLRenderer>()
  const cameraRef = useRef<THREE.PerspectiveCamera>()
  const vrmRef = useRef<VRM>()
  const clockRef = useRef<THREE.Clock>()
  const animationIdRef = useRef<number>()
  
  // アニメーション制御
  const emoteControllerRef = useRef<EmoteController>()
  const mixerRef = useRef<THREE.AnimationMixer>()
  
  // カメラ制御
  const cameraControlsRef = useRef<OrbitControls>()

  useEffect(() => {
    if (!canvasRef.current) return

    // シーンの初期化
    const scene = new THREE.Scene()
    scene.background = null // 透明背景
    sceneRef.current = scene

    // カメラの初期化（画面全体サイズ）
    const initialWidth = window.innerWidth
    const initialHeight = window.innerHeight
    const camera = new THREE.PerspectiveCamera(
      35.0, // FOVをさらに広げて全体が見えるように
      initialWidth / initialHeight,
      0.1,
      20.0
    )
    camera.position.set(0, 1.3, 2.5) // もう少し後ろに下がって全体を表示
    cameraRef.current = camera

    // レンダラーの初期化（Three.js v0.177対応）
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      alpha: true
    })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.useLegacyLights = false // 新しいライティングモデル
    renderer.shadowMap.enabled = false
    
    // 初期サイズ設定
    renderer.setSize(initialWidth, initialHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    rendererRef.current = renderer

    // OrbitControls の初期化（ChatVRMと同じ設定）
    const cameraControls = new OrbitControls(camera, renderer.domElement)
    cameraControls.screenSpacePanning = true
    cameraControls.target.set(0, 1.0, 0) // ターゲットを少し下げて全体を見やすく
    cameraControls.update()
    cameraControlsRef.current = cameraControls

    // ライティング（バランスの良い暖色照明）
    const directionalLight = new THREE.DirectionalLight(0xffede2, Math.PI * 0.625)
    directionalLight.position.set(1.0, 1.0, 1.0).normalize()
    scene.add(directionalLight)

    const ambientLight = new THREE.AmbientLight(0xfff5f0, Math.PI * 0.425)
    scene.add(ambientLight)

    // 床は透明なので追加しない

    // クロック
    const clock = new THREE.Clock()
    clockRef.current = clock

    // アニメーションループ
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate)
      
      const deltaTime = clock.getDelta()
      
      // アニメーションミキサーアップデート
      if (mixerRef.current) {
        mixerRef.current.update(deltaTime)
      }
      
      // VRMアップデート
      if (vrmRef.current) {
        vrmRef.current.update(deltaTime)
      }
      
      // アニメーション制御アップデート
      if (emoteControllerRef.current) {
        emoteControllerRef.current.update(deltaTime)
      }
      
      renderer.render(scene, camera)
    }
    animate()

    // リサイズ対応（画面全体サイズ）
    const handleResize = () => {
      if (!camera || !renderer) return
      
      const width = window.innerWidth
      const height = window.innerHeight
      
      renderer.setPixelRatio(window.devicePixelRatio)
      renderer.setSize(width, height)
      
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    
    // 初期リサイズを実行（複数回試行して確実にサイズを設定）
    setTimeout(() => handleResize(), 100)
    setTimeout(() => handleResize(), 500)
    setTimeout(() => handleResize(), 1000)
    
    window.addEventListener('resize', handleResize)

    // カスタムイベントリスナー
    const handleLoadVRM = (event: CustomEvent) => {
      loadVRMFile(event.detail)
    }
    
    const handleLoadDefaultVRM = () => {
      loadDefaultVRM()
    }

    window.addEventListener('loadVRM', handleLoadVRM as EventListener)
    window.addEventListener('loadDefaultVRM', handleLoadDefaultVRM)

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('loadVRM', handleLoadVRM as EventListener)
      window.removeEventListener('loadDefaultVRM', handleLoadDefaultVRM)
      
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
      }
      
      if (rendererRef.current) {
        rendererRef.current.dispose()
      }
    }
  }, [])

  // アイドルアニメーションを読み込む関数
  const loadIdleAnimation = async (vrm: VRM) => {
    try {
      console.log('Loading idle animation...')
      const vrma = await loadVRMAnimation('/idle_loop.vrma')
      if (vrma && mixerRef.current) {
        const clip = vrma.createAnimationClip(vrm)
        const action = mixerRef.current.clipAction(clip)
        action.play()
        console.log('Idle animation loaded and playing')
      }
    } catch (error) {
      console.error('Failed to load idle animation:', error)
    }
  }

  // カメラをキャラクターの中心に合わせる関数
  const resetCamera = (vrm: VRM) => {
    const headNode = vrm.humanoid?.getNormalizedBoneNode("head")
    if (headNode && cameraRef.current && cameraControlsRef.current) {
      const headWPos = headNode.getWorldPosition(new THREE.Vector3())
      // カメラ位置をキャラクター全体が見えるように調整
      cameraRef.current.position.set(0, 1.2, 2.5)
      // ターゲットをキャラクターの中央に設定
      cameraControlsRef.current.target.set(0, 1.0, 0)
      cameraControlsRef.current.update()
    }
  }

  // VRMファイルを読み込む
  const loadVRMFile = async (file: File) => {
    if (!sceneRef.current) return

    setLoading(true)
    setError(null)

    try {
      // 既存のVRMを削除
      if (vrmRef.current) {
        sceneRef.current.remove(vrmRef.current.scene)
        VRMUtils.deepDispose(vrmRef.current.scene)
      }

      // GLTFLoaderにVRMLoaderPluginを登録
      const loader = new GLTFLoader()
      loader.register((parser) => new VRMLoaderPlugin(parser))

      // ファイルをArrayBufferとして読み込み
      const arrayBuffer = await file.arrayBuffer()

      // ArrayBufferをBlobURLに変換
      const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)

      let gltf
      try {
        // VRMを読み込み
        gltf = await loader.loadAsync(url)
      } finally {
        // BlobURLを解放
        URL.revokeObjectURL(url)
      }
      
      const vrm = gltf.userData.vrm as VRM

      if (!vrm) {
        throw new Error('VRMデータが見つかりません')
      }

      // VRMを正しい向きに調整（ChatVRMと同じ）
      VRMUtils.rotateVRM0(vrm)
      
      // VRMのスケールを小さくして全体が見えるように
      vrm.scene.scale.setScalar(0.8)
      
      // VRMをシーンに追加
      sceneRef.current.add(vrm.scene)
      vrmRef.current = vrm

      // frustum cullingを無効化（ChatVRMと同じ）
      vrm.scene.traverse((obj) => {
        obj.frustumCulled = false
      })

      // アニメーションミキサーを初期化
      mixerRef.current = new THREE.AnimationMixer(vrm.scene)

      // アイドルアニメーションを読み込み
      loadIdleAnimation(vrm)

      // アニメーション制御を初期化
      if (cameraRef.current) {
        console.log('Initializing EmoteController...')
        emoteControllerRef.current = new EmoteController(vrm, cameraRef.current)
        console.log('EmoteController initialized:', emoteControllerRef.current)
      }

      // カメラをキャラクターの頭に合わせる
      requestAnimationFrame(() => {
        resetCamera(vrm)
        // VRM読み込み後にリサイズを実行
        setTimeout(() => {
          if (cameraRef.current && rendererRef.current) {
            const width = window.innerWidth
            const height = window.innerHeight
            rendererRef.current.setSize(width, height)
            cameraRef.current.aspect = width / height
            cameraRef.current.updateProjectionMatrix()
          }
        }, 100)
      })

      // VRM情報を表示
      const meta = vrm.meta
      setVrmInfo(`
        名前: ${meta?.name || '不明'}
        作者: 不明
        バージョン: ${meta?.version || '不明'}
      `)

      console.log('VRM loaded successfully:', vrm)
    } catch (err) {
      console.error('VRM loading error:', err)
      setError(err instanceof Error ? err.message : 'VRMの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  // デフォルトVRMを読み込む
  const loadDefaultVRM = async () => {
    try {
      setLoading(true)
      setError(null)

      // 既存のVRMを削除
      if (vrmRef.current && sceneRef.current) {
        sceneRef.current.remove(vrmRef.current.scene)
        VRMUtils.deepDispose(vrmRef.current.scene)
      }

      // GLTFLoaderにVRMLoaderPluginを登録
      const loader = new GLTFLoader()
      loader.register((parser: any) => new VRMLoaderPlugin(parser))

      // VRMを直接URLから読み込み
      const gltf = await loader.loadAsync('/kotone_claude1.vrm')
      const vrm = gltf.userData.vrm as VRM

      if (!vrm) {
        throw new Error('VRMデータが見つかりません')
      }

      // VRMを正しい向きに調整（ChatVRMと同じ）
      VRMUtils.rotateVRM0(vrm)
      
      // VRMのスケールを小さくして全体が見えるように
      vrm.scene.scale.setScalar(0.8)
      
      // VRMをシーンに追加
      if (sceneRef.current) {
        sceneRef.current.add(vrm.scene)
        vrmRef.current = vrm

        // frustum cullingを無効化（ChatVRMと同じ）
        vrm.scene.traverse((obj) => {
          obj.frustumCulled = false
        })

        // アニメーションミキサーを初期化
        mixerRef.current = new THREE.AnimationMixer(vrm.scene)

        // アイドルアニメーションを読み込み
        loadIdleAnimation(vrm)

        // アニメーション制御を初期化
        if (cameraRef.current) {
          console.log('Initializing EmoteController for default VRM...')
          emoteControllerRef.current = new EmoteController(vrm, cameraRef.current)
          console.log('EmoteController initialized for default VRM:', emoteControllerRef.current)
        }

        // カメラをキャラクターの頭に合わせる
        requestAnimationFrame(() => {
          resetCamera(vrm)
        })

        // VRM情報を表示
        const meta = vrm.meta
        setVrmInfo(`
          名前: デフォルトキャラクター
          作者: AI Kawaii Project
          バージョン: 1.0
        `)
      }

      console.log('Default VRM loaded successfully:', vrm)
    } catch (err) {
      console.error('Default VRM loading error:', err)
      setError('デフォルトVRMの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div 
      className={`relative ${className}`}
      style={{ 
        width: '100vw', 
        height: '100vh', 
        position: 'fixed',
        top: 0,
        left: 0,
        margin: 0,
        padding: 0,
        paddingBottom: 0
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ 
          width: '100vw', 
          height: '100vh', 
          display: 'block',
          margin: 0,
          padding: 0
        }}
      />
      
      {loading && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-4 rounded-lg">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-2"></div>
            <p className="text-sm text-gray-600">VRMを読み込み中...</p>
          </div>
        </div>
      )}
      
      {error && (
        <div className="absolute top-4 left-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p className="text-sm">{error}</p>
        </div>
      )}
      
    </div>
  )
} 