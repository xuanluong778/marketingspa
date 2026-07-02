import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REALTIME_CHANNEL } from '@marketingspa/shared';
import { EventsGateway } from './events.gateway';

/** Subscribe Redis pub/sub from worker and forward to Socket.IO */
@Injectable()
export class RealtimeBridgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeBridgeService.name);
  private subscriber: Redis | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly events: EventsGateway,
  ) {}

  async onModuleInit() {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.subscriber = new Redis(redisUrl, { maxRetriesPerRequest: null });

    this.subscriber.on('error', (err) => {
      this.logger.error(`Redis subscriber error: ${err.message}`);
    });

    await this.subscriber.subscribe(REALTIME_CHANNEL);
    this.subscriber.on('message', (channel, message) => {
      if (channel !== REALTIME_CHANNEL) return;
      try {
        const { organizationId, event, payload } = JSON.parse(message) as {
          organizationId: string;
          event: string;
          payload: unknown;
        };
        if (!organizationId || !event) return;
        this.events.emitToOrg(organizationId, event, payload);
      } catch (err) {
        this.logger.error('Failed to parse realtime message', err);
      }
    });

    this.logger.log(`Subscribed to ${REALTIME_CHANNEL}`);
  }

  async onModuleDestroy() {
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
  }
}
