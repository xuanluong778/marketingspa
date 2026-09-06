import { IoAdapter } from '@nestjs/platform-socket.io';
import type { INestApplication } from '@nestjs/common';
import type { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

/**
 * Redis adapter so Socket.IO rooms work across PM2 cluster API instances.
 * Sticky sessions are not required when this adapter is connected.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  enabled = false;

  constructor(app: INestApplication) {
    super(app);
  }

  async connectToRedis(redisUrl: string) {
    this.pubClient = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    this.subClient = this.pubClient.duplicate();
    await Promise.all([
      this.pubClient.status === 'wait' ? this.pubClient.connect() : Promise.resolve(),
      this.subClient.status === 'wait' ? this.subClient.connect() : Promise.resolve(),
    ]);
    this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
    this.enabled = true;
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }

  async disconnectRedis() {
    await Promise.allSettled([this.pubClient?.quit(), this.subClient?.quit()]);
    this.pubClient = null;
    this.subClient = null;
    this.enabled = false;
  }
}
