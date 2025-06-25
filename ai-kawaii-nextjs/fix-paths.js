#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Next.js 15の出力ファイルで絶対パスを相対パスに変換するスクリプト
 * Electronで正しく読み込めるようにする
 */

const outDir = path.join(__dirname, 'out');

function fixHtmlFile(filePath) {
  console.log(`Fixing paths in: ${filePath}`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // 絶対パスを相対パスに変換
  content = content.replace(/href="\/_next\//g, 'href="./_next/');
  content = content.replace(/src="\/_next\//g, 'src="./_next/');
  content = content.replace(/href="\/favicon/g, 'href="./favicon');
  content = content.replace(/src="\/file\.svg"/g, 'src="./file.svg"');
  content = content.replace(/src="\/globe\.svg"/g, 'src="./globe.svg"');
  content = content.replace(/src="\/next\.svg"/g, 'src="./next.svg"');
  content = content.replace(/src="\/vercel\.svg"/g, 'src="./vercel.svg"');
  content = content.replace(/src="\/window\.svg"/g, 'src="./window.svg"');
  content = content.replace(/src="\/settings-icon\.svg"/g, 'src="./settings-icon.svg"');
  
  fs.writeFileSync(filePath, content);
  console.log(`Fixed: ${filePath}`);
}

function walkDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      walkDirectory(filePath);
    } else if (file.endsWith('.html')) {
      fixHtmlFile(filePath);
    }
  }
}

console.log('Starting path fix for Electron compatibility...');
walkDirectory(outDir);
console.log('Path fix completed!');