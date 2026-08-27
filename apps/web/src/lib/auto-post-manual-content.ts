import type { AutoPostType } from '../types/auto-post';
import type { ContentStudioTab } from '../types/content-marketing';

function mapTabToPostType(tab: ContentStudioTab): AutoPostType {
  if (tab === 'personal') return 'BRAND_BUILDING';
  if (tab === 'advanced') return 'BEAUTY_KNOWLEDGE';
  return 'SPA_SALES';
}

/** Tiêu đề draft khi soạn thủ công (không có bài thư viện). */
export function topicFromManualCaption(caption: string): string {
  const line =
    caption
      .trim()
      .split(/\r?\n/)
      .find((l) => l.trim()) ?? '';
  const clean = line.trim();
  if (!clean) return 'Bài đăng thủ công';
  return clean.length > 80 ? `${clean.slice(0, 77)}...` : clean;
}

export function canAutoPostPublish(input: {
  caption: string;
  fanpageId: string;
  facebookConnected: boolean;
}): boolean {
  return Boolean(input.caption.trim() && input.fanpageId && input.facebookConnected);
}

/** Gợi ý datetime-local (giờ máy) sau N phút. */
export function suggestScheduleDatetimeLocal(minutesFromNow = 60): string {
  const d = new Date(Date.now() + minutesFromNow * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Chuyển giá trị datetime-local → ISO UTC cho API schedule.
 * Trả null nếu rỗng/không hợp lệ.
 */
export function datetimeLocalToIso(value: string): string | null {
  const v = value?.trim();
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function isScheduleDatetimeInFuture(value: string): boolean {
  const iso = datetimeLocalToIso(value);
  if (!iso) return false;
  return new Date(iso).getTime() > Date.now() + 15_000;
}

export function buildManualOrLibraryDraftPayload(input: {
  draftId?: string;
  caption: string;
  fanpageId?: string;
  imageUrl?: string;
  linkUrl?: string;
  tabFilter: ContentStudioTab;
  libraryTitle?: string | null;
  libraryTab?: ContentStudioTab | null;
}): {
  id?: string;
  postType: AutoPostType;
  topic: string;
  caption: string;
  fanpageId?: string;
  imageUrl?: string;
  linkUrl?: string;
} {
  const caption = input.caption;
  if (!caption.trim()) {
    throw new Error('Nội dung bài đăng không được trống');
  }
  const postType = input.libraryTab
    ? mapTabToPostType(input.libraryTab)
    : mapTabToPostType(input.tabFilter);
  return {
    id: input.draftId,
    postType,
    topic: input.libraryTitle?.trim() || topicFromManualCaption(caption),
    caption,
    fanpageId: input.fanpageId || undefined,
    imageUrl: input.imageUrl || undefined,
    linkUrl: input.linkUrl || undefined,
  };
}
