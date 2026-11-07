const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distFile = path.join(rootDir, 'dist', 'index.html');

if (process.argv.includes('--force') || process.argv.includes('-f')) {
  console.log('[Pi-UI] 強制重新打包模式 (--force)');
  process.exit(1);
}

if (!fs.existsSync(distFile)) {
  console.log('[Pi-UI] 尚未建置過專案 (dist 不存在)，準備進行打包...');
  process.exit(1);
}

const distTime = fs.statSync(distFile).mtimeMs;

function findNewerFile(target) {
  if (!fs.existsSync(target)) return null;
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) {
    return stat.mtimeMs > distTime ? target : null;
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const full = path.join(target, entry.name);
    const newer = findNewerFile(full);
    if (newer) return newer;
  }
  return null;
}

const watchPaths = [
  'src',
  'index.html',
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'tailwind.config.js'
];

let changedFile = null;
for (const p of watchPaths) {
  changedFile = findNewerFile(path.join(rootDir, p));
  if (changedFile) break;
}

if (changedFile) {
  const rel = path.relative(rootDir, changedFile);
  console.log(`[Pi-UI] 偵測到檔案變更 (${rel})，需要重新打包...`);
  process.exit(1); // needs build
} else {
  console.log('[Pi-UI] 程式碼無任何變更，跳過打包步驟，直接啟動應用程式！');
  process.exit(0); // up to date
}
