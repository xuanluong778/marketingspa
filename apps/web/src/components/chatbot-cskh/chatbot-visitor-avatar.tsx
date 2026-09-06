'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

/** URL đủ điều kiện để gắn vào <img> — absolute http(s) hoặc path /api/… (proxy avatar). */
export function isUsableAvatarUrl(src?: string | null): boolean {
  const s = String(src || '').trim();
  if (!s) return false;
  if (s === 'null' || s === 'undefined' || s === '""' || s === "''") return false;
  if (s.startsWith('/api/')) return true;
  if (s.startsWith('data:image/')) return true;
  try {
    const u = new URL(s, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'data:';
  } catch {
    return false;
  }
}

function resolveAvatarSrc(src?: string | null): string {
  const s = String(src || '').trim();
  if (!s) return '';
  if (s.startsWith('data:')) return s;
  if (s.startsWith('/api/') && typeof window !== 'undefined') {
    return `${window.location.origin}${s}`;
  }
  return s;
}

export function visitorInitials(name?: string | null): string {
  const raw = String(name || '').trim();
  if (!raw) return '?';
  if (/^PSID/i.test(raw)) return 'PS';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] || ''}${parts[parts.length - 1]![0] || ''}`.toUpperCase() || '?';
}

/** Silhouette fallback — không dùng chữ cái / màu nổi khi Meta chặn profile_pic. */
export function buildFallbackAvatarDataUri(seed?: string | null): string {
  const palette = ['#64748B', '#78716C', '#57534E', '#6B7280', '#71717A', '#52525B'];
  const key = String(seed || 'x');
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const bg = palette[hash % palette.length]!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="64" fill="${bg}"/><circle cx="64" cy="48" r="22" fill="#E2E8F0"/><path d="M24 112c8-24 24-36 40-36s32 12 40 36" fill="#E2E8F0"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Avatar khách (CSKH inbox + messages + header).
 * Ưu tiên ảnh Meta / signed proxy; lỗi → silhouette (không nhảy sang chữ cái).
 */
export function ChatbotVisitorAvatar({
  name,
  src,
  size = 36,
  className,
  title,
}: {
  name?: string | null;
  src?: string | null;
  size?: number;
  className?: string;
  title?: string;
}) {
  const usable = isUsableAvatarUrl(src);
  const [broken, setBroken] = useState(false);
  const [fallbackSrc, setFallbackSrc] = useState<string | null>(null);
  const initials = useMemo(() => visitorInitials(name), [name]);
  const dim = `${size}px`;

  useEffect(() => {
    setBroken(false);
    setFallbackSrc(null);
  }, [src]);

  const activeSrc = fallbackSrc || (usable && !broken ? src : null);
  const showImg = Boolean(activeSrc && isUsableAvatarUrl(activeSrc));

  if (showImg) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolveAvatarSrc(activeSrc)}
        alt=""
        title={title || name || undefined}
        width={size}
        height={size}
        className={cn('shrink-0 rounded-full object-cover bg-muted', className)}
        style={{ width: dim, height: dim }}
        onError={() => {
          if (!fallbackSrc) {
            setFallbackSrc(buildFallbackAvatarDataUri(src || name || '?'));
            return;
          }
          setBroken(true);
          setFallbackSrc(null);
        }}
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        fetchPriority="low"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={buildFallbackAvatarDataUri(name || '?')}
      alt=""
      title={title || name || undefined}
      width={size}
      height={size}
      className={cn('shrink-0 rounded-full object-cover bg-muted', className)}
      style={{ width: dim, height: dim }}
      aria-label={initials}
    />
  );
}
