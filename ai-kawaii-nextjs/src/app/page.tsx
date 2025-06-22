'use client'

import dynamic from 'next/dynamic'
import React, { useState } from 'react'
import Image from 'next/image'

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
          top: '60px',
          right: '10px',
          width: '30px',
          height: '30px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.9)',
          border: '1px solid rgba(255, 183, 102, 0.8)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          padding: '4px'
        }}
        aria-label="VRM設定を開く"
      >
        <Image 
          src="/settings-icon.svg" 
          alt="設定" 
          width={18}
          height={18}
          style={{ 
            filter: 'brightness(0) saturate(100%) invert(47%) sepia(67%) saturate(1158%) hue-rotate(346deg) brightness(102%) contrast(95%)',
            opacity: 0.87
          }} 
        />
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
            borderRadius: '20px',
            minWidth: '400px',
            maxWidth: '500px',
            maxHeight: '80vh',
            overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
          }}>
            {/* ヘッダー */}
            <div style={{
              padding: '20px',
              background: 'rgb(255, 140, 66)',
              color: 'white',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>VRM設定</h3>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'white',
                  fontSize: '24px',
                  cursor: 'pointer',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.3s ease'
                }}
                onMouseEnter={(e) => (e.target as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.2)'}
                onMouseLeave={(e) => (e.target as HTMLButtonElement).style.background = 'none'}
              >
                ×
              </button>
            </div>
            
            {/* ボディ */}
            <div style={{ padding: '25px' }}>
              <div style={{ marginBottom: '25px' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '10px', 
                  fontWeight: '500',
                  color: '#333',
                  fontSize: '14px'
                }}>VRMファイル読み込み</label>
                <div style={{
                  position: 'relative',
                  display: 'inline-block',
                  width: '100%'
                }}>
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
                    style={{ 
                      position: 'absolute',
                      opacity: 0,
                      width: '100%',
                      height: '100%',
                      cursor: 'pointer'
                    }}
                  />
                  <div style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '2px dashed rgba(255, 183, 102, 0.5)',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(255, 183, 102, 0.05)',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    fontSize: '14px',
                    color: '#666'
                  }}
                  onMouseEnter={(e) => {
                    const target = e.target as HTMLDivElement
                    target.style.borderColor = 'rgba(255, 183, 102, 0.8)'
                    target.style.backgroundColor = 'rgba(255, 183, 102, 0.1)'
                  }}
                  onMouseLeave={(e) => {
                    const target = e.target as HTMLDivElement
                    target.style.borderColor = 'rgba(255, 183, 102, 0.5)'
                    target.style.backgroundColor = 'rgba(255, 183, 102, 0.05)'
                  }}
                  >
                    VRMファイルを選択
                  </div>
                </div>
              </div>
              
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '10px', 
                  fontWeight: '500',
                  color: '#333',
                  fontSize: '14px'
                }}>プリセットキャラクター</label>
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('loadDefaultVRM'))
                    setIsSettingsOpen(false)
                  }}
                  style={{
                    background: 'rgb(255, 140, 66)',
                    color: 'white',
                    border: 'none',
                    padding: '12px 20px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    transition: 'all 0.3s ease',
                    width: '100%',
                    boxShadow: '0 4px 12px rgba(255, 140, 66, 0.3)'
                  }}
                  onMouseEnter={(e) => {
                    const target = e.target as HTMLButtonElement
                    target.style.transform = 'translateY(-1px)'
                    target.style.boxShadow = '0 6px 16px rgba(255, 140, 66, 0.4)'
                  }}
                  onMouseLeave={(e) => {
                    const target = e.target as HTMLButtonElement
                    target.style.transform = 'translateY(0)'
                    target.style.boxShadow = '0 4px 12px rgba(255, 140, 66, 0.3)'
                  }}
                >
                  デフォルトキャラクター読み込み
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}