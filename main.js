const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const pty = require('node-pty');
const { spawn } = require('child_process');
const VoiceService = require('./src/voiceService');

let mainWindow;
let terminalProcess;
let voiceService;
let nextjsProcess;

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
  mainWindow.webContents.openDevTools();

  // Initialize voice service
  voiceService = new VoiceService();
}

// GPU process crash workaround - must be called before app is ready
// app.disableHardwareAcceleration(); // VRM表示のため一時的に有効化

// Start Next.js server before creating window
async function startNextjsServer() {
  return new Promise((resolve, reject) => {
    console.log('Starting Next.js server...');
    
    const nextjsPath = path.join(__dirname, 'ai-kawaii-nextjs');
    
    nextjsProcess = spawn('npm', ['run', 'dev'], {
      cwd: nextjsPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PORT: '3002' }
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
ipcMain.handle('terminal-start', () => {
  console.log('Starting Claude Code process...');
  
  if (terminalProcess) {
    console.log('Killing existing process...');
    terminalProcess.kill();
  }

  try {
    // Start Claude Code with proper PTY for full terminal support
    console.log('Starting Claude Code with PTY...');
    
    terminalProcess = pty.spawn('claude', [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
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
        
        // Process for voice synthesis if enabled - simplified
        if (voiceService && data.includes('⏺')) {
          const textToSpeak = voiceService.parseTerminalOutput(data);
          if (textToSpeak && textToSpeak.length > 3) {
            console.log('Voice synthesis approved for:', JSON.stringify(textToSpeak.substring(0, 50) + '...'));
            mainWindow.webContents.send('voice-text-available', textToSpeak);
          }
        }
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