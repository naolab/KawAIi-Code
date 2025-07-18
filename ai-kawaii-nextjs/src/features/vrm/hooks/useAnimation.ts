import { useCallback, useRef } from 'react'
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
  // アイドルアニメーションを読み込む関数（mainブランチ互換 + T字ポーズ修正）
  const loadIdleAnimation = useCallback(async (vrm: VRM) => {
    try {
      debugLog('🎭 アイドルアニメーション読み込み中...')
      
      // まずT字ポーズを修正
      if (mixerRef.current && vrm.humanoid) {
        const leftUpperArmNode = vrm.humanoid.getNormalizedBoneNode('leftUpperArm')
        const rightUpperArmNode = vrm.humanoid.getNormalizedBoneNode('rightUpperArm')
        
        const poseFixTracks: THREE.KeyframeTrack[] = []
        
        if (leftUpperArmNode) {
          const leftArmRotation = new THREE.QuaternionKeyframeTrack(
            leftUpperArmNode.name + '.quaternion',
            [0],
            [0, 0, -0.6, 0.8]  // 腕を下ろした位置に固定
          )
          poseFixTracks.push(leftArmRotation)
        }
        
        if (rightUpperArmNode) {
          const rightArmRotation = new THREE.QuaternionKeyframeTrack(
            rightUpperArmNode.name + '.quaternion',
            [0],
            [0, 0, 0.6, 0.8]   // 腕を下ろした位置に固定
          )
          poseFixTracks.push(rightArmRotation)
        }
        
        if (poseFixTracks.length > 0) {
          const poseClip = new THREE.AnimationClip('posefix', 0.1, poseFixTracks)
          const poseAction = mixerRef.current.clipAction(poseClip)
          poseAction.setLoop(THREE.LoopOnce, 1)
          poseAction.clampWhenFinished = true
          poseAction.play()
          debugLog('🎭 Tポーズ修正適用')
        }
      }
      
      // 次に全身の揺れアニメーション（VRMAファイル）を読み込み
      try {
        const vrma = await loadVRMAnimation('./idle_loop.vrma')
        if (vrma && mixerRef.current) {
          const clip = vrma.createAnimationClip(vrm)
          const action = mixerRef.current.clipAction(clip)
          action.setLoop(THREE.LoopRepeat, Infinity)
          action.weight = 1.0  // アニメーションの重みを1.0に増加
          action.play()
          infoLog('🎭 アイドルアニメーション開始')
        }
      } catch {
        debugLog('🎭 VRMアニメーション失敗、シンプルアニメーションを使用')
        
        // VRMAが読み込めない場合：全身の軽い揺れアニメーション
        if (mixerRef.current && vrm.humanoid) {
          // 利用可能なボーンを詳細確認
          debugLog('🎭 ボディボーン確認中:')
          const spineNode = vrm.humanoid.getNormalizedBoneNode('spine')
          const hipsNode = vrm.humanoid.getNormalizedBoneNode('hips')
          const chestNode = vrm.humanoid.getNormalizedBoneNode('chest')
          const upperChestNode = vrm.humanoid.getNormalizedBoneNode('upperChest')
          
          debugLog('  spine:', spineNode ? spineNode.name : 'NOT FOUND')
          debugLog('  hips:', hipsNode ? hipsNode.name : 'NOT FOUND')
          debugLog('  chest:', chestNode ? chestNode.name : 'NOT FOUND')
          debugLog('  upperChest:', upperChestNode ? upperChestNode.name : 'NOT FOUND')
          
          const bodySwayTracks: THREE.KeyframeTrack[] = []
          
          // 見つかったボーンで動きを作成
          if (spineNode) {
            const spineSwayRotation = new THREE.QuaternionKeyframeTrack(
              spineNode.name + '.quaternion',
              [0, 3, 6, 9],
              [
                0, 0, 0, 1,           // 基本姿勢
                0, 0.90, 0, 0.9,   // 軽く左に回転 (値を1.5倍に増加、W成分を再計算)
                0, -0.90, 0, 0.9,  // 軽く右に回転 (値を1.5倍に増加、W成分を再計算)
                0, 0, 0, 1            // 基本姿勢に戻る
              ]
            )
            bodySwayTracks.push(spineSwayRotation)
            debugLog('  🎭 背骨回転トラック追加')
          }
          
          if (hipsNode) {
            const hipsSwayRotation = new THREE.QuaternionKeyframeTrack(
              hipsNode.name + '.quaternion',
              [0, 3, 6, 9],
              [
                0, 0, 0, 1,         // 基本姿勢
                0, 0.45, 0, 0.8930,  // 左に回転 (値を1.5倍に増加、W成分を再計算)
                0, -0.45, 0, 0.8930, // 右に回転 (値を1.5倍に増加、W成分を再計算)
                0, 0, 0, 1          // 基本姿勢に戻る
              ]
            )
            bodySwayTracks.push(hipsSwayRotation)
            debugLog('  🎭 腰回転トラック追加')
          }
          
          if (chestNode) {
            const chestSwayRotation = new THREE.QuaternionKeyframeTrack(
              chestNode.name + '.quaternion',
              [0, 1.5, 3],
              [
                0, 0, 0, 1,         // 基本姿勢
                0, 0, 0.05, 0.999,  // 軽く左に回転
                0, 0, 0, 1          // 基本姿勢に戻る
              ]
            )
            bodySwayTracks.push(chestSwayRotation)
            debugLog('  🎭 胸回転トラック追加')
          }
          
          if (upperChestNode) {
            const upperChestSwayRotation = new THREE.QuaternionKeyframeTrack(
              upperChestNode.name + '.quaternion',
              [0, 2.5, 5],
              [
                0, 0, 0, 1,          // 基本姿勢
                0.05, 0, 0, 0.999,   // 軽く前に傾く
                0, 0, 0, 1           // 基本姿勢に戻る
              ]
            )
            bodySwayTracks.push(upperChestSwayRotation)
            debugLog('  🎭 上胸回転トラック追加')
          }
          
          if (bodySwayTracks.length > 0) {
            const bodySwayClip = new THREE.AnimationClip('bodysway', 9, bodySwayTracks)
            const bodySwayAction = mixerRef.current.clipAction(bodySwayClip)
            bodySwayAction.setLoop(THREE.LoopRepeat, Infinity)
            bodySwayAction.weight = 1.0  // フル重み
            bodySwayAction.play()
            debugLog('🎭 強いボディスウェイアニメーション適用')
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