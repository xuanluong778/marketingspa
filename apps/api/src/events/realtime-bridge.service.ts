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
  private subscribed = false;
  private lastError: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly events: EventsGateway,
  ) {}

  onModuleInit() {
    void this.connectSubscriber();
  }

  isHealthy(): boolean {
    return Boolean(this.subscriber && this.subscribed && this.subscriber.status === 'ready');
  }

  getStatus() {
    return {
      connected: this.isHealthy(),
      status: this.subscriber?.status ?? 'disconnected',
      subscribed: this.subscribed,
      lastError: this.lastError,
      channel: REALTIME_CHANNEL,
    };
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
    this.subscribed = false;

    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');

    if (this.subscriber) {
      try {
        this.subscriber.removeAllListeners();
        await this.subscriber.quit();
      } catch {
        // ignore cleanup errors
      }
      this.subscriber = null;
    }

    const subscriber = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      connectTimeout: 5_000,
      // Tránh lỗi "already connecting/connected" khi gọi connect() lần 2
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    this.subscriber = subscriber;

    subscriber.on('error', (err) => {
      this.lastError = err.message;
      this.logger.warn(`Redis subscriber error: ${err.message}`);
    });

    subscriber.on('end', () => {
      this.subscribed = false;
      this.scheduleReconnect();
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
      if (subscriber.status === 'wait') {
        await subscriber.connect();
      } else if (subscriber.status === 'connecting') {
        await new Promise<void>((resolve, reject) => {
          const onReady = () => {
            cleanup();
            resolve();
          };
          const onError = (err: Error) => {
            cleanup();
            reject(err);
          };
          const cleanup = () => {
            subscriber.off('ready', onReady);
            subscriber.off('error', onError);
          };
          subscriber.once('ready', onReady);
          subscriber.once('error', onError);
        });
      }

      await subscriber.subscribe(REALTIME_CHANNEL);
      this.subscribed = true;
      this.lastError = null;
      this.logger.log(`Subscribed to ${REALTIME_CHANNEL}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.lastError = message;
      this.subscribed = false;
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
      try {
        this.subscriber.removeAllListeners();
        await this.subscriber.quit();
      } catch {
        /* ignore */
      }
      this.subscriber = null;
    }
  }
}
