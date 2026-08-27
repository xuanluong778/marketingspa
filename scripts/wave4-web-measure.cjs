/**
 * WAVE4 first-load JS measure — localhost only.
 * Usage: node scripts/wave4-web-measure.cjs [path]
 */
const http = require('http');

const origin = process.env.WEB_ORIGIN || 'http://127.0.0.1:3002';
const pagePath = process.argv[2] || '/login';

function get(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 8000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }),
      );
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

async function headLen(url) {
  const r = await get(url);
  const n = Number(r.headers['content-length'] || r.body.length || 0);
  return n;
}

(async () => {
  const t0 = Date.now();
  const page = await get(origin + pagePath);
  const htmlMs = Date.now() - t0;
  const html = page.body.toString('utf8');
  const scripts = [...html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1]);
  const css = [...html.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g)].map((m) => m[1]);
  let jsBytes = 0;
  for (const p of scripts) jsBytes += await headLen(origin + p);
  const summary = {
    path: pagePath,
    status: page.status,
    htmlMs,
    jsFiles: scripts.length,
    cssFiles: css.length,
    jsBytes,
    jsKB: Math.round(jsBytes / 102.4) / 10,
  };
  console.log(JSON.stringify(summary));
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
