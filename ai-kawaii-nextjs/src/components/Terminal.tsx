'use client'

import React, { useEffect, useRef, useState } from 'react'

interface TerminalProps {
  className?: string
}

export default function Terminal({ className }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [output, setOutput] = useState<string[]>([])
  const [currentInput, setCurrentInput] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    // WebSocket接続を確立
    const connectWebSocket = () => {
      try {
        const websocket = new WebSocket('ws://localhost:8080')
        
        websocket.onopen = () => {
          console.log('✨ WebSocket接続成功')
          setIsConnected(true)
          setWs(websocket)
          setRetryCount(0)
          setOutput(prev => [...prev, '✨ WebSocketサーバーに接続しました\r\n'])
        }

        websocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data.type === 'lipSync' && data.audioData) {
              // 音声データを受信してVRMの口パクを実行
              console.log('🎵 口パク用音声データ受信, サイズ:', data.audioData.length)
              const audioBuffer = new Uint8Array(data.audioData).buffer
              if ((window as any).playAudioWithLipSync) {
                (window as any).playAudioWithLipSync(audioBuffer)
              }
            } else if (data.message) {
              setOutput(prev => [...prev, data.message])
            }
          } catch (error) {
            console.error('メッセージ解析エラー:', error)
            setOutput(prev => [...prev, event.data])
          }
        }

        websocket.onclose = () => {
          console.log('👋 WebSocket接続終了')
          setIsConnected(false)
          setWs(null)
          setOutput(prev => [...prev, '❌ WebSocket接続が切断されました\r\n'])
        }

        websocket.onerror = (error) => {
          console.error('❌ WebSocketエラー詳細:', {
            error,
            readyState: websocket.readyState,
            url: websocket.url,
            protocol: websocket.protocol
          })
          setIsConnected(false)
          setOutput(prev => [...prev, `❌ WebSocket接続エラー: ${error.type || 'Unknown error'}\r\n`])
          setOutput(prev => [...prev, `接続先: ws://localhost:8080\r\n`])
          setOutput(prev => [...prev, `WebSocketサーバーが起動していることを確認してください\r\n`])
        }

        return websocket
      } catch (error) {
        console.error('WebSocket接続に失敗:', error)
        setOutput(prev => [...prev, '❌ WebSocketサーバーに接続できません\r\n'])
        setOutput(prev => [...prev, `エラー詳細: ${error.message || error}\r\n`])
        setOutput(prev => [...prev, 'WebSocketサーバーを起動してください: npm run websocket\r\n'])
        return null
      }
    }

    const websocket = connectWebSocket()

    return () => {
      if (websocket) {
        websocket.close()
      }
    }
  }, [])

  // 自動スクロール
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [output])

  // コマンド実行
  const executeCommand = () => {
    if (!currentInput.trim()) return
    if (!ws || !isConnected) {
      setOutput(prev => [...prev, '❌ WebSocketが接続されていません\r\n'])
      return
    }

    // コマンドを履歴に追加
    setCommandHistory(prev => [...prev, currentInput])
    setHistoryIndex(-1)

    // 入力をターミナルに表示
    setOutput(prev => [...prev, `$ ${currentInput}\r\n`])

    // WebSocketでコマンドを送信
    ws.send(JSON.stringify({
      type: 'command',
      command: currentInput
    }))

    setCurrentInput('')
  }

  // キー入力処理
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      executeCommand()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1)
        setHistoryIndex(newIndex)
        setCurrentInput(commandHistory[newIndex])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex >= 0) {
        const newIndex = historyIndex + 1
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1)
          setCurrentInput('')
        } else {
          setHistoryIndex(newIndex)
          setCurrentInput(commandHistory[newIndex])
        }
      }
    }
  }

  // ターミナル出力をレンダリング
  const renderOutput = () => {
    return output.map((line, index) => (
      <div key={index} className="whitespace-pre-wrap">
        {line}
      </div>
    ))
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* ターミナルヘッダー */}
      <div className="flex items-center justify-between p-3 bg-orange-500 text-white rounded-t-lg">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
          <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          <span className="ml-2 font-semibold">AI Kawaii Terminal</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
          <span className="text-sm">{isConnected ? '接続中' : '切断'}</span>
        </div>
      </div>

      {/* ターミナル出力エリア */}
      <div 
        ref={terminalRef}
        className="flex-1 p-4 bg-gray-900 text-green-400 font-mono text-sm overflow-y-auto"
        style={{ minHeight: '300px' }}
      >
        {renderOutput()}
        
        {/* 入力行 */}
        <div className="flex items-center mt-2">
          <span className="text-orange-400 mr-2">$</span>
          <input
            ref={inputRef}
            type="text"
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent border-none outline-none text-green-400"
            placeholder={isConnected ? "コマンドを入力..." : "WebSocket接続を待機中..."}
            disabled={!isConnected}
          />
        </div>
      </div>

      {/* フッター */}
      <div className="p-2 bg-gray-800 text-gray-300 text-xs rounded-b-lg">
        <div className="flex justify-between">
          <span>Claude Code準備完了 ✨</span>
          <span>WebSocket: {isConnected ? '🟢 接続中' : '🔴 切断'}</span>
        </div>
      </div>
    </div>
  )
}