// 音声ファイルクリーンアップの統一実装
const fs = require('fs');
const path = require('path');

// ログレベル制御
const isNode = typeof window === 'undefined';
const debugLog = isNode ? console.log : (msg => console.log(`[AudioCleanup] ${msg}`));
const errorLog = isNode ? console.error : (msg => console.error(`[AudioCleanup] ${msg}`));

class AudioFileCleanup {
    constructor(tempDir) {
        this.tempDir = tempDir || path.join(__dirname, '..', '..', 'temp');
    }

    // 全ファイル削除（起動時やリセット時に使用）
    cleanupAllFiles() {
        try {
            if (!fs.existsSync(this.tempDir)) {
                debugLog('📁 Tempディレクトリが存在しません');
                return { success: true, filesRemoved: 0, mode: 'all' };
            }
            
            const files = fs.readdirSync(this.tempDir);
            const targetFiles = files.filter(f => 
                (f.startsWith('voice_') && f.endsWith('.wav')) ||
                (f.startsWith('notification_') && f.endsWith('.json')) ||
                (f.startsWith('stop_audio_') && f.endsWith('.json'))
            );
            
            if (targetFiles.length === 0) {
                debugLog('🗑️ 削除対象ファイルなし');
                return { success: true, filesRemoved: 0, mode: 'all' };
            }
            
            debugLog(`🗑️ 削除対象ファイル: ${targetFiles.length}個`);
            
            let removedCount = 0;
            const errors = [];
            
            for (const file of targetFiles) {
                const filePath = path.join(this.tempDir, file);
                try {
                    fs.unlinkSync(filePath);
                    debugLog(`✅ 削除完了: ${file}`);
                    removedCount++;
                } catch (error) {
                    const errorMsg = `❌ ファイル削除失敗: ${file} - ${error.message}`;
                    errorLog(errorMsg);
                    errors.push(errorMsg);
                }
            }
            
            return { 
                success: errors.length === 0, 
                filesRemoved: removedCount,
                errors: errors,
                mode: 'all'
            };
        } catch (error) {
            errorLog('❌ 音声ファイルクリーンアップエラー:', error.message);
            return { success: false, error: error.message, mode: 'all' };
        }
    }

    // 最新N件を残して削除（実行中のクリーンアップに使用）
    cleanupOldFiles(keepCount = 1) {
        try {
            if (!fs.existsSync(this.tempDir)) {
                return { success: true, filesRemoved: 0, mode: 'keep-latest' };
            }
            
            const files = fs.readdirSync(this.tempDir);
            const voiceFiles = files.filter(f => f.startsWith('voice_') && f.endsWith('.wav'));
            const notificationFiles = files.filter(f => f.startsWith('notification_') && f.endsWith('.json'));
            
            let removedCount = 0;
            const errors = [];
            
            // 音声ファイルのクリーンアップ
            if (voiceFiles.length > keepCount) {
                const sortedVoiceFiles = voiceFiles.sort();
                const filesToDelete = sortedVoiceFiles.slice(0, -keepCount);
                
                for (const file of filesToDelete) {
                    const filePath = path.join(this.tempDir, file);
                    try {
                        fs.unlinkSync(filePath);
                        debugLog(`🗑️ 古い音声ファイル削除: ${file}`);
                        removedCount++;
                    } catch (error) {
                        const errorMsg = `ファイル削除失敗: ${file} - ${error.message}`;
                        errorLog(errorMsg);
                        errors.push(errorMsg);
                    }
                }
            }
            
            // 通知ファイルのクリーンアップ
            if (notificationFiles.length > keepCount) {
                const sortedNotificationFiles = notificationFiles.sort();
                const filesToDelete = sortedNotificationFiles.slice(0, -keepCount);
                
                for (const file of filesToDelete) {
                    const filePath = path.join(this.tempDir, file);
                    try {
                        fs.unlinkSync(filePath);
                        debugLog(`🗑️ 古い通知ファイル削除: ${file}`);
                        removedCount++;
                    } catch (error) {
                        const errorMsg = `ファイル削除失敗: ${file} - ${error.message}`;
                        errorLog(errorMsg);
                        errors.push(errorMsg);
                    }
                }
            }
            
            return { 
                success: errors.length === 0, 
                filesRemoved: removedCount,
                errors: errors,
                mode: 'keep-latest',
                keepCount: keepCount
            };
        } catch (error) {
            errorLog('古いファイル削除エラー:', error.message);
            return { success: false, error: error.message, mode: 'keep-latest' };
        }
    }

    // 特定パターンのファイルのみ削除
    cleanupByPattern(patterns) {
        try {
            if (!fs.existsSync(this.tempDir)) {
                return { success: true, filesRemoved: 0, mode: 'pattern' };
            }
            
            const files = fs.readdirSync(this.tempDir);
            let removedCount = 0;
            const errors = [];
            
            for (const pattern of patterns) {
                const targetFiles = files.filter(f => {
                    if (pattern instanceof RegExp) {
                        return pattern.test(f);
                    } else {
                        return f.includes(pattern);
                    }
                });
                
                for (const file of targetFiles) {
                    const filePath = path.join(this.tempDir, file);
                    try {
                        fs.unlinkSync(filePath);
                        debugLog(`🗑️ パターン削除: ${file}`);
                        removedCount++;
                    } catch (error) {
                        const errorMsg = `ファイル削除失敗: ${file} - ${error.message}`;
                        errorLog(errorMsg);
                        errors.push(errorMsg);
                    }
                }
            }
            
            return { 
                success: errors.length === 0, 
                filesRemoved: removedCount,
                errors: errors,
                mode: 'pattern',
                patterns: patterns
            };
        } catch (error) {
            errorLog('パターンベース削除エラー:', error.message);
            return { success: false, error: error.message, mode: 'pattern' };
        }
    }

    // ディレクトリ情報を取得
    getDirectoryInfo() {
        try {
            if (!fs.existsSync(this.tempDir)) {
                return { exists: false, fileCount: 0, totalSize: 0, files: [] };
            }
            
            const files = fs.readdirSync(this.tempDir);
            const fileInfo = [];
            let totalSize = 0;
            
            for (const file of files) {
                const filePath = path.join(this.tempDir, file);
                try {
                    const stats = fs.statSync(filePath);
                    fileInfo.push({
                        name: file,
                        size: stats.size,
                        modified: stats.mtime,
                        type: this.getFileType(file)
                    });
                    totalSize += stats.size;
                } catch (error) {
                    // ファイル情報取得失敗は無視
                }
            }
            
            return {
                exists: true,
                fileCount: fileInfo.length,
                totalSize: totalSize,
                files: fileInfo
            };
        } catch (error) {
            errorLog('ディレクトリ情報取得エラー:', error.message);
            return { exists: false, error: error.message };
        }
    }

    // ファイルタイプを判定
    getFileType(filename) {
        if (filename.startsWith('voice_') && filename.endsWith('.wav')) {
            return 'voice';
        } else if (filename.startsWith('notification_') && filename.endsWith('.json')) {
            return 'notification';
        } else if (filename.startsWith('stop_audio_') && filename.endsWith('.json')) {
            return 'stop-signal';
        } else {
            return 'unknown';
        }
    }
}

// エクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioFileCleanup;
} else {
    window.AudioFileCleanup = AudioFileCleanup;
}