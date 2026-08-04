export function calcConversionRate(signups: number, clicks: number): number {
  if (!clicks || clicks <= 0) return 0;
  return Math.round((signups / clicks) * 1000) / 10;
}

export function calcTotalEarned(stats: {
  pendingCommission: number;
  availableCommission: number;
  payoutPendingCommission: number;
  paidCommission: number;
}): number {
  return (
    Number(stats.pendingCommission || 0) +
    Number(stats.availableCommission || 0) +
    Number(stats.payoutPendingCommission || 0) +
    Number(stats.paidCommission || 0)
  );
}

export function canRequestWithdraw(input: {
  status: string;
  available: number;
  minPayout: number;
  hasVerifiedBank: boolean;
  hasOpenPayout: boolean;
}): boolean {
  return (
    input.status === 'ACTIVE' &&
    input.hasVerifiedBank &&
    !input.hasOpenPayout &&
    Number(input.available) >= Number(input.minPayout)
  );
}

export function buildAffiliateLink(baseUrl: string, code: string): string {
  const base = (baseUrl || 'https://marketingautoaz.com').replace(/\/$/, '');
  return `${base}/register?ref=${encodeURIComponent(code)}`;
}
