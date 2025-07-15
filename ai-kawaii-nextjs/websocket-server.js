const WebSocket = require('ws');
const { spawn } = require('child_process');
const path = require('path');

// ログレベル制御（本番環境では詳細ログを無効化）
const isProduction = process.env.NODE_ENV === 'production';
const debugLog = isProduction ? () => {} : console.log;
const infoLog = console.log; // 重要な情報は常に出力
const errorLog = console.error; // エラーは常に出力

const CLAUDE_MD_CONTENT = process.env.CLAUDE_MD_CONTENT || ''; // CLAUDE.mdの内容を環境変数から取得
debugLog('WebSocket Server: CLAUDE_MD_CONTENT読み込み完了:', CLAUDE_MD_CONTENT ? `長さ: ${CLAUDE_MD_CONTENT.length}文字` : '空/未定義');

// WebSocketサーバーを作成
const wss = new WebSocket.Server({ port: 8080 });

infoLog('🌟 WebSocketサーバーが起動しました！ポート: 8080');

wss.on('connection', (ws) => {
  debugLog('✨ クライアントが接続しました');
  
  let currentProcess = null;
  let claudeSession = null;
  let isClaudeInteractive = false;
  
  // クライアントに接続成功メッセージを送信
  ws.send(JSON.stringify({
    type: 'init',
    message: '🌟 KawAIi Code - Claude Code 🌟\r\nこんにちは！ニコだよ〜✨\r\nClaude Codeと接続されました！\r\n\r\n'
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'audio') {
        debugLog('🎵 音声データ受信, サイズ:', data.audioData.length);
        // VRMビューワーに音声データを送信
        ws.send(JSON.stringify({
          type: 'lipSync',
          audioData: data.audioData
        }));
        return;
      } else if (data.type === 'emotion') {
        debugLog('😊 感情データ受信:', data.emotion);
        console.log('[WebSocket] 感情データ詳細:', JSON.stringify(data.emotion, null, 2));
        // VRMビューワーに感情データを送信
        ws.send(JSON.stringify({
          type: 'emotion',
          emotion: data.emotion
        }));
        return;
      } else if (data.type === 'command') {
        debugLog('📝 コマンド受信:', data.command);
        
        // 既存のプロセスがあれば終了
        if (currentProcess) {
          currentProcess.kill();
        }
        
        const command = data.command.trim();
        
        // Claudeコマンドの場合
        if (command === 'claude' || command.startsWith('claude ')) {
          if (command === 'claude') {
            ws.send(JSON.stringify({
              type: 'output',
              message: '\r\n🤖 Claude対話モードです\r\n質問を入力してください（終了するには "exit"）\r\n\r\n'
            }));
            isClaudeInteractive = true;
          } else {
            // claude コマンドに続けて質問がある場合
            const prompt = command.substring(6).trim(); // "claude " を除く
            executeClaudeWithPrint(prompt, ws);
          }
        } else if (command === 'exit' || command === 'quit') {
          if (isClaudeInteractive) {
            isClaudeInteractive = false;
            ws.send(JSON.stringify({
              type: 'output',
              message: '\r\n👋 Claude対話モードを終了しました\r\n'
            }));
          }
        } else if (isClaudeInteractive) {
          // Claude対話モード中の場合は質問として処理
          executeClaudeWithPrint(command, ws);
        } else {
          // 通常のシェルコマンドを実行
          executeShellCommand(command, ws);
        }
      }
    } catch (error) {
      errorLog('❌ メッセージ解析エラー:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: `エラー: ${error.message}\r\n`
      }));
    }
  });

  ws.on('close', () => {
    debugLog('👋 クライアントが切断しました');
    if (currentProcess) {
      currentProcess.kill();
    }
    if (claudeSession) {
      claudeSession.kill();
    }
  });

  ws.on('error', (error) => {
    errorLog('❌ WebSocketエラー:', error);
  });

  // Claude対話セッションを開始する関数
  function startClaudeSession(command, ws) {
    infoLog('🤖 Claude対話セッション開始:', command);
    
    // 既存のClaudeセッションがあれば終了
    if (claudeSession) {
      claudeSession.kill();
    }
    
    const claudePath = '/opt/homebrew/bin/claude';
    let args = command.split(' ').slice(1); // 'claude' を除く引数
    
    // CLAUDE.mdの内容をプロンプトの先頭に追加
    if (CLAUDE_MD_CONTENT) {
        args = ['--prompt', CLAUDE_MD_CONTENT + '\n' + args.join(' ')];
    } else {
        args = ['--prompt', args.join(' ')];
    }
    debugLog('WebSocket Server: Claudeセッション引数長:', args.join(' ').length, '文字');

    claudeSession = spawn(claudePath, args, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      env: { ...process.env, FORCE_COLOR: '0' }
    });

    isClaudeInteractive = true;

    ws.send(JSON.stringify({
      type: 'output',
      message: '\r\n🤖 Claude対話セッションを開始しました\r\n対話を終了するには "exit" または "quit" と入力してください\r\n\r\n'
    }));

    claudeSession.stdout.on('data', (data) => {
      const output = data.toString();
      debugLog('📤 Claude出力(対話):', output.substring(0, 100) + '...');
      ws.send(JSON.stringify({
        type: 'output',
        message: output
      }));
    });

    // 初期プロンプトを強制的に表示
    setTimeout(() => {
      if (claudeSession && isClaudeInteractive) {
        ws.send(JSON.stringify({
          type: 'output',
          message: 'Claude> '
        }));
      }
    }, 1000);

    claudeSession.stderr.on('data', (data) => {
      const error = data.toString();
      errorLog('❌ Claudeエラー(対話):', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: error
      }));
    });

    claudeSession.on('close', (code) => {
      infoLog(`🔚 Claude対話セッション終了 コード: ${code}`);
      isClaudeInteractive = false;
      claudeSession = null;
      ws.send(JSON.stringify({
        type: 'output',
        message: `\r\n🔚 Claude対話セッションが終了しました\r\n`
      }));
    });

    claudeSession.on('error', (error) => {
      errorLog('❌ Claude対話セッションエラー:', error);
      isClaudeInteractive = false;
      claudeSession = null;
      ws.send(JSON.stringify({
        type: 'error',
        message: `Claude対話セッションエラー: ${error.message}\r\n`
      }));
    });
  }

  // Claude対話セッションに入力を送信する関数
  function sendToClaudeSession(input, ws) {
    if (claudeSession && isClaudeInteractive) {
      debugLog('📝 Claude対話入力:', input.substring(0, 50) + '...');
      claudeSession.stdin.write(input + '\n');
    } else {
      // 対話セッションがない場合は -p オプションで単発実行
      executeClaudeWithPrint(input, ws);
    }
  }

  // Claude Codeを-pオプションで実行する関数
  function executeClaudeWithPrint(prompt, ws) {
    debugLog('🤖 Claude -p 実行:', prompt.substring(0, 50) + '...');
    
    const claudePath = '/opt/homebrew/bin/claude';
    
    // CLAUDE.mdの内容をプロンプトの先頭に追加
    const fullPrompt = CLAUDE_MD_CONTENT ? CLAUDE_MD_CONTENT + '\n' + prompt : prompt;
    // セキュリティ上の理由でCLAUDE.md内容の詳細ログは出力しない
    debugLog('WebSocket Server: Claude実行準備完了, プロンプト長:', fullPrompt.length, '文字');
    const args = ['-p', fullPrompt];
    
    const claudeProcess = spawn(claudePath, args, {
      cwd: process.cwd(),
      stdio: 'pipe',
      shell: false
    });

    ws.send(JSON.stringify({
      type: 'output',
      message: `\r\n💭 Claude に質問中...\r\n`
    }));

    claudeProcess.stdout.on('data', (data) => {
      const output = data.toString();
      debugLog('📤 Claude出力(-p):', output.substring(0, 100) + '...');
      ws.send(JSON.stringify({
        type: 'output',
        message: output
      }));
    });

    claudeProcess.stderr.on('data', (data) => {
      const error = data.toString();
      errorLog('❌ Claudeエラー:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: error
      }));
    });

    claudeProcess.on('close', (code) => {
      infoLog(`🔚 Claude -p プロセス終了 コード: ${code}`);
      ws.send(JSON.stringify({
        type: 'output',
        message: `\r\n✨ 回答完了\r\n`
      }));
    });

    claudeProcess.on('error', (error) => {
      console.error('❌ Claude -p プロセスエラー:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: `Claude実行エラー: ${error.message}\r\n`
      }));
    });
  }

  // Claude対話セッションを停止する関数
  function stopClaudeSession(ws) {
    if (claudeSession) {
      infoLog('🛑 Claude対話セッション停止');
      claudeSession.kill('SIGTERM');
      isClaudeInteractive = false;
      claudeSession = null;
      ws.send(JSON.stringify({
        type: 'output',
        message: '\r\n👋 Claude対話セッションを終了しました\r\n'
      }));
    }
  }

  // Claude Codeコマンドを実行する関数
  function executeClaudeCommand(command, ws) {
    debugLog('🤖 Claude Code実行:', command);
    
    // Claude Codeのパスを設定（実際のインストールパスに合わせて調整）
    const claudePath = '/opt/homebrew/bin/claude'; // Claude Codeの実際のパス
    
    const args = command.split(' ').slice(1); // 'claude' を除く引数
    
    currentProcess = spawn(claudePath, args, {
      cwd: process.cwd(),
      stdio: 'pipe',
      shell: true
    });

    currentProcess.stdout.on('data', (data) => {
      const output = data.toString();
      debugLog('📤 Claude出力(-p):', output.substring(0, 100) + '...');
      ws.send(JSON.stringify({
        type: 'output',
        message: output
      }));
    });

    currentProcess.stderr.on('data', (data) => {
      const error = data.toString();
      errorLog('❌ Claudeエラー:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: error
      }));
    });

    currentProcess.on('close', (code) => {
      infoLog(`🔚 Claudeプロセス終了 コード: ${code}`);
      ws.send(JSON.stringify({
        type: 'output',
        message: `\r\nプロセスが終了しました (コード: ${code})\r\n`
      }));
      currentProcess = null;
    });

    currentProcess.on('error', (error) => {
      console.error('❌ Claudeプロセスエラー:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: `Claude Code実行エラー: ${error.message}\r\n`
      }));
      currentProcess = null;
    });
  }

  // シェルコマンドを実行する関数
  function executeShellCommand(command, ws) {
    debugLog('💻 シェル実行:', command);
    
    currentProcess = spawn(command, {
      cwd: process.cwd(),
      stdio: 'pipe',
      shell: true
    });

    currentProcess.stdout.on('data', (data) => {
      const output = data.toString();
      ws.send(JSON.stringify({
        type: 'output',
        message: output
      }));
    });

    currentProcess.stderr.on('data', (data) => {
      const error = data.toString();
      ws.send(JSON.stringify({
        type: 'error',
        message: error
      }));
    });

    currentProcess.on('close', (code) => {
      ws.send(JSON.stringify({
        type: 'output',
        message: `\r\nプロセスが終了しました (コード: ${code})\r\n`
      }));
      currentProcess = null;
    });

    currentProcess.on('error', (error) => {
      ws.send(JSON.stringify({
        type: 'error',
        message: `コマンド実行エラー: ${error.message}\r\n`
      }));
      currentProcess = null;
    });
  }
});