'use strict';
/**
 * External ops notify: Telegram, Slack/webhook, Email.
 * Never includes tokens, passwords, or customer data.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const COOLDOWN_FILE =
  process.env.OPS_ALERT_COOLDOWN_FILE ||
  '/var/www/marketingaut_usr/data/backups/ops/alert-cooldown.json';
const ALERT_LOG =
  process.env.OPS_ALERT_LOG || '/var/www/marketingaut_usr/data/backups/ops/alerts.log';

function redact(s) {
  return String(s || '')
    .replace(/postgres(?:ql)?:\/\/[^@\s'"]+@/gi, 'postgresql://***@')
    .replace(/redis:\/\/[^@\s'"]+@/gi, 'redis://***@')
    .replace(/(password|secret|token|authorization|api[_-]?key)=[^\s&]+/gi, '$1=***')
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[redacted-email]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***');
}

function cooldownMs(level) {
  if (level === 'CRITICAL') return 5 * 60 * 1000;
  if (level === 'HIGH') return 15 * 60 * 1000;
  return 30 * 60 * 1000;
}

function shouldSend(code, level) {
  if (process.env.ALERT_FORCE === '1') return true;
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(COOLDOWN_FILE, 'utf8'));
  } catch {
    data = {};
  }
  const prev = Number(data[code] || 0);
  if (Date.now() - prev < cooldownMs(level)) return false;
  data[code] = Date.now();
  fs.mkdirSync(path.dirname(COOLDOWN_FILE), { recursive: true });
  fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(data));
  return true;
}

function postJson(url, payload) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const lib = u.protocol === 'http:' ? http : https;
      const body = JSON.stringify(payload);
      const req = lib.request(
        {
          hostname: u.hostname,
          port: u.port || undefined,
          path: `${u.pathname}${u.search}`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
          timeout: 10000,
        },
        (res) => {
          res.resume();
          resolve(res.statusCode || 0);
        },
      );
      req.on('error', () => resolve(0));
      req.on('timeout', () => {
        req.destroy();
        resolve(0);
      });
      req.write(body);
      req.end();
    } catch {
      resolve(0);
    }
  });
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.ALERT_TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID || process.env.ALERT_TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const status = await postJson(url, { chat_id: chat, text: text.slice(0, 3500), disable_web_page_preview: true });
  return status >= 200 && status < 300;
}

async function sendWebhook(text) {
  const url = process.env.ALERT_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
  if (!url) return false;
  const slackish = /hooks\.slack\.com/.test(url);
  const status = await postJson(url, slackish ? { text } : { text, content: text });
  return status >= 200 && status < 300;
}

function sendEmail(level, code, detail) {
  const py = path.join(__dirname, 'ops-mail.py');
  const r = spawnSync('python3', [py, 'send-alert'], {
    env: {
      ...process.env,
      ALERT_LEVEL: level,
      ALERT_CODE: code,
      ALERT_DETAIL: detail,
    },
    encoding: 'utf8',
    timeout: 45000,
  });
  return r.status === 0;
}

async function notify(level, code, detail, opts = {}) {
  const safeDetail = redact(detail);
  const safeCode = String(code || 'OPS').replace(/[^A-Z0-9._-]/gi, '_').slice(0, 80);
  const line = `${new Date().toISOString()} ${level} ${safeCode} ${safeDetail}`;
  fs.mkdirSync(path.dirname(ALERT_LOG), { recursive: true });
  fs.appendFileSync(ALERT_LOG, `${line}\n`);
  if (opts.skipCooldown !== true && !shouldSend(safeCode, level)) {
    return { sent: false, reason: 'cooldown' };
  }
  const text = `Marketing Auto AZ ${level} ${safeCode}: ${safeDetail}`;
  const channels = [];
  try {
    if (await sendTelegram(text)) channels.push('telegram');
  } catch {
    /* ignore */
  }
  try {
    if (await sendWebhook(text)) channels.push('webhook');
  } catch {
    /* ignore */
  }
  try {
    if (sendEmail(level, safeCode, safeDetail)) channels.push('email');
  } catch {
    /* ignore */
  }
  return { sent: channels.length > 0, channels };
}

module.exports = { notify, redact };

if (require.main === module) {
  const level = process.argv[2] || 'INFO';
  const code = process.argv[3] || 'TEST';
  const detail = process.argv.slice(4).join(' ') || 'hardening check';
  notify(level, code, detail, { skipCooldown: process.env.ALERT_FORCE === '1' }).then((r) => {
    console.log(JSON.stringify({ ok: r.sent, channels: r.channels || [], reason: r.reason || null }));
    process.exit(r.sent ? 0 : 1);
  });
}
