import { MessagingProviderKind } from '@marketingspa/database';
import type { MessagingProvider } from './messaging-provider.interface';

const STUB_PROVIDER: MessagingProvider = {
  async validateConnection() {
    return { valid: false, message: 'Messaging provider chưa được cấu hình' };
  },
  normalizeWebhook() {
    return [];
  },
  estimateCost() {
    return 0;
  },
};

export class MessagingProviderRegistry {
  get(_kind: MessagingProviderKind): MessagingProvider {
    return STUB_PROVIDER;
  }
}
