'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FunnelTestDialog, publicFunnelUrl } from '@/components/funnel/funnel-test-dialog';
import { Button } from '@/components/ui/button';
import { funnelHref } from '@/lib/funnel-tabs';

export function FunnelLiveActions({
  funnelId,
  copied,
  onCopied,
}: {
  funnelId: string;
  copied?: boolean;
  onCopied?: (id: string) => void;
}) {
  const router = useRouter();
  const [testOpen, setTestOpen] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  async function onCopy() {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(publicFunnelUrl(funnelId));
      onCopied?.(funnelId);
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
        <Button size="sm" variant="secondary" onClick={() => setTestOpen(true)}>
          Test thử
        </Button>
        <Button size="sm" variant="outline" onClick={() => void onCopy()}>
          {copied ? 'Đã copy' : 'Copy link'}
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
