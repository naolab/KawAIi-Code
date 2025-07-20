import { useCallback } from 'react'
import { VRM } from '@pixiv/three-vrm'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import * as THREE from 'three'

interface UseCameraProps {
  cameraRef: React.RefObject<THREE.PerspectiveCamera | null>
  cameraControlsRef: React.RefObject<InstanceType<typeof OrbitControls> | null>
}

export const useCamera = ({ cameraRef, cameraControlsRef }: UseCameraProps) => {
  // カメラをキャラクターの中心に合わせる関数
  const resetCamera = useCallback((vrm: VRM) => {
    const headNode = vrm.humanoid?.getNormalizedBoneNode("head")
    if (headNode && cameraRef.current && cameraControlsRef.current) {
      // カメラ位置をキャラクター全体が見えるように調整
      cameraRef.current.position.set(0, 1.4, 2.0) // デフォルト位置
      // ターゲットをキャラクターの中央に設定
      cameraControlsRef.current.target.set(0, 1.4, 0) // デフォルトターゲット
      cameraControlsRef.current.update()
    }
  }, [cameraRef, cameraControlsRef])

  return {
    resetCamera
  }
}