#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 KawAIi Code ビルドスクリプト開始');

// ビルドモード判定
const mode = process.argv[2] || 'build';
const validModes = ['build', 'pack', 'dev-build'];

if (!validModes.includes(mode)) {
  console.error('❌ 無効なビルドモード:', mode);
  console.log('有効なモード:', validModes.join(', '));
  process.exit(1);
}

console.log(`📦 ビルドモード: ${mode}`);

try {
  // Step 1: Next.jsプロジェクトをビルド
  console.log('\n1️⃣ Next.jsプロジェクトビルド中...');
  execSync('cd ai-kawaii-nextjs && npm run build', { stdio: 'inherit' });
  console.log('✅ Next.jsビルド完了');

  // Step 2: 出力ディレクトリの確認
  const outDir = path.join(__dirname, 'ai-kawaii-nextjs', 'out');
  if (!fs.existsSync(outDir)) {
    throw new Error('Next.jsの出力ディレクトリが見つかりません: ' + outDir);
  }
  console.log('✅ 出力ディレクトリ確認完了');

  // Step 3: Electronビルド
  console.log('\n2️⃣ Electronアプリビルド中...');
  
  let electronCommand;
  switch (mode) {
    case 'build':
      electronCommand = 'npx electron-builder';
      break;
    case 'pack':
      electronCommand = 'npx electron-builder --dir';
      break;
    case 'dev-build':
      electronCommand = 'npx electron-builder --dir';
      break;
    default:
      throw new Error('Unknown build mode: ' + mode);
  }

  execSync(electronCommand, { stdio: 'inherit' });
  console.log('✅ Electronビルド完了');

  // Step 4: 完了メッセージ
  console.log('\n🎉 ビルドが正常に完了しました!');
  
  if (mode === 'build') {
    console.log('📁 配布用ファイルは dist/ フォルダに生成されました');
  } else if (mode === 'pack') {
    console.log('📁 パッケージは dist/ フォルダに生成されました');
  }

} catch (error) {
  console.error('\n❌ ビルドエラー:', error.message);
  process.exit(1);
}