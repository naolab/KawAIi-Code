const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const pty = require('node-pty');
const { spawn } = require('child_process');
const VoiceService = require('./src/voiceService');
const appConfig = require('./src/appConfig');
const { SpeechClient } = require('@google-cloud/speech');

let mainWindow;
let terminalProcess;
let voiceService;
let nextjsProcess;
let websocketProcess; // WebSocketサーバープロセスを追加
let claudeMdContent = ''; // この変数はもはや必要ありませんが、削除すると依存関係エラーになる可能性があるので、一旦空で残しておきます

// Add a global variable to store the current working directory for Claude Code
let claudeWorkingDir = appConfig.get('claudeWorkingDir', os.homedir()); // デフォルトはホームディレクトリ

// CLAUDE.mdの絶対パスを定義
const CLAUDE_MD_PATH = path.join(app.getAppPath(), 'CLAUDE.md');

// Google Cloud Speechクライアントの初期化
// 認証情報ファイルを設定するか、GCPの環境変数に設定してください。
process.env.GOOGLE_APPLICATION_CREDENTIALS = require('path').join(__dirname, 'decoded-shadow-459505-b5-6b7baaa9f326.json');
const speechClient = new SpeechClient();

// Google Cloud Speech関連の変数
let recognizeStream = null; // 認識ストリーム
let isRecognitionActive = false; // 認識がアクティブかどうか

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'src', 'preload.js'),
      webSecurity: false
    },
    titleBarStyle: 'hiddenInset',
    show: false
  });

  mainWindow.loadFile('src/index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // レンダラープロセスにCLAUDE.mdのパスを送信
    mainWindow.webContents.send('claude-md-path', CLAUDE_MD_PATH);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (terminalProcess) {
      terminalProcess.kill();
    }
    if (nextjsProcess) {
      nextjsProcess.kill();
      nextjsProcess = null;
    }
  });

  // DevTools for debugging (commented out for production)
  // mainWindow.webContents.openDevTools();

  // Initialize voice service
  voiceService = new VoiceService();
}

// GPU process crash workaround - must be called before app is ready
// app.disableHardwareAcceleration(); // VRM表示のため一時的に有効化

// Start Next.js server before creating window
async function startNextjsServer() {
  return new Promise(async (resolve, reject) => {
    console.log('Starting Next.js server...');

    // CLAUDE.mdの内容を読み込む処理は、Claude Codeが直接ファイルを読み込むため不要になります
    // ここでclaudeMdContentを読み込む必要はありません。
    
    const nextjsPath = path.join(__dirname, 'ai-kawaii-nextjs');
    const websocketPath = path.join(nextjsPath, 'websocket-server.js');

    // WebSocketサーバーを起動
    websocketProcess = spawn('node', [websocketPath], {
      cwd: nextjsPath, // websocket-server.jsのあるディレクトリで実行
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { 
        ...process.env,
        CLAUDE_MD_CONTENT: claudeMdContent // CLAUDE.mdの内容を渡す
      }
    });

    websocketProcess.stdout.on('data', (data) => {
      console.log('WebSocket:', data.toString().trim());
    });

    websocketProcess.stderr.on('data', (data) => {
      console.error('WebSocket stderr:', data.toString().trim());
    });

    websocketProcess.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });

    websocketProcess.on('close', (code) => {
      console.log(`WebSocket server exited with code ${code}`);
      websocketProcess = null;
    });

    const envForNextjs = {
      ...process.env,
      PORT: '3002',
      CLAUDE_MD_CONTENT: claudeMdContent 
    };
    console.log('Starting Next.js with env:', envForNextjs.CLAUDE_MD_CONTENT ? 'CLAUDE_MD_CONTENT loaded' : 'CLAUDE_MD_CONTENT empty/undefined');

    nextjsProcess = spawn('npm', ['run', 'dev'], {
      cwd: nextjsPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: envForNextjs
    });

    nextjsProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('Next.js:', output);
      
      // Check if server is ready
      if (output.includes('Ready in') || output.includes('ready started server')) {
        console.log('Next.js server is ready!');
        resolve();
      }
    });

    nextjsProcess.stderr.on('data', (data) => {
      console.log('Next.js stderr:', data.toString());
    });

    nextjsProcess.on('error', (error) => {
      console.error('Next.js server error:', error);
      reject(error);
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      console.log('Next.js server ready (timeout)');
      resolve();
    }, 30000);
  });
}

app.whenReady().then(async () => {
  await startNextjsServer();
  createWindow();
});

app.on('window-all-closed', () => {
  // Kill Next.js server when app closes
  if (nextjsProcess) {
    nextjsProcess.kill();
    nextjsProcess = null;
  }
  
  // WebSocketサーバーも終了
  if (websocketProcess) {
    websocketProcess.kill();
    websocketProcess = null;
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Claude Code process management
ipcMain.handle('terminal-start', async () => {
  console.log('Starting Claude Code process...');
  
  // Claude Codeのパスを取得
  const claudePath = process.env.CLAUDE_PATH || 'claude'; // 環境変数CLAUDE_PATHがあればそれを使用、なければ'claude'を使用

  if (!claudePath) {
    const errorMsg = 'Claude Codeのパスが設定されていません。CLAUDE_PATH環境変数を設定するか、パスの通った場所にClaude Codeをインストールしてください。';
    console.error(errorMsg);
    return { success: false, error: errorMsg };
  }

  if (terminalProcess) {
    console.log('Killing existing process...');
    terminalProcess.kill();
  }

  try {
    // Start Claude Code with proper PTY for full terminal support
    console.log('Starting Claude Code with PTY...');
    console.log('Claude Code CWD:', claudeWorkingDir);

    const sourceClaudeMdPath = path.join(app.getAppPath(), 'CLAUDE.md');
    const destClaudeMdPath = path.join(claudeWorkingDir, 'CLAUDE.md');

    try {
      // CLAUDE.mdをClaude Codeの作業ディレクトリにコピー
      await fs.promises.copyFile(sourceClaudeMdPath, destClaudeMdPath);
      console.log(`main.js: CLAUDE.md copied from ${sourceClaudeMdPath} to ${destClaudeMdPath}`);
    } catch (copyError) {
      console.error('main.js: Failed to copy CLAUDE.md:', copyError);
      // コピーに失敗しても続行できるようにします
    }
    
    terminalProcess = pty.spawn(claudePath, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: claudeWorkingDir, // ★ ユーザーが設定した作業ディレクトリを使用
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor'
      }
    });

    console.log('Claude Code started with PTY, PID:', terminalProcess.pid);

    terminalProcess.onData((data) => {
      console.log('Claude PTY data:', data);
      if (mainWindow) {
        mainWindow.webContents.send('terminal-data', data);
        
        // 音声処理はレンダラープロセス側に一元化するため、この処理をコメントアウト
        // Process for voice synthesis if enabled - 条件を緩和
        // if (voiceService) {
        //   const textToSpeak = voiceService.parseTerminalOutput(data);
        //   if (textToSpeak) {
        //     console.log('Voice synthesis approved for:', JSON.stringify(textToSpeak.substring(0, 50) + '...'));
        //     mainWindow.webContents.send('voice-text-available', textToSpeak);
        //   }
        // }
      }
    });

    terminalProcess.onExit(({ exitCode, signal }) => {
      console.log('Claude Code exited:', { exitCode, signal });
      if (mainWindow) {
        mainWindow.webContents.send('terminal-exit', exitCode);
      }
      terminalProcess = null;
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to start Claude Code:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('terminal-write', (event, data) => {
  if (terminalProcess) {
    try {
      console.log('Writing to Claude Code:', data);
      terminalProcess.write(data);
      return { success: true };
    } catch (error) {
      console.error('Error writing to Claude Code:', error);
      return { success: false, error: `Write error: ${error.message}` };
    }
  }
  return { success: false, error: 'Claude Code not started' };
});

ipcMain.handle('terminal-resize', (event, cols, rows) => {
  if (terminalProcess) {
    try {
      terminalProcess.resize(cols, rows);
      return { success: true };
    } catch (error) {
      console.error('Error resizing terminal:', error);
      return { success: false, error: error.message };
    }
  }
  return { success: true };
});

ipcMain.handle('terminal-stop', () => {
  if (terminalProcess) {
    try {
      console.log('Stopping Claude Code...');
      terminalProcess.kill();
      terminalProcess = null;
      return { success: true };
    } catch (error) {
      console.error('Error stopping Claude Code:', error);
      terminalProcess = null;
      return { success: true, warning: `Stop error: ${error.message}` };
    }
  }
  return { success: false, error: 'Claude Code not running' };
});

// ★ 新しいIPCハンドラ: 作業ディレクトリ選択ダイアログを開く
ipcMain.handle('open-directory-dialog', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Claude Codeの作業ディレクトリを選択',
      defaultPath: appConfig.get('claudeWorkingDir', os.homedir()), // 現在の設定をデフォルトパスにする
    });

    if (canceled) {
      console.log('ディレクトリ選択がキャンセルされました。');
      return { success: true, path: null }; // キャンセルされたことを通知
    } else {
      const newCwd = filePaths[0];
      claudeWorkingDir = newCwd; // グローバル変数を更新
      await appConfig.set('claudeWorkingDir', newCwd);
      console.log('Claude Code 作業ディレクトリが設定されました:', newCwd);
      return { success: true, path: newCwd };
    }
  } catch (error) {
    console.error('ディレクトリ選択ダイアログの表示または設定に失敗しました:', error);
    return { success: false, error: error.message };
  }
});

// ★ 新しいIPCハンドラ: 現在の作業ディレクトリの取得
ipcMain.handle('get-claude-cwd', async () => {
  try {
    const currentCwd = appConfig.get('claudeWorkingDir', os.homedir()); // デフォルトはホームディレクトリ
    return { success: true, cwd: currentCwd };
  } catch (error) {
    console.error('Claude Code 作業ディレクトリの取得に失敗しました:', error);
    return { success: false, error: error.message };
  }
});

// Voice synthesis handlers
ipcMain.handle('voice-check-connection', async () => {
  if (!voiceService) {
    return { success: false, error: 'Voice service not initialized' };
  }
  
  try {
    const result = await voiceService.checkConnection();
    return result;
  } catch (error) {
    console.error('Voice connection check error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('voice-get-speakers', async () => {
  if (!voiceService) {
    return { success: false, error: 'Voice service not initialized' };
  }
  
  try {
    const speakers = await voiceService.getSpeakers();
    return { success: true, speakers };
  } catch (error) {
    console.error('Voice get speakers error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('voice-synthesize', async (event, text, speaker) => {
  if (!voiceService) {
    return { success: false, error: 'Voice service not initialized' };
  }
  
  try {
    const audioData = await voiceService.synthesizeText(text, speaker);
    return { success: true, audioData };
  } catch (error) {
    console.error('Voice synthesis error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('voice-speak', async (event, text, speaker) => {
  if (!voiceService) {
    return { success: false, error: 'Voice service not initialized' };
  }
  
  try {
    const result = await voiceService.speakText(text, speaker);
    if (result.success) {
      // ArrayBufferをBufferに変換してからレンダラープロセスに送信
      const buffer = Buffer.from(result.audioData);
      mainWindow.webContents.send('play-audio', buffer);
      return { success: true };
    } else {
      return { success: false, error: 'Failed to synthesize' };
    }
  } catch (error) {
    console.error('Voice speak error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('voice-stop', () => {
  if (mainWindow) {
    mainWindow.webContents.send('stop-audio');
    return { success: true };
  }
  return { success: false, error: 'Main window not available' };
});

// VRM file loading handler
ipcMain.handle('load-vrm-file', async (event, filename) => {
  try {
    const vrmPath = path.join(__dirname, filename);
    console.log('Loading VRM file from:', vrmPath);
    
    if (!fs.existsSync(vrmPath)) {
      throw new Error(`VRM file not found: ${vrmPath}`);
    }
    
    const vrmData = fs.readFileSync(vrmPath);
    console.log('VRM file loaded, size:', vrmData.length, 'bytes');
    
    return { 
      success: true, 
      data: Array.from(vrmData), // Convert Buffer to Array for IPC
      filename: filename 
    };
  } catch (error) {
    console.error('Error loading VRM file:', error);
    return { success: false, error: error.message };
  }
});

// 壁紙システムのハンドラー
ipcMain.handle('wallpaper-get-list', async () => {
  try {
    const wallpaperDir = path.join(__dirname, 'src', 'assets', 'wallpapers', 'user');
    
    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync(wallpaperDir)) {
      fs.mkdirSync(wallpaperDir, { recursive: true });
    }
    
    const files = fs.readdirSync(wallpaperDir);
    const wallpapers = files
      .filter(file => /\.(png|jpg|jpeg|gif|webp)$/i.test(file))
      .map(file => ({
        filename: file,
        name: file.replace(/\.[^/.]+$/, ''), // 拡張子を除去
        size: fs.statSync(path.join(wallpaperDir, file)).size
      }));
    
    return { success: true, wallpapers };
  } catch (error) {
    console.error('壁紙リスト取得エラー:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('wallpaper-upload', async (event, fileData) => {
  try {
    const wallpaperDir = path.join(__dirname, 'src', 'assets', 'wallpapers', 'user');
    
    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync(wallpaperDir)) {
      fs.mkdirSync(wallpaperDir, { recursive: true });
    }
    
    // ファイル名を生成（タイムスタンプ付き）
    const timestamp = Date.now();
    const originalName = fileData.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${timestamp}_${originalName}`;
    const filePath = path.join(wallpaperDir, filename);
    
    // ファイルを保存
    const buffer = Buffer.from(fileData.data);
    fs.writeFileSync(filePath, buffer);
    
    console.log('壁紙アップロード完了:', filename);
    
    return { 
      success: true, 
      filename: filename,
      name: originalName.replace(/\.[^/.]+$/, '')
    };
  } catch (error) {
    console.error('壁紙アップロードエラー:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('wallpaper-delete', async (event, filename) => {
  try {
    const wallpaperPath = path.join(__dirname, 'src', 'assets', 'wallpapers', 'user', filename);
    
    if (fs.existsSync(wallpaperPath)) {
      fs.unlinkSync(wallpaperPath);
      console.log('壁紙削除完了:', filename);
      return { success: true };
    } else {
      return { success: false, error: 'ファイルが見つかりません' };
    }
  } catch (error) {
    console.error('壁紙削除エラー:', error);
    return { success: false, error: error.message };
  }
});

// ★ 新しいIPCハンドラ: 音声認識ストリームの開始
ipcMain.handle('start-speech-recognition-stream', async () => {
  if (isRecognitionActive) {
    console.log('Speech recognition stream is already active.');
    return { success: true, message: 'Already active' };
  }

  try {
    const request = {
      config: {
        encoding: 'WEBM_OPUS', // WEBM_OPUSに変更
        sampleRateHertz: 48000, 
        languageCode: 'ja-JP',
      },
      interimResults: true,
    };

    recognizeStream = speechClient.streamingRecognize(request)
      .on('error', (error) => {
        console.error('Google Speech API stream error:', error);
        // エラーをレンダラープロセスに送信
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('speech-recognition-error', error.message);
        }
        isRecognitionActive = false;
        recognizeStream = null;
      })
      .on('data', (data) => {
        const result = data.results[0];
        if (result) {
          const transcript = result.alternatives[0].transcript;
          const isFinal = result.isFinal;
          console.log(`Speech Recognition Result: "${transcript}" (Final: ${isFinal})`);
          mainWindow.webContents.send('speech-recognition-result', { result: transcript, isFinal });
        }
      })
      .on('end', () => {
        console.log('Google Speech API stream ended.');
        isRecognitionActive = false;
        recognizeStream = null;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('speech-recognition-end');
        }
      });

    isRecognitionActive = true;
    console.log('Speech recognition stream started.');
    return { success: true };
  } catch (error) {
    console.error('Failed to start speech recognition stream:', error);
    return { success: false, error: error.message };
  }
});

// ★ 新しいIPCハンドラ: 音声チャンクの送信
ipcMain.handle('send-audio-chunk', (event, audioChunk) => {
  if (recognizeStream && isRecognitionActive) {
    if (audioChunk && audioChunk.length > 0) {
      // 受信した音声チャンクのサイズをログ出力
      console.log(`Received audio chunk size: ${audioChunk.length}`);
      recognizeStream.write(Buffer.from(audioChunk));
    } else {
      console.warn('Received empty audio chunk.');
    }
  }
});

// ★ 新しいIPCハンドラ: 音声認識ストリームの停止
ipcMain.handle('stop-speech-recognition-stream', async () => {
  if (recognizeStream) {
    recognizeStream.end(); // ストリームを終了
    recognizeStream = null;
  }
  isRecognitionActive = false;
  console.log('Speech recognition stream stopped.');
  return { success: true };
});