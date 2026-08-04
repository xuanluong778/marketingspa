import type { FacebookPolicyUrlKind } from './facebook-policy.types';

export function detectPolicyUrlKind(
  url: string,
  hint?: FacebookPolicyUrlKind | string,
): FacebookPolicyUrlKind {
  if (hint === 'landing_page') return 'landing_page';
  let host = '';
  let path = '';
  try {
    const u = new URL(url.trim());
    host = u.hostname.toLowerCase();
    path = u.pathname.toLowerCase();
  } catch {
    return 'unknown';
  }

  const isFb =
    host.includes('facebook.com') || host.includes('fb.com') || host.includes('fb.watch');
  if (isFb) {
    if (path.includes('/reel/') || path.includes('/reels/')) return 'facebook_reel';
    if (path.includes('/watch') || path.includes('/videos/')) return 'facebook_video';
    if (path.includes('/posts/') || path.includes('/permalink') || /\/pfbid/i.test(path)) {
      return 'facebook_post';
    }
    return 'facebook_post';
  }
  return 'website';
}

export function parseFacebookContentUrl(url: string): {
  kind: FacebookPolicyUrlKind;
  pageHint?: string;
  contentId?: string;
} | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.toLowerCase();
    if (!host.includes('facebook.com') && !host.includes('fb.com')) return null;
    const kind = detectPolicyUrlKind(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const pageHint =
      parts[0] && !['watch', 'reel', 'reels', 'videos'].includes(parts[0]) ? parts[0] : undefined;
    const postsIdx = parts.indexOf('posts');
    const contentId =
      postsIdx >= 0 && parts[postsIdx + 1]
        ? parts[postsIdx + 1]
        : parts.find((p) => /^\d+$/.test(p) || p.startsWith('pfbid'));
    return { kind, pageHint, contentId };
  } catch {
    return null;
  }
}
