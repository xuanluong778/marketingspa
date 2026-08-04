'use client';

import { cn } from '@/lib/utils';
import {
  POLICY_BADGE_LABEL,
  POLICY_STATUS_STYLE,
  type ContentPolicySnapshot,
  type PolicyBadgeKind,
  resolvePolicyBadge,
} from '@/lib/facebook-policy-ui';
import type { FacebookPolicyCheckPayload } from '@/types/content-marketing';

export function FacebookPolicyStatusBadge({
  snapshot,
  payload,
  kind: kindOverride,
  className,
}: {
  snapshot?: ContentPolicySnapshot | null;
  payload?: FacebookPolicyCheckPayload;
  kind?: PolicyBadgeKind;
  className?: string;
}) {
  const kind = kindOverride ?? resolvePolicyBadge(snapshot, payload);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        POLICY_STATUS_STYLE[kind],
        className,
      )}
    >
      {POLICY_BADGE_LABEL[kind]}
      {snapshot && kind !== 'UNCHECKED' && kind !== 'STALE' ? (
        <span className="ml-1 opacity-70">· {snapshot.riskScore}/100</span>
      ) : null}
    </span>
  );
}
