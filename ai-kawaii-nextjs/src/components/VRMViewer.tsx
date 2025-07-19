'use client'

import React, { useRef, useEffect } from 'react'
import * as THREE from 'three'
import { VRM } from '@pixiv/three-vrm'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { EmoteController } from '@/features/emoteController/emoteController'
import { LipSync } from '@/features/lipSync/lipSync'
import { useVRMLoader } from '@/features/vrm/hooks/useVRMLoader'
import { useAnimation } from '@/features/vrm/hooks/useAnimation'
import { useCamera } from '@/features/vrm/hooks/useCamera'
import { useThreeScene } from '@/features/vrm/hooks/useThreeScene'

interface VRMViewerProps {
  className?: string
}

export default function VRMViewer({ className }: VRMViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  // Three.jsの基本要素
  const sceneRef = useRef<THREE.Scene | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const vrmRef = useRef<VRM | null>(null)
  const clockRef = useRef<THREE.Clock | null>(null)
  const animationIdRef = useRef<number | null>(null)
  
  // アニメーション制御
  const emoteControllerRef = useRef<EmoteController | null>(null)
  const mixerRef = useRef<THREE.AnimationMixer | null>(null)
  
  // 口パク制御
  const lipSyncRef = useRef<LipSync | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  
  // カメラ制御
  const cameraControlsRef = useRef<InstanceType<typeof OrbitControls> | null>(null)

  // アニメーション制御フック
  const { loadIdleAnimation } = useAnimation({ mixerRef })

  // カメラ制御フック
  const { resetCamera } = useCamera({ cameraRef, cameraControlsRef })

  // VRMローダーフック
  const vrmLoader = useVRMLoader({
    sceneRef,
    vrmRef,
    mixerRef,
    cameraRef,
    emoteControllerRef,
    loadIdleAnimation,
    resetCamera
  })

  // VRMローダーの状態（フックから取得）
  const loading = vrmLoader.loading
  const error = vrmLoader.error
  const vrmInfo = vrmLoader.vrmInfo
  const setVrmInfo = vrmLoader.setVrmInfo

  // VRMファイルを読み込む（フックから取得）
  const loadVRMFile = vrmLoader.loadVRMFile

  // デフォルトVRMを読み込む（フックから取得）
  const loadDefaultVRM = vrmLoader.loadDefaultVRM

  // Three.jsシーンの初期化
  useThreeScene({
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
  })

  // アプリ起動時にデフォルトVRMを自動読み込み
  useEffect(() => {
    // シーンが初期化された後にデフォルトVRMを読み込む
    const autoLoadDefaultVRM = async () => {
      // シーンの初期化を待つ
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // デフォルトVRMが未ロードの場合のみ読み込み
      if (!vrmRef.current && !loading) {
        // デバッグログは開発時のみ表示
        if (process.env.NODE_ENV !== 'production') {
          console.log('🤖 アプリ起動時にデフォルトVRMを自動読み込み開始')
        }
        await loadDefaultVRM()
      }
    }

    autoLoadDefaultVRM()
  }, [loadDefaultVRM, loading]) // loadingを依存配列に追加してフックの状態変化を監視

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
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-lg border-2 border-orange-400 shadow-2xl">
            <div className="animate-spin rounded-full h-10 w-10 border-b-3 border-orange-500 mx-auto mb-3"></div>
            <p className="text-sm text-orange-100">VRMを読み込み中...</p>
          </div>
        </div>
      )}
      
      {error && (
        <div className="absolute top-4 left-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p className="text-sm">❌ {error}</p>
        </div>
      )}

      {vrmInfo && (
        <div className="absolute top-4 left-4 bg-gray-800 text-gray-200 text-xs px-2 py-1 rounded opacity-75">
          <pre>{vrmInfo}</pre>
        </div>
      )}
      
    </div>
  )
}
