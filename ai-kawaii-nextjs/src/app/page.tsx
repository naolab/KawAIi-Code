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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-4" style={{borderBottomColor: 'var(--theme-primary)'}}></div>
        <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden mx-auto mb-2">
          <div className="h-full rounded-full animate-pulse" style={{ width: '60%', backgroundColor: 'var(--theme-primary)' }}></div>
        </div>
        <p className="text-sm" style={{color: 'var(--theme-primary)'}}>3Dキャラクターを読み込み中...</p>
      </div>
    </div>
  )
})

export default function Home() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [currentTheme, setCurrentTheme] = useState('orange')

  // アイコンカラーフィルターを生成
  const getIconFilter = (theme: string) => {
    const filters: { [key: string]: string } = {
      orange: 'brightness(0) saturate(100%) invert(47%) sepia(67%) saturate(1158%) hue-rotate(346deg) brightness(102%) contrast(95%)',
      pink: 'brightness(0) saturate(100%) invert(45%) sepia(77%) saturate(2466%) hue-rotate(314deg) brightness(102%) contrast(103%)',
      blue: 'brightness(0) saturate(100%) invert(45%) sepia(100%) saturate(2466%) hue-rotate(207deg) brightness(95%) contrast(89%)',
      green: 'brightness(0) saturate(100%) invert(60%) sepia(77%) saturate(1466%) hue-rotate(87deg) brightness(95%) contrast(89%)',
      purple: 'brightness(0) saturate(100%) invert(45%) sepia(77%) saturate(2466%) hue-rotate(274deg) brightness(95%) contrast(89%)'
    }
    return filters[theme] || filters.orange
  }

  // 親アプリからのテーマ変更メッセージを受信
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'theme-change') {
        const colors = event.data.colors
        const root = document.documentElement
        
        // テーマ名を推測してstateに保存
        if (colors.primary === '#FF8C42') setCurrentTheme('orange')
        else if (colors.primary === '#FFB3C6') setCurrentTheme('pink')
        else if (colors.primary === '#A3C7FF') setCurrentTheme('blue')
        else if (colors.primary === '#A8D5A8') setCurrentTheme('green')
        else if (colors.primary === '#D1A3E6') setCurrentTheme('purple')
        
        // CSS変数を更新
        Object.entries(colors).forEach(([key, value]) => {
          const cssVarName = '--theme-' + key.replace(/([A-Z])/g, '-$1').toLowerCase()
          root.style.setProperty(cssVarName, value as string)
        })

        // 透明度バリエーションも更新
        const hexToRgb = (hex: string) => {
          const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
          return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
          } : null
        }

        const primaryRgb = hexToRgb(colors.primary)
        if (primaryRgb) {
          const { r, g, b } = primaryRgb
          root.style.setProperty('--theme-primary-alpha-10', `rgba(${r}, ${g}, ${b}, 0.1)`)
          root.style.setProperty('--theme-primary-alpha-15', `rgba(${r}, ${g}, ${b}, 0.15)`)
          root.style.setProperty('--theme-primary-alpha-20', `rgba(${r}, ${g}, ${b}, 0.2)`)
          root.style.setProperty('--theme-primary-alpha-30', `rgba(${r}, ${g}, ${b}, 0.3)`)
          root.style.setProperty('--theme-primary-alpha-40', `rgba(${r}, ${g}, ${b}, 0.4)`)
          root.style.setProperty('--theme-primary-alpha-50', `rgba(${r}, ${g}, ${b}, 0.5)`)
        }

        const lightRgb = hexToRgb(colors.primaryLight)
        if (lightRgb) {
          const { r, g, b } = lightRgb
          root.style.setProperty('--theme-light-alpha-20', `rgba(${r}, ${g}, ${b}, 0.2)`)
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  return (
    <div style={{ width: '100%', height: '100vh', background: 'transparent' }}>
      {/* VRMビューワー専用表示 */}
      <div style={{ width: '100%', height: '100%' }}>
        <VRMViewer />
      </div>
      
      {/* 書類アイコンボタン（右上に配置） */}
      <button 
        onClick={() => setIsSettingsOpen(true)}
        style={{
          position: 'fixed',
          top: '60px',
          right: '30px',
          width: '35px',
          height: '35px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.9)',
          border: '1px solid var(--theme-primary-light)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          padding: '4px',
          pointerEvents: 'auto'
        }}
        aria-label="ファイル設定"
      >
        <Image 
          src="/file.svg" 
          alt="ファイル設定" 
          width={20}
          height={20}
          style={{ 
            filter: getIconFilter(currentTheme),
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
              background: 'var(--theme-primary)',
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
                    border: '2px dashed var(--theme-primary-light)',
                    borderRadius: '10px',
                    backgroundColor: 'var(--theme-bg-secondary)',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    fontSize: '14px',
                    color: '#666'
                  }}
                  onMouseEnter={(e) => {
                    const target = e.target as HTMLDivElement
                    target.style.borderColor = 'var(--theme-primary-light)'
                    target.style.backgroundColor = 'var(--theme-bg-tertiary)'
                  }}
                  onMouseLeave={(e) => {
                    const target = e.target as HTMLDivElement
                    target.style.borderColor = 'var(--theme-primary-light)'
                    target.style.backgroundColor = 'var(--theme-bg-secondary)'
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
                    background: 'var(--theme-primary)',
                    color: 'white',
                    border: 'none',
                    padding: '12px 20px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    transition: 'all 0.3s ease',
                    width: '100%',
                    boxShadow: '0 4px 12px var(--theme-primary-alpha-30)'
                  }}
                  onMouseEnter={(e) => {
                    const target = e.target as HTMLButtonElement
                    target.style.transform = 'translateY(-1px)'
                    target.style.boxShadow = '0 6px 16px var(--theme-primary-alpha-40)'
                  }}
                  onMouseLeave={(e) => {
                    const target = e.target as HTMLButtonElement
                    target.style.transform = 'translateY(0)'
                    target.style.boxShadow = '0 4px 12px var(--theme-primary-alpha-30)'
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