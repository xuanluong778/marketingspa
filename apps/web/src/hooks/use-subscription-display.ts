'use client';

import { buildSubscriptionDisplay, type SubscriptionDisplay } from '@marketingspa/shared';
import { useCurrentSubscription, type CurrentSubscription } from './use-billing';

function fallbackDisplay(sub: CurrentSubscription): SubscriptionDisplay {
  return buildSubscriptionDisplay({
    status: sub.subscriptionStatus ?? sub.status,
    planCode: sub.planCode ?? sub.plan?.code ?? null,
    durationMonths: sub.durationMonths ?? sub.plan?.durationMonths ?? null,
    rawExpiresAt: sub.expiresAt ?? sub.currentPeriodEnd ?? null,
    trialDays: sub.trial?.trialDays ?? 3,
  });
}

/** UI subscription display — ưu tiên `display` từ API. */
export function useSubscriptionDisplay() {
  const query = useCurrentSubscription();
  const display =
    query.data?.display ??
    (query.data ? fallbackDisplay(query.data) : null);

  return { ...query, display };
}

export type { SubscriptionDisplay };
