import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { initSentry } from './sentry';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { resolveChatbotWidgetPath } from './chatbot-cskh/utils/chatbot-widget';
import { REQUEST_ID_HEADER } from './common/middleware/request-id.middleware';

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
  app.useStaticAssets(uploadsDir, { prefix: '/uploads/' });

  // CORS: frontend app + widget embed trên website khách
  app.enableCors({
    origin: true,
    credentials: true,
  });

  const widgetPath = resolveChatbotWidgetPath();
  if (widgetPath) {
    const express = app.getHttpAdapter().getInstance();
    express.get('/chatbot/widget.js', (_req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.sendFile(widgetPath);
    });
    express.options('/chatbot/widget.js', (_req, res) => {
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

  // Fail-fast OAuth Auto Post: App ID / config_id / redirect MarketingAutoAZ
  const { assertAutoPostMetaOAuthConfig } = await import(
    './auto-post/assert-auto-post-meta-oauth'
  );
  assertAutoPostMetaOAuthConfig((k) => config.get<string>(k) ?? process.env[k]);

  const port = config.get<number>('PORT', 4000);

  await app.listen(port);
  console.log(`🚀 API running on http://localhost:${port}/api/v1`);
  if (widgetPath) {
    console.log(`💬 Chatbot widget: http://localhost:${port}/chatbot/widget.js`);
  }
}

bootstrap();
