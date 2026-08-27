'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Bot, Lock, Sparkles, BarChart3, History } from 'lucide-react';
import {
  useConfirmMarketingAutopilotProjectDraft,
  useCreateMarketingAutopilotProject,
  useMarketingAutopilotProjects,
  useMarketingAutopilotProjectDetail,
  useMarketingAutopilotProjectFilterOptions,
  useMarketingAutopilotStatus,
  useMarketingAutopilotFormOptions,
  useMarketingAutopilotContext,
  useApproveMarketingMission,
} from '@/hooks/use-marketing-autopilot';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingState, ErrorState } from '@/components/shared/page-state';
import type { AutopilotBriefFormState } from '@/components/marketing-autopilot/autopilot-brief-form';
import { AutopilotCreateTab } from '@/components/marketing-autopilot/autopilot-create-tab';
import { ProjectHistoryToolbar } from '@/components/marketing-autopilot/project-history-toolbar';
import dynamic from 'next/dynamic';
import {
  buildAutopilotPageQueryString,
  parseAutopilotPageQuery,
  type AutopilotAnalysisView,
  type AutopilotPageTab,
  type MarketingAutopilotPageQuery,
} from '@/lib/marketing-autopilot-project-query';
import type { AutopilotContentIdeaView } from '@/types/marketing-autopilot';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/i18n-provider';

const AutopilotAnalysisTab = dynamic(
  () =>
    import('@/components/marketing-autopilot/autopilot-analysis-tab').then((m) => ({
      default: m.AutopilotAnalysisTab,
    })),
  { loading: () => <LoadingState /> },
);
const ProjectHistoryPanel = dynamic(
  () =>
    import('@/components/marketing-autopilot/project-history-panel').then((m) => ({
      default: m.ProjectHistoryPanel,
    })),
  { loading: () => <LoadingState /> },
);

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

function isAutopilotDraftType(raw: unknown): raw is AutopilotDraftType {
  return typeof raw === 'string' && (AUTOPILOT_DRAFT_TYPES as readonly string[]).includes(raw);
}

const defaultForm: AutopilotBriefFormState = {
  projectName: '',
  productId: '',
  productName: '',
  productPrice: 0,
  customerProfile: '',
  customerMode: 'manual',
  segmentId: '',
  targetArea: '',
  monthlyBudget: 0,
  budgetPresetId: '',
  goals: [],
  primaryGoal: '',
};

export default function MarketingAutopilotPage() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pageQuery = useMemo(() => parseAutopilotPageQuery(searchParams), [searchParams]);
  const activeTab: AutopilotPageTab = pageQuery.tab ?? 'create';

  const status = useMarketingAutopilotStatus();
  const enabled = status.data?.enabled === true;

  const needsAnalysisData = activeTab === 'analysis';
  const needsHistoryData = activeTab === 'history';

  const apiListQuery = useMemo(() => {
    const rest = { ...pageQuery };
    delete rest.projectId;
    delete rest.tab;
    return rest;
  }, [pageQuery]);

  const projects = useMarketingAutopilotProjects(
    apiListQuery,
    enabled && (needsHistoryData || needsAnalysisData),
  );
  const filterOptions = useMarketingAutopilotProjectFilterOptions(enabled && needsHistoryData);
  const formOptions = useMarketingAutopilotFormOptions(activeTab === 'create');
  const context = useMarketingAutopilotContext(
    enabled && (activeTab === 'create' || activeTab === 'analysis'),
  );

  const createProject = useCreateMarketingAutopilotProject();
  const confirmDraft = useConfirmMarketingAutopilotProjectDraft();
  const approveMission = useApproveMarketingMission();
  const [form, setForm] = useState<AutopilotBriefFormState>(defaultForm);
  const [localDraftOverrides, setLocalDraftOverrides] = useState<
    Partial<Record<AutopilotDraftType, { draftId: string; editUrl: string; status: string }>>
  >({});

  const selectedProjectId = pageQuery.projectId ?? null;
  const projectDetail = useMarketingAutopilotProjectDetail(
    selectedProjectId,
    enabled && needsAnalysisData && Boolean(selectedProjectId),
  );

  const patchPageQuery = useCallback(
    (patch: Partial<MarketingAutopilotPageQuery>) => {
      const next = { ...pageQuery, ...patch };
      router.replace(`${pathname}${buildAutopilotPageQueryString(next)}`, { scroll: false });
    },
    [pageQuery, pathname, router],
  );

  const openProjectAnalysis = useCallback(
    (projectId: string) => {
      patchPageQuery({ projectId, tab: 'analysis', view: 'overview' });
    },
    [patchPageQuery],
  );

  const analysisView: AutopilotAnalysisView = pageQuery.view ?? 'overview';

  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        pageQuery.q ||
        pageQuery.datePreset ||
        pageQuery.dateFrom ||
        pageQuery.dateTo ||
        pageQuery.status ||
        pageQuery.goal ||
        pageQuery.product ||
        pageQuery.budgetMin != null ||
        pageQuery.budgetMax != null ||
        pageQuery.quickFilter,
      ),
    [pageQuery],
  );

  const currentProject = useMemo(() => {
    const items = projects.data?.items ?? [];
    if (selectedProjectId) {
      return items.find((p) => p.id === selectedProjectId) ?? projectDetail.data ?? null;
    }
    return items[0] ?? null;
  }, [projects.data?.items, selectedProjectId, projectDetail.data]);

  const currentMission = currentProject?.mission ?? null;
  const currentAnalysis = useMemo(() => {
    return (
      currentProject?.analysisJson ?? currentProject?.analyses?.[0]?.recommendationJson ?? null
    );
  }, [currentProject]);

  useEffect(() => {
    setLocalDraftOverrides({});
  }, [currentProject?.id]);

  const contentDraftFallback = useMemo(() => {
    const draft = currentProject?.drafts?.find((d) => d.type === 'CONTENT_DRAFT');
    if (draft?.contentIdeas?.length) return draft.contentIdeas as AutopilotContentIdeaView[];
    const payload = (draft?.payload && typeof draft.payload === 'object' ? draft.payload : {}) as {
      adapter?: { metadata?: { contentIdeas?: AutopilotContentIdeaView[] } };
    };
    return payload.adapter?.metadata?.contentIdeas ?? [];
  }, [currentProject?.drafts]);

  const createdDraftsByType = useMemo(() => {
    const fromApi: Partial<
      Record<AutopilotDraftType, { draftId: string; editUrl: string; status: string }>
    > = {};
    const resolveEditUrl = (
      type: AutopilotDraftType,
      externalId: string | null,
      existing?: string | null,
    ) => {
      if (existing) return existing;
      const base = DRAFT_EDIT_FALLBACK[type];
      if (externalId && type === 'CONTENT_DRAFT') {
        return `${base}?contentId=${encodeURIComponent(externalId)}`;
      }
      if (externalId && type === 'FUNNEL_DRAFT') {
        return `/funnel?draft=${encodeURIComponent(externalId)}`;
      }
      if (externalId && type === 'AUTOMATION_DRAFT') {
        return `${base}&flowId=${encodeURIComponent(externalId)}`;
      }
      if (externalId && type === 'CAMPAIGN_DRAFT') {
        return `${base}&campaignId=${encodeURIComponent(externalId)}`;
      }
      return base;
    };
    for (const d of currentProject?.drafts ?? []) {
      if (!isAutopilotDraftType(d.type)) continue;
      if (fromApi[d.type]) continue;
      const payload = (d.payload && typeof d.payload === 'object' ? d.payload : {}) as {
        adapter?: { externalEntityId?: string };
      };
      const externalId = d.externalEntityId ?? payload.adapter?.externalEntityId ?? null;
      fromApi[d.type] = {
        draftId: d.draftId ?? d.id,
        editUrl: resolveEditUrl(d.type, externalId, d.editUrl),
        status: d.status || 'DRAFT',
      };
    }
    for (const a of currentMission?.assets ?? []) {
      let type: AutopilotDraftType | null = isAutopilotDraftType(a.assetType) ? a.assetType : null;
      if (!type) {
        if (a.entityType === 'funnel_recommendation') type = 'FUNNEL_DRAFT';
        else if (a.entityType === 'content_teleprompter_source') type = 'CONTENT_DRAFT';
        else if (a.entityType === 'automation_flow') type = 'AUTOMATION_DRAFT';
        else if (a.entityType === 'messaging_campaign') type = 'CAMPAIGN_DRAFT';
      }
      if (!type || fromApi[type]) continue;
      fromApi[type] = {
        draftId: a.entityId,
        editUrl: resolveEditUrl(type, a.entityId, a.editUrl),
        status: a.status || 'DRAFT',
      };
    }
    return { ...fromApi, ...localDraftOverrides };
  }, [currentProject?.drafts, currentMission?.assets, localDraftOverrides]);

  const contentDraftEditUrl = createdDraftsByType.CONTENT_DRAFT?.editUrl ?? null;

  if (status.isLoading) {
    return <LoadingState message={t('autopilot.loadingStatus')} />;
  }

  if (status.isError || !status.data) {
    return <ErrorState message={t('autopilot.errorStatus')} onRetry={() => status.refetch()} />;
  }

  const isCreateTab = activeTab === 'create';

  return (
    <div
      className={cn(
        'mx-auto max-w-7xl',
        isCreateTab
          ? 'flex min-h-0 flex-col gap-1.5 lg:h-[calc(100dvh-6.5rem)] lg:max-h-[calc(100dvh-6.5rem)] lg:overflow-hidden'
          : 'space-y-6',
      )}
    >
      {!isCreateTab ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-2">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{t('autopilot.title')}</h1>
                <p className="text-sm text-muted-foreground">
                  {t('autopilot.extendedDescription')}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <div className="rounded-md bg-primary/10 p-1.5">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
            {t('autopilot.title')}
          </h1>
        </div>
      )}

      {!status.data.enabled ? (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertTitle>{t('autopilot.disabledTitle')}</AlertTitle>
          <AlertDescription>{t('autopilot.disabledDescription')}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs
        value={activeTab}
        onValueChange={(v) => patchPageQuery({ tab: v as AutopilotPageTab })}
        className={cn(isCreateTab ? 'flex min-h-0 flex-1 flex-col gap-1.5' : 'space-y-4')}
      >
        <TabsList
          className={cn(
            'grid h-auto w-full grid-cols-1 gap-1 p-1 sm:grid-cols-3',
            'bg-muted',
            isCreateTab && 'h-9 shrink-0 sm:grid-cols-3',
          )}
        >
          <TabsTrigger
            value="create"
            className="inline-flex items-center justify-center gap-2 text-xs sm:text-sm"
          >
            <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>Tạo project Autopilot</span>
          </TabsTrigger>
          <TabsTrigger
            value="analysis"
            className="inline-flex items-center justify-center gap-2 text-xs sm:text-sm"
          >
            <BarChart3 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>Kết quả phân tích</span>
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="inline-flex items-center justify-center gap-2 text-xs sm:text-sm"
          >
            <History className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>Lịch sử project</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="create"
          className={cn(
            'mt-0 focus-visible:outline-none',
            isCreateTab && 'min-h-0 flex-1 overflow-hidden',
          )}
        >
          <div className={cn(isCreateTab && 'h-full min-h-0')}>
            <AutopilotCreateTab
              form={form}
              setForm={setForm}
              defaultForm={defaultForm}
              formOptions={formOptions.data}
              snapshot={context.data?.snapshot}
              enabled={status.data.enabled}
              createProject={createProject}
              onCreated={(projectId) => openProjectAnalysis(projectId)}
            />
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="mt-4 focus-visible:outline-none">
          {activeTab === 'analysis' ? (
            <AutopilotAnalysisTab
              enabled={status.data.enabled}
              analysisView={analysisView}
              onAnalysisViewChange={(view) => patchPageQuery({ tab: 'analysis', view })}
              currentProject={currentProject}
              currentAnalysis={currentAnalysis}
              currentMission={currentMission}
              createdDraftsByType={createdDraftsByType}
              contentDraftFallback={contentDraftFallback}
              contentDraftEditUrl={contentDraftEditUrl}
              productPriceFallback={form.productPrice}
              metrics={context.data?.snapshot?.metrics as Record<string, unknown> | undefined}
              confirmDraft={confirmDraft}
              approveMission={approveMission}
              onLocalDraftUpdate={(rows) => {
                setLocalDraftOverrides((prev) => {
                  const next = { ...prev };
                  for (const row of rows) {
                    if (!isAutopilotDraftType(row.type)) continue;
                    next[row.type] = {
                      draftId: row.draftId,
                      editUrl: row.editUrl || DRAFT_EDIT_FALLBACK[row.type],
                      status: row.status || 'DRAFT',
                    };
                  }
                  return next;
                });
              }}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="history" className="mt-4 focus-visible:outline-none">
          {activeTab === 'history' ? (
            <div className="space-y-3 rounded-lg border bg-card p-4">
              <div>
                <h2 className="text-lg font-semibold">Lịch sử project</h2>
                <p className="text-sm text-muted-foreground">
                  Tìm kiếm, lọc và quản lý project đã lưu. Bấm Xem để mở kết quả phân tích.
                </p>
              </div>
              <ProjectHistoryToolbar
                query={pageQuery}
                filterOptions={filterOptions.data}
                onChange={patchPageQuery}
                onReset={() => router.replace(`${pathname}?tab=history`, { scroll: false })}
              />
              <ProjectHistoryPanel
                items={projects.data?.items ?? []}
                isLoading={projects.isLoading}
                isError={projects.isError}
                onRetry={() => projects.refetch()}
                selectedProjectId={selectedProjectId}
                onSelectProject={(id) => patchPageQuery({ projectId: id })}
                onViewProject={openProjectAnalysis}
                page={projects.data?.page ?? 1}
                totalPages={projects.data?.totalPages ?? 1}
                total={projects.data?.total ?? 0}
                onPageChange={(page) => patchPageQuery({ page, tab: 'history' })}
                hasActiveFilters={hasActiveFilters}
              />
            </div>
          ) : null}
        </TabsContent>
      </Tabs>

      {!isCreateTab ? (
        <Alert>
          <Bot className="h-4 w-4" />
          <AlertTitle>Safety boundary</AlertTitle>
          <AlertDescription>
            Marketing Autopilot tạo AI Plan + Draft. Không gọi action thật lên Facebook, Email hay
            Ads.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
