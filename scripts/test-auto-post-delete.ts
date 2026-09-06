#!/usr/bin/env node
'use strict';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname ?? __dirname, '..');

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const API = (env.API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
  const email = env.META_REVIEWER_EMAIL || '';
  const password = env.META_REVIEWER_PASSWORD || '';

  const login = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const { accessToken } = (await login.json()) as { accessToken?: string };
  if (!accessToken) {
    console.error('Login failed');
    process.exit(1);
  }

  const headers = { Authorization: `Bearer ${accessToken}` };
  const list = await fetch(`${API}/api/v1/auto-post/posts`, { headers });
  const items = ((await list.json()) as { items?: Array<{ id: string; topic?: string }> }).items ?? [];
  console.log('count before', items.length);
  if (!items.length) {
    console.log('no items');
    process.exit(0);
  }

  const target = items[items.length - 1]!;
  console.log('delete target', target.id, target.topic?.slice(0, 50));

  const del = await fetch(`${API}/api/v1/auto-post/posts/${target.id}`, {
    method: 'DELETE',
    headers,
  });
  console.log('delete status', del.status);
  console.log('delete body', await del.text());

  const list2 = await fetch(`${API}/api/v1/auto-post/posts`, { headers });
  const items2 = ((await list2.json()) as { items?: Array<{ id: string }> }).items ?? [];
  console.log('count after', items2.length);
  const stillThere = items2.some((x) => x.id === target.id);
  console.log('still has id?', stillThere);
  console.log(stillThere ? 'DELETE_PUBLISHED = FAIL' : 'DELETE_PUBLISHED = PASS');
  process.exit(stillThere ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
