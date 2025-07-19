import { useCallback, useState } from 'react'
import * as THREE from 'three'
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { EmoteController } from '@/features/emoteController/emoteController'

// ログレベル制御（本番環境では詳細ログを無効化）
const isProduction = process.env.NODE_ENV === 'production'
const debugLog = isProduction ? () => {} : console.log
const infoLog = console.log

interface UseVRMLoaderProps {
  sceneRef: React.RefObject<THREE.Scene | null>
  vrmRef: React.RefObject<VRM | null>
  mixerRef: React.RefObject<THREE.AnimationMixer | null>
  cameraRef: React.RefObject<THREE.PerspectiveCamera | null>
  emoteControllerRef: React.RefObject<EmoteController | null>
  loadIdleAnimation: (vrm: VRM) => Promise<void>
  resetCamera: (vrm: VRM) => void
}

export const useVRMLoader = ({
  sceneRef,
  vrmRef,
  mixerRef,
  cameraRef,
  emoteControllerRef,
  loadIdleAnimation,
  resetCamera
}: UseVRMLoaderProps) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vrmInfo, setVrmInfo] = useState<string>('')

  // VRMファイルを読み込む
  const loadVRMFile = useCallback(async (file: File) => {
    if (!sceneRef.current) return

    setLoading(true)
    setError(null)
    setVrmInfo('')

    try {
      // 既存のVRMを削除
      if (vrmRef.current) {
        sceneRef.current.remove(vrmRef.current.scene)
        VRMUtils.deepDispose(vrmRef.current.scene)
      }

      // GLTFLoaderにVRMLoaderPluginを登録
      const loader = new GLTFLoader()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      loader.register((parser: any) => new VRMLoaderPlugin(parser))

      // VRMを読み込む
      const gltf = await loader.parseAsync(await file.arrayBuffer())
      const vrm = gltf.userData.vrm

      vrmRef.current = vrm
      sceneRef.current.add(vrm.scene)
      VRMUtils.rotateVRM0(vrm)

      // frustum cullingを無効化
      vrm.scene.traverse((obj: THREE.Object3D) => {
        obj.frustumCulled = false
      })

      // アニメーションミキサーを初期化（loadIdleAnimationより前に必要）
      mixerRef.current = new THREE.AnimationMixer(vrm.scene)

      // アニメーション制御を初期化（loadIdleAnimationより前に必要）
      if (cameraRef.current) {
        debugLog('読み込みVRM用EmoteController初期化中...')
        emoteControllerRef.current = new EmoteController(vrm, cameraRef.current)
        debugLog('読み込みVRM用EmoteController初期化完了:', emoteControllerRef.current)
      }

      // アイドルアニメーションを読み込む
      await loadIdleAnimation(vrm)

      // カメラをリセット
      resetCamera(vrm)

      infoLog('VRM読み込み成功')
    } catch (err) {
      console.error('VRM loading error:', err)
      setError(err instanceof Error ? err.message : 'VRMの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [loadIdleAnimation, resetCamera, sceneRef, vrmRef, mixerRef, cameraRef, emoteControllerRef])

  // デフォルトVRMを読み込む
  const loadDefaultVRM = useCallback(async () => {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      loader.register((parser: any) => new VRMLoaderPlugin(parser))

      // VRMを直接URLから読み込み
      const gltf = await loader.loadAsync('./kotone_claude1.vrm')
      const vrm = gltf.userData.vrm as VRM

      if (!vrm) {
        throw new Error('VRMデータが見つかりません')
      }

      // VRMを正しい向きに調整（ChatVRMと同じ）
      VRMUtils.rotateVRM0(vrm)
      
      // VRMのサイズと位置を調整
      vrm.scene.scale.setScalar(0.7)  // 少し小さくする
      vrm.scene.position.set(0, 0.12, 0)  // 高さを0.12に調整
      vrm.scene.rotation.y = -Math.PI / 30  // 反時計回りに6度回転 (-π/30 ≈ -0.1ラジアン)
      vrm.scene.rotation.x = Math.PI / 60   // 手前に3度倒す (π/60 ≈ 0.05ラジアン)
      
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
          debugLog('デフォルトVRM用EmoteController初期化中...')
          emoteControllerRef.current = new EmoteController(vrm, cameraRef.current)
          debugLog('デフォルトVRM用EmoteController初期化完了:', emoteControllerRef.current)
        }

        // カメラをキャラクターの頭に合わせる
        requestAnimationFrame(() => {
          resetCamera(vrm)
        })

        // VRM情報を表示（空にして非表示）
        setVrmInfo('')
      }

      infoLog('デフォルトVRM読み込み成功')
    } catch (err) {
      console.error('Default VRM loading error:', err)
      setError('デフォルトVRMの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [loadIdleAnimation, resetCamera, sceneRef, vrmRef, mixerRef, cameraRef, emoteControllerRef])

  return {
    loading,
    error,
    vrmInfo,
    setVrmInfo,
    loadVRMFile,
    loadDefaultVRM
  }
}