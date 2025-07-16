#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// プロジェクトパス（環境変数から取得）
const PROJECT_PATH = process.env.KAWAII_PROJECT_PATH || '/Users/nao/Desktop/develop/AI-Kawaii-Project';

class VoiceStopService {
    constructor() {
        this.tempDir = path.join(PROJECT_PATH, 'temp');
        
        console.log('🛑 音声合成停止サービス開始');
        console.log('📁 Temp directory:', this.tempDir);
    }

    // 音声ファイルとnotificationファイルを削除
    cleanupAudioFiles() {
        try {
            if (!fs.existsSync(this.tempDir)) {
                console.log('📁 Tempディレクトリが存在しません');
                return { success: true, filesRemoved: 0 };
            }
            
            const files = fs.readdirSync(this.tempDir);
            const audioFiles = files.filter(f => 
                (f.startsWith('voice_') && f.endsWith('.wav')) ||
                (f.startsWith('notification_') && f.endsWith('.json'))
            );
            
            console.log(`🗑️  削除対象ファイル: ${audioFiles.length}個`);
            
            let removedCount = 0;
            for (const file of audioFiles) {
                const filePath = path.join(this.tempDir, file);
                try {
                    fs.unlinkSync(filePath);
                    console.log(`✅ 削除完了: ${file}`);
                    removedCount++;
                } catch (error) {
                    console.error(`❌ ファイル削除失敗: ${file}`, error.message);
                }
            }
            
            return { success: true, filesRemoved: removedCount };
        } catch (error) {
            console.error('❌ 音声ファイルクリーンアップエラー:', error.message);
            return { success: false, error: error.message };
        }
    }

    // アプリに音声停止信号を送信
    sendStopSignalToApp() {
        try {
            const stopNotificationPath = path.join(this.tempDir, `stop_audio_${Date.now()}.json`);
            const stopData = {
                type: 'stop-audio',
                timestamp: Date.now(),
                message: 'Hook initiated audio stop'
            };
            
            fs.writeFileSync(stopNotificationPath, JSON.stringify(stopData, null, 2));
            console.log('🛑 音声停止信号をアプリに送信:', stopNotificationPath);
            
            return { success: true, notificationPath: stopNotificationPath };
        } catch (error) {
            console.error('❌ 停止信号送信エラー:', error.message);
            return { success: false, error: error.message };
        }
    }

    // 音声合成プロセスの強制停止（PIDベース）
    stopVoiceSynthesisProcesses() {
        try {
            // Node.jsプロセスで音声合成関連を探して停止
            const { execSync } = require('child_process');
            
            // 音声合成関連プロセスを検索
            try {
                const processes = execSync('ps aux | grep voice-synthesis-hook | grep -v grep', { encoding: 'utf8' });
                
                if (processes.trim()) {
                    console.log('🔍 音声合成プロセス発見:');
                    console.log(processes);
                    
                    // プロセスをkill
                    execSync('pkill -f voice-synthesis-hook');
                    console.log('🛑 音声合成プロセスを停止しました');
                } else {
                    console.log('ℹ️  実行中の音声合成プロセスはありません');
                }
            } catch (grepError) {
                // プロセスが見つからない場合（正常）
                console.log('ℹ️  実行中の音声合成プロセスはありません');
            }
            
            return { success: true };
        } catch (error) {
            console.error('❌ プロセス停止エラー:', error.message);
            return { success: false, error: error.message };
        }
    }

    // メイン停止処理
    async executeStop() {
        console.log('🛑 音声合成停止処理開始');
        
        const results = {
            processStop: this.stopVoiceSynthesisProcesses(),
            audioCleanup: this.cleanupAudioFiles(),
            appSignal: this.sendStopSignalToApp()
        };
        
        console.log('\n📊 停止処理結果:');
        console.log('- プロセス停止:', results.processStop.success ? '✅' : '❌');
        console.log('- ファイル削除:', results.audioCleanup.success ? `✅ (${results.audioCleanup.filesRemoved}個)` : '❌');
        console.log('- アプリ通知:', results.appSignal.success ? '✅' : '❌');
        
        const allSuccess = results.processStop.success && 
                          results.audioCleanup.success && 
                          results.appSignal.success;
        
        if (allSuccess) {
            console.log('\n🎉 音声合成停止処理が正常に完了しました');
        } else {
            console.log('\n⚠️  一部の停止処理で問題が発生しました');
        }
        
        return results;
    }
}

// メイン実行
if (require.main === module) {
    const stopService = new VoiceStopService();
    stopService.executeStop().then(() => {
        console.log('🏁 stop-hook-voice-synthesis完了');
        process.exit(0);
    }).catch((error) => {
        console.error('💥 stop-hook-voice-synthesis失敗:', error);
        process.exit(1);
    });
}

module.exports = VoiceStopService;