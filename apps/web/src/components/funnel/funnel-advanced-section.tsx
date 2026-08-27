'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FunnelAdvancedLifecycle } from '@/components/funnel/funnel-advanced-lifecycle';
import { FunnelBuilderPanel } from '@/components/funnel/funnel-builder-panel';
import { FunnelScoringPanel } from '@/components/funnel/funnel-scoring-panel';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FunnelAdvancedPane } from '@/lib/funnel-tabs';
import type { FunnelCompleteSpec } from '@/types/funnel';
import type { FunnelPublishStatus } from '@/hooks/use-funnel-lifecycle';
import { useT } from '@/i18n/i18n-provider';

export function FunnelAdvancedSection({
  funnelId,
  defaultOpen = false,
  initialPane = 'scoring',
  status,
  publishedVersion,
  liveFrozen,
  onSpec,
}: {
  funnelId?: string | null;
  defaultOpen?: boolean;
  initialPane?: FunnelAdvancedPane;
  status?: FunnelPublishStatus;
  publishedVersion?: number;
  liveFrozen?: boolean;
  onSpec?: (spec: FunnelCompleteSpec) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  const [pane, setPane] = useState<FunnelAdvancedPane>(initialPane);

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <p className="text-sm font-medium">{t('funnel.advanced')}</p>
          <p className="text-xs text-muted-foreground">{t('funnel.advancedDesc')}</p>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="space-y-4 border-t px-4 py-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={pane === 'scoring' ? 'default' : 'outline'}
              onClick={() => setPane('scoring')}
            >
              Lead Scoring
            </Button>
            <Button
              type="button"
              size="sm"
              variant={pane === 'builder' ? 'default' : 'outline'}
              onClick={() => setPane('builder')}
            >
              AI Builder
            </Button>
            <Button
              type="button"
              size="sm"
              variant={pane === 'lifecycle' ? 'default' : 'outline'}
              onClick={() => setPane('lifecycle')}
            >
              {t('funnel.versionsPane')}
            </Button>
          </div>
          {pane === 'scoring' ? (
            <FunnelScoringPanel recommendationId={funnelId ?? undefined} />
          ) : pane === 'builder' ? (
            <FunnelBuilderPanel />
          ) : funnelId ? (
            <FunnelAdvancedLifecycle
              recommendationId={funnelId}
              status={status}
              publishedVersion={publishedVersion}
              liveFrozen={liveFrozen}
              onSpec={onSpec}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t('funnel.versionsNeedFunnel')}</p>
          )}
        </div>
      )}
    </div>
  );
}
