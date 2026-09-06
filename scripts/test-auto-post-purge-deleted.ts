#!/usr/bin/env node
'use strict';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { decryptSecret } from '../apps/api/src/common/utils/encryption.util';

const prisma = new PrismaClient();
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
  const GRAPH = env.META_API_VERSION || 'v21.0';
  const KEY = env.ENCRYPTION_KEY || '';
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

  console.log('=== Before list (triggers purge) ===');
  const list1 = await fetch(`${API}/api/v1/auto-post/posts`, { headers });
  const items1 = ((await list1.json()) as { items?: Array<Record<string, unknown>> }).items ?? [];
  console.log('count:', items1.length);
  for (const p of items1) {
    console.log(
      JSON.stringify({
        id: p.id,
        topic: String(p.topic ?? '').slice(0, 50),
        facebookPostId: p.facebookPostId,
        fanpageId: p.fanpageId,
        fanpagePageId: p.fanpagePageId,
        status: p.status,
      }),
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) process.exit(1);

  const dbPosts = await prisma.autoPost.findMany({
    where: { userId: user.id, status: 'PUBLISHED', facebookPostId: { not: null } },
    orderBy: { publishedAt: 'desc' },
    take: 5,
  });

  const conn = await prisma.autoPostFacebookConnection.findFirst({
    where: { userId: user.id },
    include: { pages: true },
  });
  const page = conn?.pages[0];
  if (!page || !KEY) {
    console.log('No page token');
    await prisma.$disconnect();
    return;
  }
  const pageToken = decryptSecret(page.encryptedPageAccessToken, KEY);
  const pageId = page.pageId;

  console.log('\n=== Graph checks per post ===');
  for (const post of dbPosts) {
    const fbId = post.facebookPostId!;
    const gUrl =
      `https://graph.facebook.com/${GRAPH}/${encodeURIComponent(fbId)}` +
      `?fields=id&access_token=${encodeURIComponent(pageToken)}`;
    const gRes = await fetch(gUrl);
    const gBody = await gRes.json();
    console.log('\npost:', post.topic?.slice(0, 40));
    console.log('facebookPostId:', fbId);
    console.log('Graph GET:', JSON.stringify(gBody));

    const inPub = await fetch(
      `https://graph.facebook.com/${GRAPH}/${pageId}/published_posts?fields=id&limit=50&access_token=${encodeURIComponent(pageToken)}`,
    );
    const pubBody = (await inPub.json()) as { data?: Array<{ id?: string }> };
    const ids = (pubBody.data ?? []).map((x) => x.id);
    console.log('in published_posts (top 50):', ids.includes(fbId));
  }

  console.log('\n=== After second list ===');
  const list2 = await fetch(`${API}/api/v1/auto-post/posts`, { headers });
  const items2 = ((await list2.json()) as { items?: unknown[] }).items ?? [];
  console.log('count:', items2.length);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
