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
  private connecting = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly events: EventsGateway,
  ) {}

  onModuleInit() {
    void this.connectSubscriber();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectSubscriber();
    }, 10_000);
  }

  private async connectSubscriber() {
    if (this.connecting) return;
    this.connecting = true;

    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');

    if (this.subscriber) {
      try {
        await this.subscriber.quit();
      } catch {
        // ignore cleanup errors
      }
      this.subscriber = null;
    }

    const subscriber = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      connectTimeout: 5_000,
      retryStrategy: () => null,
      enableOfflineQueue: false,
    });
    this.subscriber = subscriber;

    subscriber.on('error', (err) => {
      this.logger.warn(`Redis subscriber error: ${err.message}`);
    });

    subscriber.on('message', (channel, message) => {
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

    try {
      await subscriber.connect();
      await subscriber.subscribe(REALTIME_CHANNEL);
      this.logger.log(`Subscribed to ${REALTIME_CHANNEL}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Redis unavailable — realtime bridge paused (API vẫn chạy bình thường): ${message}`,
      );
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  async onModuleDestroy() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
  }
}
