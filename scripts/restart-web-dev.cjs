/**
 * Dừng dev server port 3000, xóa .next, khởi động lại next dev.
 * Chạy: node scripts/restart-web-dev.cjs
 */
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const webDir = path.join(__dirname, '../apps/web');
const nextDir = path.join(webDir, '.next');

function killPort3000() {
  try {
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano | findstr ":3000" | findstr "LISTENING"', {
        encoding: 'utf8',
      });
      for (const line of out.trim().split('\n')) {
        const pid = line.trim().split(/\s+/).pop();
        if (pid && /^\d+$/.test(pid)) {
          console.log(`Stopping process on port 3000 (PID ${pid})...`);
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        }
      }
    } else {
      execSync('lsof -ti:3000 | xargs kill -9 2>/dev/null', { stdio: 'ignore', shell: true });
    }
  } catch {
    /* port free */
  }
}

killPort3000();

// Chờ process giải phóng file lock trên Windows
if (process.platform === 'win32') {
  execSync('powershell -Command "Start-Sleep -Seconds 2"', { stdio: 'ignore' });
}

function removeNextDir(dir, attempts = 5) {
  if (!fs.existsSync(dir)) return;
  for (let i = 0; i < attempts; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      console.log('Removed apps/web/.next cache');
      return;
    } catch (err) {
      if (i === attempts - 1) throw err;
      if (process.platform === 'win32') {
        execSync('powershell -Command "Start-Sleep -Milliseconds 800"', { stdio: 'ignore' });
      }
    }
  }
}

removeNextDir(nextDir);

console.log('Starting Next.js dev server on http://localhost:3000 ...');

const child = spawn('pnpm', ['exec', 'next', 'dev', '--port', '3000'], {
  cwd: webDir,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => process.exit(code ?? 0));
