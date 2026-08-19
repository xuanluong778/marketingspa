import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantOwnershipService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertById(model: string, organizationId: string, id?: string | null, branchId?: string | null) {
    if (!id) return null;
    const row = await (this.prisma as any)[model].findFirst({ where: { id, organizationId } });
    if (!row) throw new NotFoundException(`${model} not found`);
    if (branchId && row.branchId && row.branchId !== branchId) {
      throw new ForbiddenException(`${model} not in branch`);
    }
    return row;
  }

  assertCustomer(organizationId: string, id?: string | null) { return this.assertById('customer', organizationId, id); }
  assertLead(organizationId: string, id?: string | null, branchId?: string | null) { return this.assertById('lead', organizationId, id, branchId); }
  assertEmployee(organizationId: string, id?: string | null, branchId?: string | null) { return this.assertById('employee', organizationId, id, branchId); }
  assertIntegration(organizationId: string, id?: string | null) { return this.assertById('integration', organizationId, id); }
  assertService(organizationId: string, id?: string | null) { return this.assertById('service', organizationId, id); }
  assertSpaRoom(organizationId: string, id?: string | null) { return this.assertById('spaRoom', organizationId, id); }
  assertSpaBed(organizationId: string, id?: string | null) { return this.assertById('spaBed', organizationId, id); }
  assertSpaEquipment(organizationId: string, id?: string | null) { return this.assertById('spaEquipment', organizationId, id); }
  assertAdAccount(organizationId: string, id?: string | null) { return this.assertById('adAccount', organizationId, id); }
  assertAdCampaign(organizationId: string, id?: string | null) { return this.assertById('adCampaign', organizationId, id); }
  assertAdSet(organizationId: string, id?: string | null) { return this.assertById('adSet', organizationId, id); }
  assertAdCreative(organizationId: string, id?: string | null) { return this.assertById('adCreative', organizationId, id); }
  assertFunnel(organizationId: string, id?: string | null) {
    return this.assertById('funnelRecommendation', organizationId, id);
  }

  async validateBranchBoundRelations(organizationId: string, rel: Record<string, any> = {}) {
    const branchId = rel.branchId ?? null;
    if (branchId) await this.assertById('branch', organizationId, branchId);
    const pairs: Array<[string, string]> = [
      ['customerId', 'customer'], ['leadId', 'lead'], ['employeeId', 'employee'],
      ['assignedToId', 'employee'], ['serviceId', 'service'], ['leadSourceId', 'leadSource'],
      ['stageId', 'funnelStage'], ['pipelineId', 'funnelPipeline'], ['adCampaignId', 'adCampaign'],
    ];
    for (const [key, model] of pairs) {
      if (rel[key]) await this.assertById(model, organizationId, rel[key], branchId);
    }
  }
}
