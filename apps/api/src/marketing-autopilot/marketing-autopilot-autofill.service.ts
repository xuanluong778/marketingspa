import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketingContextEngineService } from './context/marketing-context-engine.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import type { MarketingContextSnapshotPayload } from './context/marketing-context.types';
import {
  AUTOPILOT_BUDGET_PRESETS,
  AUTOPILOT_GOALS,
  VN_PROVINCES,
  goalLabels,
  inferProvinceFromAddress,
  snapBudgetToPreset,
} from './marketing-autopilot-form.constants';

export type AutofillFieldEvidence = {
  value: string | number | null;
  source: string;
  evidence: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';
  hint?: string | null;
};

export type AutofillFormPayload = {
  projectName: string;
  productId: string | null;
  productName: string;
  productPrice: number;
  customerProfile: string;
  customerMode: 'ai' | 'segment' | 'manual';
  segmentId: string | null;
  targetArea: string;
  monthlyBudget: number;
  budgetPresetId: string;
  goals: string[];
  primaryGoal: string;
};

@Injectable()
export class MarketingAutopilotAutofillService {
  private readonly logger = new Logger(MarketingAutopilotAutofillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contextEngine: MarketingContextEngineService,
  ) {}

  async getFormOptions(organizationId: string) {
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [org, services, emailSegments, savedViews, bookingCounts] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: {
          name: true,
          address: true,
          branches: { where: { isActive: true }, select: { name: true, address: true }, take: 8 },
        },
      }),
      this.prisma.service.findMany({
        where: { organizationId, isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, price: true, category: true },
        take: 50,
      }),
      Promise.resolve(
        [] as Array<{ id: string; name: string }>,
      ),
      this.prisma.leadSavedView.findMany({
        where: { organizationId },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, name: true },
        take: 20,
      }),
      this.safe(
        () =>
          this.prisma.appointment.groupBy({
            by: ['serviceId'],
            where: {
              organizationId,
              serviceId: { not: null },
              scheduledAt: { gte: from },
            },
            _count: { serviceId: true },
          }),
        [] as Array<{ serviceId: string | null; _count: { serviceId: number } }>,
      ),
    ]);

    const countByService = new Map(
      bookingCounts.filter((r) => r.serviceId).map((r) => [r.serviceId as string, r._count.serviceId]),
    );

    const products = services
      .map((s) => ({
        id: s.id,
        name: s.name,
        price: Number(s.price),
        category: s.category,
        bookingCount30d: countByService.get(s.id) ?? 0,
      }))
      .sort((a, b) => b.bookingCount30d - a.bookingCount30d || a.name.localeCompare(b.name, 'vi'));

    const defaultProvince =
      inferProvinceFromAddress(org?.address) ||
      org?.branches.map((b) => inferProvinceFromAddress(b.address)).find(Boolean) ||
      null;
    const defaultProvinceSource = inferProvinceFromAddress(org?.address)
      ? 'organization.address'
      : defaultProvince
        ? 'branch.address'
        : null;

    const derivedSegments = [
      { id: 'crm:hot', name: 'Lead nóng (MQL/SQL)', source: 'crm.leads' },
      { id: 'crm:nofollowup', name: 'Lead chưa follow-up', source: 'crm.leads' },
      { id: 'crm:booked', name: 'Khách đã booking', source: 'bookings' },
    ];

    return {
      products,
      segments: [
        ...derivedSegments,
        ...savedViews.map((v) => ({ id: `view:${v.id}`, name: v.name, source: 'crm.savedView' })),
        ...emailSegments.map((s) => ({ id: `email:${s.id}`, name: s.name, source: 'email.segment' })),
      ],
      provinces: VN_PROVINCES.map((p) => p.name),
      defaultProvince,
      defaultProvinceSource,
      organizationName: org?.name ?? '',
      organizationAddress: org?.address ?? null,
      goals: AUTOPILOT_GOALS.map((g) => ({ id: g.id, label: g.label })),
      budgetPresets: AUTOPILOT_BUDGET_PRESETS.map((p) => ({
        id: p.id,
        label: p.label,
        amount: p.amount,
      })),
    };
  }

  async autofill(
    user: AuthUser,
    input?: { goals?: string[]; productId?: string | null; customerMode?: string; segmentId?: string | null },
  ) {
    const options = await this.getFormOptions(user.organizationId);
    const { snapshot, snapshotId } = await this.contextEngine.getContext(user.organizationId, { user });
    const goals = this.normalizeGoals(input?.goals, snapshot);
    const labels = goalLabels(goals);

    const product = this.pickProduct(options.products, input?.productId);
    const area = this.pickArea(options);
    const customer = this.pickCustomer(options, snapshot, input);
    const budget = this.pickBudget(snapshot, goals, product.price);
    const projectName = this.buildProjectName(labels, product.name);

    const form: AutofillFormPayload = {
      projectName,
      productId: product.id,
      productName: product.name,
      productPrice: product.price,
      customerProfile: customer.profile,
      customerMode: customer.mode,
      segmentId: customer.segmentId,
      targetArea: area.value,
      monthlyBudget: budget.amount,
      budgetPresetId: budget.presetId,
      goals,
      primaryGoal: labels.join(' · ') || 'Tăng Booking',
    };

    const questions: string[] = [];
    if (product.confidence === 'INSUFFICIENT_DATA') questions.push('Chọn sản phẩm');
    if (customer.confidence === 'INSUFFICIENT_DATA') questions.push('Chọn khách hàng');
    if (area.confidence === 'INSUFFICIENT_DATA') questions.push('Chọn khu vực');
    if (budget.confidence === 'INSUFFICIENT_DATA') questions.push('Chọn ngân sách');

    return {
      form,
      snapshotId,
      generatedAt: snapshot.generatedAt,
      questions,
      evidence: {
        product: this.field(product.name, product.source, product.evidence, product.confidence, product.name || null),
        productPrice: this.field(
          product.price,
          product.source,
          `price=${product.price}`,
          product.confidence,
          product.price ? this.budgetHint(product.price) : null,
        ),
        customerProfile: this.field(
          customer.profile,
          customer.source,
          customer.evidence,
          customer.confidence,
          customer.hint,
        ),
        targetArea: this.field(area.value, area.source, area.evidence, area.confidence, area.value || null),
        monthlyBudget: this.field(
          budget.amount,
          budget.source,
          budget.evidence,
          budget.confidence,
          this.budgetHint(budget.amount),
        ),
        projectName: this.field(
          projectName,
          'autofill.naming',
          `goals=${labels.join(',')} product=${product.name}`,
          product.confidence === 'INSUFFICIENT_DATA' ? 'LOW' : 'HIGH',
          projectName || null,
        ),
        goals: this.field(
          labels.join(' · '),
          'user.intent+context',
          `goals=${goals.join(',')}`,
          'HIGH',
          labels.slice(0, 2).join(' + ') || null,
        ),
      },
    };
  }

  private budgetHint(amount: number): string {
    if (!amount) return '';
    const mil = amount / 1_000_000;
    if (Number.isInteger(mil)) return `${mil} triệu`;
    return `${mil.toFixed(1)} triệu`;
  }

  private field(
    value: string | number | null,
    source: string,
    evidence: string,
    confidence: AutofillFieldEvidence['confidence'],
    hint?: string | null,
  ): AutofillFieldEvidence {
    return { value, source, evidence, confidence, hint: hint || null };
  }

  private normalizeGoals(raw: string[] | undefined, snapshot: MarketingContextSnapshotPayload): string[] {
    const selected = (raw ?? []).filter((id) => AUTOPILOT_GOALS.some((g) => g.id === id));
    if (selected.length) return selected.slice(0, 3);

    const bottlenecks = snapshot.bottlenecks ?? [];
    const opportunities = snapshot.opportunities ?? [];
    if (bottlenecks.some((b) => b.kind === 'crm_followup')) {
      return ['remarketing', 'khach-cu'];
    }
    if (bottlenecks.some((b) => b.kind === 'conversion' || b.kind === 'funnel')) {
      return ['tang-booking'];
    }
    if (opportunities.some((o) => o.kind === 'hot_leads')) {
      return ['tang-booking'];
    }
    if (opportunities.some((o) => o.kind === 'remarketing')) {
      return ['remarketing', 'khach-cu'];
    }

    const noFollowUp = snapshot.metrics.leads.noFollowUp ?? 0;
    const totalLeads = snapshot.metrics.leads.total ?? 0;
    if (noFollowUp > 0 && totalLeads > 0 && noFollowUp / totalLeads >= 0.2) {
      return ['remarketing', 'khach-cu'];
    }
    if ((snapshot.metrics.leads.hot ?? 0) > 0) {
      return ['tang-booking'];
    }
    if (totalLeads === 0) {
      return ['tang-lead', 'nhan-dien'];
    }
    return ['tang-booking'];
  }

  private pickProduct(
    products: Array<{ id: string; name: string; price: number; bookingCount30d: number }>,
    productId?: string | null,
  ) {
    const selected = productId ? products.find((p) => p.id === productId) : null;
    const top = products[0] ?? null;
    const chosen = selected ?? top;
    if (!chosen) {
      return {
        id: null as string | null,
        name: '',
        price: 0,
        source: 'services',
        evidence: 'service.count=0',
        confidence: 'INSUFFICIENT_DATA' as const,
      };
    }
    return {
      id: chosen.id,
      name: chosen.name,
      price: chosen.price,
      source: selected ? 'user.product' : 'bookings+services',
      evidence: selected
        ? `serviceId=${chosen.id} price=${chosen.price}`
        : `topBookingCount30d=${chosen.bookingCount30d} service=${chosen.name} price=${chosen.price}`,
      confidence: selected ? ('HIGH' as const) : chosen.bookingCount30d > 0 ? ('HIGH' as const) : ('MEDIUM' as const),
    };
  }

  private pickArea(options: Awaited<ReturnType<MarketingAutopilotAutofillService['getFormOptions']>>) {
    if (options.defaultProvince) {
      return {
        value: options.defaultProvince,
        source: options.defaultProvinceSource ?? 'organization.address',
        evidence: `address=${options.organizationAddress ?? options.defaultProvince}`,
        confidence: 'HIGH' as const,
      };
    }
    return {
      value: '',
      source: 'organization.address',
      evidence: 'organization.address=empty',
      confidence: 'INSUFFICIENT_DATA' as const,
    };
  }

  private pickCustomer(
    options: Awaited<ReturnType<MarketingAutopilotAutofillService['getFormOptions']>>,
    snapshot: MarketingContextSnapshotPayload,
    input?: { customerMode?: string; segmentId?: string | null },
  ) {
    const mode = (['ai', 'segment', 'manual'].includes(input?.customerMode ?? '')
      ? input?.customerMode
      : 'ai') as 'ai' | 'segment' | 'manual';

    if (mode === 'segment' && input?.segmentId) {
      const seg = options.segments.find((s) => s.id === input.segmentId);
      if (seg) {
        return {
          mode,
          segmentId: seg.id,
          profile: seg.name,
          hint: seg.name,
          source: seg.source,
          evidence: `segmentId=${seg.id}`,
          confidence: 'HIGH' as const,
        };
      }
    }

    const parts: string[] = [];
    const leads = snapshot.metrics.leads;
    const bottlenecks = snapshot.bottlenecks ?? [];
    const opportunities = snapshot.opportunities ?? [];
    const w7 = snapshot.windows?.find((w) => w.days === 7);

    if (leads.total && leads.total > 0) {
      parts.push(`${leads.total} lead/30 ngày`);
      if (leads.hot) parts.push(`${leads.hot} lead nóng`);
      if (leads.noFollowUp) parts.push(`${leads.noFollowUp} chưa follow-up`);
    }
    if (w7?.metrics.leads.total) {
      parts.push(`${w7.metrics.leads.total} lead/7 ngày`);
    }
    if (snapshot.metrics.bookings.total) {
      parts.push(`${snapshot.metrics.bookings.total} booking`);
    }
    if (bottlenecks.some((b) => b.kind === 'crm_followup')) {
      parts.push('bottleneck: lead chờ follow-up');
    }
    if (opportunities.some((o) => o.kind === 'hot_leads')) {
      parts.push('cơ hội: lead nóng sẵn sàng chốt');
    }
    const namedSeg = options.segments.find((s) => s.source === 'email.segment' || s.source === 'crm.savedView');
    if (namedSeg) parts.push(`gần với segment "${namedSeg.name}"`);

    if (!parts.length) {
      return {
        mode,
        segmentId: null as string | null,
        profile: '',
        hint: null as string | null,
        source: 'crm.leads',
        evidence: 'lead.count=0; context-v2 insufficient',
        confidence: 'INSUFFICIENT_DATA' as const,
      };
    }

    const hint =
      namedSeg?.name ||
      (bottlenecks.some((b) => b.kind === 'crm_followup')
        ? 'Khách chưa chốt — ưu tiên nurture'
        : opportunities.some((o) => o.kind === 'hot_leads')
          ? 'Lead nóng'
          : 'Khách tiềm năng');
    const profile =
      (leads.noFollowUp ?? 0) > 0 || bottlenecks.some((b) => b.kind === 'crm_followup')
        ? `Khách đã tương tác nhưng chưa chốt — ${parts.join(', ')}.`
        : `Khách tiềm năng (Context V2): ${parts.join(', ')}.`;

    return {
      mode: 'ai' as const,
      segmentId: namedSeg?.id ?? (leads.hot ? 'crm:hot' : 'crm:nofollowup'),
      profile,
      hint,
      source: 'context-v2+crm.leads+bookings',
      evidence: `engine=${snapshot.engineVersion}; leads.total=${leads.total} hot=${leads.hot} noFollowUp=${leads.noFollowUp}; bottlenecks=${bottlenecks.map((b) => b.kind).join(',')}; opportunities=${opportunities.map((o) => o.kind).join(',')}`,
      confidence: (leads.total ?? 0) >= 10 ? ('HIGH' as const) : ('MEDIUM' as const),
    };
  }

  private pickBudget(
    snapshot: MarketingContextSnapshotPayload,
    goals: string[],
    productPrice: number,
  ) {
    const spend = snapshot.metrics.ads.spend;
    const cpl = snapshot.metrics.ads.cpl;
    const leads = snapshot.metrics.leads.total;
    const noFollowUp = snapshot.metrics.leads.noFollowUp ?? 0;

    if (goals.includes('remarketing') || goals.includes('khach-cu')) {
      if (noFollowUp > 0 && (spend == null || spend === 0)) {
        const snapped = snapBudgetToPreset(5_000_000);
        return {
          ...snapped,
          source: 'crm.leads',
          evidence: `noFollowUp=${noFollowUp} — ưu tiên chăm sóc trước scale ads, preset 5tr`,
          confidence: 'MEDIUM' as const,
        };
      }
    }

    if (cpl != null && cpl > 0 && (leads ?? 0) >= 5) {
      const targetLeads = Math.max(leads ?? 20, 20);
      const raw = cpl * targetLeads;
      const snapped = snapBudgetToPreset(raw);
      return {
        ...snapped,
        source: 'ads.adDailyStat',
        evidence: `cpl=${cpl} x targetLeads=${targetLeads} = ${Math.round(raw)}`,
        confidence: 'HIGH' as const,
      };
    }

    if (spend != null && spend > 0) {
      const snapped = snapBudgetToPreset(spend);
      return {
        ...snapped,
        source: 'ads.adDailyStat',
        evidence: `ads.spend.30d=${spend}`,
        confidence: 'HIGH' as const,
      };
    }

    if (productPrice > 0) {
      const raw = Math.max(productPrice * 20, 5_000_000);
      const snapped = snapBudgetToPreset(raw);
      return {
        ...snapped,
        source: 'services.price',
        evidence: `heuristic price=${productPrice} x 20 — không có ads spend/CPL`,
        confidence: 'LOW' as const,
      };
    }

    return {
      amount: 10_000_000,
      presetId: '10tr',
      source: 'autofill.default',
      evidence: 'ads.spend=null cpl=null productPrice=0 — không bịa CPL, dùng preset thận trọng 10tr',
      confidence: 'INSUFFICIENT_DATA' as const,
    };
  }

  private buildProjectName(goalLabelsList: string[], productName: string): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const goalPart = (goalLabelsList.slice(0, 2).join(' + ') || 'Autopilot').slice(0, 40);
    const productPart = (productName || 'Dịch vụ').slice(0, 40);
    return `${goalPart} · ${productPart} · ${month}/${year}`;
  }

  private async safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      this.logger.warn(`Autofill datasource failed: ${err instanceof Error ? err.message : String(err)}`);
      return fallback;
    }
  }
}
