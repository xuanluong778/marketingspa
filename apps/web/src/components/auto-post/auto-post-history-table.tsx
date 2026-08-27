'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { type AutoPostItem, type AutoPostStatus } from '@/types/auto-post';
import { cn } from '@/lib/utils';
import { ExternalLink, RotateCcw, Trash2, XCircle } from 'lucide-react';
import { useI18n, useT } from '@/i18n/i18n-provider';

const STATUS_VARIANT: Record<AutoPostStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  PENDING: 'bg-amber-100 text-amber-800',
  SCHEDULED: 'bg-blue-100 text-blue-800',
  PUBLISHING: 'bg-violet-100 text-violet-800',
  PUBLISHED: 'bg-emerald-100 text-emerald-800',
  FAILED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

const STATUS_I18N: Record<AutoPostStatus, string> = {
  DRAFT: 'facebookFlow.statusDraft',
  PENDING: 'facebookFlow.statusPending',
  SCHEDULED: 'facebookFlow.statusScheduled',
  PUBLISHING: 'facebookFlow.statusPublishing',
  PUBLISHED: 'facebookFlow.statusPublished',
  FAILED: 'facebookFlow.statusFailed',
  CANCELLED: 'facebookFlow.statusCancelled',
};

function formatDt(iso: string | null, dateLocale: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(dateLocale);
}

function resolvePostUrl(item: AutoPostItem): string | null {
  if (item.facebookPostUrl) return item.facebookPostUrl;
  if (!item.facebookPostId) return null;
  if (item.facebookPostId.includes('_')) {
    const [pid, storyId] = item.facebookPostId.split('_');
    const pageId = item.fanpagePageId || pid;
    if (pageId && storyId) {
      return `https://www.facebook.com/permalink.php?story_fbid=${encodeURIComponent(storyId)}&id=${encodeURIComponent(pageId)}`;
    }
  }
  return `https://www.facebook.com/${item.facebookPostId}`;
}

export function AutoPostHistoryTable({
  items,
  onRetry,
  onCancel,
  onDelete,
  busy,
}: {
  items: AutoPostItem[];
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  busy?: boolean;
}) {
  const t = useT();
  const { locale } = useI18n();
  const dateLocale = locale === 'en' ? 'en-US' : 'vi-VN';
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        {t('autoPost.emptyHistory')}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full text-sm text-slate-900">
        <thead className="border-b bg-slate-100">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-black">
              {t('facebookFlow.colTopic')}
            </th>
            <th className="px-4 py-3 text-left font-semibold text-black">
              {t('facebookFlow.colType')}
            </th>
            <th className="px-4 py-3 text-left font-semibold text-black">
              {t('facebookFlow.colFanpage')}
            </th>
            <th className="px-4 py-3 text-left font-semibold text-black">
              {t('facebookFlow.colStatus')}
            </th>
            <th className="px-4 py-3 text-left font-semibold text-black">
              {t('facebookFlow.colSchedule')}
            </th>
            <th className="px-4 py-3 text-right font-semibold text-black">
              {t('facebookFlow.colActions')}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const viewUrl = resolvePostUrl(item);
            return (
              <tr key={item.id} className="border-b last:border-0 hover:bg-slate-50/80">
                <td className="max-w-[200px] px-4 py-3">
                  <p className="truncate font-medium text-slate-900">{item.topic}</p>
                  {item.errorMessage && item.status === 'FAILED' && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-red-600">{item.errorMessage}</p>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-800">
                  {t(`facebookFlow.postType.${item.postType}`)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-800">
                  {item.fanpageName ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <Badge className={cn('font-normal', STATUS_VARIANT[item.status])}>
                    {t(STATUS_I18N[item.status])}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                  {item.status === 'SCHEDULED'
                    ? formatDt(item.scheduledAt, dateLocale)
                    : formatDt(item.publishedAt ?? item.createdAt, dateLocale)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-1">
                    {item.status === 'PUBLISHED' && viewUrl ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-[#0A3D30] bg-[#0A3D30] text-white hover:bg-[#083028] hover:text-white [&_svg]:text-white"
                        asChild
                      >
                        <a href={viewUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="mr-1 h-3.5 w-3.5" />
                          {t('facebookFlow.viewPost')}
                        </a>
                      </Button>
                    ) : null}
                    {item.status === 'FAILED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-[#0A3D30] bg-[#0A3D30] text-white hover:bg-[#083028] hover:text-white [&_svg]:text-white"
                        disabled={busy}
                        onClick={() => onRetry(item.id)}
                      >
                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                        {t('common.retry')}
                      </Button>
                    )}
                    {item.status === 'SCHEDULED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-[#0A3D30] bg-[#0A3D30] text-white hover:bg-[#083028] hover:text-white [&_svg]:text-white"
                        disabled={busy}
                        onClick={() => onCancel(item.id)}
                      >
                        <XCircle className="mr-1 h-3.5 w-3.5" />
                        {t('facebookFlow.cancelSchedule')}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-200 bg-white text-red-700 hover:bg-red-50 hover:text-red-800"
                      disabled={busy}
                      onClick={() => onDelete(item.id)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      {t('common.delete')}
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
