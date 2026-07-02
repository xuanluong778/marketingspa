import { IntegrationProvider } from '@marketingspa/database';
import type { MarketingConnector } from './marketing-connector.interface';
import {
  EmailConnector,
  GoogleAdsConnector,
  MetaAdsConnector,
  SmsConnector,
  ZaloConnector,
} from './mock-connectors';

export function createConnector(provider: IntegrationProvider): MarketingConnector {
  switch (provider) {
    case IntegrationProvider.META_ADS:
      return new MetaAdsConnector();
    case IntegrationProvider.GOOGLE_ADS:
      return new GoogleAdsConnector();
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
