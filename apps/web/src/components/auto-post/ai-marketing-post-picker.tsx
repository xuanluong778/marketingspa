'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  type AiMarketingPostPayload,
} from '@/lib/auto-post-ai-marketing-bridge';
import { buildContentAutoPostHref } from '@/lib/content-auto-post-routes';
import type { ContentHistoryItem } from '@/types/content-marketing';
import { useI18n, useT } from '@/i18n/i18n-provider';

function formatCreatedAt(iso: string | undefined, locale: string): string {
  if (!iso?.trim()) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');
}

export function AiMarketingPostPicker({
  items,
  selectedId,
  onSelect,
  className,
  emptyMessage,
}: {
  items: ContentHistoryItem[];
  selectedId?: string;
  onSelect: (payload: AiMarketingPostPayload) => void;
  className?: string;
  emptyMessage?: string;
}) {
  const t = useT();
  const { locale } = useI18n();
  if (items.length === 0) {
    return (
      <div className={cn('rounded-xl border border-dashed p-8 text-center space-y-3', className)}>
        <p className="text-sm text-muted-foreground">
          {emptyMessage ?? t('content.emptyAiMarketingPosts')}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href={buildContentAutoPostHref('create')}>
            <Sparkles className="mr-2 h-4 w-4" />
            {t('facebookFlow.tabs.create')}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2 max-h-[min(520px,60vh)] overflow-y-auto pr-1', className)}>
      {items.map((item) => {
        const active = selectedId === item.id;
        const title = item.title?.trim() || t('facebookFlow.noTitle');
        const preview = item.content?.trim().slice(0, 120);

        return (
          <button
            key={item.id}
            type="button"
            onClick={() =>
              onSelect({
                historyId: item.id,
                tab: item.tab,
                title,
                content: item.content,
                contentScore: item.contentScore,
                sourceLabel: t(`facebookFlow.tabFilter.${item.tab}`),
              })
            }
            className={cn(
              'w-full text-left rounded-xl border p-4 transition-colors',
              active
                ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/40',
            )}
          >
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <Badge variant="secondary" className="font-normal text-xs">
                {t(`facebookFlow.tabFilter.${item.tab}`)}
              </Badge>
              {item.contentScore > 0 && (
                <span className="text-xs text-muted-foreground">
                  {t('facebookFlow.scoreLabel', { score: Math.round(item.contentScore) })}
                </span>
              )}
              {item.createdAt && (
                <span className="text-xs text-muted-foreground">{formatCreatedAt(item.createdAt, locale)}</span>
              )}
            </div>
            <p className="font-medium text-slate-900 line-clamp-1">{title}</p>
            {preview && (
              <p className="mt-1 line-clamp-2 text-xs text-black">{preview}…</p>
            )}
          </button>
        );
      })}
    </div>
  );
}
