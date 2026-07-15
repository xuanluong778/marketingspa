import type { ContentStudioTab } from '@/types/content-marketing';

/** Tab con trong menu Content & Auto post */
export type ContentAutoPostTab =
  | 'create'
  | 'library'
  | 'auto-post'
  | 'schedule'
  | 'channels';

export const CONTENT_AUTO_POST_BASE = '/content';

export const CONTENT_AUTO_POST_TABS: {
  value: ContentAutoPostTab;
  label: string;
  description?: string;
}[] = [
  { value: 'create', label: 'Tạo Content' },
  { value: 'library', label: 'Thư viện bài viết' },
  { value: 'auto-post', label: 'Auto Post' },
  { value: 'schedule', label: 'Lịch đăng' },
  { value: 'channels', label: 'Kết nối kênh' },
];

export const CONTENT_AUTO_POST_MENU_DESCRIPTION =
  'Tạo nội dung, xây dựng thương hiệu và đăng bài tự động cho spa';

export function isContentAutoPostTab(value: string | null): value is ContentAutoPostTab {
  return CONTENT_AUTO_POST_TABS.some((t) => t.value === value);
}

export function contentStudioTabToShellTab(tab: ContentStudioTab): ContentAutoPostTab {
  return 'create';
}

export function buildContentAutoPostHref(
  tab: ContentAutoPostTab,
  params?: Record<string, string>,
): string {
  const qs = new URLSearchParams({ tab, ...params });
  return `${CONTENT_AUTO_POST_BASE}?${qs.toString()}`;
}

export function legacyTabToContentAutoPostTab(
  legacy: string | null,
): ContentAutoPostTab | null {
  if (legacy === 'ad' || legacy === 'advanced') return 'create';
  if (legacy === 'personal') return 'create';
  if (isContentAutoPostTab(legacy)) return legacy;
  return null;
}
