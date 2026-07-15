import type { Job } from 'bullmq';
import { AutoPostStatus } from '@marketingspa/database';
import { prisma } from '@marketingspa/database';
import { decryptSecret, publishToFacebookPage } from '../lib/auto-post-publish';

export async function processAutoPostPublish(job: Job<{ postId: string; userId: string }>) {
  const { postId, userId } = job.data;
  const post = await prisma.autoPost.findFirst({ where: { id: postId, userId } });
  if (!post) return { skipped: true, reason: 'not_found' };
  if (post.status !== AutoPostStatus.SCHEDULED) {
    return { skipped: true, reason: 'not_scheduled' };
  }
  if (!post.approvedAt) {
    await prisma.autoPost.update({
      where: { id: postId },
      data: { status: AutoPostStatus.FAILED, errorMessage: 'Bài chưa được duyệt' },
    });
    return { skipped: true, reason: 'not_approved' };
  }
  if (!post.fanpageId || !post.caption?.trim()) {
    await prisma.autoPost.update({
      where: { id: postId },
      data: { status: AutoPostStatus.FAILED, errorMessage: 'Thiếu Fanpage hoặc nội dung' },
    });
    return { skipped: true, reason: 'invalid_post' };
  }

  await prisma.autoPost.update({
    where: { id: postId },
    data: { status: AutoPostStatus.PUBLISHING },
  });

  try {
    const page = await prisma.autoPostFacebookPage.findFirst({
      where: { id: post.fanpageId, userId },
    });
    if (!page) throw new Error('Fanpage không tồn tại');

    const accessToken = decryptSecret(page.encryptedPageAccessToken);
    const fbPostId = await publishToFacebookPage(page.pageId, accessToken, {
      message: post.caption.trim(),
      link: post.linkUrl ?? undefined,
      imageUrl: post.imageUrl ?? undefined,
    });

    await prisma.autoPost.update({
      where: { id: postId },
      data: {
        status: AutoPostStatus.PUBLISHED,
        publishedAt: new Date(),
        facebookPostId: fbPostId,
        errorMessage: null,
      },
    });

    await prisma.autoPostPublishLog.create({
      data: {
        userId,
        postId,
        action: 'scheduled_publish',
        status: 'success',
        facebookPostId: fbPostId,
      },
    });

    return { ok: true, facebookPostId: fbPostId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Đăng bài thất bại';
    await prisma.autoPostApiLog.create({
      data: { userId, postId, action: 'scheduled_publish', message: msg },
    });
    await prisma.autoPost.update({
      where: { id: postId },
      data: { status: AutoPostStatus.FAILED, errorMessage: msg },
    });
    await prisma.autoPostPublishLog.create({
      data: {
        userId,
        postId,
        action: 'scheduled_publish',
        status: 'failed',
        errorMessage: msg,
      },
    });
    throw e;
  }
}

export async function processAutoPostScheduledScan() {
  const due = await prisma.autoPost.findMany({
    where: {
      status: AutoPostStatus.SCHEDULED,
      scheduledAt: { lte: new Date() },
      approvedAt: { not: null },
    },
    take: 20,
  });

  let processed = 0;
  for (const post of due) {
    try {
      await processAutoPostPublish({
        data: { postId: post.id, userId: post.userId },
      } as Job<{ postId: string; userId: string }>);
      processed++;
    } catch {
      /* logged */
    }
  }
  return { due: due.length, processed };
}
