import { useCallback } from 'react'
import * as THREE from 'three'
import { VRM } from '@pixiv/three-vrm'
import { loadVRMAnimation } from '@/lib/loadVRMAnimation'

// ログレベル制御（本番環境では詳細ログを無効化）
const isProduction = process.env.NODE_ENV === 'production'
const debugLog = isProduction ? () => {} : console.log
const infoLog = console.log

interface UseAnimationProps {
  mixerRef: React.RefObject<THREE.AnimationMixer | null>
}

export const useAnimation = ({ mixerRef }: UseAnimationProps) => {
  // アイドルアニメーションを読み込む関数（ChatVRM方式）
  const loadIdleAnimation = useCallback(async (vrm: VRM) => {
    try {
      debugLog('🎭 アイドルアニメーション読み込み中...')
      
      // VRMAファイルを読み込み（ChatVRMと同じ方式）
      try {
        const vrma = await loadVRMAnimation('./idle_loop.vrma')
        if (vrma && mixerRef.current) {
          const clip = vrma.createAnimationClip(vrm)
          const action = mixerRef.current.clipAction(clip)
          action.setLoop(THREE.LoopRepeat, Infinity)
          action.play()
          infoLog('🎭 アイドルアニメーション開始（ChatVRM方式）')
        }
      } catch (error) {
        console.error('🎭 VRMAアニメーション読み込み失敗:', error)
        debugLog('🎭 フォールバック：シンプルアニメーションを使用')
        
        // VRMAが読み込めない場合のフォールバック
        if (mixerRef.current && vrm.humanoid) {
          const bodySwayTracks: THREE.KeyframeTrack[] = []
          
          // シンプルな揺れアニメーション
          const spineNode = vrm.humanoid.getNormalizedBoneNode('spine')
          if (spineNode) {
            const spineSwayRotation = new THREE.QuaternionKeyframeTrack(
              spineNode.name + '.quaternion',
              [0, 2, 4],
              [
                0, 0, 0, 1,
                0, 0.01, 0, 0.99995,
                0, 0, 0, 1
              ]
            )
            bodySwayTracks.push(spineSwayRotation)
          }
          
          if (bodySwayTracks.length > 0) {
            const bodySwayClip = new THREE.AnimationClip('bodysway', 4, bodySwayTracks)
            const bodySwayAction = mixerRef.current.clipAction(bodySwayClip)
            bodySwayAction.setLoop(THREE.LoopRepeat, Infinity)
            bodySwayAction.play()
            debugLog('🎭 フォールバックアニメーション適用')
          }
        }
      }
    } catch (error) {
      console.error('🎭 Failed to load idle animation:', error)
    }
  }, [mixerRef])

  return {
    loadIdleAnimation
  }
}