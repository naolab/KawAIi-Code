'use client'

import dynamic from 'next/dynamic'
import React, { useState } from 'react'

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
  const [, setCurrentTheme] = useState('orange')

  // 親アプリからのメッセージを受信
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // VRMファイル読み込みメッセージ
      if (event.data?.type === 'loadVRM' && event.data.fileData) {
        try {
          let fileBits;
          if (typeof event.data.fileData === 'string') {
            // Base64文字列の場合（新仕様）
            const binStr = atob(event.data.fileData);
            const len = binStr.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binStr.charCodeAt(i);
            }
            fileBits = [bytes];
          } else {
            // 配列の場合（旧仕様）
            fileBits = [event.data.fileData];
          }

          const file = new File(fileBits, event.data.fileName, { type: 'application/octet-stream' })
          window.dispatchEvent(new CustomEvent('loadVRM', { detail: file }))
        } catch (error) {
          console.error('VRMファイル読み込みエラー:', error)
        }
      }

      // デフォルトVRM読み込みメッセージ
      if (event.data?.type === 'loadDefaultVRM') {
        window.dispatchEvent(new CustomEvent('loadDefaultVRM'))
      }

      // テーマ変更メッセージ
      if (event.data?.type === 'theme-change') {
        const colors = event.data.colors
        const root = document.documentElement
        
        // テーマ名を推測してstateに保存
        if (colors.primary === '#FF8C42') setCurrentTheme('orange')
        else if (colors.primary === '#FF8FAD') setCurrentTheme('pink')
        else if (colors.primary === '#7AB8FF') setCurrentTheme('blue')
        else if (colors.primary === '#7AC87A') setCurrentTheme('green')
        else if (colors.primary === '#B882D1') setCurrentTheme('purple')
        
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
    </div>
  )
}