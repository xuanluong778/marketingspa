import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { initSentry } from './sentry';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { resolveChatbotWidgetPath } from './chatbot-cskh/utils/chatbot-widget';
import { REQUEST_ID_HEADER } from './common/middleware/request-id.middleware';
import { createAuthenticatedUploadsHandler } from './common/middleware/authenticated-uploads.middleware';
import { isCorsOriginAllowed, resolveCorsOrigins } from './common/utils/cors-origins';

async function bootstrap() {
  initSentry();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // Đảm bảo rawBody có cho verify X-Hub-Signature-256 (Meta webhook)
  app.useBodyParser('json', {
    verify: (req: Request & { rawBody?: Buffer }, _res: Response, buf: Buffer) => {
      if (Buffer.isBuffer(buf) && buf.length) {
        req.rawBody = buf;
      }
    },
  });
  // Meta deauthorize / data-deletion gửi application/x-www-form-urlencoded
  app.useBodyParser('urlencoded', { extended: true });

  app.setGlobalPrefix('api/v1');
  // Probe aliases without version prefix (k8s / nginx). Logic lives in HealthService.
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    const { randomUUID } = require('crypto');
    const incoming = req.headers[REQUEST_ID_HEADER.toLowerCase()];
    const requestId =
      (typeof incoming === 'string' && incoming.trim()) || randomUUID();
    (req as Request & { requestId?: string }).requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  const uploadsDir = join(process.cwd(), 'uploads');
  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }
  // Private uploads — JWT required (no public useStaticAssets)
  const jwt = app.get(JwtService);
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get(
    '/uploads/*',
    createAuthenticatedUploadsHandler({ uploadsDir, jwt }),
  );

  const corsOrigins = resolveCorsOrigins(process.env);
  app.enableCors({
    origin: (origin, callback) => {
      // Same-origin / curl / server-to-server (no Origin header)
      if (!origin) {
        callback(null, true);
        return;
      }
      if (isCorsOriginAllowed(origin, corsOrigins)) {
        callback(null, true);
        return;
      }
      // Deny without throwing — throwing makes Express return 500 on preflight.
      callback(null, false);
    },
    credentials: true,
  });

  const widgetPath = resolveChatbotWidgetPath();
  if (widgetPath) {
    expressApp.get('/chatbot/widget.js', (_req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.sendFile(widgetPath);
    });
    expressApp.options('/chatbot/widget.js', (_req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.status(204).end();
    });
  } else {
    console.warn('⚠️  chatbot/widget.js not found — embed script will 404 until file is present');
  }

  const config = app.get(ConfigService);
  const { assertEncryptionKeyConfigured } = await import(
    './common/utils/assert-encryption-key'
  );
  assertEncryptionKeyConfigured(config.get<string>('ENCRYPTION_KEY'));

  const redisUrl = config.get<string>('REDIS_URL') || process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  if (process.env.SOCKET_REDIS_ADAPTER !== '0') {
    try {
      const { RedisIoAdapter } = await import('./events/redis-io.adapter');
      const redisIoAdapter = new RedisIoAdapter(app);
      await redisIoAdapter.connectToRedis(redisUrl);
      app.useWebSocketAdapter(redisIoAdapter);
      console.log('🔌 Socket.IO Redis adapter enabled');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️  Socket.IO Redis adapter unavailable (${message}) — single-instance sockets only`);
    }
  }

  // Fail-fast OAuth Auto Post: App ID / config_id / redirect MarketingAutoAZ
  const { assertAutoPostMetaOAuthConfig } = await import(
    './auto-post/assert-auto-post-meta-oauth'
  );
  assertAutoPostMetaOAuthConfig((k) => config.get<string>(k) ?? process.env[k]);

  const port = config.get<number>('PORT', 4000);
  const host = config.get<string>('HOST', '127.0.0.1');

  const { HealthService } = await import('./health/health.service');
  const healthService = app.get(HealthService);
  expressApp.get('/health', (_req: Request, res: Response) => {
    res.json(healthService.liveness());
  });
  expressApp.get('/ready', async (_req: Request, res: Response) => {
    const result = await healthService.readiness();
    res.status(result.ok ? 200 : 503).json(result.body);
  });

  app.enableShutdownHooks();
  await app.listen(port, host);
  console.log(`🚀 API running on http://${host}:${port}/api/v1`);
  if (widgetPath) {
    console.log(`💬 Chatbot widget: http://${host}:${port}/chatbot/widget.js`);
  }
}

bootstrap();
