import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@marketingspa/database';
import {
  applyFunnelInlineContentPatch,
  diffFunnelCompleteSpecs,
  funnelInlineContentChanged,
  parseFunnelCompleteSpec,
  sanitizeFunnelInlineContentPatch,
  type FunnelCompleteSpec,
} from '@marketingspa/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';

@Injectable()
export class FunnelInlineEditService {
  constructor(private readonly prisma: PrismaService) {}

  canEditFunnel(user: AuthUser): boolean {
    if (user.role === 'OWNER' || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      return true;
    }
    return (user.permissions ?? []).includes('lead.write');
  }

  async getPreviewForm(user: AuthUser, recommendationId: string) {
    const canEdit = this.canEditFunnel(user);
    const rec = await this.prisma.funnelRecommendation.findFirst({
      where: { id: recommendationId, organizationId: user.organizationId },
    });
    if (!rec) throw new NotFoundException('Funnel không tồn tại');
    if (rec.status === 'ARCHIVED') {
      throw new BadRequestException('Funnel đã lưu trữ — không xem preview');
    }
    if (!rec.completeSpec) {
      throw new BadRequestException('Funnel chưa có nội dung — hãy tạo phễu trước');
    }

    let spec: FunnelCompleteSpec;
    try {
      spec = parseFunnelCompleteSpec(rec.completeSpec);
    } catch {
      throw new BadRequestException('completeSpec không hợp lệ');
    }

    let hasUnpublishedChanges = false;
    if (rec.status === 'ACTIVE' && rec.publishedSpec) {
      try {
        const published = parseFunnelCompleteSpec(rec.publishedSpec);
        hasUnpublishedChanges = funnelInlineContentChanged(published, spec);
      } catch {
        hasUnpublishedChanges = true;
      }
    }

    const formId = spec.nodes.find((n) => n.type === 'FORM')?.id ?? rec.id;
    return {
      id: rec.id,
      formId,
      name: spec.name,
      offer: spec.offer,
      cta: spec.cta,
      summary: spec.summary,
      leadForm: spec.leadForm,
      appearance: spec.appearance ?? null,
      status: rec.status,
      canEdit,
      editMode: canEdit,
      liveFrozen: rec.status === 'ACTIVE',
      hasUnpublishedChanges,
      publishedVersion: rec.publishedVersion,
      previewOnly: rec.status !== 'ACTIVE',
    };
  }

  async saveInlineContent(
    user: AuthUser,
    recommendationId: string,
    rawPatch: unknown,
  ) {
    if (!this.canEditFunnel(user)) {
      throw new ForbiddenException('Không có quyền chỉnh sửa phễu');
    }
    const rec = await this.prisma.funnelRecommendation.findFirst({
      where: { id: recommendationId, organizationId: user.organizationId },
    });
    if (!rec) throw new NotFoundException('Funnel không tồn tại');
    if (rec.status === 'ARCHIVED') {
      throw new BadRequestException('Funnel ARCHIVED — không sửa');
    }
    if (!rec.completeSpec) {
      throw new BadRequestException('Chưa có completeSpec');
    }

    let current: FunnelCompleteSpec;
    try {
      current = parseFunnelCompleteSpec(rec.completeSpec);
    } catch {
      throw new BadRequestException('completeSpec hiện tại không hợp lệ');
    }

    const patch = sanitizeFunnelInlineContentPatch(rawPatch);
    const merged = applyFunnelInlineContentPatch(current, patch);

    await this.prisma.funnelRecommendation.update({
      where: { id: rec.id },
      data: { completeSpec: merged as unknown as Prisma.InputJsonValue },
    });

    let hasUnpublishedChanges = rec.status === 'ACTIVE';
    if (rec.status === 'ACTIVE' && rec.publishedSpec) {
      try {
        const published = parseFunnelCompleteSpec(rec.publishedSpec);
        hasUnpublishedChanges = funnelInlineContentChanged(published, merged);
      } catch {
        hasUnpublishedChanges = true;
      }
    }

    return {
      recommendationId: rec.id,
      complete: merged,
      saved: true,
      liveFrozen: rec.status === 'ACTIVE',
      hasUnpublishedChanges,
      publishedVersion: rec.publishedVersion,
    };
  }

  diffDraftVsLive(recommendationId: string, organizationId: string) {
    return this.prisma.funnelRecommendation.findFirst({
      where: { id: recommendationId, organizationId },
      select: { completeSpec: true, publishedSpec: true, status: true },
    }).then((rec) => {
      if (!rec?.completeSpec || !rec.publishedSpec || rec.status !== 'ACTIVE') return [];
      try {
        const before = parseFunnelCompleteSpec(rec.publishedSpec);
        const after = parseFunnelCompleteSpec(rec.completeSpec);
        return diffFunnelCompleteSpecs(before, after);
      } catch {
        return [{ path: 'spec', before: 'invalid', after: 'invalid' }];
      }
    });
  }
}
