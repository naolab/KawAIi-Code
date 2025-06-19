'use client'

import dynamic from 'next/dynamic'
import React, { useState } from 'react'

// VRMViewerをクライアントサイドのみで読み込み
const VRMViewer = dynamic(() => import('@/components/VRMViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto mb-2"></div>
        <p className="text-sm text-orange-600">3Dキャラクターを読み込み中...</p>
      </div>
    </div>
  )
})

export default function Home() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  return (
    <div style={{ width: '100%', height: '100vh', background: 'transparent' }}>
      {/* VRMビューワー専用表示 */}
      <div style={{ width: '100%', height: '100%' }}>
        <VRMViewer />
      </div>
      
      {/* 設定ボタン（右上に小さく配置） */}
      <button 
        onClick={() => setIsSettingsOpen(true)}
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          width: '30px',
          height: '30px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.9)',
          border: '2px solid #ff6b35',
          cursor: 'pointer',
          fontSize: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
        }}
        aria-label="VRM設定を開く"
      >
        ⚙️
      </button>
      
      {/* 設定モーダル */}
      {isSettingsOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '10px',
            minWidth: '300px',
            maxWidth: '90%'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <h3>VRM設定</h3>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer'
                }}
              >
                ×
              </button>
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>VRMファイル読み込み</label>
              <input
                type="file"
                accept=".vrm"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    window.dispatchEvent(new CustomEvent('loadVRM', { detail: file }))
                    setIsSettingsOpen(false)
                  }
                }}
                style={{ width: '100%' }}
              />
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>プリセットキャラクター</label>
              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('loadDefaultVRM'))
                  setIsSettingsOpen(false)
                }}
                style={{
                  background: '#ff6b35',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
              >
                デフォルトキャラクター読み込み
              </button>
            </div>
            
            <div>
              <span>自動アニメーション: </span>
              <span style={{ color: 'green' }}>✓ 有効（瞬き・揺れ）</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}