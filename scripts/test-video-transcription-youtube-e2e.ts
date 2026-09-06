#!/usr/bin/env node
'use strict';

const API = (process.env.API_BASE_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '') + '/api/v1';
const url =
  process.argv[2] || 'https://www.youtube.com/watch?v=XaH3XKTUMtM';

async function main() {
  const email = process.env.META_REVIEWER_EMAIL;
  const password = process.env.META_REVIEWER_PASSWORD;
  if (!email || !password) {
    console.log('SKIP');
    return;
  }
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const { accessToken } = await login.json();
  const fd = new FormData();
  fd.append('sourceUrl', url);
  fd.append('language', 'vi');
  fd.append('ownershipConfirmed', 'true');
  fd.append('keepVideo', 'false');
  const create = await fetch(`${API}/video-transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: fd,
  });
  const text = await create.text();
  if (!create.ok) {
    console.error('CREATE FAIL', create.status, text.slice(0, 300));
    process.exit(1);
  }
  const job = JSON.parse(text);
  console.log('CREATED', job.id, job.status, job.stage);
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const get = await fetch(`${API}/video-transcriptions/${job.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const j = await get.json();
    console.log(
      `${j.status}/${j.stage} chars=${j.resultCharCount ?? j.cleanedTranscript?.length ?? 0} err=${j.errorCode ?? '-'}`,
    );
    if (j.status === 'completed') {
      console.log('PREVIEW', (j.cleanedTranscript || '').slice(0, 200));
      break;
    }
    if (j.status === 'failed') {
      console.log('ERR', j.errorMessage);
      process.exit(1);
    }
  }
}

main();
