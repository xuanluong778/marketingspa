'use strict';
/**
 * Minimal S3/R2 SigV4 PUT/GET/LIST/DELETE. No AWS CLI required.
 * Never logs keys. Path-style when BACKUP_R2_ENDPOINT is set (R2).
 */
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { URL } = require('url');

function sha256hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}
function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function signingKey(secret, dateStamp, region) {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
}

function amzNow() {
  const iso = new Date().toISOString().replace(/[-:]/g, '');
  const amzDate = iso.replace(/\.\d+Z$/, 'Z');
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

function request({ url, method, headers, body }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? http : https;
    const hdrs = { ...headers };
    if (body && body.length) hdrs['content-length'] = String(body.length);
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || undefined,
        path: `${u.pathname}${u.search}`,
        method,
        headers: hdrs,
        timeout: 60000,
        agent: false,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          resolve({ status: res.statusCode || 0, body: buf, headers: res.headers });
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('s3_timeout'));
    });
    if (body && body.length) req.write(body);
    req.end();
  });
}

function encodeKey(key) {
  return key
    .split('/')
    .map((p) => encodeURIComponent(p).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join('/');
}

function signedHeadersFor(host, amzDate, payloadHash, extraHeaders) {
  const extras = {};
  for (const [k, v] of Object.entries(extraHeaders || {})) {
    extras[k.toLowerCase()] = v;
  }
  const headers = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...extras,
  };
  const names = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();
  const canonicalHeaders = names.map((n) => `${n}:${String(headers[n]).trim()}\n`).join('');
  return { headers, signedHeaders: names.join(';'), canonicalHeaders };
}

function buildAuth({ accessKey, secretKey, region, amzDate, dateStamp, signedHeaders, canonicalRequest }) {
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');
  const sig = crypto.createHmac('sha256', signingKey(secretKey, dateStamp, region)).update(stringToSign).digest('hex');
  return `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`;
}

function sanitizeEndpoint(raw) {
  let e = String(raw || '')
    .trim()
    .replace(/^['"]|['"]$/g, '');
  // Allow pasted example form https://<accountid>.r2.cloudflarestorage.com
  e = e.replace(/^(https?:\/\/)<([^>]+)>(\.)/i, '$1$2$3');
  return e.replace(/\/$/, '');
}

function cfgFromEnv() {
  const bucket = (process.env.BACKUP_R2_BUCKET || process.env.BACKUP_S3_BUCKET || '').trim();
  const endpoint = sanitizeEndpoint(process.env.BACKUP_R2_ENDPOINT || process.env.BACKUP_S3_ENDPOINT || '');
  const r2 = /r2\.cloudflarestorage\.com$/i.test((() => {
    try {
      return new URL(endpoint).host;
    } catch {
      return '';
    }
  })());
  const region = (
    process.env.BACKUP_R2_REGION ||
    (r2 ? 'auto' : process.env.AWS_REGION) ||
    'auto'
  )
    .trim() || 'auto';
  const accessKey = (process.env.BACKUP_R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '').trim();
  const secretKey = (process.env.BACKUP_R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '').trim();
  return { bucket, endpoint, region, accessKey, secretKey };
}

function isConfigured() {
  const c = cfgFromEnv();
  return Boolean(c.bucket && c.accessKey && c.secretKey && (c.endpoint || process.env.AWS_REGION));
}

function objectUrl(c, key, query = '') {
  if (c.endpoint) {
    const base = c.endpoint.replace(/\/$/, '');
    return `${base}/${c.bucket}/${encodeKey(key)}${query}`;
  }
  return `https://${c.bucket}.s3.${c.region}.amazonaws.com/${encodeKey(key)}${query}`;
}

async function signedRequest({ method, key, body, query, extraHeaders }) {
  const c = cfgFromEnv();
  if (!c.bucket || !c.accessKey || !c.secretKey) throw new Error('s3_not_configured');
  const { amzDate, dateStamp } = amzNow();
  const payload = body ? Buffer.from(body) : Buffer.alloc(0);
  const payloadHash = sha256hex(payload);
  const url = objectUrl(c, key || '', query || '');
  const u = new URL(url);
  const { headers, signedHeaders, canonicalHeaders } = signedHeadersFor(u.host, amzDate, payloadHash, extraHeaders);
  const canonicalUri = u.pathname;
  const canonicalQuery = u.search.startsWith('?') ? u.search.slice(1) : u.search;
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  headers.Authorization = buildAuth({
    accessKey: c.accessKey,
    secretKey: c.secretKey,
    region: c.region,
    amzDate,
    dateStamp,
    signedHeaders,
    canonicalRequest,
  });
  const res = await request({ url, method, headers, body: payload.length ? payload : undefined });
  if (res.status >= 400) {
    const xml = res.body.toString('utf8');
    const code = (xml.match(/<Code>([^<]+)<\/Code>/) || [])[1] || '';
    throw new Error(`s3_http_${res.status}${code ? `:${code}` : ''}`);
  }
  return res;
}

async function unsignedGet(key) {
  const c = cfgFromEnv();
  if (!c.bucket || !c.endpoint) throw new Error('s3_not_configured');
  const url = objectUrl(c, key);
  const u = new URL(url);
  return request({
    url,
    method: 'GET',
    headers: { host: u.host },
  });
}

async function putObject(key, body) {
  const extraHeaders = { 'content-type': 'application/octet-stream' };
  if (process.env.BACKUP_S3_SSE === '1') {
    extraHeaders['x-amz-server-side-encryption'] = 'AES256';
  }
  return signedRequest({
    method: 'PUT',
    key,
    body,
    extraHeaders,
  });
}

async function getObject(key) {
  return signedRequest({ method: 'GET', key });
}

async function deleteObject(key) {
  return signedRequest({ method: 'DELETE', key });
}

async function listPrefix(prefix) {
  const res = await signedRequest({
    method: 'GET',
    key: '',
    query: `?list-type=2&prefix=${encodeURIComponent(prefix)}`,
  });
  const xml = res.body.toString('utf8');
  const keys = [];
  const re = /<Key>([^<]+)<\/Key>/g;
  let m;
  while ((m = re.exec(xml))) keys.push(m[1]);
  return keys;
}

module.exports = { isConfigured, putObject, getObject, deleteObject, listPrefix, cfgFromEnv, unsignedGet };
