import { IntegrationProvider } from '@marketingspa/database';
import type { MarketingConnector } from './marketing-connector.interface';
import { EmailConnector, SmsConnector, ZaloConnector } from './mock-connectors';

/**
 * Ads (META_ADS / GOOGLE_ADS) mock connectors are DEPRECATED.
 * Credential + sync ownership lives on AdConnection / ad-performance OAuth.
 */
export function createConnector(provider: IntegrationProvider): MarketingConnector {
  if (isAdsIntegrationProvider(provider)) {
    throw new Error(
      'DEPRECATED: Ads mock connector disabled — use AdConnection / OAuth via /ads (ad-performance)',
    );
  }

  switch (provider) {
    case IntegrationProvider.ZALO_OA:
      return new ZaloConnector();
    case IntegrationProvider.SMS:
      return new SmsConnector();
    case IntegrationProvider.EMAIL:
      return new EmailConnector();
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

export const ALL_INTEGRATION_PROVIDERS: IntegrationProvider[] = [
  IntegrationProvider.META_ADS,
  IntegrationProvider.GOOGLE_ADS,
  IntegrationProvider.ZALO_OA,
  IntegrationProvider.SMS,
  IntegrationProvider.EMAIL,
];

export function isAdsIntegrationProvider(provider: IntegrationProvider): boolean {
  return (
    provider === IntegrationProvider.META_ADS || provider === IntegrationProvider.GOOGLE_ADS
  );
}
