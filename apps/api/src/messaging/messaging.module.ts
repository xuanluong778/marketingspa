import { Module, forwardRef } from '@nestjs/common';
import { ChannelConnectionsController } from './channel-connections.controller';
import { ChannelConnectionsService } from './channel-connections.service';
import { MessagingWebhookController } from './messaging-webhook.controller';
import { MessagingWebhookIngressService } from './messaging-webhook-ingress.service';
import { MessagingProviderRegistry } from './providers/messaging-provider.registry';
import { MessagingIdentityModule } from '../messaging-identity/messaging-identity.module';
import { MessagingEligibilityController } from './messaging-eligibility.controller';
import { MessagingEligibilityService } from './messaging-eligibility.service';
import { MessagingOrgPolicyController } from './messaging-org-policy.controller';
import { MessagingOrgPolicyService } from './messaging-org-policy.service';

@Module({
  imports: [forwardRef(() => MessagingIdentityModule)],
  controllers: [
    ChannelConnectionsController,
    MessagingWebhookController,
    MessagingEligibilityController,
    MessagingOrgPolicyController,
  ],
  providers: [
    ChannelConnectionsService,
    MessagingWebhookIngressService,
    MessagingProviderRegistry,
    MessagingEligibilityService,
    MessagingOrgPolicyService,
  ],
  exports: [
    ChannelConnectionsService,
    MessagingWebhookIngressService,
    MessagingProviderRegistry,
    MessagingEligibilityService,
    MessagingOrgPolicyService,
  ],
})
export class MessagingModule {}
