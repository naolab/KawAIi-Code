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
  
  // 絶対パスを相対パスに変換 (より汎用的なパターン)
  // 1. href="/_next/ -> href="./_next/
  // 2. src="/_next/ -> src="./_next/
  // 3. JSON内の "/_next/ -> "./_next/
  content = content.replace(/(href|src)="\/_next\//g, '$1="./_next/');
  content = content.replace(/:"\/_next\//g, ':"./_next/');
  content = content.replace(/,"\/_next\//g, ',"./_next/');
  
  // favicon ya svg も同様に
  content = content.replace(/(href|src)="\/(favicon|file\.svg|globe\.svg|next\.svg|vercel\.svg|window\.svg|settings-icon\.svg)/g, '$1="./$2');
  
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