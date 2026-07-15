/**
 * Chặn `next build` khi dev server (port 3000) đang chạy.
 * Tránh ghi đè .next cache → lỗi MODULE_NOT_FOUND / Internal Server Error.
 */
const { execSync } = require('child_process');

function isPort3000InUse() {
  try {
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano | findstr ":3000" | findstr "LISTENING"', {
        encoding: 'utf8',
      });
      return out.trim().length > 0;
    }
    execSync('lsof -i:3000 -sTCP:LISTEN', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (isPort3000InUse()) {
  console.error(
    '\n❌ Web dev server đang chạy trên port 3000.\n' +
      '   Dừng dev server trước khi build, hoặc dùng: pnpm dev:web:clean\n' +
      '   (Build song song dev gây corrupt .next → Internal Server Error)\n',
  );
  process.exit(1);
}
