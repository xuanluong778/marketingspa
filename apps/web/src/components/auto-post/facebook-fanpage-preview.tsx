'use client';

import { FacebookPostContent } from '@/components/content-marketing/facebook-post-content';
import { cn } from '@/lib/utils';
import { ExternalLink } from 'lucide-react';

export function FacebookFanpagePreview({
  pageName,
  pagePictureUrl,
  caption,
  imageUrl,
  linkUrl,
  cta,
  className,
}: {
  pageName: string;
  pagePictureUrl?: string | null;
  caption: string;
  imageUrl?: string | null;
  linkUrl?: string | null;
  cta?: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden',
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <div className="h-10 w-10 rounded-full bg-emerald-100 overflow-hidden shrink-0">
          {pagePictureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pagePictureUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-emerald-700 font-bold text-sm">
              {pageName.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div>
          <p className="font-semibold text-sm text-slate-900">{pageName || 'Fanpage spa'}</p>
          <p className="text-xs text-muted-foreground">Vừa xong · 🌐</p>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        {caption.trim() ? (
          <FacebookPostContent content={caption} />
        ) : (
          <p className="text-sm text-muted-foreground italic">Nội dung bài đăng sẽ hiển thị ở đây...</p>
        )}

        {imageUrl?.trim() && (
          <div className="rounded-lg overflow-hidden border bg-slate-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="Preview" className="w-full max-h-72 object-cover" />
          </div>
        )}

        {linkUrl?.trim() && (
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2 text-sm text-emerald-700 hover:bg-slate-100"
          >
            <ExternalLink className="h-4 w-4 shrink-0" />
            <span className="truncate">{linkUrl}</span>
          </a>
        )}

        {cta?.trim() && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-800">
            CTA: {cta}
          </div>
        )}
      </div>
    </div>
  );
}
