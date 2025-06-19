'use client'

import dynamic from 'next/dynamic'
import React from 'react'

// VRMViewerをクライアントサイドのみで読み込み
const VRMViewer = dynamic(() => import('@/components/VRMViewer'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full">Loading VRM Viewer...</div>
})

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-pink-100 to-purple-100">
      <div className="container mx-auto p-4">
        <h1 className="text-4xl font-bold text-center mb-8 text-purple-800">
          AI Kawaii Project - VRM Viewer
        </h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-200px)]">
          {/* VRMビューアー */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow-lg overflow-hidden flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-600">VRMビューアーを準備中...</p>
            </div>
          </div>
          
          {/* コントロールパネル */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-purple-700">
              キャラクター設定
            </h2>
            
            {/* ファイル読み込み */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                VRMファイルを選択
              </label>
              <input
                type="file"
                accept=".vrm"
                className="block w-full text-sm text-gray-500
                          file:mr-4 file:py-2 file:px-4
                          file:rounded-full file:border-0
                          file:text-sm file:font-semibold
                          file:bg-purple-50 file:text-purple-700
                          hover:file:bg-purple-100"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    // VRMViewerにファイルを渡す
                    window.dispatchEvent(new CustomEvent('loadVRM', { detail: file }))
                  }
                }}
              />
            </div>
            
            {/* プリセットキャラクター */}
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-2 text-gray-700">
                プリセット
              </h3>
              <button
                className="w-full bg-purple-500 text-white py-2 px-4 rounded-lg hover:bg-purple-600 transition-colors"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('loadDefaultVRM'))
                }}
              >
                デフォルトキャラクター読み込み
              </button>
            </div>
            
            {/* アニメーション制御 */}
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-2 text-gray-700">
                アニメーション
              </h3>
              <div className="space-y-2">
                <button
                  className="w-full bg-pink-500 text-white py-2 px-4 rounded-lg hover:bg-pink-600 transition-colors"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('playAnimation', { detail: 'wave' }))
                  }}
                >
                  手を振る
                </button>
                <button
                  className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition-colors"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('playAnimation', { detail: 'bow' }))
                  }}
                >
                  お辞儀
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
} 