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
import { AutoPostFacebookService } from './auto-post-facebook.service';
import { AutoPostMetaService } from './auto-post-meta.service';
import {
  generateAutoPostContent,
  rewriteAutoPostContent,
} from './auto-post-ai.logic';
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

@Injectable()
export class AutoPostService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiService,
    private readonly facebook: AutoPostFacebookService,
    private readonly meta: AutoPostMetaService,
    @Inject(AUTO_POST_QUEUE) private readonly autoPostQueue: Queue,
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
    const result = await generateAutoPostContent(this.openai, dto);
    return result;
  }

  async rewriteAi(_user: AuthUser, dto: RewriteAutoPostDto) {
    return rewriteAutoPostContent(this.openai, dto.mode, dto.caption, dto.cta);
  }

  async saveDraft(user: AuthUser, dto: SaveAutoPostDraftDto) {
    const fanpage = await this.resolveFanpage(user.id, dto.fanpageId);
    const data = this.buildPostData(user, dto, fanpage);

    if (dto.id) {
      const existing = await this.requireOwnedPost(user.id, dto.id);
      if (!EDITABLE_STATUSES.includes(existing.status)) {
        throw new BadRequestException('Không thể sửa bài ở trạng thái hiện tại');
      }
      return this.prisma.autoPost.update({
        where: { id: dto.id },
        data: { ...data, status: AutoPostStatus.DRAFT },
      });
    }

    return this.prisma.autoPost.create({
      data: { ...data, status: AutoPostStatus.DRAFT },
    });
  }

  async updatePost(user: AuthUser, dto: UpdateAutoPostDto) {
    const existing = await this.requireOwnedPost(user.id, dto.id);
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      throw new BadRequestException('Không thể cập nhật bài ở trạng thái hiện tại');
    }
    const fanpage = await this.resolveFanpage(user.id, dto.fanpageId);
    const data = this.buildPostData(user, dto, fanpage);
    return this.prisma.autoPost.update({
      where: { id: dto.id },
      data,
    });
  }

  async listPosts(userId: string, status?: AutoPostStatus) {
    const items = await this.prisma.autoPost.findMany({
      where: { userId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { items: items.map((p) => this.serializePost(p)) };
  }

  async getPost(userId: string, id: string) {
    const post = await this.requireOwnedPost(userId, id);
    return this.serializePost(post);
  }

  async deletePost(userId: string, id: string) {
    const post = await this.requireOwnedPost(userId, id);
    if (
      post.status === AutoPostStatus.PUBLISHING ||
      post.status === AutoPostStatus.PUBLISHED
    ) {
      throw new BadRequestException('Không thể xóa bài đã/đang đăng');
    }
    await this.prisma.autoPost.delete({ where: { id } });
    return { ok: true };
  }

  async publishNow(userId: string, postId: string) {
    const post = await this.requireOwnedPost(userId, postId);
    this.assertPublishable(post);
    await this.prisma.autoPost.update({
      where: { id: postId },
      data: {
        status: AutoPostStatus.PUBLISHING,
        approvedAt: new Date(),
        errorMessage: null,
      },
    });

    try {
      const fbPostId = await this.executePublish(userId, post);
      const updated = await this.prisma.autoPost.update({
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
          action: 'publish_now',
          status: 'success',
          facebookPostId: fbPostId,
        },
      });
      return this.serializePost(updated);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Đăng bài thất bại';
      await this.facebook.logApiError(userId, 'publish_now', msg, postId);
      const updated = await this.prisma.autoPost.update({
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

  async schedule(userId: string, dto: ScheduleAutoPostDto) {
    const scheduledAt = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Thời gian lên lịch không hợp lệ');
    }
    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException('Không thể lên lịch ở thời gian quá khứ');
    }

    const post = await this.requireOwnedPost(userId, dto.postId);
    this.assertPublishable(post);

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
    await this.autoPostQueue.add(
      'publish-scheduled',
      { postId: dto.postId, userId },
      { jobId: `auto-post-${dto.postId}`, delay, removeOnComplete: true },
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

  async cancelSchedule(userId: string, postId: string) {
    const post = await this.requireOwnedPost(userId, postId);
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

  async retry(userId: string, postId: string) {
    const post = await this.requireOwnedPost(userId, postId);
    if (post.status !== AutoPostStatus.FAILED) {
      throw new BadRequestException('Chỉ có thể thử lại bài ở trạng thái lỗi');
    }
    return this.publishNow(userId, postId);
  }

  /** Called by worker for scheduled posts */
  async publishScheduledPost(postId: string, userId: string) {
    const post = await this.prisma.autoPost.findFirst({ where: { id: postId, userId } });
    if (!post) return { skipped: true, reason: 'not_found' };
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

    await this.prisma.autoPost.update({
      where: { id: postId },
      data: { status: AutoPostStatus.PUBLISHING },
    });

    try {
      const fbPostId = await this.executePublish(userId, post);
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
      const msg = e instanceof Error ? e.message : 'Đăng bài thất bại';
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
        await this.publishScheduledPost(post.id, post.userId);
        processed++;
      } catch {
        /* logged in publishScheduledPost */
      }
    }
    return { due: due.length, processed };
  }

  private async executePublish(
    userId: string,
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
  }) {
    if (!post.fanpageId) throw new BadRequestException('Vui lòng chọn Fanpage trước khi đăng');
    if (!post.caption?.trim()) throw new BadRequestException('Nội dung bài đăng không được trống');
    if (post.status === AutoPostStatus.PUBLISHED) {
      throw new BadRequestException('Bài đã được đăng');
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

  private async resolveFanpage(userId: string, fanpageId?: string) {
    if (!fanpageId) return null;
    const page = await this.prisma.autoPostFacebookPage.findFirst({
      where: { id: fanpageId, userId },
    });
    if (!page) throw new NotFoundException('Fanpage không tồn tại');
    return { id: page.id, pageId: page.pageId, pageName: page.pageName };
  }

  private async requireOwnedPost(userId: string, id: string) {
    const post = await this.prisma.autoPost.findFirst({ where: { id, userId } });
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
      scheduledAt: post.scheduledAt?.toISOString() ?? null,
      publishedAt: post.publishedAt?.toISOString() ?? null,
      approvedAt: post.approvedAt?.toISOString() ?? null,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    };
  }
}
