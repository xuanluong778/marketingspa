'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Check,
  CheckCircle2,
  Coins,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Loader2,
  Megaphone,
  Pencil,
  Sparkles,
  Target,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/shared/page-state';
import { formatMutationError } from '@/lib/format-mutation-error';
import { formatDateTime } from '@/lib/format';
import { BudgetScenarioPanel } from '@/components/marketing-autopilot/budget-scenario-panel';
import { ContentDraftPanel } from '@/components/marketing-autopilot/content-draft-panel';
import {
  draftStatusLabel,
  draftTypeLabel,
  formatCompactNumber,
  formatVnd,
  resolveDisplayStatus,
  shortText,
} from '@/lib/marketing-autopilot-labels';
import type { AutopilotAnalysisView } from '@/lib/marketing-autopilot-project-query';
import { cn } from '@/lib/utils';
import type {
  AutopilotContentIdeaView,
  MarketingAutopilotConfirmDraftResponse,
  MarketingAutopilotProject,
  MarketingMission,
} from '@/types/marketing-autopilot';
import type { UseMutationResult } from '@tanstack/react-query';
import { useT } from '@/i18n/i18n-provider';

const AUTOPILOT_DRAFT_TYPES = [
  'CONTENT_DRAFT',
  'FUNNEL_DRAFT',
  'AUTOMATION_DRAFT',
  'CAMPAIGN_DRAFT',
] as const;

type AutopilotDraftType = (typeof AUTOPILOT_DRAFT_TYPES)[number];

const DRAFT_EDIT_FALLBACK: Record<AutopilotDraftType, string> = {
  CONTENT_DRAFT: '/teleprompter',
  FUNNEL_DRAFT: '/funnel',
  AUTOMATION_DRAFT: '/automation?tab=flows',
  CAMPAIGN_DRAFT: '/automation?tab=campaigns',
};

const SUB_TABS: Array<{ id: AutopilotAnalysisView; labelKey: string }> = [
  { id: 'overview', labelKey: 'autopilot.overview' },
  { id: 'todos', labelKey: 'autopilot.actionPlan' },
  { id: 'budget', labelKey: 'autopilot.budgetSim' },
];

const BUDGET_COLORS = ['#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444', '#06b6d4'];

const DEPLOYMENT_STEPS = [
  'Thu thập dữ liệu',
  'Phân tích AI',
  'Lập kế hoạch',
  'Tạo tài sản',
  'Chờ duyệt',
] as const;

function isAutopilotDraftType(raw: unknown): raw is AutopilotDraftType {
  return typeof raw === 'string' && (AUTOPILOT_DRAFT_TYPES as readonly string[]).includes(raw);
}

type AnalysisJson = {
  summary?: string;
  suggestedChannels?: string[];
  nextBestActions?: Array<Record<string, unknown>>;
  budgetScenarios?: unknown[];
  budgetSplit?: Array<{ channel: string; percent: number }>;
  plan?: unknown;
  score?: number;
};

type Props = {
  enabled: boolean;
  analysisView: AutopilotAnalysisView;
  onAnalysisViewChange: (view: AutopilotAnalysisView) => void;
  currentProject: MarketingAutopilotProject | null;
  currentAnalysis: AnalysisJson | null;
  currentMission: MarketingMission | null | undefined;
  createdDraftsByType: Partial<
    Record<AutopilotDraftType, { draftId: string; editUrl: string; status: string }>
  >;
  contentDraftFallback: AutopilotContentIdeaView[];
  contentDraftEditUrl: string | null;
  productPriceFallback?: number;
  metrics?: Record<string, unknown>;
  confirmDraft: UseMutationResult<
    MarketingAutopilotConfirmDraftResponse,
    Error,
    { projectId: string; idempotencyKey?: string; draftTypes?: string[] },
    unknown
  >;
  approveMission: UseMutationResult<MarketingMission, Error, string, unknown>;
  onLocalDraftUpdate: (
    rows: Array<{ type: string; draftId: string; editUrl?: string; status?: string }>,
  ) => void;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function planText(plan: unknown, key: string): string | null {
  const root = asRecord(plan);
  if (!root) return null;
  const section = asRecord(root[key]);
  if (!section) {
    const direct = root[key];
    return typeof direct === 'string' && direct.trim() ? direct.trim() : null;
  }
  for (const field of ['summary', 'strategy', 'description', 'text', 'headline']) {
    const v = section[field];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function funnelStages(plan: unknown): Array<{ name: string; objective?: string }> {
  const root = asRecord(plan);
  const funnel = asRecord(root?.funnel);
  const stages = funnel?.stages;
  if (!Array.isArray(stages)) return [];
  return stages
    .map((s) => {
      const row = asRecord(s);
      const name = typeof row?.name === 'string' ? row.name : null;
      if (!name) return null;
      return {
        name,
        objective: typeof row?.objective === 'string' ? row.objective : undefined,
      };
    })
    .filter(Boolean) as Array<{ name: string; objective?: string }>;
}

function estimateReady(scenarios: AnalysisJson['budgetScenarios']) {
  const list = Array.isArray(scenarios) ? scenarios : [];
  const preferred =
    list.find((s) => {
      const row = asRecord(s);
      return row?.scenarioId === 'current' || row?.label === 'Hiện tại';
    }) ?? list[0];
  const est = asRecord(asRecord(preferred)?.estimates);
  const read = (key: string): number | null => {
    const m = asRecord(est?.[key]);
    const v = m?.value;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    return null;
  };
  const leads = read('leads');
  const bookings = read('bookings');
  const revenue = read('revenue');
  const cpl = read('cpl');
  const cpa = read('cpa');
  const roas = read('roas');
  const hasData = [leads, bookings, revenue, cpl, cpa, roas].some((v) => v != null);
  return { leads, bookings, revenue, cpl, cpa, roas, hasData };
}

function parseConfidencePercent(raw?: string | null, score?: number): number | null {
  if (typeof score === 'number' && Number.isFinite(score)) return Math.round(score);
  if (!raw) return null;
  const m = /(\d{1,3})\s*%/.exec(raw);
  if (m) return Number(m[1]);
  if (/cao|high/i.test(raw)) return 90;
  if (/trung|medium/i.test(raw)) return 70;
  if (/thấp|low/i.test(raw)) return 50;
  return null;
}

function statusBadgeClass(status: string) {
  if (status.includes('Chờ duyệt') || status.includes('Sẵn sàng')) {
    return 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30';
  }
  if (status.includes('Đang chạy') || status.includes('Hoàn thành') || status.includes('Đã duyệt')) {
    return 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30';
  }
  if (status.includes('lỗi') || status.includes('Lỗi')) {
    return 'bg-red-500/15 text-red-300 ring-1 ring-red-500/30';
  }
  return 'bg-white/10 text-white/80 ring-1 ring-white/15';
}

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-white/10 bg-[#0f2a24]/60 p-4', className)}>
      <h3 className="mb-3 text-sm font-semibold text-white/90">{title}</h3>
      {children}
    </div>
  );
}

type ActionPlanRow = {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  title: string;
  countLabel: string;
  purpose: string;
  impact: string;
  ready: boolean;
  href?: string;
  draftType?: AutopilotDraftType;
};

function ActionPlanTable({
  rows,
  enabled,
  confirmDraftPending,
  pendingDraftType,
  onCreateDraft,
  onViewAll,
  wrapText = false,
}: {
  rows: ActionPlanRow[];
  enabled: boolean;
  confirmDraftPending: boolean;
  pendingDraftType: AutopilotDraftType | null;
  onCreateDraft: (type: AutopilotDraftType) => void;
  onViewAll?: () => void;
  /** Overview tab: show full labels without truncation */
  wrapText?: boolean;
}) {
  const gridCols = wrapText
    ? 'lg:grid lg:grid-cols-[minmax(160px,1.5fr)_minmax(180px,2.2fr)_minmax(160px,2fr)_minmax(88px,0.75fr)_minmax(130px,1fr)] lg:items-center lg:gap-x-4'
    : 'lg:grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,2fr)_minmax(0,1.65fr)_minmax(0,0.85fr)_minmax(0,1.1fr)] lg:items-center lg:gap-x-4';

  return (
    <div className="w-full">
      <div
        className={cn(
          'mb-2 hidden border-b border-white/10 pb-2 text-[11px] font-medium uppercase tracking-wide text-white/45',
          gridCols,
        )}
      >
        <span>Hạng mục</span>
        <span>Mục đích</span>
        <span>Tác động dự kiến</span>
        <span>Trạng thái</span>
        <span className="text-right lg:text-left">Hành động</span>
      </div>

      <ul className="divide-y divide-white/5">
        {rows.map((row) => {
          const Icon = row.icon;
          const pending = row.draftType && confirmDraftPending && pendingDraftType === row.draftType;
          return (
            <li key={row.key} className={cn('py-3', gridCols, 'gap-y-2')}>
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    row.iconBg,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className={cn(wrapText ? 'min-w-0' : 'min-w-0')}>
                  <p
                    className={cn(
                      'text-sm font-semibold text-white/90',
                      !wrapText && 'truncate',
                    )}
                  >
                    {row.title}
                  </p>
                  <p className="text-[11px] text-white/45">{row.countLabel}</p>
                </div>
              </div>

              <p
                className={cn(
                  'text-xs leading-5 text-white/70 lg:py-0',
                  wrapText && 'break-words',
                )}
              >
                {row.purpose}
              </p>

              <p
                className={cn(
                  'text-xs leading-5 text-white/60 lg:py-0',
                  wrapText && 'break-words',
                )}
              >
                {row.impact}
              </p>

              <div>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
                    row.ready
                      ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25'
                      : 'bg-white/10 text-white/55 ring-1 ring-white/10',
                  )}
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      row.ready ? 'bg-emerald-400' : 'bg-white/40',
                    )}
                  />
                  {row.ready ? 'Sẵn sàng' : 'Chưa tạo'}
                </span>
              </div>

              <div className="flex shrink-0 lg:justify-start">
                {row.href && row.ready ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className={cn('h-8 px-3 text-xs', wrapText && 'whitespace-nowrap')}
                    asChild
                  >
                    <Link href={row.href}>
                      Xem & chỉnh sửa
                      <ExternalLink className="ml-1.5 h-3 w-3" />
                    </Link>
                  </Button>
                ) : row.draftType ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 px-3 text-xs"
                    disabled={!enabled || confirmDraftPending}
                    onClick={() => onCreateDraft(row.draftType!)}
                  >
                    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Tạo draft'}
                  </Button>
                ) : (
                  <span className="text-xs text-white/40">—</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {onViewAll ? (
        <button
          type="button"
          className="mt-4 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/75 transition-colors hover:bg-white/5 hover:text-white"
          onClick={onViewAll}
        >
          Xem tất cả tài sản đã tạo →
        </button>
      ) : null}
    </div>
  );
}

function BudgetDonut({ split, totalBudget }: { split: Array<{ channel: string; percent: number }>; totalBudget: number }) {
  if (!split.length) return null;
  let cursor = 0;
  const gradient = split
    .map((row, i) => {
      const start = cursor;
      cursor += row.percent;
      return `${BUDGET_COLORS[i % BUDGET_COLORS.length]} ${start}% ${cursor}%`;
    })
    .join(', ');

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div
        className="mx-auto h-28 w-28 shrink-0 rounded-full"
        style={{ background: `conic-gradient(${gradient})` }}
        aria-hidden
      />
      <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
        {split.map((row, i) => (
          <li key={row.channel} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 text-white/70">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: BUDGET_COLORS[i % BUDGET_COLORS.length] }}
              />
              <span className="truncate">{row.channel}</span>
            </span>
            <span className="shrink-0 tabular-nums text-white/90">
              {row.percent}% · {formatVnd(Math.round((totalBudget * row.percent) / 100))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DeploymentStepper({ progress, statusLabel }: { progress: number; statusLabel: string }) {
  const activeIdx =
    statusLabel.includes('Chờ duyệt') || statusLabel.includes('Sẵn sàng')
      ? 4
      : statusLabel.includes('Hoàn thành') || statusLabel.includes('Đã duyệt')
        ? 4
        : progress >= 80
          ? 3
          : progress >= 60
            ? 2
            : progress >= 30
              ? 1
              : 0;

  return (
    <ol className="space-y-2">
      {DEPLOYMENT_STEPS.map((label, i) => {
        const done = i < activeIdx || (i === activeIdx && progress >= 100);
        const current = i === activeIdx && !done;
        return (
          <li key={label} className="flex items-center gap-2 text-xs">
            <span
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                done && 'bg-emerald-500/20 text-emerald-400',
                current && 'bg-amber-500/20 text-amber-300',
                !done && !current && 'bg-white/5 text-white/40',
              )}
            >
              {done ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className={cn(done || current ? 'text-white/90' : 'text-white/45')}>
              {label}
              {current ? ' — Sẵn sàng chạy' : ''}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function AutopilotAnalysisTab({
  enabled,
  analysisView,
  onAnalysisViewChange,
  currentProject,
  currentAnalysis,
  currentMission,
  createdDraftsByType,
  contentDraftFallback,
  contentDraftEditUrl,
  productPriceFallback,
  metrics,
  confirmDraft,
  approveMission,
  onLocalDraftUpdate,
}: Props) {
  const t = useT();
  const [pendingDraftType, setPendingDraftType] = useState<AutopilotDraftType | null>(null);
  const [planOpen, setPlanOpen] = useState(false);

  const displayStatus = resolveDisplayStatus({
    missionStatus: currentMission?.status,
    projectStatus: currentProject?.status,
  });

  const progress =
    currentMission?.approvalSummary?.progressPercent ?? currentMission?.progressPercent ?? 0;

  const canApprove = Boolean(
    enabled && currentMission?.approvalSummary?.canApprove && !approveMission.isPending,
  );

  const strategyText = useMemo(() => {
    if (currentMission?.approvalSummary?.strategy && currentMission.approvalSummary.strategy !== '—') {
      return currentMission.approvalSummary.strategy;
    }
    const fromPlan = planText(currentAnalysis?.plan, 'strategy');
    if (fromPlan) return fromPlan;
    return shortText(currentAnalysis?.summary, 200);
  }, [currentMission, currentAnalysis]);

  const audienceText = useMemo(() => {
    if (currentMission?.approvalSummary?.audience && currentMission.approvalSummary.audience !== '—') {
      return currentMission.approvalSummary.audience;
    }
    return shortText(currentProject?.customerProfile, 180);
  }, [currentMission, currentProject]);

  const monthlyBudget = Number(currentProject?.monthlyBudget) || 0;
  const budgetSplit = currentAnalysis?.budgetSplit ?? [];
  const channels = currentAnalysis?.suggestedChannels ?? [];
  const stages = funnelStages(currentAnalysis?.plan);
  const forecast = estimateReady(currentAnalysis?.budgetScenarios);

  const assetBreakdown = useMemo(() => {
    const s = currentMission?.approvalSummary;
    const content = s?.contentCount ?? contentDraftFallback.length ?? 0;
    const funnel =
      (createdDraftsByType.FUNNEL_DRAFT ? 1 : 0) ||
      (s?.funnel && s.funnel !== '—' ? 1 : 0);
    const automation =
      (createdDraftsByType.AUTOMATION_DRAFT ? 1 : 0) ||
      (s?.automation && s.automation !== '—' ? 1 : 0);
    const campaign =
      (createdDraftsByType.CAMPAIGN_DRAFT ? 1 : 0) ||
      (s?.campaign && s.campaign !== '—' ? 1 : 0);
    let email = 0;
    let ads = 0;
    for (const a of currentMission?.assets ?? []) {
      const t = `${a.assetType ?? ''} ${a.entityType ?? ''}`.toLowerCase();
      if (t.includes('email')) email += 1;
      if (t.includes('ads') || t.includes('ad_')) ads += 1;
    }
    if (s?.email && s.email !== '—') email = Math.max(email, 1);
    if (s?.ads && s.ads !== '—') ads = Math.max(ads, 1);
    const total = content + funnel + automation + campaign + email + ads;
    return { content, funnel, automation, campaign, email, ads, total: total || contentDraftFallback.length };
  }, [currentMission, contentDraftFallback.length, createdDraftsByType]);

  const confidencePct = parseConfidencePercent(
    currentMission?.approvalSummary?.confidence,
    currentAnalysis?.score,
  );

  const todos = useMemo(
    () =>
      [...(currentAnalysis?.nextBestActions ?? [])]
        .sort((a, b) => ((a.priority as number) ?? 99) - ((b.priority as number) ?? 99))
        .slice(0, 8),
    [currentAnalysis],
  );

  const draftRows = useMemo((): ActionPlanRow[] => {
    const contentCount = assetBreakdown.content;
    const automationCount = assetBreakdown.automation;
    const funnelCount = assetBreakdown.funnel;
    const campaignCount = assetBreakdown.campaign;
    const emailCount = assetBreakdown.email + assetBreakdown.ads;

    return [
      {
        key: 'content',
        icon: FileText,
        iconBg: 'bg-violet-500/20 text-violet-300',
        title: 'Content Draft',
        countLabel: `${contentCount || 0} nội dung`,
        purpose: 'Tạo nội dung theo funnel và KPI lead-to-booking',
        impact: 'Tăng tương tác, tăng chuyển đổi',
        ready: contentCount > 0 || Boolean(createdDraftsByType.CONTENT_DRAFT),
        href:
          createdDraftsByType.CONTENT_DRAFT?.editUrl ||
          contentDraftEditUrl ||
          DRAFT_EDIT_FALLBACK.CONTENT_DRAFT,
        draftType: 'CONTENT_DRAFT',
      },
      {
        key: 'automation',
        icon: Workflow,
        iconBg: 'bg-sky-500/20 text-sky-300',
        title: 'Automation Draft',
        countLabel: `${automationCount || 0} flow`,
        purpose: 'Kịch bản chatbot / automation nuôi dưỡng & chốt booking',
        impact: 'Tăng tỷ lệ booking từ lead',
        ready: automationCount > 0 || Boolean(createdDraftsByType.AUTOMATION_DRAFT),
        href: createdDraftsByType.AUTOMATION_DRAFT?.editUrl || DRAFT_EDIT_FALLBACK.AUTOMATION_DRAFT,
        draftType: 'AUTOMATION_DRAFT',
      },
      {
        key: 'funnel',
        icon: Filter,
        iconBg: 'bg-teal-500/20 text-teal-300',
        title: 'Funnel Draft',
        countLabel: `${funnelCount || 0} funnel`,
        purpose: 'Thiết kế hành trình chuyển đổi tối ưu',
        impact:
          currentMission?.approvalSummary?.funnel &&
          currentMission.approvalSummary.funnel !== '—'
            ? currentMission.approvalSummary.funnel
            : 'Tăng tỷ lệ chuyển đổi booking',
        ready: funnelCount > 0 || Boolean(createdDraftsByType.FUNNEL_DRAFT),
        href: createdDraftsByType.FUNNEL_DRAFT?.editUrl || DRAFT_EDIT_FALLBACK.FUNNEL_DRAFT,
        draftType: 'FUNNEL_DRAFT',
      },
      {
        key: 'campaign',
        icon: Megaphone,
        iconBg: 'bg-amber-500/20 text-amber-300',
        title: 'Campaign Draft',
        countLabel: `${campaignCount || 0} campaign`,
        purpose: 'Chiến dịch remarketing đa kênh',
        impact: 'Tăng doanh thu và ROAS',
        ready: campaignCount > 0 || Boolean(createdDraftsByType.CAMPAIGN_DRAFT),
        href: createdDraftsByType.CAMPAIGN_DRAFT?.editUrl || DRAFT_EDIT_FALLBACK.CAMPAIGN_DRAFT,
        draftType: 'CAMPAIGN_DRAFT',
      },
      {
        key: 'email',
        icon: Zap,
        iconBg: 'bg-fuchsia-500/20 text-fuchsia-300',
        title: 'Email / CRM Draft',
        countLabel: `${emailCount || 0} email`,
        purpose: 'Email chăm sóc, nuôi dưỡng và giữ chân khách hàng',
        impact: 'Tăng khách quay lại và booking',
        ready: emailCount > 0,
        href: undefined,
      },
    ];
  }, [assetBreakdown, createdDraftsByType, contentDraftEditUrl, currentMission]);

  const createDraft = (draftType: AutopilotDraftType) => {
    if (!currentProject?.id) return;
    setPendingDraftType(draftType);
    confirmDraft.mutate(
      {
        projectId: currentProject.id,
        idempotencyKey: `marketing-autopilot-nba:${currentProject.id}:${draftType}`,
        draftTypes: [draftType],
      },
      {
        onSuccess: (data) => {
          const rows = data.results?.length
            ? data.results
            : (data.drafts ?? []).map((d) => ({
                draftId: d.draftId ?? d.id,
                type: d.type,
                status: d.status ?? 'DRAFT',
                editUrl:
                  d.editUrl ??
                  DRAFT_EDIT_FALLBACK[d.type as AutopilotDraftType] ??
                  '/marketing-autopilot',
              }));
          onLocalDraftUpdate(rows);
          setPendingDraftType(null);
        },
        onError: () => setPendingDraftType(null),
      },
    );
  };

  if (!currentAnalysis || !currentProject) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0f2a24]/60 p-6">
        <EmptyState
          title={t('autopilot.emptyAnalysis')}
          description="Tạo project mới hoặc bấm Xem từ Lịch sử project để mở kết quả tại đây."
        />
      </div>
    );
  }

  const aiDoneLabel = progress >= 100 ? 'AI phân tích hoàn tất' : 'AI đang phân tích';

  return (
    <div className="space-y-4">
      {/* Project header — mockup top bar */}
      <section className="rounded-2xl border border-white/10 bg-[#0f2a24]/80 p-4 sm:p-5">
        <div className="grid gap-4 xl:grid-cols-[1fr_auto]">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            {/* Project identity */}
            <div className="flex gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/20">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-lg font-semibold">{currentProject.name}</h2>
                  <Pencil className="h-3.5 w-3.5 shrink-0 text-white/40" aria-hidden />
                </div>
                <p className="text-xs text-white/50">
                  {currentProject.productName} · Tạo lúc {formatDateTime(currentProject.createdAt)}
                </p>
                <div className="mt-3 space-y-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-white/45">Mục tiêu</p>
                    <p className="text-sm text-white/85">{currentProject.primaryGoal || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-white/45">Ngân sách</p>
                    <p className="text-sm font-medium text-white">
                      {formatVnd(currentProject.monthlyBudget)} / tháng
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Status + progress */}
            <div className="space-y-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-white/45">Trạng thái</p>
                <span
                  className={cn(
                    'mt-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                    statusBadgeClass(displayStatus),
                  )}
                >
                  {displayStatus}
                </span>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-white/50">{aiDoneLabel}</span>
                  <span className="font-medium text-emerald-400">{Math.round(progress)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-[width]"
                    style={{ width: `${Math.min(100, progress)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* AI summary text */}
            <p className="text-sm leading-6 text-white/70 lg:border-l lg:border-white/10 lg:pl-4">
              {currentAnalysis.summary ||
                'AI đã phân tích dữ liệu và tạo kế hoạch marketing đề xuất. Review các đề xuất và duyệt để chạy.'}
            </p>
          </div>

          {/* CTAs */}
          <div className="flex flex-wrap items-start gap-2 xl:flex-col xl:items-stretch">
            <Button
              type="button"
              variant="outline"
              className="border-white/20 bg-transparent text-white hover:bg-white/10"
              onClick={() => setPlanOpen(true)}
            >
              <Eye className="mr-2 h-4 w-4" />
              Xem kế hoạch chi tiết
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={!canApprove}
              onClick={() => currentMission && approveMission.mutate(currentMission.id)}
            >
              {approveMission.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Duyệt & chạy
            </Button>
          </div>
        </div>

        {approveMission.isError ? (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>Không duyệt được</AlertTitle>
            <AlertDescription>
              {formatMutationError(approveMission.error, 'Mission chưa sẵn sàng hoặc đã duyệt.')}
            </AlertDescription>
          </Alert>
        ) : null}
      </section>

      {/* 4 summary cards */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-[#0f2a24]/60 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Target className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold">Chiến lược đề xuất</h3>
          </div>
          <p className="text-xs leading-5 text-white/65">{shortText(strategyText, 120)}</p>
          <span className="mt-2 inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
            Phù hợp mục tiêu
          </span>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0f2a24]/60 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Users className="h-4 w-4 text-sky-400" />
            <h3 className="text-sm font-semibold">{t('autopilot.targetCustomers')}</h3>
          </div>
          <p className="text-xs leading-5 text-white/65">{shortText(audienceText, 120)}</p>
          <button type="button" className="mt-2 text-[10px] text-sky-300 hover:underline">
            Nhóm tiềm năng cao
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0f2a24]/60 p-4">
          <div className="mb-2 flex items-center gap-2">
            <FileText className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-semibold">Tài sản AI đã tạo</h3>
          </div>
          <p className="text-2xl font-bold tabular-nums text-white">{assetBreakdown.total}</p>
          <p className="text-[10px] text-white/45">tài sản</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-white/55">
            <span>Content {assetBreakdown.content}</span>
            <span>Funnel {assetBreakdown.funnel}</span>
            <span>Auto {assetBreakdown.automation}</span>
            <span>Campaign {assetBreakdown.campaign}</span>
            <span>Email {assetBreakdown.email}</span>
            <span>Ads {assetBreakdown.ads}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0f2a24]/60 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Coins className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold">Ngân sách đề xuất</h3>
          </div>
          <p className="text-lg font-bold text-white">{formatVnd(currentProject.monthlyBudget)}</p>
          <p className="text-[10px] text-white/45">/ tháng · {budgetSplit.length || channels.length || '—'} kênh</p>
          {budgetSplit.length > 0 ? (
            <div className="mt-2 flex h-1.5 overflow-hidden rounded-full">
              {budgetSplit.map((row, i) => (
                <div
                  key={row.channel}
                  style={{
                    width: `${row.percent}%`,
                    backgroundColor: BUDGET_COLORS[i % BUDGET_COLORS.length],
                  }}
                />
              ))}
            </div>
          ) : null}
          <button
            type="button"
            className="mt-2 text-[10px] text-amber-300 hover:underline"
            onClick={() => onAnalysisViewChange('budget')}
          >
            Xem phân bổ chi tiết →
          </button>
        </div>
      </section>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-[#0a201b]/80 p-1">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm transition-colors',
              analysisView === tab.id
                ? 'bg-[#163830] font-medium text-white shadow-sm'
                : 'text-white/55 hover:text-white/85',
            )}
            onClick={() => onAnalysisViewChange(tab.id)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Overview — strategy + budget on top, action plan full width below */}
      {analysisView === 'overview' ? (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
          <Panel title={t('autopilot.strategyOverview')}>
            <p className="mb-3 text-xs font-medium text-white/50">Tóm tắt bởi AI</p>
            <p className="mb-4 text-sm leading-6 text-white/75">
              {currentAnalysis.summary || strategyText}
            </p>

            {stages.length > 0 ? (
              <div className="mb-4">
                <p className="mb-2 text-xs text-white/50">Funnel đề xuất</p>
                <div className="space-y-1">
                  {stages.slice(0, 4).map((s, i) => (
                    <div
                      key={s.name}
                      className="rounded-lg bg-white/5 px-3 py-1.5 text-xs"
                      style={{ marginLeft: `${i * 8}px`, width: `calc(100% - ${i * 8}px)` }}
                    >
                      {s.name}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {currentMission?.approvalSummary?.kpi && currentMission.approvalSummary.kpi !== '—' ? (
              <div className="mb-4">
                <p className="mb-1 text-xs text-white/50">KPI chính</p>
                <p className="text-sm text-white/80">{currentMission.approvalSummary.kpi}</p>
              </div>
            ) : null}

            {channels.length > 0 ? (
              <div className="mb-4">
                <p className="mb-2 text-xs text-white/50">Kênh đề xuất</p>
                <div className="flex flex-wrap gap-1.5">
                  {channels.map((ch) => (
                    <span key={ch} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/75">
                      {ch}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {confidencePct != null ? (
              <div className="mb-4 flex items-center gap-3">
                <div
                  className="relative flex h-14 w-14 items-center justify-center rounded-full"
                  style={{
                    background: `conic-gradient(#22c55e ${confidencePct}%, rgba(255,255,255,0.08) 0)`,
                  }}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0f2a24] text-xs font-bold">
                    {confidencePct}%
                  </span>
                </div>
                <p className="text-xs text-white/60">Độ tin cậy cao</p>
              </div>
            ) : null}

            <p className="mb-2 text-xs text-white/50">Tiến trình triển khai</p>
            <DeploymentStepper progress={progress} statusLabel={displayStatus} />
          </Panel>

          <Panel title="Mô phỏng ngân sách">
            <p className="mb-2 text-xs text-white/50">Dự báo hiệu quả (30 ngày)</p>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {[
                { label: 'Lead dự kiến', value: forecast.leads, fmt: formatCompactNumber },
                { label: 'Booking dự kiến', value: forecast.bookings, fmt: formatCompactNumber },
                { label: 'Doanh thu dự kiến', value: forecast.revenue, fmt: (v: number) => formatVnd(v) },
                { label: 'CPL dự kiến', value: forecast.cpl, fmt: (v: number) => formatVnd(v) },
              ].map((m) => (
                <div key={m.label} className="rounded-xl bg-white/5 px-3 py-2">
                  <p className="text-[10px] text-white/45">{m.label}</p>
                  <p className="text-sm font-semibold tabular-nums text-white">
                    {forecast.hasData && m.value != null ? m.fmt(m.value) : 'Chưa đủ dữ liệu'}
                  </p>
                </div>
              ))}
            </div>

            {budgetSplit.length > 0 && monthlyBudget > 0 ? (
              <>
                <p className="mb-2 text-xs text-white/50">Phân bổ ngân sách đề xuất</p>
                <BudgetDonut split={budgetSplit} totalBudget={monthlyBudget} />
              </>
            ) : (
              <p className="text-xs text-white/50">{t('autopilot.emptyBudgetDetail')}</p>
            )}

            <button
              type="button"
              className="mt-3 text-xs text-white/60 hover:text-white"
              onClick={() => onAnalysisViewChange('budget')}
            >
              Xem chi tiết mô phỏng →
            </button>
          </Panel>
          </div>

          <Panel title="Việc AI đề xuất triển khai">
            <ActionPlanTable
              rows={draftRows}
              enabled={enabled}
              confirmDraftPending={confirmDraft.isPending}
              pendingDraftType={pendingDraftType}
              onCreateDraft={createDraft}
              wrapText
            />
          </Panel>
        </div>
      ) : null}

      {analysisView === 'todos' ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {draftRows.map((row) => {
              const Icon = row.icon;
              return (
                <div key={row.key} className="rounded-2xl border border-white/10 bg-[#0f2a24]/60 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <h4 className="text-sm font-semibold">{row.title}</h4>
                  </div>
                  <p className="text-2xl font-bold tabular-nums">{row.countLabel.split(' ')[0]}</p>
                  <p className="text-xs text-white/50">{row.countLabel}</p>
                  {row.href && row.ready ? (
                    <Button size="sm" variant="secondary" className="mt-3 w-full" asChild>
                      <Link href={row.href}>Xem & chỉnh sửa</Link>
                    </Button>
                  ) : row.draftType ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-3 w-full"
                      disabled={!enabled || confirmDraft.isPending}
                      onClick={() => createDraft(row.draftType!)}
                    >
                      Tạo {draftTypeLabel(row.draftType).toLowerCase()}
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>

          <Panel title="Việc AI đề xuất triển khai">
            <ActionPlanTable
              rows={draftRows}
              enabled={enabled}
              confirmDraftPending={confirmDraft.isPending}
              pendingDraftType={pendingDraftType}
              onCreateDraft={createDraft}
            />
          </Panel>

          <ContentDraftPanel
            projectId={currentProject.id}
            enabled={enabled}
            fallbackIdeas={contentDraftFallback}
            contentEditUrl={contentDraftEditUrl}
          />
        </div>
      ) : null}

      {analysisView === 'budget' ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              { label: 'Lead dự kiến', value: forecast.leads, fmt: formatCompactNumber },
              { label: 'Booking dự kiến', value: forecast.bookings, fmt: formatCompactNumber },
              { label: 'Doanh thu dự kiến', value: forecast.revenue, fmt: (v: number) => formatVnd(v) },
              { label: 'CPL', value: forecast.cpl, fmt: (v: number) => formatVnd(v) },
              { label: 'CPA', value: forecast.cpa, fmt: (v: number) => formatVnd(v) },
              { label: 'ROAS', value: forecast.roas, fmt: formatCompactNumber },
            ].map((m) => (
              <div key={m.label} className="rounded-2xl border border-white/10 bg-[#0f2a24]/60 px-4 py-3">
                <p className="text-xs text-white/50">{m.label}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {forecast.hasData && m.value != null ? m.fmt(m.value) : 'Chưa đủ dữ liệu'}
                </p>
              </div>
            ))}
          </div>
          {budgetSplit.length > 0 && monthlyBudget > 0 ? (
            <Panel title="Phân bổ ngân sách đề xuất">
              <BudgetDonut split={budgetSplit} totalBudget={monthlyBudget} />
            </Panel>
          ) : null}
          <BudgetScenarioPanel
            scenarios={currentAnalysis.budgetScenarios as never}
            productPrice={Number(currentProject.productPrice) || productPriceFallback || undefined}
            metrics={metrics as never}
          />
        </div>
      ) : null}

      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Kế hoạch chi tiết</DialogTitle>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-lg bg-muted/40 p-3 text-[11px] leading-5">
            {JSON.stringify(
              currentMission?.planPreview ?? currentAnalysis?.plan ?? currentAnalysis,
              null,
              2,
            )}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
