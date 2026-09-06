#!/usr/bin/env node
/** Smoke: POST /video-transcriptions accepts keepVideo (no ValidationPipe 400). */
'use strict';

const API = (process.env.API_BASE_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '');
const email = (process.env.META_REVIEWER_EMAIL ?? '').trim();
const password = (process.env.META_REVIEWER_PASSWORD ?? '').trim();

async function main() {
  if (!email || !password) {
    console.log('SKIP — no META_REVIEWER_EMAIL/PASSWORD');
    return;
  }
  const login = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) {
    console.error('LOGIN FAIL', login.status);
    process.exit(1);
  }
  const { accessToken } = (await login.json()) as { accessToken: string };
  const fd = new FormData();
  fd.append('sourceUrl', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  fd.append('language', 'vi');
  fd.append('ownershipConfirmed', 'true');
  fd.append('keepVideo', 'false');

  const res = await fetch(`${API}/api/v1/video-transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: fd,
  });
  const text = await res.text();
  if (text.includes('keepVideo should not exist')) {
    console.error('FAIL — keepVideo still rejected by ValidationPipe');
    process.exit(1);
  }
  console.log('KEEPVIDEO_DTO = PASS (status', res.status + ')');
  if (res.ok) {
    const job = JSON.parse(text) as { id: string };
    console.log('JOB_CREATED =', job.id);
    await fetch(`${API}/api/v1/video-transcriptions/${job.id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
