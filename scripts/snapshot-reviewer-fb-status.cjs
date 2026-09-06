/** Post-disconnect reviewer status snapshot (no secrets). */
import { readFileSync } from 'fs';
import { join } from 'path';

const env: Record<string, string> = {};
for (const line of readFileSync(join(__dirname, '../.env'), 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#') || !t.includes('=')) continue;
  const i = t.indexOf('=');
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
const API = (env.API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');

async function main() {
  const login = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: env.META_REVIEWER_EMAIL,
      password: env.META_REVIEWER_PASSWORD,
    }),
  });
  const lj = await login.json();
  const token = lj.accessToken || lj.access_token;
  if (!token) {
    console.log(JSON.stringify({ error: 'login_failed', status: login.status }));
    return;
  }
  const status = await fetch(`${API}/api/v1/auto-post/facebook/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const sj = await status.json();
  const pages = await fetch(`${API}/api/v1/auto-post/facebook/oauth/pages`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const pj = await pages.json();
  console.log(
    JSON.stringify(
      {
        status_http: status.status,
        connected: sj.connected,
        page_count: (sj.pages || []).length,
        oauth_pages_status: pj.status,
        oauth_pages_count: (pj.pages || []).length,
      },
      null,
      2,
    ),
  );
}

main();
