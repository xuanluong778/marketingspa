'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  activateBlockedReason,
  blockingChecks,
  friendlyCheckFix,
} from '@/lib/funnel-lifecycle-ui';
import type { FunnelValidatorResult } from '@/types/funnel-validator';

export function FunnelBlockingAlert({ result }: { result: FunnelValidatorResult | null | undefined }) {
  if (!result || result.canActivate) return null;
  const blocking = blockingChecks(result);
  const extra = activateBlockedReason(result);

  return (
    <Alert variant="warning">
      <AlertTitle>Chưa thể kích hoạt</AlertTitle>
      <AlertDescription>
        <p className="mb-2">Sửa các mục sau rồi bấm Kích hoạt:</p>
        <ul className="list-disc space-y-1 pl-5">
          {blocking.map((c) => (
            <li key={c.id}>{friendlyCheckFix(c)}</li>
          ))}
          {extra ? <li>{extra}</li> : null}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
