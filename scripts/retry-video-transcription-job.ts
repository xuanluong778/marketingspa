#!/usr/bin/env node
'use strict';

const API = (process.env.API_BASE_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '') + '/api/v1';
const id = process.argv[2] || '40476ba3-0ba6-43e0-8f1b-e6a52013341e';

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
  const retry = await fetch(`${API}/video-transcriptions/${id}/retry`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  console.log('RETRY', retry.status, (await retry.text()).slice(0, 200));
  for (let i = 0; i < 18; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const get = await fetch(`${API}/video-transcriptions/${id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const j = await get.json();
    console.log(`${j.status}/${j.stage} chars=${j.resultCharCount ?? 0} err=${j.errorCode ?? '-'}`);
    if (j.status === 'completed' || j.status === 'failed') break;
  }
}

main();
