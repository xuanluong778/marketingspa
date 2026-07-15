import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { ContentHistoryItem, ContentStudioTab } from '@/types/content-marketing';
import type { AutoPostType } from '@/types/auto-post';
import { loadContentHistory } from '@/lib/content-marketing-form';
import { buildContentAutoPostHref } from '@/lib/content-auto-post-routes';

const PENDING_KEY = 'ms_auto_post_from_ai';

export const AI_MARKETING_TAB_FILTER_OPTIONS: { value: ContentStudioTab; label: string }[] = [
  { value: 'ad', label: 'Quảng Cáo Bán Hàng' },
  { value: 'personal', label: 'Xây Dựng Thương Hiệu' },
  { value: 'advanced', label: 'Viết bài nâng cao' },
];

export interface AiMarketingPostPayload {
  historyId?: string;
  tab: ContentStudioTab;
  title: string;
  content: string;
  contentScore?: number;
  sourceLabel: string;
}

export function aiMarketingTabLabel(tab: ContentStudioTab): string {
  return AI_MARKETING_TAB_FILTER_OPTIONS.find((o) => o.value === tab)?.label ?? tab;
}

export function mapAiTabToAutoPostType(tab: ContentStudioTab): AutoPostType {
  if (tab === 'personal') return 'BRAND_BUILDING';
  if (tab === 'advanced') return 'BEAUTY_KNOWLEDGE';
  return 'SPA_SALES';
}

export function contentHistoryItemToPayload(item: ContentHistoryItem): AiMarketingPostPayload {
  return {
    historyId: item.id,
    tab: item.tab,
    title: item.title?.trim() || 'Không có tiêu đề',
    content: item.content,
    contentScore: item.contentScore,
    sourceLabel: aiMarketingTabLabel(item.tab),
  };
}

export function savePendingAutoPost(payload: AiMarketingPostPayload): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));
}

export function loadPendingAutoPost(): AiMarketingPostPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AiMarketingPostPayload;
    if (!parsed?.content?.trim() || !parsed.tab) return null;
    return {
      ...parsed,
      title: parsed.title?.trim() || 'Không có tiêu đề',
      sourceLabel: parsed.sourceLabel || aiMarketingTabLabel(parsed.tab),
    };
  } catch {
    return null;
  }
}

export function clearPendingAutoPost(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(PENDING_KEY);
}

export function resolveAutoPostFromAi(
  userId: string | undefined,
  historyId?: string | null,
): AiMarketingPostPayload | null {
  const pending = loadPendingAutoPost();
  if (pending && (!historyId || pending.historyId === historyId)) {
    return pending;
  }
  if (!historyId) return pending;

  const item = loadContentHistory(userId).find((h) => h.id === historyId);
  return item ? contentHistoryItemToPayload(item) : pending;
}

export function sendToAutoPost(
  router: AppRouterInstance,
  payload: AiMarketingPostPayload,
): void {
  savePendingAutoPost(payload);
  const extra: Record<string, string> = {};
  if (payload.historyId) extra.from = payload.historyId;
  router.push(buildContentAutoPostHref('auto-post', extra));
}

export function buildLiveAiPayload(
  tab: ContentStudioTab,
  title: string,
  content: string,
  contentScore?: number,
): AiMarketingPostPayload {
  return {
    tab,
    title: title.trim() || 'Không có tiêu đề',
    content,
    contentScore,
    sourceLabel: aiMarketingTabLabel(tab),
  };
}
