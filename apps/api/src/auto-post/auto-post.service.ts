import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { AutoPostStatus } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAiService } from '../openai/openai.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AUTO_POST_QUEUE } from '../queue/queue.constants';
import type { Queue } from 'bullmq';
import { QueueEnqueueService } from '../common/services/queue-enqueue.service';
import { AutoPostFacebookService } from './auto-post-facebook.service';
import { AutoPostMetaService } from './auto-post-meta.service';
import {
  generateAutoPostContent,
  rewriteAutoPostContent,
} from './auto-post-ai.logic';
import {
  buildFacebookPostUrl,
  friendlyPublishError,
  isPermanentPublishError,
} from './auto-post-publish-errors';
import type {
  GenerateAutoPostDto,
  RewriteAutoPostDto,
  SaveAutoPostDraftDto,
  ScheduleAutoPostDto,
  UpdateAutoPostDto,
} from './dto/auto-post.dto';

const EDITABLE_STATUSES: AutoPostStatus[] = [
  AutoPostStatus.DRAFT,
  AutoPostStatus.PENDING,
  AutoPostStatus.FAILED,
];

const CLAIMABLE_FOR_PUBLISH: AutoPostStatus[] = [
  AutoPostStatus.DRAFT,
  AutoPostStatus.PENDING,
  AutoPostStatus.FAILED,
  AutoPostStatus.CANCELLED,
  AutoPostStatus.SCHEDULED,
];

@Injectable()
export class AutoPostService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiService,
    private readonly facebook: AutoPostFacebookService,
    private readonly meta: AutoPostMetaService,
    @Inject(AUTO_POST_QUEUE) private readonly autoPostQueue: Queue,
    private readonly queueEnqueue: QueueEnqueueService,
  ) {}

  status() {
    const metaConfigured = Boolean(
      (process.env.META_APP_ID || process.env.FACEBOOK_APP_ID) &&
        (process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET),
    );
    const metaLoginConfigId = Boolean(
      process.env.META_LOGIN_CONFIG_ID ||
        process.env.FACEBOOK_LOGIN_CONFIG_ID ||
        process.env.FACEBOOK_CONFIG_ID,
    );
    const metaPageEnvConfigured = Boolean(
      process.env.META_PAGE_ID?.trim() && process.env.META_PAGE_ACCESS_TOKEN?.trim(),
    );
    return {
      aiConfigured: this.openai.isConfigured(),
      metaConfigured,
      metaLoginConfigId,
      metaPageEnvConfigured,
    };
  }

  async generateAi(user: AuthUser, dto: GenerateAutoPostDto) {
    return generateAutoPostContent(this.openai, dto);
  }

  async rewriteAi(_user: AuthUser, dto: RewriteAutoPostDto) {
    return rewriteAutoPostContent(this.openai, dto.mode, dto.caption, dto.cta);
  }

  async saveDraft(user: AuthUser, dto: SaveAutoPostDraftDto) {
    const fanpage = await this.resolveFanpage(user.id, user.organizationId, dto.fanpageId);
    const data = this.buildPostData(user, dto, fanpage);

    if (dto.id) {
      const existing = await this.requireOwnedPost(user.id, user.organizationId, dto.id);
      if (!EDITABLE_STATUSES.includes(existing.status)) {
        throw new BadRequestException('Không thể sửa bài ở trạng thái hiện tại');
      }
      const updated = await this.prisma.autoPost.update({
        where: { id: dto.id },
        data: { ...data, status: AutoPostStatus.DRAFT },
      });
      return this.serializePost(updated);
    }

    const created = await this.prisma.autoPost.create({
      data: { ...data, status: AutoPostStatus.DRAFT },
    });
    return this.serializePost(created);
  }

  async updatePost(user: AuthUser, dto: UpdateAutoPostDto) {
    const existing = await this.requireOwnedPost(user.id, user.organizationId, dto.id);
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      throw new BadRequestException('Không thể cập nhật bài ở trạng thái hiện tại');
    }
    const fanpage = await this.resolveFanpage(user.id, user.organizationId, dto.fanpageId);
    const data = this.buildPostData(user, dto, fanpage);
    const updated = await this.prisma.autoPost.update({
      where: { id: dto.id },
      data,
    });
    return this.serializePost(updated);
  }

  async listPosts(userId: string, organizationId: string, status?: AutoPostStatus) {
    const items = await this.prisma.autoPost.findMany({
      where: { userId, organizationId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { items: items.map((p) => this.serializePost(p)) };
  }

  async getPost(userId: string, organizationId: string, id: string) {
    const post = await this.requireOwnedPost(userId, organizationId, id);
    return this.serializePost(post);
  }

  async deletePost(userId: string, organizationId: string, id: string) {
    const post = await this.requireOwnedPost(userId, organizationId, id);
    if (
      post.status === AutoPostStatus.PUBLISHING ||
      post.status === AutoPostStatus.PUBLISHED
    ) {
      throw new BadRequestException('Không thể xóa bài đã/đang đăng');
    }
    await this.prisma.autoPost.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Đăng ngay — idempotent:
   * - Nếu đã PUBLISHED + facebookPostId → trả về bài hiện có (không tạo bài FB trùng)
   * - Claim atomic status → PUBLISHING để chống double-click / race
   */
  async publishNow(userId: string, organizationId: string, postId: string) {
    const post = await this.requireOwnedPost(userId, organizationId, postId);

    // Idempotent: đã đăng thành công thì trả về bài hiện có (không gọi Graph lại)
    if (post.status === AutoPostStatus.PUBLISHED && post.facebookPostId) {
      return this.serializePost(post);
    }

    this.assertPublishable(post);

    const claimed = await this.prisma.autoPost.updateMany({
      where: {
        id: postId,
        userId,
        organizationId,
        status: { in: CLAIMABLE_FOR_PUBLISH },
        facebookPostId: null,
      },
      data: {
        status: AutoPostStatus.PUBLISHING,
        approvedAt: new Date(),
        errorMessage: null,
      },
    });

    if (claimed.count !== 1) {
      const current = await this.requireOwnedPost(userId, organizationId, postId);
      if (current.status === AutoPostStatus.PUBLISHED && current.facebookPostId) {
        return this.serializePost(current);
      }
      if (current.status === AutoPostStatus.PUBLISHING) {
        throw new BadRequestException('Bài đang được đăng');
      }
      throw new BadRequestException('Không thể đăng bài ở trạng thái hiện tại');
    }

    // Hủy delayed job nếu đang SCHEDULED
    try {
      const job = await this.autoPostQueue.getJob(`auto-post-${postId}`);
      if (job) await job.remove();
    } catch {
      /* ignore */
    }

    try {
      const fbPostId = await this.executePublish(userId, organizationId, post);
      const updated = await this.prisma.autoPost.update({
        where: { id: postId },
        data: {
          status: AutoPostStatus.PUBLISHED,
          publishedAt: new Date(),
          facebookPostId: fbPostId,
          scheduledAt: null,
          errorMessage: null,
        },
      });
      await this.prisma.autoPostPublishLog.create({
        data: {
          userId,
          postId,
          action: 'publish_now',
          status: 'success',
          facebookPostId: fbPostId,
        },
      });
      return this.serializePost(updated);
    } catch (e) {
      const msg = friendlyPublishError(e instanceof Error ? e.message : 'Đăng bài thất bại');
      await this.facebook.logApiError(userId, 'publish_now', msg, postId);
      await this.prisma.autoPost.update({
        where: { id: postId },
        data: { status: AutoPostStatus.FAILED, errorMessage: msg },
      });
      await this.prisma.autoPostPublishLog.create({
        data: {
          userId,
          postId,
          action: 'publish_now',
          status: 'failed',
          errorMessage: msg,
        },
      });
      throw new BadRequestException(msg);
    }
  }

  async schedule(userId: string, organizationId: string, dto: ScheduleAutoPostDto) {
    const scheduledAt = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Thời gian lên lịch không hợp lệ');
    }
    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException('Không thể lên lịch ở thời gian quá khứ');
    }

    const post = await this.requireOwnedPost(userId, organizationId, dto.postId);
    this.assertPublishable(post);

    // Preflight quyền/token trước khi xếp lịch
    await this.facebook.assertCanPublish(userId, organizationId, post.fanpageId!);

    const updated = await this.prisma.autoPost.update({
      where: { id: dto.postId },
      data: {
        status: AutoPostStatus.SCHEDULED,
        scheduledAt,
        approvedAt: new Date(),
        errorMessage: null,
      },
    });

    const delay = scheduledAt.getTime() - Date.now();
    await this.queueEnqueue.add(
      this.autoPostQueue,
      'publish-scheduled',
      { postId: dto.postId, userId, organizationId },
      {
        jobId: `auto-post-${dto.postId}`,
        delay,
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
      },
    );

    await this.prisma.autoPostPublishLog.create({
      data: {
        userId,
        postId: dto.postId,
        action: 'scheduled',
        status: 'success',
      },
    });

    return this.serializePost(updated);
  }

  async cancelSchedule(userId: string, organizationId: string, postId: string) {
    const post = await this.requireOwnedPost(userId, organizationId, postId);
    if (post.status !== AutoPostStatus.SCHEDULED) {
      throw new BadRequestException('Bài không ở trạng thái đã lên lịch');
    }
    const job = await this.autoPostQueue.getJob(`auto-post-${postId}`);
    if (job) await job.remove();

    const updated = await this.prisma.autoPost.update({
      where: { id: postId },
      data: {
        status: AutoPostStatus.CANCELLED,
        scheduledAt: null,
      },
    });
    return this.serializePost(updated);
  }

  async retry(userId: string, organizationId: string, postId: string) {
    const post = await this.requireOwnedPost(userId, organizationId, postId);
    if (post.status !== AutoPostStatus.FAILED) {
      throw new BadRequestException('Chỉ có thể thử lại bài ở trạng thái lỗi');
    }
    if (isPermanentPublishError(post.errorMessage)) {
      throw new BadRequestException(
        post.errorMessage?.includes('MISSING_PERMISSION')
          ? 'MISSING_PERMISSION: Không thể thử lại — thiếu quyền pages_manage_posts. Kết nối lại Fanpage.'
          : 'NEEDS_RECONNECT: Không thể thử lại — token hết hạn hoặc lỗi quyền. Kết nối lại Fanpage.',
      );
    }
    return this.publishNow(userId, organizationId, postId);
  }

  /** Called by worker for scheduled posts (API-side helper / tests) */
  async publishScheduledPost(postId: string, userId: string, organizationId: string) {
    const post = await this.prisma.autoPost.findFirst({
      where: { id: postId, userId, organizationId },
    });
    if (!post) return { skipped: true, reason: 'not_found' };
    if (post.status === AutoPostStatus.PUBLISHED && post.facebookPostId) {
      return { ok: true, facebookPostId: post.facebookPostId, idempotent: true };
    }
    if (post.status !== AutoPostStatus.SCHEDULED) {
      return { skipped: true, reason: 'not_scheduled' };
    }
    if (!post.approvedAt) {
      await this.prisma.autoPost.update({
        where: { id: postId },
        data: { status: AutoPostStatus.FAILED, errorMessage: 'Bài chưa được duyệt' },
      });
      return { skipped: true, reason: 'not_approved' };
    }

    const claimed = await this.prisma.autoPost.updateMany({
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
      const fbPostId = await this.executePublish(userId, organizationId, post);
      await this.prisma.autoPost.update({
        where: { id: postId },
        data: {
          status: AutoPostStatus.PUBLISHED,
          publishedAt: new Date(),
          facebookPostId: fbPostId,
          errorMessage: null,
        },
      });
      await this.prisma.autoPostPublishLog.create({
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
      const msg = friendlyPublishError(e instanceof Error ? e.message : 'Đăng bài thất bại');
      await this.facebook.logApiError(userId, 'scheduled_publish', msg, postId);
      await this.prisma.autoPost.update({
        where: { id: postId },
        data: { status: AutoPostStatus.FAILED, errorMessage: msg },
      });
      await this.prisma.autoPostPublishLog.create({
        data: {
          userId,
          postId,
          action: 'scheduled_publish',
          status: 'failed',
          errorMessage: msg,
        },
      });
      if (isPermanentPublishError(msg)) {
        return { failed: true, permanent: true, error: msg };
      }
      throw e;
    }
  }

  /** Worker scan fallback for overdue scheduled posts */
  async processDueScheduledPosts() {
    const due = await this.prisma.autoPost.findMany({
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
        await this.publishScheduledPost(post.id, post.userId, post.organizationId);
        processed++;
      } catch {
        /* logged in publishScheduledPost */
      }
    }
    return { due: due.length, processed };
  }

  private async executePublish(
    userId: string,
    organizationId: string,
    post: {
      fanpageId: string | null;
      caption: string;
      linkUrl: string | null;
      imageUrl: string | null;
    },
  ): Promise<string> {
    if (!post.fanpageId) throw new BadRequestException('Chưa chọn Fanpage');
    if (!post.caption?.trim()) throw new BadRequestException('Nội dung bài đăng trống');

    const { pageId, accessToken } = await this.facebook.getPageAccessToken(
      userId,
      organizationId,
      post.fanpageId,
    );

    const result = await this.meta.publishPagePost(pageId, accessToken, {
      message: post.caption.trim(),
      link: post.linkUrl ?? undefined,
      imageUrl: post.imageUrl ?? undefined,
    });
    return result.id;
  }

  private assertPublishable(post: {
    fanpageId: string | null;
    caption: string;
    status: AutoPostStatus;
    facebookPostId?: string | null;
  }) {
    if (!post.fanpageId) throw new BadRequestException('Vui lòng chọn Fanpage trước khi đăng');
    if (!post.caption?.trim()) throw new BadRequestException('Nội dung bài đăng không được trống');
    if (post.status === AutoPostStatus.PUBLISHED || post.facebookPostId) {
      // Idempotent path handled in publishNow; here for schedule/assert
      if (post.status === AutoPostStatus.PUBLISHED) {
        throw new BadRequestException('Bài đã được đăng');
      }
    }
    if (post.status === AutoPostStatus.PUBLISHING) {
      throw new BadRequestException('Bài đang được đăng');
    }
  }

  private buildPostData(
    user: AuthUser,
    dto: SaveAutoPostDraftDto,
    fanpage: { id: string; pageId: string; pageName: string } | null,
  ) {
    return {
      userId: user.id,
      organizationId: user.organizationId,
      fanpageId: fanpage?.id ?? null,
      fanpagePageId: fanpage?.pageId ?? null,
      fanpageName: fanpage?.pageName ?? null,
      postType: dto.postType,
      topic: dto.topic.trim(),
      caption: dto.caption.trim(),
      imageUrl: dto.imageUrl?.trim() || null,
      linkUrl: dto.linkUrl?.trim() || null,
      hashtags: dto.hashtags?.trim() || null,
      cta: dto.cta?.trim() || null,
      spaService: dto.spaService?.trim() || null,
      targetAudience: dto.targetAudience?.trim() || null,
      tone: dto.tone?.trim() || null,
      promotion: dto.promotion?.trim() || null,
    };
  }

  private async resolveFanpage(
    userId: string,
    organizationId: string,
    fanpageId?: string,
  ) {
    if (!fanpageId) return null;
    const page = await this.prisma.autoPostFacebookPage.findFirst({
      where: { id: fanpageId, userId, connection: { organizationId } },
    });
    if (!page) throw new NotFoundException('Fanpage không tồn tại');
    return { id: page.id, pageId: page.pageId, pageName: page.pageName };
  }

  private async requireOwnedPost(userId: string, organizationId: string, id: string) {
    const post = await this.prisma.autoPost.findFirst({
      where: { id, userId, organizationId },
    });
    if (!post) throw new NotFoundException('Bài đăng không tồn tại');
    return post;
  }

  private serializePost(post: {
    id: string;
    fanpageId: string | null;
    fanpagePageId: string | null;
    fanpageName: string | null;
    postType: string;
    topic: string;
    caption: string;
    imageUrl: string | null;
    linkUrl: string | null;
    hashtags: string | null;
    cta: string | null;
    spaService: string | null;
    targetAudience: string | null;
    tone: string | null;
    promotion: string | null;
    status: AutoPostStatus;
    scheduledAt: Date | null;
    publishedAt: Date | null;
    facebookPostId: string | null;
    errorMessage: string | null;
    approvedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ...post,
      facebookPostUrl: buildFacebookPostUrl(post.facebookPostId, post.fanpagePageId),
      scheduledAt: post.scheduledAt?.toISOString() ?? null,
      publishedAt: post.publishedAt?.toISOString() ?? null,
      approvedAt: post.approvedAt?.toISOString() ?? null,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    };
  }
}
