/**
 * WAVE5 viewport overflow audit — localhost only.
 * Usage: node scripts/with-root-env.cjs node scripts/wave5-viewport-audit.cjs
 *
 * Does not print credentials. Requires Playwright Chromium.
 */
const { chromium } = require('/tmp/wave5-playwright/node_modules/playwright');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const WEB = process.env.WEB_ORIGIN || 'http://127.0.0.1:3002';
const API = (process.env.API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
const VIEWPORTS = [360, 390, 768, 1024, 1440];
const ROUTES = [
  '/overview',
  '/crm',
  '/leads',
  '/ads',
  '/messaging',
  '/messages',
  '/sales',
  '/sales/orders',
  '/hrm',
  '/hrm/attendance',
  '/funnel',
];

function postJson(urlStr, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const data = JSON.stringify(body);
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        timeout: 8000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function loginToken() {
  const email = process.env.META_REVIEWER_EMAIL;
  const password = process.env.META_REVIEWER_PASSWORD;
  if (!email || !password) throw new Error('META_REVIEWER_EMAIL/PASSWORD missing');
  const r = await postJson(`${API}/api/v1/auth/login`, { email, password });
  const token = r.json?.accessToken || r.json?.data?.accessToken;
  if (!token) throw new Error(`login failed status=${r.status}`);
  return token;
}

async function main() {
  const token = await loginToken();
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const rows = [];
  try {
    for (const width of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width, height: width < 768 ? 800 : 900 } });
      await page.addInitScript((t) => {
        localStorage.setItem('ms_access_token', t);
      }, token);
      for (const route of ROUTES) {
        await page.goto(`${WEB}${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(700);
        const m = await page.evaluate(() => {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const scrollable = (el) =>
            el.closest('[class*="overflow-x"], [class*="overflow-auto"], [class*="overflow-scroll"]');
          let maxRight = 0;
          let offender = null;
          const all = document.querySelectorAll('body *');
          for (const el of all) {
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) continue;
            if (r.right > vw + 2 && r.left < vw) {
              if (scrollable(el)) continue;
              if (r.right > maxRight) {
                maxRight = r.right;
                const cls = (el.className && String(el.className).slice(0, 80)) || '';
                offender = el.tagName.toLowerCase() + (cls ? '.' + cls.replace(/\s+/g, '.') : '');
              }
            }
          }
          const header = document.querySelector('header');
          const headerOverflow = header ? header.scrollWidth > header.clientWidth + 2 : false;
          const smallTargets = [...document.querySelectorAll('header button, header a')].filter((el) => {
            const b = el.getBoundingClientRect();
            return b.width > 0 && b.height > 0 && (b.width < 40 || b.height < 40);
          }).length;
          return {
            vw,
            vh,
            docScrollWidth: document.documentElement.scrollWidth,
            overflowPx: Math.max(0, Math.round(maxRight - vw)),
            offender,
            headerOverflow,
            smallHeaderTargets: smallTargets,
          };
        });
        const fail = m.overflowPx > 8 || m.headerOverflow;
        rows.push({ width, route, fail, ...m });
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const failed = rows.filter((r) => r.fail);
  const byWidth = {};
  for (const w of VIEWPORTS) {
    const subset = rows.filter((r) => r.width === w);
    byWidth[w] = {
      routes: subset.length,
      fails: subset.filter((r) => r.fail).length,
    };
  }
  const summary = {
    failed: failed.length,
    total: rows.length,
    byWidth,
    fails: failed.slice(0, 20),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e.message);
  process.exit(2);
});
