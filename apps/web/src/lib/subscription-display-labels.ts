import type {
  SubscriptionTier,
  SubscriptionUpgradeVariant,
} from '@marketingspa/shared';
import type { TranslateParams } from '@/i18n/types';

type TFn = (key: string, params?: TranslateParams) => string;

export function localizedPlanLabel(
  t: TFn,
  tier: SubscriptionTier,
  trialDays = 3,
): string {
  switch (tier) {
    case 'PRO_12M':
      return t('layout.currentPlan12m');
    case 'PRO_6M':
      return t('layout.currentPlan6m');
    case 'TRIAL':
      return t('layout.trialPlan', { days: trialDays });
    case 'ADMIN_GIFT':
      return t('layout.giftedPackage');
    case 'FREE':
    default:
      return t('layout.noProPlan');
  }
}

export function localizedUpgradeLabel(
  t: TFn,
  variant: SubscriptionUpgradeVariant,
): string {
  switch (variant) {
    case 'upgrade_12m':
      return t('layout.upgradeTo12m');
    case 'current_plan':
      return t('layout.currentPlan12m');
    case 'upgrade_pro':
    default:
      return t('layout.upgradePro');
  }
}
