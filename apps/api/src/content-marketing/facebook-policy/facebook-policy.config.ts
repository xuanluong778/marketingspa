/**
 * Policy catalog metadata (Meta Ads / Facebook advertising standards reference).
 */
export const FACEBOOK_POLICY_BUNDLE = {
  policyCode: 'META-ADS-VN-2026',
  policyVersion: '2026.08.1',
  sourceUrl: 'https://www.facebook.com/policies/ads/',
  reviewedAt: '2026-08-01',
  label: 'Meta Advertising Standards (VN guidance pack)',
} as const;

export const FACEBOOK_ADS_POLICY_CATALOG: Record<
  string,
  { policyCode: string; sourceUrl: string; label: string }
> = {
  ABSOLUTE_CLAIMS: {
    policyCode: 'META-ADS-CLAIMS',
    sourceUrl: 'https://www.facebook.com/policies/ads/',
    label: 'Misleading / absolute claims',
  },
  HEALTH: {
    policyCode: 'META-ADS-HEALTH',
    sourceUrl: 'https://www.facebook.com/policies/ads/',
    label: 'Health & wellness claims',
  },
  PERSONAL_ATTRIBUTES: {
    policyCode: 'META-ADS-PERSONAL',
    sourceUrl: 'https://www.facebook.com/policies/ads/',
    label: 'Personal attributes',
  },
  FINANCIAL: {
    policyCode: 'META-ADS-FINANCE',
    sourceUrl: 'https://www.facebook.com/policies/ads/',
    label: 'Financial products / misleading money claims',
  },
  BEFORE_AFTER: {
    policyCode: 'META-ADS-BA',
    sourceUrl: 'https://www.facebook.com/policies/ads/',
    label: 'Before/after & unrealistic outcomes',
  },
  SENSATIONAL: {
    policyCode: 'META-ADS-SENSATIONAL',
    sourceUrl: 'https://www.facebook.com/policies/ads/',
    label: 'Sensational / shocking content',
  },
  PROHIBITED: {
    policyCode: 'META-ADS-PROHIBITED',
    sourceUrl: 'https://www.facebook.com/policies/ads/',
    label: 'Prohibited content',
  },
  SPECIAL_AD_CATEGORY: {
    policyCode: 'META-ADS-SAC',
    sourceUrl: 'https://www.facebook.com/business/help/298000447747885',
    label: 'Special Ad Categories',
  },
  LANDING: {
    policyCode: 'META-ADS-LANDING',
    sourceUrl: 'https://www.facebook.com/policies/ads/',
    label: 'Landing page consistency & safety',
  },
  MEDIA: {
    policyCode: 'META-ADS-MEDIA',
    sourceUrl: 'https://www.facebook.com/policies/ads/',
    label: 'Image / video / OCR claims',
  },
};
