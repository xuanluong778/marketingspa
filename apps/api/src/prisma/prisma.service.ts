import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, applyPrismaPoolEnv } from '@marketingspa/database';

// Cap pool before PrismaClient super() reads DATABASE_URL
applyPrismaPoolEnv({
  connectionLimit: Number(process.env.DATABASE_CONNECTION_LIMIT || 12) || 12,
});

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    try {
      await this.$connect();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `⚠️  PostgreSQL chưa kết nối được (${message}). ` +
          'Bật PostgreSQL trong Laragon hoặc chạy: docker compose -f docker-compose.dev.yml up -d',
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
