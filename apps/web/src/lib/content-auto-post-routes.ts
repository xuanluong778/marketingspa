import type { ContentStudioTab } from '@/types/content-marketing';

/** Tab con trong menu Content & Auto post */
export type ContentAutoPostTab = 'create' | 'library' | 'auto-post' | 'schedule' | 'channels';

/** Section trong tab Tạo Content */
export type ContentCreateSectionParam =
  | 'ad'
  | 'advanced'
  | 'personal'
  | 'ads-check'
  | 'facebook-check'
  | 'video-transcript';

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

export const CONTENT_CREATE_SECTIONS: ContentCreateSectionParam[] = [
  'ad',
  'advanced',
  'personal',
  'ads-check',
  'facebook-check',
  'video-transcript',
];

export const CONTENT_AUTO_POST_MENU_DESCRIPTION =
  'Content Studio — tạo nội dung đa ngành, xây dựng thương hiệu và đăng bài tự động';

export function isContentAutoPostTab(value: string | null): value is ContentAutoPostTab {
  return CONTENT_AUTO_POST_TABS.some((t) => t.value === value);
}

export function isContentCreateSection(
  value: string | null | undefined,
): value is ContentCreateSectionParam {
  if (!value || value === 'undefined' || value === 'null') return false;
  return (CONTENT_CREATE_SECTIONS as string[]).includes(value);
}

/**
 * Resolve create section from query.
 * Missing section → default `ad` (no URL rewrite required).
 * Invalid / "undefined" → invalid=true (caller should replace URL).
 */
export function resolveContentCreateSection(sectionParam: string | null): {
  section: ContentCreateSectionParam;
  invalid: boolean;
} {
  if (sectionParam == null || sectionParam === '') {
    return { section: 'ad', invalid: false };
  }
  if (!isContentCreateSection(sectionParam)) {
    return { section: 'ad', invalid: true };
  }
  // Canonical public URL uses facebook-check; ads-check still accepted
  if (sectionParam === 'ads-check') {
    return { section: 'facebook-check', invalid: false };
  }
  return { section: sectionParam, invalid: false };
}

export function contentStudioTabToShellTab(_tab: ContentStudioTab): ContentAutoPostTab {
  return 'create';
}

export function buildContentAutoPostHref(
  tab: ContentAutoPostTab,
  params?: Record<string, string>,
): string {
  const qs = new URLSearchParams({ tab });
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v == null || v === '' || v === 'undefined' || v === 'null') continue;
      qs.set(k, v);
    }
  }
  return `${CONTENT_AUTO_POST_BASE}?${qs.toString()}`;
}

/**
 * Merge tab/section/mode into the current query string (preserves other params).
 * Use for in-place tab switches so F5 / Back keep context.
 */
export function mergeContentAutoPostHref(
  currentSearch: string | URLSearchParams,
  patch: {
    tab?: ContentAutoPostTab;
    section?: string | null;
    mode?: string | null;
    remove?: string[];
  },
): string {
  const qs = new URLSearchParams(
    typeof currentSearch === 'string' ? currentSearch : currentSearch.toString(),
  );
  if (patch.tab) qs.set('tab', patch.tab);
  if (patch.section === null) {
    qs.delete('section');
  } else if (patch.section != null && patch.section !== '') {
    qs.set('section', patch.section === 'ads-check' ? 'facebook-check' : patch.section);
  }
  if (patch.mode === null) {
    qs.delete('mode');
  } else if (patch.mode != null && patch.mode !== '') {
    qs.set('mode', patch.mode);
  }
  for (const key of patch.remove ?? []) qs.delete(key);
  for (const [k, v] of [...qs.entries()]) {
    if (v === 'undefined' || v === 'null' || v === '') qs.delete(k);
  }
  return `${CONTENT_AUTO_POST_BASE}?${qs.toString()}`;
}

/** Canonical section value for URL (UI may use ads-check). */
export function toContentCreateSectionParam(section: string): ContentCreateSectionParam {
  if (section === 'ads-check' || section === 'facebook-check') return 'facebook-check';
  if (isContentCreateSection(section)) return section;
  return 'ad';
}

export function legacyTabToContentAutoPostTab(legacy: string | null): ContentAutoPostTab | null {
  if (legacy === 'ad' || legacy === 'advanced') return 'create';
  if (legacy === 'personal') return 'create';
  if (isContentAutoPostTab(legacy)) return legacy;
  return null;
}
