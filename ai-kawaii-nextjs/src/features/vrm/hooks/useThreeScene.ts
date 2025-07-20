import { useEffect } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { VRM } from '@pixiv/three-vrm'
import { EmoteController } from '@/features/emoteController/emoteController'
import { LipSync } from '@/features/lipSync/lipSync'

// ログレベル制御（本番環境では詳細ログを無効化）
const isProduction = process.env.NODE_ENV === 'production'
const debugLog = isProduction ? () => {} : console.log

interface UseThreeSceneProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  sceneRef: React.RefObject<THREE.Scene | null>
  rendererRef: React.RefObject<THREE.WebGLRenderer | null>
  cameraRef: React.RefObject<THREE.PerspectiveCamera | null>
  vrmRef: React.RefObject<VRM | null>
  clockRef: React.RefObject<THREE.Clock | null>
  animationIdRef: React.RefObject<number | null>
  emoteControllerRef: React.RefObject<EmoteController | null>
  mixerRef: React.RefObject<THREE.AnimationMixer | null>
  lipSyncRef: React.RefObject<LipSync | null>
  audioContextRef: React.RefObject<AudioContext | null>
  cameraControlsRef: React.RefObject<InstanceType<typeof OrbitControls> | null>
  loadVRMFile: (file: File) => Promise<void>
  loadDefaultVRM: () => Promise<void>
  setVrmInfo: (info: string) => void
}

export const useThreeScene = ({
  canvasRef,
  sceneRef,
  rendererRef,
  cameraRef,
  vrmRef,
  clockRef,
  animationIdRef,
  emoteControllerRef,
  mixerRef,
  lipSyncRef,
  audioContextRef,
  cameraControlsRef,
  loadVRMFile,
  loadDefaultVRM,
  setVrmInfo
}: UseThreeSceneProps) => {
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
      50.0, // デフォルトのFOVに戻す
      initialWidth / initialHeight,
      0.1,
      20.0
    )
    camera.position.set(0.22, 1.4, 0.8) // カメラ高さを1.4に調整
    cameraRef.current = camera

    // レンダラーの初期化（パフォーマンス最適化）
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: false, // CPU負荷軽減のため無効化
      alpha: true,
      powerPreference: 'high-performance'
    })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = false
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)) // 高DPI制限
    
    // 初期サイズ設定
    renderer.setSize(initialWidth, initialHeight)
    rendererRef.current = renderer

    // OrbitControls の初期化（ChatVRMと同じ設定）
    const cameraControls = new OrbitControls(camera, renderer.domElement)
    cameraControls.screenSpacePanning = true
    cameraControls.target.set(0, 1.2, 0) // ターゲット高さを0.1下げて調整
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

    // 口パク初期化
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      audioContextRef.current = audioContext
      lipSyncRef.current = new LipSync(audioContext)
      debugLog('LipSync初期化完了')
    } catch (error) {
      console.error('Failed to initialize LipSync:', error)
    }

    // アニメーションループ（35fps制限でCPU負荷軽減）
    let lastFrameTime = 0
    const targetFPS = 35
    const frameInterval = 1000 / targetFPS
    
    const animate = (currentTime: number) => {
      animationIdRef.current = requestAnimationFrame(animate)
      
      // フレームレート制限（35fps）
      if (currentTime - lastFrameTime < frameInterval) {
        return
      }
      lastFrameTime = currentTime
      
      const deltaTime = clock.getDelta()
      
      // アニメーションミキサーアップデート
      if (mixerRef.current) {
        mixerRef.current.update(deltaTime)
      }
      
      // VRMアップデート
      if (vrmRef.current) {
        vrmRef.current.update(deltaTime)
      }
      
      // 口パクアップデート
      if (lipSyncRef.current && emoteControllerRef.current) {
        const { volume } = lipSyncRef.current.update()
        emoteControllerRef.current.lipSync('aa', volume)
      }
      
      // アニメーション制御アップデート
      if (emoteControllerRef.current) {
        emoteControllerRef.current.update(deltaTime)
      }
      
      renderer.render(scene, camera)
    }
    animate(0)

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
      console.log('🔵 [useThreeScene] loadDefaultVRMイベント受信')
      loadDefaultVRM()
    }

    window.addEventListener('loadVRM', handleLoadVRM as EventListener)
    window.addEventListener('loadDefaultVRM', handleLoadDefaultVRM)

    // 口パク用音声再生メソッドをグローバルに公開
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).playAudioWithLipSync = async (audioData: ArrayBuffer) => {
      if (lipSyncRef.current) {
        debugLog('🎭 LipSync再生開始, サイズ:', audioData.byteLength)
        await lipSyncRef.current.playFromArrayBuffer(audioData)
      }
    }
    
    // 感情変更メソッドをグローバルに公開
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).setVRMEmotion = (emotion: any) => {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[VRMViewer] setVRMEmotion called:', emotion)
        console.log('[VRMViewer] emoteControllerRef.current:', emoteControllerRef.current)
      }
      
      if (emoteControllerRef.current) {
        debugLog('😊 VRM感情変更:', emotion)
        
        if (emotion.isComplex && emotion.emotions) {
          // 複合感情の処理
          debugLog('複合感情検出:', emotion.emotions)
          if (process.env.NODE_ENV !== 'production') {
            console.log('[VRMViewer] Playing complex emotion:', emotion.emotions, 'duration:', emotion.duration || 2000)
          }
          emoteControllerRef.current.playComplexEmotion(emotion.emotions, emotion.duration || 2000)
        } else if (emotion.emotion) {
          // 単一感情の処理
          if (process.env.NODE_ENV !== 'production') {
            console.log('[VRMViewer] Playing single emotion:', emotion.emotion, emotion.weight || 1, 'duration:', emotion.duration || 2000)
          }
          emoteControllerRef.current.playEmotion(emotion.emotion, emotion.weight || 1, emotion.duration || 2000)
        } else {
          console.warn('[VRMViewer] Invalid emotion data:', emotion)
        }
      } else {
        console.error('[VRMViewer] emoteControllerRef.current is null')
      }
    }

    // postMessageでElectronから音声データを受信
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== 'file://') return // Electronからのメッセージのみ受信
      
      if (event.data.type === 'lipSync' && event.data.audioData) {
        debugLog('🎭 postMessageで音声データ受信, サイズ:', event.data.audioData.length)
        const audioBuffer = new Uint8Array(event.data.audioData).buffer
        if (lipSyncRef.current) {
          lipSyncRef.current.playFromArrayBuffer(audioBuffer)
        }
      }
      
      if (event.data.type === 'emotion' && event.data.emotion) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('🎭 postMessageで感情データ受信:', event.data.emotion)
        }
        if (emoteControllerRef.current) {
          // 音声制御モードは常時有効なので、そのまま表情を変更
          
          // setVRMEmotionを呼び出して表情を変更
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((window as any).setVRMEmotion) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).setVRMEmotion(event.data.emotion)
            if (process.env.NODE_ENV !== 'production') {
              console.log('🎭 setVRMEmotion呼び出し完了')
            }
          } else {
            console.error('🎭 setVRMEmotion関数が見つかりません')
          }
        } else {
          console.error('🎭 emoteControllerRef.current is null')
        }
      }
      
      if (event.data.type === 'audioState') {
        if (process.env.NODE_ENV !== 'production') {
          console.log('🎭 postMessageで音声状態受信:', event.data.state)
        }
        if (emoteControllerRef.current) {
          if (event.data.state === 'started') {
            // 音声開始：音声制御モードは常時有効なので特別な処理不要
            if (process.env.NODE_ENV !== 'production') {
              console.log('🎭 音声開始')
            }
          } else if (event.data.state === 'ended') {
            // 音声終了：表情をニュートラルに戻す
            emoteControllerRef.current.expressionController.resetToNeutral()
            if (process.env.NODE_ENV !== 'production') {
              console.log('🎭 音声終了：表情をニュートラルにリセット')
            }
          }
        } else {
          console.error('🎭 emoteControllerRef.current is null')
        }
      }
    }

    window.addEventListener('message', handleMessage)

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('loadVRM', handleLoadVRM as EventListener)
      window.removeEventListener('loadDefaultVRM', handleLoadDefaultVRM)
      window.removeEventListener('message', handleMessage)
      
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
      }
      
      if (rendererRef.current) {
        rendererRef.current.dispose()
      }
    }
  }, [cameraRef, cameraControlsRef, emoteControllerRef, lipSyncRef, mixerRef, rendererRef, sceneRef, vrmRef, loadVRMFile, loadDefaultVRM, setVrmInfo, canvasRef, clockRef, animationIdRef, audioContextRef])
}