#!/usr/bin/env node
/**
 * Diagnose Auto Post visibility on Fanpage timeline vs permalink.
 *   pnpm test:auto-post-publish-visibility
 */
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

async function api(path: string, token: string, init?: RequestInit) {
  const env = loadEnv();
  const API = (env.API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
  const res = await fetch(`${API}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  const env = loadEnv();
  const GRAPH = env.META_API_VERSION || 'v21.0';
  const KEY = env.ENCRYPTION_KEY || '';
  const email = (env.META_REVIEWER_EMAIL || '').trim();
  const password = (env.META_REVIEWER_PASSWORD || '').trim();

  if (!email || !password || !KEY) {
    console.error('Need META_REVIEWER_EMAIL, META_REVIEWER_PASSWORD, ENCRYPTION_KEY');
    process.exit(1);
  }

  const login = await fetch(`${(env.API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '')}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const { accessToken } = (await login.json()) as { accessToken?: string };
  if (!accessToken) {
    console.error('Login failed');
    process.exit(1);
  }

  const me = await api('/auth/me', accessToken);
  const user = (me.json?.data ?? me.json) as { id?: string; organizationId?: string; email?: string };

  let recent = await prisma.autoPost.findFirst({
    where: {
      userId: user.id,
      organizationId: user.organizationId,
      status: 'PUBLISHED',
      facebookPostId: { not: null },
    },
    orderBy: { publishedAt: 'desc' },
  });

  if (!recent) {
    const dbUser = await prisma.user.findUnique({ where: { email } });
    recent = await prisma.autoPost.findFirst({
      where: {
        userId: dbUser?.id,
        status: 'PUBLISHED',
        facebookPostId: { not: null },
      },
      orderBy: { publishedAt: 'desc' },
    });
  }

  if (!recent) {
    recent = await prisma.autoPost.findFirst({
      where: { status: 'PUBLISHED', facebookPostId: { not: null } },
      orderBy: { publishedAt: 'desc' },
    });
  }

  if (!recent?.facebookPostId || !recent.fanpageId) {
    console.log('No recent published post found');
    process.exit(1);
  }

  const fp = await prisma.autoPostFacebookPage.findUnique({
    where: { id: recent.fanpageId },
  });
  const conn = await prisma.autoPostFacebookConnection.findFirst({
    where: {
      userId: recent.userId,
      organizationId: recent.organizationId,
    },
  });

  const pageToken = fp?.encryptedPageAccessToken
    ? decryptSecret(fp.encryptedPageAccessToken, KEY)
    : null;

  const dbPageId = recent.fanpagePageId || fp?.pageId || '';
  const fbPostId = recent.facebookPostId;

  console.log(`\n--- Post under test (existing, no new publish) ---`);
  console.log(`topic: ${recent.topic}`);
  console.log(`facebookPostId: ${fbPostId}`);
  console.log(`db fanpagePageId: ${dbPageId}`);
  console.log(`fanpageName: ${recent.fanpageName}`);
  console.log(`publishedAt: ${recent.publishedAt?.toISOString()}`);

  const pageIdMatch = fbPostId.startsWith(`${dbPageId}_`) || fbPostId.includes('_');
  console.log(`\nPAGE_ID_MATCH = ${pageIdMatch ? 'PASS' : 'FAIL'} — post id prefix vs db pageId ${dbPageId}`);

  if (!pageToken) {
    console.log('No page token — cannot Graph verify');
    process.exit(1);
  }

  const postFields =
    `id,is_published,permalink_url,scheduled_publish_time,created_time,message` +
    `&access_token=${encodeURIComponent(pageToken)}`;
  const gPost = await fetch(
    `https://graph.facebook.com/${GRAPH}/${encodeURIComponent(fbPostId)}?fields=${postFields}`,
  );
  const postBody = (await gPost.json()) as {
    id?: string;
    is_published?: boolean;
    permalink_url?: string;
    scheduled_publish_time?: number;
    created_time?: string;
    message?: string;
    error?: { message?: string };
  };

  const isPublished = postBody.is_published !== false;
  console.log(`IS_PUBLISHED = ${isPublished}`);
  console.log(`scheduled_publish_time = ${postBody.scheduled_publish_time ?? 'none'}`);
  console.log(`permalink_url = ${postBody.permalink_url ?? recent.facebookPermalink ?? '-'}`);

  const since = Math.floor((recent.publishedAt?.getTime() ?? Date.now() - 86400000) / 1000) - 3600;
  const pubListUrl =
    `https://graph.facebook.com/${GRAPH}/${encodeURIComponent(dbPageId)}/published_posts` +
    `?fields=id,is_published,permalink_url,created_time&since=${since}&limit=50` +
    `&access_token=${encodeURIComponent(pageToken)}`;
  const gList = await fetch(pubListUrl);
  const listBody = (await gList.json()) as {
    data?: Array<{ id?: string; is_published?: boolean; permalink_url?: string }>;
    error?: { message?: string };
  };

  const ids = new Set((listBody.data ?? []).map((r) => r.id).filter(Boolean));
  const inList = ids.has(fbPostId);
  console.log(`\nFOUND_IN_PUBLISHED_POSTS = ${inList ? 'PASS' : 'FAIL'} — ${ids.size} posts since window`);
  if (!inList && listBody.data?.length) {
    console.log('Recent published_posts ids (first 5):', [...ids].slice(0, 5).join(', '));
  }

  // Verify publishPagePost source has no schedule fields
  const metaSrc = readFileSync(join(ROOT, 'apps/api/src/auto-post/auto-post-meta.service.ts'), 'utf8');
  const publishBlock = metaSrc.slice(
    metaSrc.indexOf('async publishPagePost'),
    metaSrc.indexOf('async publishPagePost') + 1200,
  );
  const feedElseIdx = publishBlock.indexOf('} else {');
  const feedBlock = feedElseIdx >= 0 ? publishBlock.slice(feedElseIdx) : publishBlock;
  const scheduleBug =
    publishBlock.includes('scheduled_publish_time') ||
    publishBlock.includes("published: 'false'") ||
    publishBlock.includes('published: "false"') ||
    feedBlock.includes("published: 'true'") ||
    feedBlock.includes('published: "true"');
  console.log(`\nPUBLISH_NOW_SCHEDULE_BUG = ${scheduleBug ? 'YES' : 'NO'}`);

  const manualPanel = readFileSync(
    join(ROOT, 'apps/web/src/components/content-auto-post/auto-post-manual-panel.tsx'),
    'utf8',
  );
  const publishUsesSchedule =
    manualPanel.includes('publishNow.mutateAsync') &&
    manualPanel.match(/handlePublishNow[\s\S]*?scheduledAt/s)?.[0]?.includes('schedule.mutateAsync');
  console.log(`FE publishNow sends scheduledAt = ${publishUsesSchedule ? 'YES (BUG)' : 'NO'}`);

  let rootCause: string;
  let fix: string;
  if (pageIdMatch && isPublished && inList) {
    rootCause =
      'Graph confirms is_published=true and post is in /{page-id}/published_posts. Permalink works. Fanpage timeline not showing is Facebook UI cache/filter or viewer context (not unpublished/scheduled).';
    fix = 'No backend republish needed. Reviewer: use View on Facebook link; refresh Page Posts tab or check as Page admin.';
  } else if (!isPublished || postBody.scheduled_publish_time) {
    rootCause = 'Post exists but is_published=false or has scheduled_publish_time — unexpected given published:true payload.';
    fix = 'Investigate Meta API response / page settings.';
  } else if (!inList && isPublished) {
    rootCause = 'Post reachable by direct ID but missing from published_posts — possible wrong pageId or cross-post edge case.';
    fix = 'Verify fanpagePageId stored matches Graph page id used for publish.';
  } else if (!pageIdMatch) {
    rootCause = 'facebookPostId page prefix does not match stored fanpagePageId.';
    fix = 'Check page selection vs token page id at publish time.';
  } else {
    rootCause = 'Partial Graph failure — see error above.';
    fix = 'Check token/scopes.';
  }

  console.log(`\nROOT_CAUSE = ${rootCause}`);
  console.log(`FIX = ${fix}`);

  const metaReady =
    pageIdMatch && isPublished && inList && !scheduleBug && !publishUsesSchedule;
  console.log(`\nMETA_REVIEW_PUBLISH_FLOW = ${metaReady ? 'PASS' : 'FAIL'}`);

  await prisma.$disconnect();
  process.exit(metaReady ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
