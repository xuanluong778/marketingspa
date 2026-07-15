import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { initSentry } from './sentry';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { resolveChatbotWidgetPath } from './chatbot-cskh/utils/chatbot-widget';

async function bootstrap() {
  initSentry();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  app.setGlobalPrefix('api/v1');
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
  const port = config.get<number>('PORT', 4000);

  await app.listen(port);
  console.log(`🚀 API running on http://localhost:${port}/api/v1`);
  if (widgetPath) {
    console.log(`💬 Chatbot widget: http://localhost:${port}/chatbot/widget.js`);
  }
}

bootstrap();
