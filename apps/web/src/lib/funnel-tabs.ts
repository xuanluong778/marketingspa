import { FUNNEL_TEMPLATE_SIMPLE_NAME } from '@/lib/funnel-create-goals';

export type FunnelMainTab = 'mine' | 'create' | 'customers' | 'analytics';
export type FunnelCreateSource = 'ai' | 'templates';
export type FunnelAdvancedPane = 'scoring' | 'builder' | 'lifecycle';

export function resolveFunnelMainTab(raw: string | null): FunnelMainTab {
  if (raw === 'analytics') return 'analytics';
  if (raw === 'customers' || raw === 'journey') return 'customers';
  if (raw === 'create' || raw === 'generate' || raw === 'templates') return 'create';
  return 'mine';
}

export function resolveFunnelCreateSource(
  raw: string | null,
  source: string | null,
): FunnelCreateSource {
  if (source === 'templates' || raw === 'templates') return 'templates';
  return 'ai';
}

export function shouldOpenFunnelAdvanced(raw: string | null, advanced: string | null): boolean {
  return advanced === '1' || raw === 'scoring' || raw === 'builder' || raw === 'lifecycle';
}

export function resolveFunnelAdvancedPane(
  raw: string | null,
  pane: string | null,
): FunnelAdvancedPane {
  if (pane === 'builder' || raw === 'builder') return 'builder';
  if (pane === 'lifecycle' || raw === 'lifecycle') return 'lifecycle';
  return 'scoring';
}

export function funnelPreviewHref(funnelId: string): string {
  return `/funnel/preview/${funnelId}`;
}

export function funnelHref(opts: {
  tab?: FunnelMainTab;
  draft?: string | null;
  design?: string | null;
  create?: boolean;
  source?: FunnelCreateSource;
  focus?: string | null;
  advanced?: boolean;
  advancedPane?: FunnelAdvancedPane;
  funnel?: string | null;
  lead?: string | null;
}): string {
  const sp = new URLSearchParams();
  const tab = opts.tab ?? 'mine';
  if (tab !== 'mine') sp.set('tab', tab);
  if (tab === 'mine' && opts.design) sp.set('design', opts.design);
  if (tab === 'mine' && opts.draft) sp.set('draft', opts.draft);
  if (tab === 'create' && opts.create) sp.set('create', '1');
  if (tab === 'create' && opts.source === 'templates') sp.set('source', 'templates');
  if (tab === 'create' && opts.focus) sp.set('focus', opts.focus);
  if (tab === 'customers' && opts.funnel) sp.set('funnel', opts.funnel);
  if (tab === 'customers' && opts.lead) sp.set('lead', opts.lead);
  if (opts.advanced) sp.set('advanced', '1');
  if (opts.advanced && opts.advancedPane === 'builder') sp.set('advancedPane', 'builder');
  if (opts.advanced && opts.advancedPane === 'lifecycle') sp.set('advancedPane', 'lifecycle');
  const qs = sp.toString();
  return qs ? `/funnel?${qs}` : '/funnel';
}

export function funnelListTitle(row: {
  name?: string | null;
  selectedSlug?: string | null;
  prompt?: string | null;
  id: string;
}): string {
  const name = row.name?.trim();
  if (name) return name;
  const slug = row.selectedSlug?.trim();
  if (slug) return FUNNEL_TEMPLATE_SIMPLE_NAME[slug] ?? slug;
  const prompt = row.prompt?.trim();
  if (prompt) return prompt.slice(0, 80);
  return row.id.slice(0, 8);
}

export const FUNNEL_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Nháp',
  ACTIVE: 'Đang chạy',
  PAUSED: 'Tạm dừng',
  ARCHIVED: 'Lưu trữ',
};
