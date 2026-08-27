'use strict';
/**
 * Socket.IO Redis adapter check: two clients must both receive a Redis-published event.
 * Never prints tokens.
 */
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const API = (process.env.LOAD_API || 'http://127.0.0.1:4000').replace(/\/$/, '');

function login() {
  const email = process.env.META_REVIEWER_EMAIL;
  const password = process.env.META_REVIEWER_PASSWORD;
  if (!email || !password) throw new Error('META_REVIEWER_EMAIL/PASSWORD missing');
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ email, password });
    const u = new URL(API + '/api/v1/auth/login');
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port || 80,
        path: u.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => {
          raw += c;
        });
        res.on('end', () => {
          try {
            const json = JSON.parse(raw);
            const token = json.accessToken || json.access_token || json.tokens?.accessToken;
            const orgId = json.user?.organizationId;
            if (!token || !orgId) reject(new Error(`login_failed status=${res.statusCode}`));
            else resolve({ token, orgId });
          } catch {
            reject(new Error('login_parse_failed'));
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const { io } = require(require.resolve('socket.io-client', { paths: [path.join(ROOT, 'apps/web')] }));
  const Redis = require(require.resolve('ioredis', { paths: [path.join(ROOT, 'apps/api')] }));
  const { token, orgId } = await login();
  const marker = `scale-${Date.now()}`;
  const hits = [];

  function connect() {
    return new Promise((resolve, reject) => {
      const s = io(`${API}/events`, {
        transports: ['websocket', 'polling'],
        auth: { token },
        timeout: 8000,
      });
      const t = setTimeout(() => reject(new Error('socket_connect_timeout')), 8000);
      s.on('connect', () => {
        clearTimeout(t);
        resolve(s);
      });
      s.on('connect_error', (e) => {
        clearTimeout(t);
        reject(e);
      });
      s.on('lead:new', (payload) => {
        if (payload && payload.leadId === marker) hits.push(s.id);
      });
    });
  }

  const a = await connect();
  const b = await connect();
  const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', { maxRetriesPerRequest: 1 });
  await redis.publish(
    'marketingspa:realtime:events',
    JSON.stringify({
      organizationId: orgId,
      event: 'lead:new',
      payload: { leadId: marker, name: 'scale', pipelineStatus: 'NEW' },
    }),
  );
  await new Promise((r) => setTimeout(r, 1500));
  a.disconnect();
  b.disconnect();
  await redis.quit();
  const unique = new Set(hits).size;
  const ok = unique >= 2;
  console.log(JSON.stringify({ ok, clients: 2, received: unique, adapterHint: ok ? 'redis-or-single-fanout' : 'miss' }));
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(String(e.message || e));
  process.exit(1);
});
