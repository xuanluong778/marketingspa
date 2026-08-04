import type { Job } from 'bullmq';
import type Redis from 'ioredis';
import { AutoPostFacebookConnectionStatus, AutoPostStatus } from '@marketingspa/database';
import { prisma } from '@marketingspa/database';
import { decryptSecret, publishToFacebookPage } from '../lib/auto-post-publish';
import {
  friendlyPublishError,
  isPermanentPublishError,
  sanitizePublishErrorMessage,
} from '../lib/auto-post-publish-errors';
import {
  acquireAutoPostPublishLock,
  releaseAutoPostPublishLock,
} from '../lib/auto-post-publish-lock';

export async function processAutoPostPublish(
  job: Job<{ postId: string; userId: string; organizationId: string }>,
  redis?: Redis,
) {
  const { postId, userId, organizationId } = job.data;
  if (!organizationId?.trim()) {
    throw new Error('Job auto-post thiếu organizationId');
  }

  const owner = `job:${job.id ?? 'unknown'}:${process.pid}`;
  let lockKey: string | null = null;

  if (redis) {
    const lock = await acquireAutoPostPublishLock(redis, organizationId, postId, owner);
    if (!lock.ok) {
      return { skipped: true, reason: 'locked' };
    }
    lockKey = lock.key;
  }

  try {
    const post = await prisma.autoPost.findFirst({
      where: { id: postId, userId, organizationId },
    });
    if (!post) return { skipped: true, reason: 'not_found' };

    // Idempotent: đã đăng rồi thì không gọi Graph lại
    if (post.status === AutoPostStatus.PUBLISHED && post.facebookPostId) {
      return { ok: true, facebookPostId: post.facebookPostId, idempotent: true };
    }

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

    const claimed = await prisma.autoPost.updateMany({
      where: {
        id: postId,
        userId,
        organizationId,
        status: AutoPostStatus.SCHEDULED,
        facebookPostId: null,
      },
      data: { status: AutoPostStatus.PUBLISHING },
    });
    if (claimed.count !== 1) {
      return { skipped: true, reason: 'already_claimed' };
    }

    try {
      const page = await prisma.autoPostFacebookPage.findFirst({
        where: {
          id: post.fanpageId,
          userId,
          connection: { organizationId },
        },
        include: { connection: true },
      });
      if (!page) throw new Error('Fanpage không tồn tại');

      const conn = page.connection;
      if (
        conn.status === AutoPostFacebookConnectionStatus.TOKEN_EXPIRED ||
        (conn.tokenExpiresAt && conn.tokenExpiresAt.getTime() < Date.now())
      ) {
        await prisma.autoPostFacebookConnection.update({
          where: { id: conn.id },
          data: {
            status: AutoPostFacebookConnectionStatus.TOKEN_EXPIRED,
            lastError: 'NEEDS_RECONNECT: Token Facebook đã hết hạn',
          },
        });
        throw new Error('NEEDS_RECONNECT: Token Facebook đã hết hạn — vui lòng kết nối lại');
      }

      const isEnv = conn.scopes?.includes('env_page_token');
      if (!isEnv && !conn.scopes?.includes('pages_manage_posts')) {
        throw new Error('MISSING_PERMISSION: pages_manage_posts');
      }

      const accessToken = decryptSecret(page.encryptedPageAccessToken);
      const published = await publishToFacebookPage(page.pageId, accessToken, {
        message: post.caption.trim(),
        link: post.linkUrl ?? undefined,
        imageUrl: post.imageUrl ?? undefined,
      });

      await prisma.autoPost.update({
        where: { id: postId },
        data: {
          status: AutoPostStatus.PUBLISHED,
          publishedAt: new Date(),
          facebookPostId: published.id,
          facebookPermalink: published.permalinkUrl,
          errorMessage: null,
        },
      });

      await prisma.autoPostPublishLog.create({
        data: {
          userId,
          postId,
          action: 'scheduled_publish',
          status: 'success',
          facebookPostId: published.id,
        },
      });

      return { ok: true, facebookPostId: published.id };
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Đăng bài thất bại';
      const msg = sanitizePublishErrorMessage(raw);
      const display = friendlyPublishError(msg);
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

      // Lỗi vĩnh viễn (token/quyền/media): không throw → BullMQ không retry vô hạn
      if (isPermanentPublishError(msg) || isPermanentPublishError(display)) {
        return { failed: true, permanent: true, error: msg };
      }
      throw e;
    }
  } finally {
    if (redis && lockKey) {
      await releaseAutoPostPublishLock(redis, lockKey, owner).catch(() => undefined);
    }
  }
}

export async function processAutoPostScheduledScan(redis?: Redis) {
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
      await processAutoPostPublish(
        {
          id: `scan-${post.id}`,
          data: {
            postId: post.id,
            userId: post.userId,
            organizationId: post.organizationId,
          },
        } as Job<{ postId: string; userId: string; organizationId: string }>,
        redis,
      );
      processed++;
    } catch {
      /* logged */
    }
  }
  return { due: due.length, processed };
}
