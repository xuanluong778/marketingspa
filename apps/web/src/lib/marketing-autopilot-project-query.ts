import type {
  MarketingAutopilotProjectListQuery,
  ProjectDatePreset,
  ProjectQuickFilter,
  ProjectSortOption,
} from '@/types/marketing-autopilot';

export type {
  MarketingAutopilotProjectListQuery,
  ProjectDatePreset,
  ProjectQuickFilter,
  ProjectSortOption,
};

export type AutopilotPageTab = 'command' | 'create' | 'analysis' | 'history';

export type AutopilotAnalysisView = 'overview' | 'todos' | 'budget';

export type MarketingAutopilotPageQuery = MarketingAutopilotProjectListQuery & {
  tab?: AutopilotPageTab;
  /** Sub-view inside Kết quả phân tích */
  view?: AutopilotAnalysisView;
};

export const DEFAULT_PROJECT_LIST_QUERY: MarketingAutopilotProjectListQuery = {
  page: 1,
  pageSize: 20,
  sort: 'newest',
};

const DATE_PRESETS = new Set([
  'today',
  '7d',
  '30d',
  'this_month',
  'last_month',
  'this_year',
  'custom',
]);

const SORT_OPTIONS = new Set(['newest', 'oldest', 'budget', 'name']);
const QUICK_FILTERS = new Set(['running', 'needs_approval']);
const TAB_VALUES = new Set(['command', 'create', 'analysis', 'history']);
const VIEW_VALUES = new Set(['overview', 'todos', 'budget']);

export function parseAutopilotPageQuery(
  searchParams: URLSearchParams,
): MarketingAutopilotPageQuery {
  const list = parseProjectListQuery(searchParams);
  const tabRaw = searchParams.get('tab') ?? 'command';
  const viewRaw = searchParams.get('view') ?? 'overview';
  // Legacy ?view=content (Asset Draft) → Kế hoạch hành động
  const normalizedView = viewRaw === 'content' ? 'todos' : viewRaw;
  return {
    ...list,
    tab: TAB_VALUES.has(tabRaw) ? (tabRaw as AutopilotPageTab) : 'command',
    view: VIEW_VALUES.has(normalizedView) ? (normalizedView as AutopilotAnalysisView) : 'overview',
  };
}

export function parseProjectListQuery(
  searchParams: URLSearchParams,
): MarketingAutopilotProjectListQuery {
  const datePresetRaw = searchParams.get('datePreset') ?? '';
  const sortRaw = searchParams.get('sort') ?? 'newest';
  const quickRaw = searchParams.get('quick') ?? '';

  return {
    page: parseNum(searchParams.get('page')) ?? 1,
    pageSize: parseNum(searchParams.get('pageSize')) ?? 20,
    q: searchParams.get('q') ?? undefined,
    datePreset: DATE_PRESETS.has(datePresetRaw) ? (datePresetRaw as ProjectDatePreset) : undefined,
    dateFrom: searchParams.get('dateFrom') ?? undefined,
    dateTo: searchParams.get('dateTo') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    goal: searchParams.get('goal') ?? undefined,
    product: searchParams.get('product') ?? undefined,
    budgetMin: parseNum(searchParams.get('budgetMin')),
    budgetMax: parseNum(searchParams.get('budgetMax')),
    quickFilter: QUICK_FILTERS.has(quickRaw) ? (quickRaw as ProjectQuickFilter) : undefined,
    sort: SORT_OPTIONS.has(sortRaw) ? (sortRaw as ProjectSortOption) : 'newest',
    projectId: searchParams.get('projectId') ?? undefined,
  };
}

function parseNum(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function buildAutopilotPageQueryString(query: MarketingAutopilotPageQuery): string {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | undefined | null) => {
    if (value == null || value === '') return;
    params.set(key, String(value));
  };

  set('tab', query.tab && query.tab !== 'command' ? query.tab : undefined);
  set(
    'view',
    query.tab === 'analysis' && query.view && query.view !== 'overview' ? query.view : undefined,
  );
  set('page', query.page && query.page > 1 ? query.page : undefined);
  set('pageSize', query.pageSize && query.pageSize !== 20 ? query.pageSize : undefined);
  set('q', query.q?.trim());
  set('datePreset', query.datePreset);
  set('dateFrom', query.dateFrom);
  set('dateTo', query.dateTo);
  set('status', query.status);
  set('goal', query.goal);
  set('product', query.product);
  set('budgetMin', query.budgetMin);
  set('budgetMax', query.budgetMax);
  set('quick', query.quickFilter);
  set('sort', query.sort && query.sort !== 'newest' ? query.sort : undefined);
  set('projectId', query.projectId);

  const s = params.toString();
  return s ? `?${s}` : '';
}

/** @deprecated use buildAutopilotPageQueryString */
export function buildProjectListQueryString(query: MarketingAutopilotProjectListQuery): string {
  return buildAutopilotPageQueryString(query);
}

export function buildProjectListApiQuery(query: MarketingAutopilotProjectListQuery): string {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | undefined | null) => {
    if (value == null || value === '') return;
    params.set(key, String(value));
  };

  set('page', query.page ?? 1);
  set('pageSize', query.pageSize ?? 20);
  set('q', query.q?.trim());
  set('datePreset', query.datePreset);
  set('dateFrom', query.dateFrom);
  set('dateTo', query.dateTo);
  set('status', query.status);
  set('goal', query.goal);
  set('product', query.product);
  set('budgetMin', query.budgetMin);
  set('budgetMax', query.budgetMax);
  set('quickFilter', query.quickFilter);
  set('sort', query.sort ?? 'newest');

  return params.toString();
}
