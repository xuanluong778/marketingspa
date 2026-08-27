'use client';

import { useState } from 'react';
import { ScanBarcode } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useProductLookup } from '@/hooks/use-sales';
import { formatMutationError } from '@/lib/format-mutation-error';
import { useT } from '@/i18n/i18n-provider';
import type { SalesProduct } from '@/types/sales';

/** Scan / gõ SKU hoặc barcode → Enter → lookup product */
export function SalesBarcodeScan({
  onFound,
  disabled,
  placeholder,
}: {
  onFound: (product: SalesProduct & { sellableQty?: number }) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const t = useT();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const lookup = useProductLookup();

  const run = () => {
    const q = code.trim();
    if (!q) {
      setErr(t('sales.scanRequired'));
      return;
    }
    setErr('');
    lookup.mutate(q, {
      onSuccess: (p) => {
        onFound(p);
        setCode('');
      },
      onError: (e) => setErr(formatMutationError(e, t('sales.scanNotFound'))),
    });
  };

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <ScanBarcode className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            value={code}
            disabled={disabled || lookup.isPending}
            placeholder={placeholder || t('sales.scanPlaceholder')}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                run();
              }
            }}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || lookup.isPending}
          onClick={run}
        >
          {lookup.isPending ? t('common.loading') : t('sales.scan')}
        </Button>
      </div>
      {err ? <p className="text-xs text-amber-200">{err}</p> : null}
    </div>
  );
}
