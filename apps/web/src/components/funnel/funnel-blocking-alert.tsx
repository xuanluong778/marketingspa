'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  activateBlockedReason,
  blockingChecks,
  friendlyCheckFix,
} from '@/lib/funnel-lifecycle-ui';
import type { FunnelValidatorResult } from '@/types/funnel-validator';
import { useT } from '@/i18n/i18n-provider';

export function FunnelBlockingAlert({ result }: { result: FunnelValidatorResult | null | undefined }) {
  const t = useT();
  if (!result || result.canActivate) return null;
  const blocking = blockingChecks(result);
  const extra = activateBlockedReason(result);

  function fixLabel(checkId: string, fallback: string) {
    const key = `funnel.checks.${checkId}`;
    const translated = t(key);
    return translated === key ? fallback : translated;
  }

  const insufficientKey = 'funnel.checks.insufficient';
  const insufficientMsg = t(insufficientKey);
  const extraLabel =
    extra && insufficientMsg !== insufficientKey ? insufficientMsg : extra;

  return (
    <Alert variant="warning">
      <AlertTitle>{t('funnel.cannotActivate')}</AlertTitle>
      <AlertDescription>
        <p className="mb-2">{t('funnel.fixThenActivate')}</p>
        <ul className="list-disc space-y-1 pl-5">
          {blocking.map((c) => (
            <li key={c.id}>{fixLabel(c.id, friendlyCheckFix(c))}</li>
          ))}
          {extraLabel ? <li>{extraLabel}</li> : null}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
