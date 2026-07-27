import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AutoPostMetaDeletionStatus,
  AutoPostStatus,
} from '@marketingspa/database';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUTO_POST_QUEUE } from '../queue/queue.constants';
import { ChannelConnectionsService } from '../messaging/channel-connections.service';
import { AutoPostMetaService } from './auto-post-meta.service';
import {
  assertHttpsRequest,
  buildDataDeletionConfirmationCode,
  maskFacebookUserId,
  parseAndVerifySignedRequest,
  SignedRequestError,
} from './auto-post-signed-request';

@Injectable()
export class AutoPostMetaComplianceService {
  private readonly logger = new Logger(AutoPostMetaComplianceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly meta: AutoPostMetaService,
    private readonly audit: AuditService,
    private readonly channelConnections: ChannelConnectionsService,
    @Inject(AUTO_POST_QUEUE) private readonly autoPostQueue: Queue,
  ) {}

  /**
   * Meta Deauthorize Callback — revoke tokens, detach Fanpages, cancel scheduled jobs.
   * Idempotent on (facebookUserId, issued_at).
   */
  async handleDeauthorize(input: {
    signedRequest: string;
    ipAddress?: string;
    requestId?: string;
    secure?: boolean;
    forwardedProto?: string | string[];
  }) {
    this.ensureHttps(input);
    const payload = this.verifySignedRequest(input.signedRequest);
    const facebookUserId = payload.user_id;
    const issuedAt = payload.issued_at;

    const existing = await this.prisma.autoPostMetaDeauthorizeEvent.findUnique({
      where: {
        facebookUserId_issuedAt: { facebookUserId, issuedAt },
      },
    });
    if (existing) {
      this.safeAudit('auto_post.facebook.deauthorize.idempotent', {
        facebookUserId,
        eventId: existing.id,
        ipAddress: input.ipAddress,
        requestId: input.requestId,
      });
      return {
        ok: true,
        idempotent: true,
        facebookUserIdMasked: maskFacebookUserId(facebookUserId),
        userIdsAffected: existing.userIdsAffected.length,
      };
    }

    const result = await this.revokeFacebookAccess(facebookUserId);

    await this.prisma.autoPostMetaDeauthorizeEvent.create({
      data: {
        facebookUserId,
        issuedAt,
        userIdsAffected: result.userIds,
        pagesRemoved: result.pagesRemoved,
        jobsCancelled: result.jobsCancelled,
      },
    });

    this.safeAudit('auto_post.facebook.deauthorize.completed', {
      facebookUserId,
      userIdsAffected: result.userIds.length,
      pagesRemoved: result.pagesRemoved,
      jobsCancelled: result.jobsCancelled,
      organizationIds: result.organizationIds,
      ipAddress: input.ipAddress,
      requestId: input.requestId,
    });

    return {
      ok: true,
      idempotent: false,
      facebookUserIdMasked: maskFacebookUserId(facebookUserId),
      userIdsAffected: result.userIds.length,
      pagesRemoved: result.pagesRemoved,
      jobsCancelled: result.jobsCancelled,
    };
  }

  /**
   * Meta Data Deletion Callback — delete/anonymize FB Auto Post data; return status URL.
   * Idempotent on facebookUserId (same confirmation_code).
   */
  async handleDataDeletion(input: {
    signedRequest: string;
    ipAddress?: string;
    requestId?: string;
    secure?: boolean;
    forwardedProto?: string | string[];
  }): Promise<{ url: string; confirmation_code: string }> {
    this.ensureHttps(input);
    const payload = this.verifySignedRequest(input.signedRequest);
    const facebookUserId = payload.user_id;
    const confirmationCode = buildDataDeletionConfirmationCode(facebookUserId);

    const existing = await this.prisma.autoPostMetaDataDeletionRequest.findUnique({
      where: { facebookUserId },
    });
    if (existing?.status === AutoPostMetaDeletionStatus.COMPLETED) {
      this.safeAudit('auto_post.facebook.data_deletion.idempotent', {
        facebookUserId,
        confirmationCode: existing.confirmationCode,
        ipAddress: input.ipAddress,
        requestId: input.requestId,
      });
      return {
        url: this.buildStatusUrl(existing.confirmationCode),
        confirmation_code: existing.confirmationCode,
      };
    }

    let request = existing;
    if (!request) {
      try {
        request = await this.prisma.autoPostMetaDataDeletionRequest.create({
          data: {
            confirmationCode,
            facebookUserId,
            status: AutoPostMetaDeletionStatus.PENDING,
          },
        });
      } catch {
        // Concurrent create — reload
        request = await this.prisma.autoPostMetaDataDeletionRequest.findUnique({
          where: { facebookUserId },
        });
        if (!request) throw new BadRequestException('Unable to create deletion request');
        if (request.status === AutoPostMetaDeletionStatus.COMPLETED) {
          return {
            url: this.buildStatusUrl(request.confirmationCode),
            confirmation_code: request.confirmationCode,
          };
        }
      }
    }

    if (!request) {
      throw new BadRequestException('Unable to create deletion request');
    }

    const revoke = await this.revokeFacebookAccess(facebookUserId);
    const anonymized = await this.anonymizeFacebookPosts(revoke.userIds);

    await this.prisma.autoPostMetaDataDeletionRequest.update({
      where: { id: request.id },
      data: {
        status: AutoPostMetaDeletionStatus.COMPLETED,
        confirmationCode: request.confirmationCode || confirmationCode,
        userIdsAffected: revoke.userIds,
        organizationIds: revoke.organizationIds,
        postsAnonymized: anonymized.postsAnonymized,
        pagesRemoved: revoke.pagesRemoved,
        scheduledCancelled: revoke.jobsCancelled + anonymized.scheduledCancelled,
        completedAt: new Date(),
      },
    });

    this.safeAudit('auto_post.facebook.data_deletion.completed', {
      facebookUserId,
      confirmationCode: request.confirmationCode,
      userIdsAffected: revoke.userIds.length,
      pagesRemoved: revoke.pagesRemoved,
      postsAnonymized: anonymized.postsAnonymized,
      scheduledCancelled: revoke.jobsCancelled + anonymized.scheduledCancelled,
      organizationIds: revoke.organizationIds,
      ipAddress: input.ipAddress,
      requestId: input.requestId,
    });

    return {
      url: this.buildStatusUrl(request.confirmationCode),
      confirmation_code: request.confirmationCode,
    };
  }

  async getDeletionStatus(confirmationCode: string) {
    const code = confirmationCode?.trim();
    if (!code) throw new BadRequestException('confirmation_code is required');

    const row = await this.prisma.autoPostMetaDataDeletionRequest.findUnique({
      where: { confirmationCode: code },
    });

    if (!row) {
      return {
        confirmation_code: code,
        status: AutoPostMetaDeletionStatus.NOT_FOUND,
        message: 'Không tìm thấy yêu cầu xóa dữ liệu với mã này.',
        completed_at: null as string | null,
        facebook_user_id_masked: null as string | null,
      };
    }

    return {
      confirmation_code: row.confirmationCode,
      status: row.status,
      message:
        row.status === AutoPostMetaDeletionStatus.COMPLETED
          ? 'Đã xóa/ẩn danh dữ liệu Facebook Auto Post liên quan.'
          : 'Yêu cầu đang được xử lý.',
      completed_at: row.completedAt?.toISOString() ?? null,
      facebook_user_id_masked: maskFacebookUserId(row.facebookUserId),
      pages_removed: row.pagesRemoved,
      posts_anonymized: row.postsAnonymized,
      scheduled_cancelled: row.scheduledCancelled,
    };
  }

  private verifySignedRequest(signedRequest: string) {
    try {
      return parseAndVerifySignedRequest(signedRequest, this.meta.appSecret);
    } catch (e) {
      if (e instanceof SignedRequestError) {
        this.logger.warn(`Meta signed_request rejected: ${e.message}`);
        throw new UnauthorizedException(e.message);
      }
      throw e;
    }
  }

  private ensureHttps(input: {
    secure?: boolean;
    forwardedProto?: string | string[];
  }) {
    try {
      assertHttpsRequest({
        secure: input.secure,
        forwardedProto: input.forwardedProto,
        nodeEnv: this.config.get<string>('NODE_ENV') ?? process.env.NODE_ENV,
      });
    } catch (e) {
      if (e instanceof SignedRequestError) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }
  }

  private buildStatusUrl(confirmationCode: string): string {
    const appUrl = (
      this.config.get<string>('APP_URL') ??
      process.env.APP_URL ??
      'https://marketingautoaz.com'
    ).replace(/\/$/, '');
    return `${appUrl}/facebook/data-deletion/status/${encodeURIComponent(confirmationCode)}`;
  }

  /** Invalidate tokens, remove Fanpages, cancel related BullMQ jobs. */
  private async revokeFacebookAccess(facebookUserId: string) {
    const connections = await this.prisma.autoPostFacebookConnection.findMany({
      where: { facebookUserId },
      select: { id: true, userId: true, organizationId: true },
    });

    const userIds = [...new Set(connections.map((c) => c.userId))];
    const organizationIds = [...new Set(connections.map((c) => c.organizationId))];
    let pagesRemoved = 0;
    let jobsCancelled = 0;

    for (const userId of userIds) {
      const pages = await this.prisma.autoPostFacebookPage.findMany({
        where: { userId },
        select: { id: true, pageId: true },
      });
      pagesRemoved += pages.length;

      for (const page of pages) {
        await this.channelConnections.disableMessengerPageAccess(page.pageId, {
          reason: 'Facebook deauthorized',
        });
      }

      const scheduled = await this.prisma.autoPost.findMany({
        where: { userId, status: AutoPostStatus.SCHEDULED },
        select: { id: true },
      });
      for (const post of scheduled) {
        try {
          const job = await this.autoPostQueue.getJob(`auto-post-${post.id}`);
          if (job) {
            await job.remove();
            jobsCancelled++;
          }
        } catch (e) {
          this.logger.warn(
            `Failed to cancel auto-post job ${post.id}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }

      if (scheduled.length > 0) {
        await this.prisma.autoPost.updateMany({
          where: { userId, status: AutoPostStatus.SCHEDULED },
          data: {
            status: AutoPostStatus.CANCELLED,
            scheduledAt: null,
            errorMessage: 'Cancelled: Facebook deauthorized',
          },
        });
      }

      await this.prisma.autoPostFacebookPage.deleteMany({ where: { userId } });
      // Hard-delete connection rows so tokens cannot be recovered
      await this.prisma.autoPostFacebookConnection.deleteMany({ where: { userId } });
    }

    this.logger.log(
      `Revoked Auto Post Facebook access for ${maskFacebookUserId(facebookUserId)} users=${userIds.length} pages=${pagesRemoved} jobs=${jobsCancelled}`,
    );

    return { userIds, organizationIds, pagesRemoved, jobsCancelled };
  }

  /** Anonymize Facebook-linked fields on Auto Post records for affected users. */
  private async anonymizeFacebookPosts(userIds: string[]) {
    if (userIds.length === 0) {
      return { postsAnonymized: 0, scheduledCancelled: 0 };
    }

    const scheduled = await this.prisma.autoPost.updateMany({
      where: { userId: { in: userIds }, status: AutoPostStatus.SCHEDULED },
      data: {
        status: AutoPostStatus.CANCELLED,
        scheduledAt: null,
        errorMessage: 'Cancelled: Facebook data deletion',
      },
    });

    const result = await this.prisma.autoPost.updateMany({
      where: { userId: { in: userIds } },
      data: {
        fanpageId: null,
        fanpagePageId: null,
        fanpageName: null,
        facebookPostId: null,
        imageUrl: null,
        linkUrl: null,
        caption: '[deleted — Facebook data deletion request]',
        hashtags: null,
        cta: null,
        topic: '[deleted]',
        errorMessage: null,
      },
    });

    // Scrub publish logs that store facebook post ids
    await this.prisma.autoPostPublishLog.updateMany({
      where: { userId: { in: userIds } },
      data: { facebookPostId: null, errorMessage: null },
    });

    await this.prisma.autoPostApiLog.updateMany({
      where: { userId: { in: userIds } },
      data: { message: '[redacted — Facebook data deletion]' },
    });

    return {
      postsAnonymized: result.count,
      scheduledCancelled: scheduled.count,
    };
  }

  private safeAudit(
    action: string,
    meta: {
      facebookUserId: string;
      confirmationCode?: string;
      eventId?: string;
      userIdsAffected?: number;
      pagesRemoved?: number;
      postsAnonymized?: number;
      jobsCancelled?: number;
      scheduledCancelled?: number;
      organizationIds?: string[];
      ipAddress?: string;
      requestId?: string;
    },
  ) {
    void this.audit
      .log({
        action,
        entityType: 'AutoPostFacebook',
        entityId: maskFacebookUserId(meta.facebookUserId),
        ipAddress: meta.ipAddress,
        requestId: meta.requestId,
        metadata: {
          facebookUserIdMasked: maskFacebookUserId(meta.facebookUserId),
          confirmationCode: meta.confirmationCode,
          eventId: meta.eventId,
          userIdsAffected: meta.userIdsAffected,
          pagesRemoved: meta.pagesRemoved,
          postsAnonymized: meta.postsAnonymized,
          jobsCancelled: meta.jobsCancelled,
          scheduledCancelled: meta.scheduledCancelled,
          organizationCount: meta.organizationIds?.length,
          // Never include tokens / app secret / raw signed_request
        },
      })
      .catch((e) => {
        this.logger.warn(
          `Audit log failed for ${action}: ${e instanceof Error ? e.message : String(e)}`,
        );
      });
  }
}
