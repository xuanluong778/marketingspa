/**
 * Marketing Autopilot → Facebook Fanpage publish bridge.
 * Reuses AutoPostService / AutoPostFacebookService — no duplicate Graph integration.
 */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AutoPostStatus } from '@marketingspa/database';
import {
  getAutopilotFacebookPublishBlock,
  OUTCOME_MUTATION_LOCK_TTL_MS,
} from '@marketingspa/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AutoPostService } from '../../auto-post/auto-post.service';
import { AutoPostFacebookService } from '../../auto-post/auto-post-facebook.service';
import { MarketingAutopilotGuardrailService } from '../marketing-autopilot-guardrail.service';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';

export type AutopilotFacebookPublishResult = {
  postId: string;
  pageId: string | null;
  fanpageId: string | null;
  facebookPostId: string | null;
  status: string;
  publishedAt: string | null;
  scheduledAt: string | null;
  error: string | null;
  idempotent: boolean;
};

@Injectable()
export class MarketingAutopilotFacebookPublishService {
  private readonly logger = new Logger(MarketingAutopilotFacebookPublishService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly autoPost: AutoPostService,
    private readonly autoPostFacebook: AutoPostFacebookService,
    private readonly guardrailService: MarketingAutopilotGuardrailService,
  ) {}

  /** Guardrail + token/page/permission — fail-safe before schedule/publish. */
  async assertCanPublishForPost(userId: string, organizationId: string, postId: string) {
    await this.assertAutopilotGuardrails(organizationId);

    const post = await this.prisma.autoPost.findFirst({
      where: { id: postId, organizationId },
    });
    if (!post) {
      throw new BadRequestException('AutoPost không tồn tại');
    }
    if (!post.fanpageId) {
      throw new BadRequestException('AutoPost chưa gán Fanpage — chọn Fanpage trước khi đăng');
    }
    await this.autoPostFacebook.assertCanPublish(userId, organizationId, post.fanpageId);
    return post;
  }

  private async assertAutopilotGuardrails(organizationId: string) {
    const guardrail = await this.guardrailService.getOrCreate(organizationId);
    const block = getAutopilotFacebookPublishBlock(guardrail);
    if (block.blocked) {
      throw new BadRequestException(block.message);
    }
    return guardrail;
  }

  /**
   * Publish or schedule via existing Auto Post queue/API.
   * Idempotent: reuses AutoPost publish lock + PUBLISHED+facebookPostId short-circuit.
   */
  async publishApprovedPost(input: {
    user: AuthUser;
    missionId: string;
    approvalId: string;
    postId: string;
    scheduledAt?: string | null;
  }): Promise<AutopilotFacebookPublishResult> {
    const lockKey = `autopilot-fb-publish:${input.postId}`;
    const locked = await this.acquireLock(input.user.organizationId, lockKey, input.user.id);
    if (!locked) {
      const existing = await this.readPostOutcome(input.postId, input.user.organizationId);
      if (existing.facebookPostId || existing.status === AutoPostStatus.SCHEDULED) {
        return { ...existing, idempotent: true };
      }
      throw new BadRequestException('Autopilot Facebook publish đang xử lý — thử lại sau');
    }

    try {
      const post = await this.assertCanPublishForPost(
        input.user.id,
        input.user.organizationId,
        input.postId,
      );

      if (post.status === AutoPostStatus.PUBLISHED && post.facebookPostId) {
        return { ...(await this.readPostOutcome(post.id, input.user.organizationId)), idempotent: true };
      }
      if (post.status === AutoPostStatus.SCHEDULED && post.scheduledAt) {
        return { ...(await this.readPostOutcome(post.id, input.user.organizationId)), idempotent: true };
      }

      const scheduleIso = input.scheduledAt?.trim() || post.scheduledAt?.toISOString() || null;
      const scheduleAt = scheduleIso ? new Date(scheduleIso) : null;
      const useSchedule = scheduleAt && scheduleAt.getTime() > Date.now() + 30_000;

      // Re-check connection/token/permission immediately before enqueue/Graph
      await this.autoPostFacebook.assertCanPublish(
        input.user.id,
        input.user.organizationId,
        post.fanpageId!,
      );

      let serialized: {
        id: string;
        status: string;
        facebookPostId?: string | null;
        fanpagePageId?: string | null;
        fanpageId?: string | null;
        publishedAt?: string | null;
        scheduledAt?: string | null;
      };

      if (useSchedule && scheduleAt) {
        serialized = (await this.autoPost.schedule(input.user.id, input.user.organizationId, {
          postId: input.postId,
          scheduledAt: scheduleAt.toISOString(),
          fanpageIds: post.fanpageId ? [post.fanpageId] : undefined,
        })) as typeof serialized;
      } else {
        serialized = (await this.autoPost.publishNow(
          input.user.id,
          input.user.organizationId,
          input.postId,
        )) as typeof serialized;
      }

      const outcome = await this.readPostOutcome(input.postId, input.user.organizationId);

      await this.audit.log({
        organizationId: input.user.organizationId,
        userId: input.user.id,
        action: useSchedule ? 'AUTOPILOT_FACEBOOK_SCHEDULED' : 'AUTOPILOT_FACEBOOK_PUBLISHED',
        entityType: 'AUTO_POST',
        entityId: input.postId,
        metadata: {
          missionId: input.missionId,
          approvalId: input.approvalId,
          pageId: outcome.pageId,
          facebookPostId: outcome.facebookPostId,
          status: outcome.status,
          scheduledAt: outcome.scheduledAt,
          publishedAt: outcome.publishedAt,
          error: outcome.error,
        },
      });

      this.logger.log(
        `[autopilot-fb] post ${input.postId} → ${outcome.status} page=${outcome.pageId} fbId=${outcome.facebookPostId ?? 'n/a'}`,
      );

      return { ...outcome, idempotent: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const outcome = await this.readPostOutcome(input.postId, input.user.organizationId);

      await this.audit.log({
        organizationId: input.user.organizationId,
        userId: input.user.id,
        action: 'AUTOPILOT_FACEBOOK_PUBLISH_FAILED',
        entityType: 'AUTO_POST',
        entityId: input.postId,
        metadata: {
          missionId: input.missionId,
          approvalId: input.approvalId,
          pageId: outcome.pageId,
          facebookPostId: outcome.facebookPostId,
          status: outcome.status,
          error: message,
          publishedAt: outcome.publishedAt,
          scheduledAt: outcome.scheduledAt,
        },
      });

      this.logger.warn(
        `[autopilot-fb] post ${input.postId} fail-safe: ${message} (status=${outcome.status})`,
      );
      throw err;
    } finally {
      await this.releaseLock(input.user.organizationId, lockKey);
    }
  }

  private async readPostOutcome(
    postId: string,
    organizationId: string,
  ): Promise<Omit<AutopilotFacebookPublishResult, 'idempotent'>> {
    const row = await this.prisma.autoPost.findFirst({
      where: { id: postId, organizationId },
    });
    if (!row) {
      return {
        postId,
        pageId: null,
        fanpageId: null,
        facebookPostId: null,
        status: 'MISSING',
        publishedAt: null,
        scheduledAt: null,
        error: 'post_not_found',
      };
    }
    return {
      postId: row.id,
      pageId: row.fanpagePageId,
      fanpageId: row.fanpageId,
      facebookPostId: row.facebookPostId,
      status: row.status,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      error: row.errorMessage ?? null,
    };
  }

  private async acquireLock(organizationId: string, lockKey: string, holder: string): Promise<boolean> {
    const now = new Date();
    await this.prisma.marketingAutopilotOutcomeMutationLock.deleteMany({
      where: { organizationId, expiresAt: { lt: now } },
    });
    const existing = await this.prisma.marketingAutopilotOutcomeMutationLock.findUnique({
      where: { organizationId_lockKey: { organizationId, lockKey } },
    });
    if (existing && existing.expiresAt > now) return false;
    try {
      await this.prisma.marketingAutopilotOutcomeMutationLock.create({
        data: {
          organizationId,
          lockKey,
          holder,
          expiresAt: new Date(now.getTime() + OUTCOME_MUTATION_LOCK_TTL_MS),
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  private async releaseLock(organizationId: string, lockKey: string) {
    await this.prisma.marketingAutopilotOutcomeMutationLock.deleteMany({
      where: { organizationId, lockKey },
    });
  }
}
