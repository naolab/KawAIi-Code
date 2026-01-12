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

  // レンダリング開始フラグ（ロード画面の隙間を無くすため）
  const [isFirstFrameDrawn, setIsFirstFrameDrawn] = React.useState(false)

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
  const setVrmInfo = vrmLoader.setVrmInfo

  // VRMファイルを読み込む（フックから取得）
  const loadVRMFile = vrmLoader.loadVRMFile

  // デフォルトVRMを読み込む（フックから取得）
  const loadDefaultVRM = vrmLoader.loadDefaultVRM

  // ロード開始時に描画フラグをリセット
  useEffect(() => {
    if (loading) {
      setIsFirstFrameDrawn(false)
    }
  }, [loading])

  // Three.jsシーンの初期化
  const handleFirstFrameRendered = React.useCallback(() => {
    console.log('✨ [VRMViewer] First frame rendered, hiding loading screen')
    setIsFirstFrameDrawn(true)
  }, [])

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
    setVrmInfo,
    onFirstFrameRendered: handleFirstFrameRendered
  })

  // 自動読み込みは無効化 - CharacterDisplayManagerが全VRM読み込みを管理
  // アプリ起動時にCharacterDisplayManagerからloadVRMFileまたはloadDefaultVRMが呼ばれる
  useEffect(() => {
    // URLからcharIdを取得（マルチ表示用）
    const params = new URLSearchParams(window.location.search)
    const charId = params.get('charId')
    
    // 初期化時のログのみ
    console.log(`🤖 [VRMViewer] Ready to receive VRM from CharacterDisplayManager (ID: ${charId || 'main'})`)
    
    // 親アプリに準備完了を通知
    window.parent.postMessage({ type: 'vrm-viewer-ready', charId }, '*')

    // マネージャーからの確認リクエストに応答する仕組みを追加
    const handleCheckReady = (event: MessageEvent) => {
      if (event.data?.type === 'checkReady') {
        window.parent.postMessage({ type: 'vrm-viewer-ready', charId }, '*')
      }
    }
    window.addEventListener('message', handleCheckReady)
    
    return () => {
      window.removeEventListener('message', handleCheckReady)
    }
  }, []) // 初回マウント時のみ

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
      
      {(loading || !isFirstFrameDrawn) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center">
            <div 
              className="animate-spin rounded-full h-8 w-8 border-b-2 mb-2" 
              style={{ borderBottomColor: 'var(--theme-primary, #f97316)' }}
            ></div>
            <p className="text-xs font-medium" style={{ color: 'var(--theme-primary, #f97316)', textShadow: '0 0 10px rgba(255,255,255,0.8)' }}>
              読み込み中...
            </p>
          </div>
        </div>
      )}
      
      {error && (
        <div className="absolute top-4 left-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p className="text-sm">❌ {error}</p>
        </div>
      )}

    </div>
  )
}
