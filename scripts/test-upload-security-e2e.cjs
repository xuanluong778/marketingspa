'use strict';
/**
 * Live upload security regression (HRM, KB, Email, Content, Work, Chatbot).
 * Never prints tokens. Malicious names/MIME must not 500.
 */
const http = require('http');

const API = (process.env.LOAD_API || 'http://127.0.0.1:4000').replace(/\/$/, '');
const results = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
}

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
            if (!token) reject(new Error(`login_failed status=${res.statusCode}`));
            else resolve(token);
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

function multipart(fields, file) {
  const boundary = '----maaz' + Date.now();
  const chunks = [];
  for (const [k, v] of Object.entries(fields || {})) {
    chunks.push(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`);
  }
  chunks.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\nContent-Type: ${file.type}\r\n\r\n`,
  );
  const head = Buffer.from(chunks.join(''));
  const mid = Buffer.isBuffer(file.body) ? file.body : Buffer.from(file.body);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { body: Buffer.concat([head, mid, tail]), type: `multipart/form-data; boundary=${boundary}` };
}

function post(path, token, payload) {
  return new Promise((resolve) => {
    const u = new URL(API + path);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port || 80,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': payload.type,
          'Content-Length': payload.body.length,
        },
        timeout: 20000,
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode || 0));
      },
    );
    req.on('error', () => resolve(0));
    req.on('timeout', () => {
      req.destroy();
      resolve(0);
    });
    req.write(payload.body);
    req.end();
  });
}

const FAKE_UUID = '00000000-0000-4000-8000-000000000001';

const ROUTES = [
  { name: 'HRM_DOC', path: `/api/v1/hrm/employees/${FAKE_UUID}/documents/upload` },
  { name: 'HRM_LEAVE', path: '/api/v1/hrm/leave-requests' },
  { name: 'KB', path: `/api/v1/rag-kb/${FAKE_UUID}/import/file` },
  { name: 'EMAIL', path: '/api/v1/email-marketing/contacts/import-file' },
  { name: 'CONTENT', path: '/api/v1/content-marketing/facebook-policy/analyze-media' },
  { name: 'WORK', path: `/api/v1/work-management/projects/${FAKE_UUID}/documents` },
  { name: 'CHATBOT', path: '/api/v1/chatbot-cskh/knowledge/diagram' },
];

function okHandled(code) {
  return code === 400 || code === 401 || code === 403 || code === 404 || code === 201 || code === 200 || code === 422;
}

async function main() {
  const token = await login();
  const evil = multipart({}, {
    field: 'file',
    filename: '../../etc/passwd.exe',
    type: 'application/x-msdownload',
    body: 'MZ',
  });
  const csv = multipart({}, {
    field: 'file',
    filename: 'ok.csv',
    type: 'text/csv',
    body: 'email,name\nloadtest@example.invalid,T\n',
  });
  const png = multipart({}, {
    field: 'file',
    filename: 'ok.png',
    type: 'image/png',
    body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  });

  for (const r of ROUTES) {
    const evilCode = await post(r.path, token, evil);
    const passEvil = evilCode !== 500 && evilCode !== 0;
    record(`${r.name}_EVIL`, passEvil, `status=${evilCode}`);
    const goodPayload = r.name === 'EMAIL' || r.name === 'KB' ? csv : png;
    const goodCode = await post(r.path, token, goodPayload);
    const passGood = okHandled(goodCode) && goodCode !== 500;
    record(`${r.name}_VALID`, passGood, `status=${goodCode}`);
  }

  const failed = results.filter((x) => !x.pass).length;
  console.log(failed === 0 ? 'ALL_PASS' : `FAILED_${failed}`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(String(e.message || e));
  process.exit(1);
});
