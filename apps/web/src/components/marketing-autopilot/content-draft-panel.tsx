'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useMarketingAutopilotContentIdeas,
  useRegenerateMarketingContentIdea,
  useSaveMarketingContentIdeaToStudio,
} from '@/hooks/use-marketing-autopilot';
import type { AutopilotContentIdeaView } from '@/types/marketing-autopilot';

function previewText(text: string, max = 160): string {
  const t = text.replace(/\*\*/g, '').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function ContentDraftPanel({
  projectId,
  enabled,
  fallbackIdeas,
  contentEditUrl,
}: {
  projectId?: string | null;
  enabled?: boolean;
  fallbackIdeas?: AutopilotContentIdeaView[];
  contentEditUrl?: string | null;
}) {
  const ideasQuery = useMarketingAutopilotContentIdeas(projectId, Boolean(enabled && projectId));
  const regenerate = useRegenerateMarketingContentIdea();
  const saveStudio = useSaveMarketingContentIdeaToStudio();
  const [viewIdea, setViewIdea] = useState<AutopilotContentIdeaView | null>(null);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);

  const ideas = useMemo(() => {
    const fromApi = ideasQuery.data?.ideas;
    if (Array.isArray(fromApi) && fromApi.length >= 5) return fromApi as AutopilotContentIdeaView[];
    if (fallbackIdeas?.length) return fallbackIdeas;
    return [];
  }, [ideasQuery.data?.ideas, fallbackIdeas]);

  const masterContentId = ideasQuery.data?.contentId ?? null;
  const editBase = contentEditUrl ?? (masterContentId ? `/teleprompter?contentId=${masterContentId}` : '/teleprompter');

  if (!ideas.length) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Ý tưởng nội dung — {ideas.length} sẵn sàng</h3>
        <p className="text-xs text-muted-foreground">Chỉ bản nháp · không tự đăng / không chạy Ads</p>
      </div>
      <ul className="grid gap-3 lg:grid-cols-2">
        {ideas.map((idea) => (
          <li key={idea.index} className="space-y-2 rounded-md border px-3 py-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-foreground">
                  {idea.index}. {idea.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {idea.channel} · {idea.formatLabel}
                </p>
              </div>
            </div>
            <p className="text-muted-foreground leading-5">
              <span className="text-foreground/80">Hook:</span> {previewText(idea.hook, 120)}
            </p>
            <p className="text-muted-foreground leading-5">
              <span className="text-foreground/80">Insight:</span>{' '}
              {previewText(idea.customerInsight, 120)}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" size="sm" variant="secondary" onClick={() => setViewIdea(idea)}>
                Xem kịch bản
              </Button>
              <Button type="button" size="sm" variant="outline" asChild>
                <Link href={`${editBase}${editBase.includes('?') ? '&' : '?'}idea=${idea.index}`}>
                  Chỉnh sửa
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={!projectId || regenerate.isPending}
                onClick={() => {
                  if (!projectId) return;
                  setPendingIndex(idea.index);
                  regenerate.mutate(
                    { projectId, ideaIndex: idea.index },
                    { onSettled: () => setPendingIndex(null) },
                  );
                }}
              >
                {regenerate.isPending && pendingIndex === idea.index ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                )}
                Tạo lại
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={!projectId || saveStudio.isPending}
                onClick={() => {
                  if (!projectId) return;
                  saveStudio.mutate({ projectId, ideaIndex: idea.index });
                }}
              >
                Lưu vào Content Studio
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={viewIdea != null} onOpenChange={(open) => !open && setViewIdea(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          {viewIdea ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {viewIdea.index}. {viewIdea.title}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm leading-6 whitespace-pre-wrap">
                <p>
                  <strong>Hook:</strong> {viewIdea.hook}
                </p>
                <p>
                  <strong>Insight / nỗi đau:</strong> {viewIdea.customerInsight}
                </p>
                <p>
                  <strong>Góc triển khai:</strong> {viewIdea.angle}
                </p>
                <p>
                  <strong>Kênh · Format:</strong> {viewIdea.channel} · {viewIdea.formatLabel}
                </p>
                <div className="rounded-md border bg-muted/30 p-3">{viewIdea.fullContent}</div>
                <p>
                  <strong>Offer:</strong> {viewIdea.offer}
                </p>
                <p>
                  <strong>CTA:</strong> {viewIdea.cta}
                </p>
                {viewIdea.safetyNotes?.length ? (
                  <div className="text-xs text-muted-foreground">
                    <strong>Lưu ý an toàn:</strong>
                    <ul className="mt-1 list-disc pl-5">
                      {viewIdea.safetyNotes.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
