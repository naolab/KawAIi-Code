#!/usr/bin/env node

const crypto = require('crypto');

// APIキー復号化関数
function decryptApiKey(encryptedKey) {
    if (!encryptedKey) return '';
    try {
        const algorithm = 'aes-256-cbc';
        const key = crypto.createHash('sha256').update('kawaii-voice-app').digest();
        const iv = Buffer.alloc(16, 0);
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encryptedKey, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error('APIキー復号化エラー:', error.message);
        return '';
    }
}

// 設定ファイルから暗号化されたAPIキーを読み込み
const fs = require('fs');
const path = require('path');
const os = require('os');

const configPath = path.join(os.homedir(), '.kawaii-code-config', 'config.json');

async function testCloudAPI() {
    try {
        // 設定ファイル読み込み
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const apiKey = decryptApiKey(config.aivisCloudApiKey);
        
        if (!apiKey) {
            console.log('❌ APIキーが設定されていません');
            return;
        }
        
        console.log('🔑 APIキー確認: ' + apiKey.substring(0, 15) + '...');
        
        const apiUrl = 'https://api.aivis-project.com/v1';
        
        // 1. 基本的な認証テスト（適当なエンドポイント）
        console.log('\\n📡 認証テスト中...');
        
        const testResponse = await fetch(`${apiUrl}/speakers`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('ステータス:', testResponse.status);
        console.log('ステータステキスト:', testResponse.statusText);
        
        if (testResponse.status === 401) {
            console.log('❌ 認証失敗: APIキーが無効です');
        } else if (testResponse.status === 404) {
            console.log('⚠️  エンドポイントが見つかりません（正常なAPIキーの可能性）');
        } else if (testResponse.ok) {
            console.log('✅ 認証成功');
            const data = await testResponse.text();
            console.log('レスポンス:', data.substring(0, 200) + '...');
        } else {
            console.log('❓ 予期しないレスポンス');
            const errorText = await testResponse.text();
            console.log('エラー:', errorText);
        }
        
        // 2. TTS合成テスト（修正版パラメータ）
        console.log('\\n🎵 TTS合成テスト中...');
        
        const ttsPayload = {
            model_uuid: 'a59cb814-0083-4369-8542-f51a29e72af7',
            text: 'テストです',
            use_ssml: false,
            output_format: 'mp3',           // リアルタイム用に最適化
            output_sampling_rate: 44100,    // 標準品質
            output_audio_channels: 'mono',
            speaking_rate: 1.0,             // 正しいパラメータ名に修正
            volume: 1.0,                    // 標準音量に修正
            emotional_intensity: 1.0,       // 感情表現の強さ
            tempo_dynamics: 1.0             // 抑揚の制御
        };
        
        const ttsResponse = await fetch(`${apiUrl}/tts/synthesize`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(ttsPayload)
        });
        
        console.log('TTS ステータス:', ttsResponse.status);
        
        if (ttsResponse.ok) {
            console.log('✅ TTS合成成功');
            const audioData = await ttsResponse.arrayBuffer();
            console.log('音声データサイズ:', audioData.byteLength, 'バイト');
        } else {
            console.log('❌ TTS合成失敗');
            const errorText = await ttsResponse.text();
            console.log('エラー:', errorText);
        }
        
    } catch (error) {
        console.error('❌ テスト実行エラー:', error.message);
    }
}

// テスト実行
testCloudAPI();