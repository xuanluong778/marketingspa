#!/usr/bin/env node
/** List recent pending/processing video transcription jobs + worker heartbeat. */
'use strict';

import { PrismaClient } from '@marketingspa/database';
import Redis from 'ioredis';

const prisma = new PrismaClient();

async function main() {
  const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
  const heartbeat = await redis.get('marketingspa:worker:heartbeat');
  const waitLen = await redis.llen('marketingspa:video-transcription-queue:wait');
  const activeLen = await redis.llen('marketingspa:video-transcription-queue:active');
  console.log('WORKER_HEARTBEAT', heartbeat ? new Date(Number(heartbeat)).toISOString() : 'missing');
  console.log('QUEUE_WAIT', waitLen, 'ACTIVE', activeLen);

  const id = process.argv[2];
  if (id) {
    const row = await prisma.videoTranscription.findUnique({
      where: { id },
      select: { sourceUrl: true, sourceTitle: true, attemptCount: true, status: true },
    });
    console.log('JOB_DETAIL', JSON.stringify(row));
  }

  const rows = await prisma.videoTranscription.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: {
      id: true,
      status: true,
      stage: true,
      sourceType: true,
      sourceTitle: true,
      errorCode: true,
      errorMessage: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  for (const r of rows) {
    console.log(
      `${r.id.slice(0, 8)}… ${r.status}/${r.stage} ${r.sourceType} ${r.sourceTitle?.slice(0, 40) ?? ''} err=${r.errorCode ?? '-'}`,
    );
  }
  await redis.quit();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
