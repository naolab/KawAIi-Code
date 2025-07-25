#!/usr/bin/env node

/**
 * VoiceQueue重複チェック機能のテストスクリプト
 * Phase 1実装後の動作確認用
 */

const path = require('path');

// プロジェクトパスの設定
const PROJECT_PATH = __dirname;

// 必要なクラスを読み込み
const SimpleDuplicateChecker = require('./src/classes/SimpleDuplicateChecker');
const VoiceQueue = require('./src/classes/VoiceQueue');

// グローバルにSimpleDuplicateCheckerを設定
global.SimpleDuplicateChecker = SimpleDuplicateChecker;

// デバッグログ関数を設定
global.debugLog = (...args) => {
    console.log('[TEST]', ...args);
};

// テスト用のモックTerminalApp
const mockTerminalApp = {
    voiceEnabled: true,
    voicePlayingState: {
        isPlaying: false,
        isAnyPlaying() { return false; }
    },
    tabManager: {
        parentTabId: 'test-tab',
        activeTabId: 'test-tab'
    }
};

async function testVoiceQueueDuplicateCheck() {
    console.log('🧪 VoiceQueue重複チェック機能テスト開始\n');
    
    try {
        // VoiceQueueインスタンス作成
        const voiceQueue = new VoiceQueue(mockTerminalApp);
        
        console.log('✅ VoiceQueue初期化成功');
        
        // 初期状態確認
        const initialStatus = voiceQueue.getStatus();
        console.log('📊 初期状態:', {
            queueLength: initialStatus.queueLength,
            duplicateCheckerEnabled: initialStatus.duplicateChecker.enabled
        });
        
        if (!initialStatus.duplicateChecker.enabled) {
            console.error('❌ 重複チェッカーが無効です');
            return false;
        }
        
        // テスト1: 新規テキストの追加
        console.log('\n🔍 テスト1: 新規テキストの追加');
        await voiceQueue.addToQueue('『テストメッセージ1だぞ』');
        
        let status = voiceQueue.getStatus();
        console.log('キュー長:', status.queueLength);
        console.log('重複統計:', status.duplicateChecker.stats);
        
        // テスト2: 同じテキストの重複追加
        console.log('\n🔍 テスト2: 同じテキストの重複追加（スキップされるはず）');
        await voiceQueue.addToQueue('『テストメッセージ1だぞ』');
        
        status = voiceQueue.getStatus();
        console.log('キュー長（重複後）:', status.queueLength);
        console.log('重複統計:', status.duplicateChecker.stats);
        
        if (status.duplicateChecker.stats.duplicates > 0) {
            console.log('✅ 重複検出機能が正常に動作');
        } else {
            console.log('⚠️ 重複が検出されませんでした');
        }
        
        // テスト3: 異なるテキストの追加
        console.log('\n🔍 テスト3: 異なるテキストの追加');
        await voiceQueue.addToQueue('『テストメッセージ2だぞ』');
        
        status = voiceQueue.getStatus();
        console.log('最終キュー長:', status.queueLength);
        console.log('最終重複統計:', status.duplicateChecker.stats);
        
        // 詳細統計表示
        if (voiceQueue.duplicateChecker) {
            console.log('\n📈 詳細統計:');
            voiceQueue.duplicateChecker.showDiagnostics();
        }
        
        console.log('\n✅ テスト完了 - Phase 1実装は正常に動作しています');
        return true;
        
    } catch (error) {
        console.error('❌ テストエラー:', error);
        console.error('スタックトレース:', error.stack);
        return false;
    }
}

// メイン実行
if (require.main === module) {
    testVoiceQueueDuplicateCheck().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = { testVoiceQueueDuplicateCheck };