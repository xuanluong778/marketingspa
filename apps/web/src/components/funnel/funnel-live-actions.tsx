'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { FunnelTestDialog, publicFunnelUrl } from '@/components/funnel/funnel-test-dialog';
import { FunnelDirectEditButton } from '@/components/funnel/funnel-direct-edit-button';
import { Button } from '@/components/ui/button';
import { funnelHref } from '@/lib/funnel-tabs';

export function FunnelLiveActions({
  funnelId,
  copied,
  onCopied,
  trailing,
}: {
  funnelId: string;
  copied?: boolean;
  onCopied?: (id: string) => void;
  /** Nút bổ sung ngay sau "Xem phễu live" (vd. Tạm dừng) */
  trailing?: ReactNode;
}) {
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
      setCopyError('Không copy được link');
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => window.open(publicFunnelUrl(funnelId), '_blank', 'noopener,noreferrer')}
        >
          Xem phễu live
        </Button>
        {trailing}
        <FunnelDirectEditButton funnelId={funnelId} variant="outline" />
        <Button size="sm" variant="secondary" onClick={() => setTestOpen(true)}>
          Test thử
        </Button>
        <Button size="sm" variant="outline" onClick={() => void onCopy()}>
          {isCopied ? 'Đã Copy link' : 'Copy link'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.replace(funnelHref({ tab: 'customers', funnel: funnelId }))}
        >
          Xem khách hàng
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.replace(funnelHref({ tab: 'analytics' }))}
        >
          Xem kết quả
        </Button>
      </div>
      {copyError ? <p className="text-sm text-destructive">{copyError}</p> : null}
      <FunnelTestDialog funnelId={funnelId} open={testOpen} onOpenChange={setTestOpen} />
    </div>
  );
}
