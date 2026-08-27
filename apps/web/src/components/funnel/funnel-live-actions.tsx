'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { FunnelTestDialog, publicFunnelUrl } from '@/components/funnel/funnel-test-dialog';
import { FunnelDirectEditButton } from '@/components/funnel/funnel-direct-edit-button';
import { Button } from '@/components/ui/button';
import { funnelHref } from '@/lib/funnel-tabs';
import { useT } from '@/i18n/i18n-provider';

export function FunnelLiveActions({
  funnelId,
  copied,
  onCopied,
  trailing,
}: {
  funnelId: string;
  copied?: boolean;
  onCopied?: (id: string) => void;
  /** Extra button right after "View live funnel" (e.g. Pause) */
  trailing?: ReactNode;
}) {
  const t = useT();
  const router = useRouter();
  const [testOpen, setTestOpen] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [localCopied, setLocalCopied] = useState(false);
  const isCopied = copied !== undefined ? copied : localCopied;

  useEffect(() => {
    setLocalCopied(false);
  }, [funnelId]);

  async function onCopy() {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(publicFunnelUrl(funnelId));
      if (onCopied) {
        onCopied(funnelId);
      } else {
        setLocalCopied(true);
        window.setTimeout(() => setLocalCopied(false), 2500);
      }
    } catch {
      setCopyError(t('funnel.copyFailed'));
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => window.open(publicFunnelUrl(funnelId), '_blank', 'noopener,noreferrer')}
        >
          {t('funnel.viewLive')}
        </Button>
        {trailing}
        <FunnelDirectEditButton funnelId={funnelId} variant="outline" />
        <Button size="sm" variant="secondary" onClick={() => setTestOpen(true)}>
          {t('common.testTry')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => void onCopy()}>
          {isCopied ? t('funnel.copiedLink') : t('funnel.copyLink')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.replace(funnelHref({ tab: 'customers', funnel: funnelId }))}
        >
          {t('funnel.viewCustomers')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.replace(funnelHref({ tab: 'analytics' }))}
        >
          {t('funnel.viewResults')}
        </Button>
      </div>
      {copyError ? <p className="text-sm text-destructive">{copyError}</p> : null}
      <FunnelTestDialog funnelId={funnelId} open={testOpen} onOpenChange={setTestOpen} />
    </div>
  );
}
