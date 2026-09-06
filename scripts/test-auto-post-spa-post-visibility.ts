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
  const KEY = env.ENCRYPTION_KEY || '';
  const GRAPH = env.META_API_VERSION || 'v21.0';

  const posts = await prisma.autoPost.findMany({
    where: { status: 'PUBLISHED', fanpageName: { contains: 'DIGI' } },
    orderBy: { publishedAt: 'desc' },
    take: 15,
    select: {
      id: true,
      topic: true,
      facebookPostId: true,
      facebookPermalink: true,
      publishedAt: true,
      fanpagePageId: true,
      fanpageName: true,
      fanpageId: true,
      caption: true,
    },
  });

  console.log('=== Published posts on Thế Giới DIGI ===');
  for (const p of posts) {
    const snippet = (p.caption || '').slice(0, 60).replace(/\n/g, ' ');
    console.log(
      JSON.stringify({
        publishedAt: p.publishedAt?.toISOString(),
        facebookPostId: p.facebookPostId,
        topic: p.topic?.slice(0, 50),
        snippet,
      }),
    );
  }

  const spaId = '103244355239559_1380236150886244';
  const spa = posts.find((p) => p.facebookPostId === spaId);
  const target =
    spa ||
    posts.find(
      (p) => (p.caption || '').includes('Năm ngoái') || (p.caption || '').includes('bờ vực'),
    ) ||
    posts.find((p) => p.publishedAt && p.publishedAt < new Date('2026-09-03'));

  if (!target?.facebookPostId) {
    console.log('No target post found');
    await prisma.$disconnect();
    return;
  }

  const fp = target.fanpageId
    ? await prisma.autoPostFacebookPage.findUnique({ where: { id: target.fanpageId } })
    : await prisma.autoPostFacebookPage.findFirst({
        where: { pageId: target.fanpagePageId || undefined },
      });
  const pageToken = fp?.encryptedPageAccessToken
    ? decryptSecret(fp.encryptedPageAccessToken, KEY)
    : null;
  const pageId = target.fanpagePageId || fp?.pageId || '';

  console.log('\n=== Deep check target post ===');
  console.log('facebookPostId:', target.facebookPostId);
  console.log('pageId:', pageId);
  console.log('permalink:', target.facebookPermalink);

  if (!pageToken) {
    console.log('No page token');
    await prisma.$disconnect();
    process.exit(1);
  }

  const fields =
    'id,is_published,permalink_url,scheduled_publish_time,created_time,status_type,message,from';
  const gPost = await fetch(
    `https://graph.facebook.com/${GRAPH}/${encodeURIComponent(target.facebookPostId)}?fields=${fields}&access_token=${encodeURIComponent(pageToken)}`,
  );
  const postBody = await gPost.json();
  console.log('\nGraph post:', JSON.stringify(postBody, null, 2));

  const pubUrl =
    `https://graph.facebook.com/${GRAPH}/${pageId}/published_posts` +
    `?fields=id,is_published,created_time,message&limit=100` +
    `&access_token=${encodeURIComponent(pageToken)}`;
  let nextUrl: string | null = pubUrl;
  const allPubIds: string[] = [];
  for (let page = 0; nextUrl && page < 10; page += 1) {
    const pubRes = await fetch(nextUrl);
    const pubBody = (await pubRes.json()) as {
      data?: Array<{ id?: string; message?: string }>;
      paging?: { next?: string };
      error?: { message?: string };
    };
    for (const row of pubBody.data ?? []) {
      if (row.id) allPubIds.push(row.id);
    }
    nextUrl = pubBody.paging?.next?.trim() || null;
  }
  const found = allPubIds.includes(target.facebookPostId!);
  console.log('\nIn published_posts (paginated):', found);
  console.log('Total in list:', allPubIds.length);
  if (!found) {
    console.log('First 15 ids:', allPubIds.slice(0, 15).join(', '));
    const match = allPubIds.find((id) => id.includes('1380236150886244'));
    console.log('Spa id in full list:', match || 'NO');
  }

  const promoUrl =
    `https://graph.facebook.com/${GRAPH}/${pageId}/promotable_posts` +
    `?fields=id,is_published,created_time,message&limit=100` +
    `&access_token=${encodeURIComponent(pageToken)}`;
  const promoRes = await fetch(promoUrl);
  const promoBody = (await promoRes.json()) as {
    data?: Array<{ id?: string; is_published?: boolean; message?: string }>;
    error?: { message?: string };
  };
  const promoIds = (promoBody.data ?? []).map((x) => x.id).filter(Boolean);
  const spaInPromo = promoIds.includes(target.facebookPostId!);
  console.log('\nIn promotable_posts:', spaInPromo);
  console.log('promotable_posts total:', promoIds.length);
  console.log('promotable error:', promoBody.error?.message || 'none');
  const spaPromo = (promoBody.data ?? []).find((x) => x.id === target.facebookPostId);
  if (spaPromo) {
    console.log('Spa in promotable_posts:', JSON.stringify(spaPromo));
  }
  const unpublishedPromo = (promoBody.data ?? []).filter((x) => x.is_published === false);
  console.log('Unpublished in promotable_posts:', unpublishedPromo.length);
  if (unpublishedPromo.length) {
    console.log(
      'Sample unpublished:',
      unpublishedPromo.slice(0, 3).map((x) => ({ id: x.id, msg: (x.message || '').slice(0, 40) })),
    );
  }

  const dbPostFull = await prisma.autoPost.findFirst({
    where: { facebookPostId: target.facebookPostId! },
  });
  console.log('\nSPA full:', JSON.stringify({
    fanpageId: dbPostFull?.fanpageId,
    fanpagePageId: dbPostFull?.fanpagePageId,
    imageUrl: dbPostFull?.imageUrl,
    linkUrl: dbPostFull?.linkUrl,
    postType: dbPostFull?.postType,
    captionLen: dbPostFull?.caption?.length,
  }, null, 2));


  const logs = await prisma.autoPostPublishLog.findMany({
    where: { postId: dbPostFull?.id },
    orderBy: { createdAt: 'asc' },
    select: { action: true, status: true, facebookPostId: true, createdAt: true, errorMessage: true },
  });
  console.log('\nPublish logs:', JSON.stringify(logs, null, 2));

  const ourIds = posts.map((p) => p.facebookPostId).filter(Boolean) as string[];
  const onPage = ourIds.filter((id) => allPubIds.includes(id));
  const missing = ourIds.filter((id) => !allPubIds.includes(id));
  console.log('\nOur 15 recent posts ON published_posts:', onPage.length);
  console.log('Missing from published_posts:', missing.length);
  console.log('Missing ids:', missing.slice(0, 8).join(', '));

  const feedUrl =
    `https://graph.facebook.com/${GRAPH}/${pageId}/feed` +
    `?fields=id,is_published,created_time,message&limit=50` +
    `&access_token=${encodeURIComponent(pageToken)}`;
  const feedRes = await fetch(feedUrl);
  const feedBody = (await feedRes.json()) as {
    data?: Array<{ id?: string }>;
    error?: { message?: string };
  };
  const feedIds = (feedBody.data ?? []).map((x) => x.id).filter(Boolean);
  console.log('\nIn /feed (limit 50):', feedIds.includes(target.facebookPostId));
  console.log('Feed error:', feedBody.error?.message || 'none');

  const pageUrl =
    `https://graph.facebook.com/${GRAPH}/${pageId}?fields=id,name,link,username` +
    `&access_token=${encodeURIComponent(pageToken)}`;
  const pageRes = await fetch(pageUrl);
  console.log('\nPage info:', JSON.stringify(await pageRes.json(), null, 2));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
