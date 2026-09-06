'use client';

import { ExternalLink } from 'lucide-react';
import type { AutoPostItem } from '@/types/auto-post';
import { resolveFacebookPostUrl } from '@/lib/resolve-facebook-post-url';
import type { FacebookReviewCopy } from '@/lib/facebook-review-copy';

export function AutoPostSelectedPageChip({
  pageName,
  pagePictureUrl,
  label,
}: {
  pageName: string;
  pagePictureUrl?: string | null;
  label: string;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm"
      data-auto-post-selected-page="true"
    >
      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-emerald-100">
        {pagePictureUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pagePictureUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-bold text-emerald-700">
            {(pageName || '?').slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-800/70">{label}</p>
        <p className="truncate font-semibold text-emerald-950">{pageName}</p>
      </div>
    </div>
  );
}

export function AutoPostPublishResultBanner({
  item,
  locale,
  copy,
  onDismiss,
}: {
  item: AutoPostItem;
  locale: 'en' | 'vi';
  copy: FacebookReviewCopy['autoPost'];
  onDismiss?: () => void;
}) {
  const postUrl = resolveFacebookPostUrl(item);
  const when = item.publishedAt
    ? new Date(item.publishedAt).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN')
    : null;

  return (
    <div
      className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
      data-auto-post-publish-result="true"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">{copy.statusPublished}</p>
          {item.facebookPostId ? (
            <p className="break-all font-mono text-xs text-emerald-900/90">
              {copy.facebookPostId(item.facebookPostId)}
            </p>
          ) : null}
          {when ? <p className="text-xs text-emerald-800/80">{copy.publishedAt(when)}</p> : null}
        </div>
        {onDismiss ? (
          <button
            type="button"
            className="shrink-0 rounded px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-100"
            onClick={onDismiss}
            aria-label={copy.closeAria}
          >
            ✕
          </button>
        ) : null}
      </div>
      {postUrl ? (
        <a
          href={postUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 font-medium text-emerald-700 hover:underline"
          data-auto-post-view-on-facebook="true"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {copy.viewOnFacebook}
        </a>
      ) : null}
    </div>
  );
}
