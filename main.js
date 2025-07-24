const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const pty = require('node-pty');
const { spawn } = require('child_process');
const VoiceService = require('./src/voiceService');
const appConfig = require('./src/appConfig');
const AIConfigService = require('./src/services/ai-config-service');
const ConversationLoggerMain = require('./src/services/ConversationLoggerMain');
// ログレベル制御（配布版では詳細ログを無効化）
// 開発時は環境変数またはfalseで開発モードに切り替え
const isProduction = process.env.NODE_ENV === 'production' || false; // 開発時はfalse
const debugLog = isProduction ? () => {} : console.log;
const infoLog = isProduction ? () => {} : console.log; // 配布版では無効化
const errorLog = console.error; // エラーは常に出力

// サービス初期化
const aiConfigService = new AIConfigService();
const conversationLogger = new ConversationLoggerMain();


let mainWindow;
let terminalProcess; // 既存の単一ターミナル（後方互換性のため残す）
let terminalProcesses = {}; // 複数タブ用PTYプロセス管理
let voiceService;
let nextjsProcess;
let websocketProcess; // WebSocketサーバープロセスを追加
// Add a global variable to store the current working directory for Claude Code
let claudeWorkingDir; // 初期化はapp.whenReady()内で行う


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

  // デベロッパーツールを無効化（開発時も非表示）
  // if (!isProduction) {
  //   mainWindow.webContents.openDevTools();
  // }
  
  // Next.jsアプリのコンソールログをメインプロセスに転送（開発環境のみ）
  if (!isProduction) {
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      console.log(`[NextJS Console] ${message}`);
    });
  }
  
  // メニューバーを設定（開発・配布版共通）
  const { Menu } = require('electron');
  const template = [];
  
  // macOS用のアプリメニュー
  if (process.platform === 'darwin') {
    template.push({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideothers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }
  
  // 編集メニュー（コピー・ペースト等）
  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectall' }
    ]
  });
  
  // 表示メニュー
  template.push({
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { type: 'separator' },
      { role: 'resetzoom' },
      { role: 'zoomin' },
      { role: 'zoomout' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  });
  
  // 開発環境のみデバッグメニューを追加
  if (!isProduction) {
    template.push({
      label: 'Debug',
      submenu: [
        {
          label: 'Toggle DevTools',
          accelerator: 'F12',
          click: () => {
            mainWindow.webContents.toggleDevTools();
          }
        }
      ]
    });
  }
  
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  
  // 配布版でのDevTools無効化処理は維持
  if (isProduction) {
    
    // DevToolsの無効化
    mainWindow.webContents.on('before-input-event', (event, input) => {
      // F12、Cmd+Option+I、Ctrl+Shift+Iを無効化
      if (input.key === 'F12' || 
          (input.meta && input.alt && input.key === 'i') || 
          (input.control && input.shift && input.key === 'I')) {
        event.preventDefault();
      }
    });
    
    // 配布版でも右クリックメニューは有効にする（ユーザビリティ向上）
  }
  
  // 右クリックメニュー（コンテキストメニュー）の設定
  mainWindow.webContents.on('context-menu', (event, params) => {
    const { selectionText, isEditable } = params;
    const menuItems = [];
    
    // テキストが選択されている場合
    if (selectionText && selectionText.trim() !== '') {
      menuItems.push(
        { role: 'copy' }
      );
    }
    
    // 編集可能な要素の場合
    if (isEditable) {
      menuItems.push(
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' },
        { role: 'selectall' }
      );
    } else if (selectionText) {
      // 編集不可だが選択されている場合
      menuItems.push(
        { role: 'copy' },
        { type: 'separator' },
        { role: 'selectall' }
      );
    } else {
      // 何も選択されていない場合
      menuItems.push(
        { role: 'selectall' }
      );
    }
    
    // メニューが空でない場合のみ表示
    if (menuItems.length > 0) {
      const contextMenu = Menu.buildFromTemplate(menuItems);
      contextMenu.popup({ window: mainWindow });
    }
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

  // DevTools for debugging
  // mainWindow.webContents.openDevTools();

  // Initialize voice service
  voiceService = new VoiceService();
}

// GPU process crash workaround - must be called before app is ready
// app.disableHardwareAcceleration(); // VRM表示のため一時的に有効化

// Start Next.js server before creating window
async function startNextjsServer() {
  return new Promise(async (resolve, reject) => {
    infoLog('Next.jsサーバーを起動中...');

    // CLAUDE.mdは各プロセスが直接読み込むため、ここでの読み込みは不要
    
    const nextjsPath = path.join(__dirname, 'ai-kawaii-nextjs');
    const websocketPath = path.join(nextjsPath, 'websocket-server.js');

    // WebSocketサーバーを起動
    websocketProcess = spawn('node', [websocketPath], {
      cwd: nextjsPath, // websocket-server.jsのあるディレクトリで実行
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { 
        ...process.env
      }
    });
    
    // WebSocketサーバーが起動するまで待機
    await new Promise((resolve) => {
      setTimeout(() => {
        infoLog('WebSocketサーバー起動待機完了');
        resolve();
      }, 5000); // 5秒待機に延長
    });

    websocketProcess.stdout.on('data', (data) => {
      debugLog('WebSocket:', data.toString().trim());
    });

    websocketProcess.stderr.on('data', (data) => {
      console.error('WebSocket stderr:', data.toString().trim());
    });

    websocketProcess.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });

    websocketProcess.on('close', (code) => {
      infoLog(`WebSocketサーバーが終了: コード ${code}`);
      websocketProcess = null;
    });

    const envForNextjs = {
      ...process.env,
      PORT: '3002'
    };
    infoLog('Next.jsサーバーをポート3002で起動');

    nextjsProcess = spawn('npm', ['run', 'dev'], {
      cwd: nextjsPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: envForNextjs
    });

    nextjsProcess.stdout.on('data', (data) => {
      const output = data.toString();
      debugLog('Next.js:', output);
      
      // Check if server is ready
      if (output.includes('Ready in') || output.includes('ready started server')) {
        infoLog('Next.jsサーバーが準備完了!');
        resolve();
      }
    });

    nextjsProcess.stderr.on('data', (data) => {
      debugLog('Next.js stderr:', data.toString());
    });

    nextjsProcess.on('error', (error) => {
      console.error('Next.js server error:', error);
      reject(error);
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      infoLog('Next.jsサーバー準備完了 (タイムアウト)');
      resolve();
    }, 30000);
  });
}

app.whenReady().then(async () => {
  // 設定を先に読み込む
  await appConfig.loadConfig();
  claudeWorkingDir = appConfig.getClaudeWorkingDir();
  
  // 作業ディレクトリをプロセスのcwdに設定
  try {
    process.chdir(claudeWorkingDir);
    infoLog(`作業ディレクトリを設定: ${claudeWorkingDir}`);
  } catch (error) {
    errorLog('作業ディレクトリ設定失敗:', error);
    // フォールバック: ホームディレクトリを使用
    claudeWorkingDir = os.homedir();
    process.chdir(claudeWorkingDir);
    infoLog(`フォールバック作業ディレクトリを設定: ${claudeWorkingDir}`);
  }

  await startNextjsServer();

  // ConversationLoggerの初期化
  await conversationLogger.initialize();

  createWindow();
  
  // Hook通知監視開始
  startHookNotificationWatcher();
});

// 共通のクリーンアップ処理
let isCleanupExecuted = false;
async function performCleanup() {
  if (isCleanupExecuted) {
    debugLog('クリーンアップは既に実行済み');
    return;
  }
  
  isCleanupExecuted = true;
  debugLog('アプリ終了時のクリーンアップを開始');
  
  // Hook通知監視停止
  stopHookNotificationWatcher();
  
  // ConversationLoggerの終了処理
  if (conversationLogger) {
    await conversationLogger.close();
  }
  
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
  
  debugLog('アプリ終了時のクリーンアップ完了');
}

// before-quit: Dockアイコン長押し→終了、Cmd+Q で発火
app.on('before-quit', async (event) => {
  debugLog('before-quit イベント発火');
  event.preventDefault(); // 一旦終了を阻止
  
  await performCleanup();
  
  // クリーンアップ完了後に実際に終了
  app.exit(0);
});

// window-all-closed: ×ボタンで閉じる で発火
app.on('window-all-closed', async () => {
  debugLog('window-all-closed イベント発火');
  
  await performCleanup();
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// will-quit: アプリが終了する直前に発火（フォールバック）
app.on('will-quit', async (event) => {
  debugLog('will-quit イベント発火');
  if (!isCleanupExecuted) {
    event.preventDefault(); // 一旦終了を阻止
    
    await performCleanup();
    
    // クリーンアップ完了後に実際に終了
    app.exit(0);
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Claude Code process management
ipcMain.handle('terminal-start', async (event, aiType) => {
  infoLog(`AIアシスタントの起動リクエストを受信: ${aiType}`);

  const selectedAI = aiConfigService.getConfig(aiType);
  if (!selectedAI) {
    const error = new Error(`無効なAIタイプが指定されました: ${aiType}`);
    errorLog('Invalid AI type specified:', aiType);
    dialog.showErrorBox('設定エラー', '指定されたAIタイプが見つかりません');
    return { success: false, error: error.message };
  }

  infoLog(`${selectedAI.name} の実行パスを探索中...`);
  let commandPath = '';
  for (const testPath of selectedAI.possiblePaths) {
    try {
      fs.accessSync(testPath, fs.constants.F_OK);
      commandPath = testPath;
      infoLog(`実行可能ファイルを発見: ${commandPath}`);
      break;
    } catch (error) {
      debugLog(`パスが見つかりません: ${testPath}`);
    }
  }

  if (!commandPath) {
    const error = new Error(`${selectedAI.name} の実行可能ファイルが見つかりませんでした`);
    const userMessage = `${selectedAI.name} の実行可能ファイルが見つかりませんでした。

以下の点を確認してください:
- ${selectedAI.name} はインストールされていますか？
- 環境変数PATHは正しく設定されていますか？
- (必要であれば) CLAUDE_PATH 環境変数を設定してください。`;
    
    errorLog('AI executable not found:', { aiType, possiblePaths: selectedAI.possiblePaths });
    dialog.showErrorBox('起動失敗', userMessage);
    return { success: false, error: error.message };
  }

  if (terminalProcess) {
    debugLog('既存のターミナルプロセスを終了中...');
    terminalProcess.kill();
  }

  try {
    infoLog(`${selectedAI.name}をPTYで起動します...`);
    debugLog('実行パス:', commandPath);
    debugLog('作業ディレクトリ:', claudeWorkingDir);
    
    const spawnArgs = selectedAI.arguments || [];
    terminalProcess = pty.spawn(commandPath, spawnArgs, {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: claudeWorkingDir,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'
      }
    });

    infoLog(`${selectedAI.name}起動完了, PID:`, terminalProcess.pid);

    terminalProcess.onData((data) => {
      debugLog(`PTY data from ${selectedAI.name}:`, data);
      if (mainWindow) {
        mainWindow.webContents.send('terminal-data', data);
      }
    });

    terminalProcess.onExit(({ exitCode, signal }) => {
      infoLog(`${selectedAI.name}終了:`, { exitCode, signal });
      if (mainWindow) {
        mainWindow.webContents.send('terminal-exit', exitCode);
      }
      terminalProcess = null;
    });

    return { success: true };
  } catch (error) {
    errorLog(`Failed to start ${selectedAI.name}:`, error);
    dialog.showErrorBox('起動失敗', `プロセスの起動中にエラーが発生しました。

エラー内容: ${error.message}`);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('terminal-write', (event, data) => {
  if (terminalProcess) {
    try {
      debugLog('Claude Codeに書き込み:', data);
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
      infoLog('Claude Codeを停止中...');
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
      debugLog('ディレクトリ選択がキャンセルされました。');
      return { success: true, path: null }; // キャンセルされたことを通知
    } else {
      const newCwd = filePaths[0];
      claudeWorkingDir = newCwd; // グローバル変数を更新
      await appConfig.set('claudeWorkingDir', newCwd);
      infoLog('Claude Code 作業ディレクトリが設定されました:', newCwd);
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
    // 既に初期化済みのappConfigから取得（重複読み込み回避）
    const savedDir = appConfig.config.claudeWorkingDir;
    if (savedDir) {
      debugLog('Claude working directory from appConfig:', savedDir);
      return { success: true, cwd: savedDir };
    }
    
    // デフォルトはホームディレクトリ
    const defaultCwd = os.homedir();
    debugLog('Claude working directory using default:', defaultCwd);
    return { success: true, cwd: defaultCwd };
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
    // 感情データを取得するためparseTerminalOutputを使用
    const parsedResult = voiceService.parseTerminalOutput(text);
    let emotionData = null;
    
    if (parsedResult && parsedResult.emotion) {
      emotionData = parsedResult.emotion;
      debugLog('😊 アプリ内監視モード感情データ取得:', emotionData);
    }
    
    const result = await voiceService.speakText(text, speaker);
    if (result.success) {
      // ArrayBufferをBufferに変換してからレンダラープロセスに送信
      const buffer = Buffer.from(result.audioData);
      mainWindow.webContents.send('play-audio', { audioData: buffer, text: text });
      
      // 感情データがある場合はレンダラープロセスに送信
      if (emotionData) {
        mainWindow.webContents.send('emotion-data', emotionData);
        debugLog('😊 アプリ内監視モード感情データ送信完了:', emotionData);
      }
      
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

ipcMain.handle('voice-get-emotion', async (event, text) => {
  if (!voiceService) {
    return { success: false, error: 'Voice service not initialized' };
  }
  
  try {
    // Hook処理と同じ感情データ抽出
    const parsedResult = voiceService.parseTerminalOutput(text);
    if (parsedResult && parsedResult.emotion) {
      debugLog('😊 感情データ抽出完了:', parsedResult.emotion);
      return { success: true, emotion: parsedResult.emotion };
    } else {
      return { success: true, emotion: null };
    }
  } catch (error) {
    console.error('Voice emotion extraction error:', error);
    return { success: false, error: error.message };
  }
});

// 会話ログ読み込み機能（内部システム）
ipcMain.handle('load-conversation-log', async (event, count = 20) => {
  try {
    debugLog('Internal conversation log loading:', { count });
    
    // 内部ConversationLoggerを使用してログを取得
    const result = await conversationLogger.getLogs(count, 0);
    
    if (result.success) {
      debugLog(`Internal log loading success: ${result.logs.length} logs`);
      return {
        success: true,
        logs: result.logs,
        count: result.count,
        total: result.total
      };
    } else {
      debugLog('Internal log loading failed:', result.error);
      return {
        success: false,
        error: result.error || 'ログの読み込みに失敗しました',
        logs: []
      };
    }
    
  } catch (error) {
    console.error('Internal conversation log loading error:', error);
    return { 
      success: false, 
      error: error.message,
      logs: []
    };
  }
});

// ログ保存機能（内部システム）
ipcMain.handle('save-conversation-log', async (event, text, sessionId = null) => {
  try {
    debugLog('Internal conversation log saving:', { text: text.substring(0, 50) + '...', sessionId });
    
    // 内部ConversationLoggerを使用してログを保存
    const result = await conversationLogger.saveLog(text, sessionId);
    
    if (result.success) {
      debugLog(`Internal log saving success: ${result.logId}`);
    } else {
      debugLog('Internal log saving failed:', result.error);
    }
    
    return result;
    
  } catch (error) {
    console.error('Internal conversation log saving error:', error);
    return { 
      success: false, 
      error: error.message
    };
  }
});

// ログ統計情報取得機能（内部システム）
ipcMain.handle('get-conversation-log-stats', async () => {
  try {
    const result = conversationLogger.getStats();
    debugLog('Internal log stats retrieved:', result.stats);
    return result;
  } catch (error) {
    console.error('Internal conversation log stats error:', error);
    return { 
      success: false, 
      error: error.message,
      stats: null
    };
  }
});

// ログクリア機能（内部システム）
ipcMain.handle('clear-conversation-log', async () => {
  try {
    debugLog('Internal conversation log clearing requested');
    
    const result = await conversationLogger.clearLogs();
    
    if (result.success) {
      debugLog('Internal log clearing success');
    } else {
      debugLog('Internal log clearing failed:', result.error);
    }
    
    return result;
    
  } catch (error) {
    console.error('Internal conversation log clearing error:', error);
    return { 
      success: false, 
      error: error.message
    };
  }
});

// 感情データの転送用IPCハンドラー
ipcMain.on('emotion-data', (event, emotionData) => {
  debugLog('😊 感情データを受信:', emotionData);
  if (mainWindow) {
    // Next.jsアプリに感情データを送信
    mainWindow.webContents.send('emotion-data', emotionData);
    debugLog('😊 感情データをNext.jsアプリに転送完了');
  }
});

// Hook通知の直接受信用IPCハンドラー（ファイルベース通知の代替）
ipcMain.on('hook-notification', (event, notification) => {
  
  if (notification.type === 'voice-synthesis-hook' && notification.filepath) {
    try {
      // 音声ファイルが存在することを確認
      if (fs.existsSync(notification.filepath)) {
        // 音声ファイルを読み込んでレンダラープロセスに送信
        const audioData = fs.readFileSync(notification.filepath);
        if (mainWindow) {
          mainWindow.webContents.send('hook-audio-play', {
            audioData: audioData,
            filepath: notification.filepath,
            text: notification.text,
            emotion: notification.emotion
          });
          
          // テキスト表示機能
          if (notification.showInChat && notification.text) {
            mainWindow.webContents.send('show-hook-conversation', {
              text: notification.text,
              character: notification.character || 'shy',
              timestamp: notification.timestamp
            });
          }
        }
      } else {
        errorLog('❌ Hook音声ファイルが見つかりません:', notification.filepath);
      }
    } catch (error) {
      errorLog('❌ Hook音声処理エラー:', error);
    }
  }
  
  if (notification.type === 'stop-audio') {
    debugLog('🛑 音声停止通知をIPCで受信');
    if (mainWindow) {
      mainWindow.webContents.send('hook-audio-stop');
    }
  }
});

// Hook通知監視機能
let hookNotificationWatcher = null;

function startHookNotificationWatcher() {
  const tempDir = path.join(__dirname, 'temp');
  
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  // 通知ファイルの監視
  hookNotificationWatcher = fs.watch(tempDir, (eventType, filename) => {
    if (eventType === 'rename' && filename && filename.startsWith('notification_') && filename.endsWith('.json')) {
      const notificationPath = path.join(tempDir, filename);
      
      // ファイルが存在することを確認
      if (fs.existsSync(notificationPath)) {
        try {
          const notification = JSON.parse(fs.readFileSync(notificationPath, 'utf8'));
          
          if (notification.type === 'voice-synthesis-hook' && notification.filepath) {
            // 音声ファイルが存在することを確認
            if (fs.existsSync(notification.filepath)) {
              // 音声ファイルを読み込んでレンダラープロセスに送信
              const audioData = fs.readFileSync(notification.filepath);
              if (mainWindow) {
                mainWindow.webContents.send('play-audio', audioData);
                
                // テキスト表示機能
                if (notification.showInChat && notification.text) {
                  mainWindow.webContents.send('show-hook-conversation', {
                    text: notification.text,
                    character: notification.character || 'shy',
                    timestamp: notification.timestamp
                  });
                }
              }
              
              // 音声ファイルを削除（再生完了後）
              setTimeout(() => {
                if (fs.existsSync(notification.filepath)) {
                  fs.unlinkSync(notification.filepath);
                }
              }, 10000); // 10秒後に削除
            }
          }
          
          // 通知ファイルを削除
          fs.unlinkSync(notificationPath);
        } catch (error) {
          console.error('Hook通知処理エラー:', error);
        }
      }
    }
  });
  
}

function stopHookNotificationWatcher() {
  if (hookNotificationWatcher) {
    hookNotificationWatcher.close();
    hookNotificationWatcher = null;
  }
}

// VRM file loading handler
ipcMain.handle('load-vrm-file', async (event, filename) => {
  try {
    const vrmPath = path.join(__dirname, filename);
    debugLog('VRMファイル読み込み中:', vrmPath);
    
    if (!fs.existsSync(vrmPath)) {
      throw new Error(`VRM file not found: ${vrmPath}`);
    }
    
    const vrmData = fs.readFileSync(vrmPath);
    debugLog('VRMファイル読み込み完了, サイズ:', vrmData.length, 'bytes');
    
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
    const wallpaperDir = path.join(app.getPath('userData'), 'wallpapers', 'user');
    
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
    const wallpaperDir = path.join(app.getPath('userData'), 'wallpapers', 'user');
    
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
    
    infoLog('壁紙アップロード完了:', filename);
    
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
    const wallpaperPath = path.join(app.getPath('userData'), 'wallpapers', 'user', filename);
    
    if (fs.existsSync(wallpaperPath)) {
      fs.unlinkSync(wallpaperPath);
      infoLog('壁紙削除完了:', filename);
      return { success: true };
    } else {
      return { success: false, error: 'ファイルが見つかりません' };
    }
  } catch (error) {
    console.error('壁紙削除エラー:', error);
    return { success: false, error: error.message };
  }
});

// ★ 新しいIPCハンドラ: ユーザーデータディレクトリのパスを取得
ipcMain.handle('get-user-data-path', () => {
  try {
    return { success: true, path: app.getPath('userData') };
  } catch (error) {
    console.error('ユーザーデータパスの取得に失敗しました:', error);
    return { success: false, error: error.message };
  }
});

// 統一設定管理システムのIPCハンドラー
ipcMain.handle('get-app-config', async () => {
  try {
    // 既に初期化済みのappConfigを返す（重複読み込み回避）
    return appConfig.config;
  } catch (error) {
    errorLog('get-app-config error:', error);
    return {};
  }
});

ipcMain.handle('set-app-config', async (event, key, value) => {
  try {
    await appConfig.set(key, value);
    debugLog('App config set:', { key, value });
    
    // claudeWorkingDirの場合は既存のappConfigにも同期
    if (key === 'claudeWorkingDir') {
      try {
        await appConfig.set('claudeWorkingDir', value);
        debugLog('Synced claudeWorkingDir to appConfig:', value);
      } catch (syncError) {
        debugLog('Failed to sync to appConfig:', syncError.message);
      }
    }
    
    return { success: true };
  } catch (error) {
    errorLog('set-app-config error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('remove-app-config', async (event, key) => {
  try {
    delete appConfig.config[key];
    await appConfig.saveConfig();
    debugLog('App config removed:', { key });
    return { success: true };
  } catch (error) {
    errorLog('remove-app-config error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('clear-app-config', async () => {
  try {
    appConfig.config = appConfig.getDefaultConfig();
    await appConfig.saveConfig();
    debugLog('App config cleared');
    return { success: true };
  } catch (error) {
    errorLog('clear-app-config error:', error);
    return { success: false, error: error.message };
  }
});

// Cloud API関連のIPCハンドラー
ipcMain.handle('get-cloud-api-key', async () => {
  try {
    const apiKey = appConfig.getCloudApiKey();
    return apiKey;
  } catch (error) {
    errorLog('get-cloud-api-key error:', error);
    return '';
  }
});

ipcMain.handle('set-cloud-api-key', async (event, apiKey) => {
  try {
    await appConfig.setCloudApiKey(apiKey);
    debugLog('Cloud API key set');
    return { success: true };
  } catch (error) {
    errorLog('set-cloud-api-key error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-use-cloud-api', async (event, useCloudAPI) => {
  try {
    await appConfig.set('useCloudAPI', useCloudAPI);
    debugLog('useCloudAPI set:', useCloudAPI);
    return { success: true };
  } catch (error) {
    errorLog('set-use-cloud-api error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-use-cloud-api', async (event) => {
  try {
    const useCloudAPI = appConfig.get('useCloudAPI', false);
    debugLog('useCloudAPI get:', useCloudAPI);
    return useCloudAPI;
  } catch (error) {
    errorLog('get-use-cloud-api error:', error);
    return false;
  }
});

// ===== タブ機能用IPCハンドラー =====

// AI設定処理はAIConfigServiceに統一

// タブ作成
ipcMain.handle('tab-create', async (event, tabId, aiType) => {
  try {
    infoLog(`タブ作成リクエスト: ${tabId}, AI: ${aiType}`);
    
    const aiConfig = aiConfigService.getConfig(aiType);
    if (!aiConfig) {
      return { success: false, error: `無効なAIタイプ: ${aiType}` };
    }
    
    let commandPath;
    try {
      commandPath = await aiConfigService.findExecutablePath(aiType);
    } catch (error) {
      return { success: false, error: error.message };
    }
    
    // 既存のプロセスがある場合は終了
    if (terminalProcesses[tabId]) {
      terminalProcesses[tabId].kill();
      delete terminalProcesses[tabId];
    }
    
    // 新しいPTYプロセス作成
    const spawnArgs = aiConfig.arguments || [];
    terminalProcesses[tabId] = pty.spawn(commandPath, spawnArgs, {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: claudeWorkingDir,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'
      }
    });
    
    infoLog(`タブ ${tabId} でプロセス起動完了, PID: ${terminalProcesses[tabId].pid}`);
    
    // データハンドラー設定
    terminalProcesses[tabId].onData((data) => {
      debugLog(`Tab ${tabId} data:`, data);
      if (mainWindow) {
        mainWindow.webContents.send('tab-data', tabId, data);
      }
    });
    
    // 終了ハンドラー設定
    terminalProcesses[tabId].onExit(({ exitCode, signal }) => {
      infoLog(`Tab ${tabId} プロセス終了:`, { exitCode, signal });
      if (mainWindow) {
        mainWindow.webContents.send('tab-exit', tabId, exitCode);
      }
      delete terminalProcesses[tabId];
    });
    
    return { success: true };
  } catch (error) {
    errorLog(`Tab ${tabId} 作成エラー:`, error);
    return { success: false, error: error.message };
  }
});

// タブ削除
ipcMain.handle('tab-delete', async (event, tabId) => {
  try {
    infoLog(`タブ削除リクエスト: ${tabId}`);
    
    if (terminalProcesses[tabId]) {
      terminalProcesses[tabId].kill();
      delete terminalProcesses[tabId];
      infoLog(`Tab ${tabId} プロセス終了完了`);
    }
    
    return { success: true };
  } catch (error) {
    errorLog(`Tab ${tabId} 削除エラー:`, error);
    return { success: false, error: error.message };
  }
});

// タブ書き込み
ipcMain.handle('tab-write', (event, tabId, data) => {
  try {
    if (terminalProcesses[tabId]) {
      debugLog(`Tab ${tabId} 書き込み:`, data);
      terminalProcesses[tabId].write(data);
      return { success: true };
    }
    return { success: false, error: `Tab ${tabId} が見つかりません` };
  } catch (error) {
    errorLog(`Tab ${tabId} 書き込みエラー:`, error);
    return { success: false, error: error.message };
  }
});

// タブリサイズ
ipcMain.handle('tab-resize', (event, tabId, cols, rows) => {
  try {
    if (terminalProcesses[tabId]) {
      terminalProcesses[tabId].resize(cols, rows);
      debugLog(`Tab ${tabId} リサイズ: ${cols}x${rows}`);
      return { success: true };
    }
    return { success: true }; // タブが存在しない場合もエラーにしない
  } catch (error) {
    errorLog(`Tab ${tabId} リサイズエラー:`, error);
    return { success: false, error: error.message };
  }
});

// 親タブ設定（音声読み上げ制御用）
let currentParentTabId = null;
ipcMain.handle('set-parent-tab', (event, tabId) => {
  try {
    currentParentTabId = tabId;
    infoLog(`親タブ設定: ${tabId}`);
    return { success: true };
  } catch (error) {
    errorLog('親タブ設定エラー:', error);
    return { success: false, error: error.message };
  }
});

// ===== 既存のIPCハンドラー =====

// ★ 新しいIPCハンドラ: 音声認識ストリームの開始
