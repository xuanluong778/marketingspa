/** Plan codes — đồng bộ với seed/migration MSP Pro. */
export const SUBSCRIPTION_PLAN_CODES = {
  TRIAL: 'msp-trial-3d',
  PRO_6M: 'msp-pro-6m',
  PRO_12M: 'msp-pro-12m',
} as const;

export type SubscriptionPeriodSource = 'NONE' | 'TRIAL' | 'PAYMENT' | 'ADMIN_GIFT';

export type SubscriptionTier =
  | 'FREE'
  | 'TRIAL'
  | 'ADMIN_GIFT'
  | 'PRO_6M'
  | 'PRO_12M';

export type SubscriptionUpgradeVariant = 'upgrade_pro' | 'upgrade_12m' | 'current_plan';

export interface SubscriptionUpgradeButton {
  show: boolean;
  label: string;
  href: string;
  variant: SubscriptionUpgradeVariant;
}

export interface SubscriptionDisplay {
  tier: SubscriptionTier;
  periodSource: SubscriptionPeriodSource;
  /** ISO — thời điểm hết hạn dùng cho UI (đã sanitize nếu cần). */
  expiresAt: string | null;
  /** ceil((expiresAt - now) / 1 ngày), luôn >= 0 */
  remainingDays: number;
  planLabel: string;
  upgradeButton: SubscriptionUpgradeButton | null;
  showDaysChip: boolean;
}

export interface SubscriptionDisplayInput {
  status: string;
  planCode: string | null;
  durationMonths: number | null;
  /** Raw DB end — trialEndsAt khi TRIALING, else currentPeriodEnd */
  rawExpiresAt: string | Date | null;
  /** Kết thúc chu kỳ tính từ payment orders PAID (null nếu chưa thanh toán) */
  paidPeriodEnd?: string | Date | null;
  trialDays?: number;
  now?: number;
}

const MS_PER_DAY = 86_400_000;
/** Admin có thể tặng thêm tối đa trên gói đã trả phí — vượt ngưỡng coi là corrupt stacking. */
export const MAX_ADMIN_EXTENSION_DAYS_ON_PAID = 365;

export function parseExpiresMs(value: string | Date | null | undefined): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

export function computeRemainingDays(
  expiresAt: string | Date | null | undefined,
  now = Date.now(),
): number {
  const ms = parseExpiresMs(expiresAt);
  if (ms == null) return 0;
  return Math.max(0, Math.ceil((ms - now) / MS_PER_DAY));
}

/** Cộng tháng giống backend extendSubscriptionTx. */
export function addMonthsUtc(base: Date, months: number): Date {
  const end = new Date(base);
  end.setMonth(end.getMonth() + months);
  return end;
}

/** Tính hạn từ chuỗi đơn PAID (stack gia hạn). */
export function computePaidPeriodEndFromOrders(
  orders: Array<{ paidAt: string | Date | null; durationMonths: number | null }>,
): Date | null {
  let end: Date | null = null;
  for (const o of orders) {
    const paidMs = parseExpiresMs(o.paidAt);
    const months = o.durationMonths ?? 0;
    if (paidMs == null || months <= 0) continue;
    const paidAt = new Date(paidMs);
    const base = end && end.getTime() > paidAt.getTime() ? end : paidAt;
    end = addMonthsUtc(base, months);
  }
  return end;
}

export function resolvePeriodSource(input: {
  status: string;
  planCode: string | null;
  paidPeriodEnd: Date | null;
}): SubscriptionPeriodSource {
  const code = input.planCode ?? '';
  if (input.status === 'TRIALING' || code === SUBSCRIPTION_PLAN_CODES.TRIAL) return 'TRIAL';
  if (input.paidPeriodEnd) return 'PAYMENT';
  if (input.status === 'ACTIVE' || input.status === 'EXPIRING') return 'ADMIN_GIFT';
  return 'NONE';
}

export function resolveSubscriptionTier(input: {
  status: string;
  planCode: string | null;
  durationMonths: number | null;
  periodSource: SubscriptionPeriodSource;
}): SubscriptionTier {
  const { status, planCode, durationMonths, periodSource } = input;
  const code = planCode ?? '';

  if (status === 'TRIALING' || code === SUBSCRIPTION_PLAN_CODES.TRIAL) return 'TRIAL';
  if (status === 'NONE' || status === 'EXPIRED' || status === 'TRIAL_EXPIRED') return 'FREE';

  const months = durationMonths ?? 0;
  const isPro12 = code === SUBSCRIPTION_PLAN_CODES.PRO_12M || months === 12;
  const isPro6 = code === SUBSCRIPTION_PLAN_CODES.PRO_6M || months === 6;

  if (periodSource === 'PAYMENT') {
    if (isPro12) return 'PRO_12M';
    if (isPro6) return 'PRO_6M';
  }

  if (periodSource === 'ADMIN_GIFT' && (isPro12 || isPro6)) return 'ADMIN_GIFT';

  if (isPro12 && (status === 'ACTIVE' || status === 'EXPIRING')) return 'PRO_12M';
  if (isPro6 && (status === 'ACTIVE' || status === 'EXPIRING')) return 'PRO_6M';

  return 'FREE';
}

/**
 * Sanitize expiresAt cho gói trả phí: nếu currentPeriodEnd vượt quá paid chain + admin buffer
 * (vd. 3266 ngày do extend/gift lặp) → clamp về paidPeriodEnd.
 */
export function resolveEffectiveExpiresAt(input: {
  rawExpiresAt: Date | null;
  paidPeriodEnd: Date | null;
  periodSource: SubscriptionPeriodSource;
}): Date | null {
  const { rawExpiresAt, paidPeriodEnd, periodSource } = input;
  if (!rawExpiresAt) return null;
  if (periodSource !== 'PAYMENT' || !paidPeriodEnd) return rawExpiresAt;

  const maxAllowedMs =
    paidPeriodEnd.getTime() + MAX_ADMIN_EXTENSION_DAYS_ON_PAID * MS_PER_DAY;
  if (rawExpiresAt.getTime() > maxAllowedMs) {
    return paidPeriodEnd;
  }
  return rawExpiresAt;
}

export function buildPlanLabel(tier: SubscriptionTier, trialDays = 3): string {
  switch (tier) {
    case 'PRO_12M':
      return 'Gói hiện tại 12 tháng';
    case 'PRO_6M':
      return 'Gói hiện tại 6 tháng';
    case 'TRIAL':
      return `Dùng thử ${trialDays} ngày`;
    case 'ADMIN_GIFT':
      return 'Gói được tặng';
    case 'FREE':
    default:
      return 'Chưa có gói Pro';
  }
}

export function buildUpgradeButton(tier: SubscriptionTier): SubscriptionUpgradeButton | null {
  switch (tier) {
    case 'FREE':
    case 'TRIAL':
    case 'ADMIN_GIFT':
      return {
        show: true,
        label: 'Nâng cấp gói Pro',
        href: '/pricing',
        variant: 'upgrade_pro',
      };
    case 'PRO_6M':
      return {
        show: true,
        label: 'Nâng cấp lên 12 tháng',
        href: '/pricing?upgrade=msp-pro-12m',
        variant: 'upgrade_12m',
      };
    case 'PRO_12M':
      return {
        show: false,
        label: 'Gói hiện tại 12 tháng',
        href: '/pricing',
        variant: 'current_plan',
      };
    default:
      return {
        show: true,
        label: 'Nâng cấp gói Pro',
        href: '/pricing',
        variant: 'upgrade_pro',
      };
  }
}

/** Source of truth — API + web UI dùng chung. */
export function buildSubscriptionDisplay(
  input: SubscriptionDisplayInput,
): SubscriptionDisplay {
  const now = input.now ?? Date.now();
  const rawMs = parseExpiresMs(input.rawExpiresAt);
  const rawExpiresAt = rawMs != null ? new Date(rawMs) : null;
  const paidMs = parseExpiresMs(input.paidPeriodEnd ?? null);
  const paidPeriodEnd = paidMs != null ? new Date(paidMs) : null;

  const periodSource = resolvePeriodSource({
    status: input.status,
    planCode: input.planCode,
    paidPeriodEnd,
  });

  const effectiveExpiresAt = resolveEffectiveExpiresAt({
    rawExpiresAt,
    paidPeriodEnd,
    periodSource,
  });

  const tier = resolveSubscriptionTier({
    status: input.status,
    planCode: input.planCode,
    durationMonths: input.durationMonths,
    periodSource,
  });

  const expiresAtIso = effectiveExpiresAt?.toISOString() ?? null;
  const remainingDays = computeRemainingDays(expiresAtIso, now);
  const upgradeButton = buildUpgradeButton(tier);

  return {
    tier,
    periodSource,
    expiresAt: expiresAtIso,
    remainingDays,
    planLabel: buildPlanLabel(tier, input.trialDays ?? 3),
    upgradeButton,
    showDaysChip: tier !== 'FREE' || remainingDays > 0,
  };
}
