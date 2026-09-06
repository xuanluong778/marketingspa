import type { AutoPostItem } from '@/types/auto-post';

/** Build public Facebook URL for a published Auto Post item. */
export function resolveFacebookPostUrl(item: {
  facebookPostUrl?: string | null;
  facebookPermalink?: string | null;
  facebookPostId?: string | null;
  fanpagePageId?: string | null;
}): string | null {
  const direct = item.facebookPostUrl || item.facebookPermalink;
  if (direct?.trim()) return direct.trim();
  const fbId = item.facebookPostId?.trim();
  if (!fbId) return null;
  if (fbId.includes('_')) {
    const [pid, storyId] = fbId.split('_');
    const pageId = item.fanpagePageId || pid;
    if (pageId && storyId) {
      return `https://www.facebook.com/permalink.php?story_fbid=${encodeURIComponent(storyId)}&id=${encodeURIComponent(pageId)}`;
    }
  }
  if (/^https?:\/\//i.test(fbId)) return fbId;
  return `https://www.facebook.com/${fbId}`;
}

export function normalizePublishResponse(
  data: AutoPostItem | { items?: AutoPostItem[] },
): AutoPostItem | null {
  if (!data || typeof data !== 'object') return null;
  if ('items' in data && Array.isArray(data.items) && data.items[0]) {
    return data.items[0];
  }
  if ('id' in data && 'status' in data) {
    return data as AutoPostItem;
  }
  return null;
}
