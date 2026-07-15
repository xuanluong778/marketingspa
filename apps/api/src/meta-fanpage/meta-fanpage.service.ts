import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { AutoPostStatus, AutoPostType } from '@marketingspa/database';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AUTO_POST_QUEUE } from '../queue/queue.constants';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import type { CreateMetaFanpagePostDto } from './dto/meta-fanpage.dto';
import {
  META_FANPAGE_PUBLISH_JOB,
  type MetaFanpagePublishJobData,
} from './meta-fanpage.queue';

type MetaErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

@Injectable()
export class MetaFanpageService {
  private readonly logger = new Logger(MetaFanpageService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(AUTO_POST_QUEUE) private readonly autoPostQueue: Queue,
  ) {}

  get graphVersion(): string {
    return (
      this.config.get<string>('META_GRAPH_VERSION')?.trim() ||
      this.config.get<string>('META_API_VERSION')?.trim() ||
      'v21.0'
    );
  }

  private get pageId(): string | undefined {
    return this.config.get<string>('META_PAGE_ID')?.trim() || undefined;
  }

  /** Chỉ dùng nội bộ — tuyệt đối không trả về API / log. */
  private get pageAccessToken(): string | undefined {
    return this.config.get<string>('META_PAGE_ACCESS_TOKEN')?.trim() || undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.pageId && this.pageAccessToken);
  }

  /** Chỉ dùng nội bộ backend (Auto Post sync) — không expose ra HTTP. */
  getEnvCredentials(): { pageId: string; accessToken: string } | null {
    if (!this.isConfigured()) return null;
    return { pageId: this.pageId!, accessToken: this.pageAccessToken! };
  }

  maskPageId(pageId: string): string {
    if (pageId.length <= 8) return `${pageId.slice(0, 2)}***`;
    return `${pageId.slice(0, 4)}***${pageId.slice(-4)}`;
  }

  async getStatus() {
    if (!this.isConfigured()) {
      return {
        connected: false,
        configured: false,
        pageId: null as string | null,
        pageIdMasked: null as string | null,
        pageName: null as string | null,
        graphVersion: this.graphVersion,
        message:
          'Chưa cấu hình META_PAGE_ID và Page Token (backend .env).',
      };
    }

    const pageId = this.pageId!;
    try {
      const page = await this.graphGet<{ id: string; name?: string }>(
        `/${pageId}`,
        { fields: 'id,name' },
      );
      return {
        connected: true,
        configured: true,
        pageId: page.id,
        pageIdMasked: this.maskPageId(page.id),
        pageName: page.name ?? null,
        graphVersion: this.graphVersion,
        message: 'Fanpage đã kết nối.',
      };
    } catch (e) {
      const mapped = this.mapMetaError(e);
      return {
        connected: false,
        configured: true,
        pageId,
        pageIdMasked: this.maskPageId(pageId),
        pageName: null as string | null,
        graphVersion: this.graphVersion,
        message: mapped.message,
        errorCode: mapped.errorCode,
      };
    }
  }

  async publishNow(user: AuthUser, dto: CreateMetaFanpagePostDto) {
    this.ensureConfigured();
    const message = dto.message.trim();
    const link = dto.link?.trim() || undefined;
    const imageUrl = dto.imageUrl?.trim() || undefined;

    if (!message) {
      throw new BadRequestException('Nội dung bài đăng không được trống');
    }
    if (link && imageUrl) {
      throw new BadRequestException(
        'Chỉ hỗ trợ một trong hai: link hoặc ảnh (không gửi cả hai cùng lúc).',
      );
    }
    this.assertHttpUrl(link, 'Link');
    this.assertHttpUrl(imageUrl, 'Ảnh');

    const pageId = this.pageId!;
    const status = await this.getStatus();
    const pageName = status.pageName ?? 'Fanpage';

    const history = await this.prisma.autoPost.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        fanpageId: null,
        fanpagePageId: pageId,
        fanpageName: pageName,
        postType: AutoPostType.SPA_SALES,
        topic: message.slice(0, 120) || 'Đăng Fanpage',
        caption: message,
        imageUrl: imageUrl ?? null,
        linkUrl: link ?? null,
        status: AutoPostStatus.PUBLISHING,
        approvedAt: new Date(),
      },
    });

    try {
      const result = imageUrl
        ? await this.publishPhoto(pageId, message, imageUrl)
        : await this.publishFeed(pageId, message, link);

      const published = await this.prisma.autoPost.update({
        where: { id: history.id },
        data: {
          status: AutoPostStatus.PUBLISHED,
          publishedAt: new Date(),
          facebookPostId: result.id,
          errorMessage: null,
          fanpageName: pageName,
        },
      });

      await this.prisma.autoPostPublishLog.create({
        data: {
          userId: user.id,
          postId: published.id,
          action: 'meta_fanpage_publish_now',
          status: 'success',
          facebookPostId: result.id,
        },
      });

      await this.prisma.autoPostApiLog.create({
        data: {
          userId: user.id,
          postId: published.id,
          action: 'meta_fanpage_publish',
          statusCode: 200,
          message: `Đã đăng bài ${result.id}`,
        },
      });

      return {
        success: true,
        postId: published.id,
        facebookPostId: result.id,
        publishedAt: published.publishedAt,
        pageIdMasked: this.maskPageId(pageId),
        pageName,
        status: published.status,
      };
    } catch (e) {
      const mapped = this.mapMetaError(e);
      await this.prisma.autoPost.update({
        where: { id: history.id },
        data: {
          status: AutoPostStatus.FAILED,
          errorMessage: mapped.message,
        },
      });
      await this.prisma.autoPostPublishLog.create({
        data: {
          userId: user.id,
          postId: history.id,
          action: 'meta_fanpage_publish_now',
          status: 'failed',
          errorMessage: mapped.message,
        },
      });
      await this.prisma.autoPostApiLog.create({
        data: {
          userId: user.id,
          postId: history.id,
          action: 'meta_fanpage_publish',
          statusCode: mapped.statusCode,
          errorCode: mapped.errorCode,
          message: mapped.message,
        },
      });
      throw mapped.exception;
    }
  }

  /**
   * Chuẩn bị job BullMQ cho lịch đăng sau này — chưa gọi từ API public.
   * Worker sẽ xử lý job `meta-fanpage-publish` khi bật schedule.
   */
  async enqueueScheduledPublish(
    data: MetaFanpagePublishJobData,
    delayMs: number,
  ): Promise<{ jobId: string }> {
    const job = await this.autoPostQueue.add(META_FANPAGE_PUBLISH_JOB, data, {
      delay: Math.max(0, delayMs),
      removeOnComplete: true,
      jobId: data.historyPostId
        ? `meta-fanpage-${data.historyPostId}`
        : undefined,
    });
    return { jobId: String(job.id) };
  }

  private ensureConfigured() {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Chưa cấu hình META_PAGE_ID và Page Token trên server (.env).',
      );
    }
  }

  private assertHttpUrl(value: string | undefined, label: string) {
    if (!value) return;
    try {
      const u = new URL(value);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        throw new Error('bad protocol');
      }
    } catch {
      throw new BadRequestException(`${label} phải là URL http/https hợp lệ`);
    }
  }

  private async publishFeed(
    pageId: string,
    message: string,
    link?: string,
  ): Promise<{ id: string }> {
    const body: Record<string, string> = { message };
    if (link) body.link = link;
    return this.graphPost<{ id: string }>(`/${pageId}/feed`, body);
  }

  private async publishPhoto(
    pageId: string,
    caption: string,
    imageUrl: string,
  ): Promise<{ id: string }> {
    return this.graphPost<{ id: string }>(`/${pageId}/photos`, {
      url: imageUrl,
      caption,
    });
  }

  private graphUrl(path: string): string {
    const clean = path.startsWith('/') ? path : `/${path}`;
    return `https://graph.facebook.com/${this.graphVersion}${clean}`;
  }

  private async graphGet<T>(
    path: string,
    query: Record<string, string> = {},
  ): Promise<T> {
    const token = this.pageAccessToken!;
    const params = new URLSearchParams({ ...query, access_token: token });
    const url = `${this.graphUrl(path)}?${params.toString()}`;
    const res = await fetch(url);
    return this.parseGraphResponse<T>(res);
  }

  private async graphPost<T>(
    path: string,
    body: Record<string, string>,
  ): Promise<T> {
    const token = this.pageAccessToken!;
    const params = new URLSearchParams({ ...body, access_token: token });
    const res = await fetch(this.graphUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    return this.parseGraphResponse<T>(res);
  }

  private async parseGraphResponse<T>(res: Response): Promise<T> {
    const raw = (await res.json()) as T & MetaErrorBody;
    if (!res.ok || raw.error) {
      const msg = raw.error?.message ?? `Meta API error (${res.status})`;
      // Không log URL/body (có thể chứa token)
      this.logger.warn(
        `Meta Graph thất bại status=${res.status} code=${raw.error?.code ?? 'n/a'} type=${raw.error?.type ?? 'n/a'}`,
      );
      const err = new Error(msg) as Error & {
        metaCode?: number;
        metaType?: string;
        httpStatus?: number;
      };
      err.metaCode = raw.error?.code;
      err.metaType = raw.error?.type;
      err.httpStatus = res.status;
      throw err;
    }
    return raw;
  }

  private mapMetaError(e: unknown): {
    message: string;
    errorCode?: string;
    statusCode: number;
    exception: Error;
  } {
    const err = e as Error & {
      metaCode?: number;
      metaType?: string;
      httpStatus?: number;
    };
    const code = err.metaCode;
    const msg = err.message || 'Meta API error';

    if (code === 190 || /session has expired|invalid oauth|cannot parse access token/i.test(msg)) {
      const message =
        'Token Fanpage hết hạn hoặc không hợp lệ. Cập nhật META_PAGE_ACCESS_TOKEN trên server.';
      return {
        message,
        errorCode: 'TOKEN_INVALID',
        statusCode: 401,
        exception: new UnauthorizedException(message),
      };
    }
    if (
      code === 200 ||
      code === 10 ||
      /permission|(#200)|pages_manage_posts|not authorized/i.test(msg)
    ) {
      const message =
        'Thiếu quyền đăng bài trên Fanpage (cần pages_manage_posts). Kiểm tra token Page.';
      return {
        message,
        errorCode: 'PERMISSION_DENIED',
        statusCode: 400,
        exception: new BadRequestException(message),
      };
    }
    if (
      code === 100 ||
      /unsupported get request|does not exist|page id/i.test(msg)
    ) {
      const message =
        'Page ID không hợp lệ hoặc token không thuộc Fanpage này. Kiểm tra META_PAGE_ID.';
      return {
        message,
        errorCode: 'INVALID_PAGE_ID',
        statusCode: 400,
        exception: new BadRequestException(message),
      };
    }
    if (code === 4 || code === 17 || code === 32 || /rate limit|too many calls/i.test(msg)) {
      const message = 'Meta đang giới hạn tần suất (rate limit). Thử lại sau vài phút.';
      return {
        message,
        errorCode: 'RATE_LIMIT',
        statusCode: 503,
        exception: new ServiceUnavailableException(message),
      };
    }

    const message = `Meta API: ${msg}`;
    return {
      message,
      errorCode: code != null ? String(code) : 'META_ERROR',
      statusCode: err.httpStatus && err.httpStatus >= 400 ? err.httpStatus : 400,
      exception: new BadRequestException(message),
    };
  }
}
