'use client';

import { useState } from 'react';
import { FunnelBlockingAlert } from '@/components/funnel/funnel-blocking-alert';
import { FunnelLiveActions } from '@/components/funnel/funnel-live-actions';
import { FunnelStatusStrip } from '@/components/funnel/funnel-status-strip';
import { FunnelTestDialog } from '@/components/funnel/funnel-test-dialog';
import { Button } from '@/components/ui/button';
import {
  usePauseFunnel,
  usePrepareFunnelPublish,
  usePublishFunnel,
  type FunnelPublishStatus,
} from '@/hooks/use-funnel-lifecycle';
import { useFunnelValidation } from '@/hooks/use-funnel-validator';
import type { FunnelCompleteSpec } from '@/types/funnel';
import { useT } from '@/i18n/i18n-provider';

type Props = {
  recommendationId: string;
  status?: FunnelPublishStatus;
  compact?: boolean;
  copied?: boolean;
  onCopied?: (id: string) => void;
  onSpec?: (spec: FunnelCompleteSpec) => void;
  onActivated?: () => void;
};

export function FunnelLifecycleBar({
  recommendationId,
  status = 'DRAFT',
  compact = false,
  copied,
  onCopied,
  onSpec,
  onActivated,
}: Props) {
  const t = useT();
  const prepare = usePrepareFunnelPublish();
  const publish = usePublishFunnel();
  const pause = usePauseFunnel();
  const showActivate = status === 'DRAFT' || status === 'PAUSED';
  const validation = useFunnelValidation(showActivate ? recommendationId : null, false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);

  const busy = prepare.isPending || publish.isPending || pause.isPending || validation.isFetching;
  const canActivate = validation.data?.canActivate === true;

  async function onActivate() {
    setActionError(null);
    try {
      const prepared = await prepare.mutateAsync(recommendationId);
      onSpec?.(prepared.complete);
    } catch {
      // prepare is best-effort — publish still gates on validator
    }
    const latest = await validation.refetch();
    if (!latest.data?.canActivate) return;
    try {
      await publish.mutateAsync({ id: recommendationId });
      onActivated?.();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('funnel.activateFailed'));
    }
  }

  return (
    <div className="space-y-3 rounded-md border px-3 py-3">
      <FunnelStatusStrip status={status} />

      {showActivate && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size={compact ? 'default' : 'sm'} disabled={busy} onClick={() => void onActivate()}>
            {publish.isPending || prepare.isPending
              ? t('common.checking')
              : status === 'PAUSED'
                ? t('funnel.resume')
                : t('common.activate')}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setTestOpen(true)}>
            {t('common.testTry')}
          </Button>
        </div>
      )}

      {showActivate && !validation.isLoading ? <FunnelBlockingAlert result={validation.data} /> : null}

      {status === 'ACTIVE' && (
        <FunnelLiveActions
          funnelId={recommendationId}
          copied={copied}
          onCopied={onCopied}
          trailing={
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => pause.mutate(recommendationId)}
            >
              {t('common.pause')}
            </Button>
          }
        />
      )}

      {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}
      {canActivate && showActivate ? (
        <p className="text-xs text-muted-foreground">{t('funnel.readyToActivate')}</p>
      ) : null}

      <FunnelTestDialog funnelId={recommendationId} open={testOpen} onOpenChange={setTestOpen} />
    </div>
  );
}
