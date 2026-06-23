// 루트 디렉토리의 .env.local을 먼저 로드 (Prisma가 사용할 수 있도록)
import * as dotenv from 'dotenv';
import * as path from 'path';

// 루트 .env.local → 루트 .env → 로컬 .env 순서로 로드
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import * as cookieParser from 'cookie-parser';
import * as compression from 'compression';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { CsrfTokenMiddleware } from './common/middleware/csrf-token.middleware';
import { CsrfGuard } from './common/guards/csrf.guard';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // 기본 body parser 비활성화 — 아래에서 수동으로 등록하여 이중 파싱 방지
    bodyParser: false,
  });

  // Body size 제한 확장 (500개 파일 배치 confirm 등)
  const rawExpressApp = app.getHttpAdapter().getInstance();
  const { json, urlencoded } = await import('express');
  const logIngestionPath = '/api/v1/integration/log-events';
  const shouldUseLogIngestionBodyParser = (req: Request): boolean => {
    const pathOnly = (req.originalUrl || req.url).split('?')[0];
    return req.method === 'POST' && pathOnly === logIngestionPath;
  };
  const shouldSkipBodyParser = (req: Request): boolean => {
    const pathOnly = (req.originalUrl || req.url).split('?')[0];
    return (
      (req.method === 'PUT' && pathOnly === '/api/v1/files/google-drive/upload') ||
      shouldUseLogIngestionBodyParser(req)
    );
  };
  const skipBodyParserForDriveUpload =
    (parser: RequestHandler): RequestHandler =>
    (req, res, next) => {
      if (shouldSkipBodyParser(req)) {
        next();
        return;
      }
      parser(req, res, next);
    };
  const logIngestionJsonParser = json({
    limit: '256kb',
    verify: (req, _res, buf) => {
      if (shouldUseLogIngestionBodyParser(req as Request)) {
        (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      }
    },
  });
  rawExpressApp.use((req: Request, res: Response, next: NextFunction) => {
    if (shouldUseLogIngestionBodyParser(req)) {
      logIngestionJsonParser(req, res, next);
      return;
    }
    next();
  });
  rawExpressApp.use(skipBodyParserForDriveUpload(json({ limit: '10mb' })));
  rawExpressApp.use(skipBodyParserForDriveUpload(urlencoded({ extended: true, limit: '10mb' })));

  // Gzip 응답 압축 — JSON 대형 응답(Contact 목록 등)의 전송 크기를 60~80% 절감
  app.use(compression());

  // Cookie parser for session verification
  app.use(cookieParser());

  // CSRF 토큰 자동 발급 미들웨어 (세션 쿠키 있을 때 csrf-token 쿠키 발급)
  const csrfMiddleware = new CsrfTokenMiddleware();
  app.use(csrfMiddleware.use.bind(csrfMiddleware));

  const configService = app.get(ConfigService);
  // NESTJS_PORT 우선, 없으면 PORT 사용 (루트 .env.local과 호환)
  const port = configService.get<number>('NESTJS_PORT') || configService.get<number>('PORT', 4000);
  // CORS: CORS_ORIGINS (복수형) 우선, 없으면 CORS_ORIGIN (단수형) 사용
  const corsConfig =
    configService.get<string>('CORS_ORIGINS') ||
    configService.get<string>('CORS_ORIGIN', 'http://localhost:3000');
  const allowedOrigins = corsConfig
    .split(',')
    .map((origin: string) => origin.trim())
    .filter(Boolean);

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // CORS
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-API-Key',
      'X-CSRF-Token',
      'X-Log-Client-Id',
      'X-Log-Key-Id',
      'X-Log-Timestamp',
      'X-Log-Nonce',
      'X-Log-Signature',
      'X-Google-Drive-Upload-Url',
      'Content-Range',
    ],
  });

  // Global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // CSRF Guard (전역 — POST/PATCH/DELETE 요청에서 csrf-token 검증)
  app.useGlobalGuards(new CsrfGuard());

  // Validation pipe
  // whitelist: true → DTO에 없는 속성은 자동 제거 (unknown props stripped silently)
  // forbidNonWhitelisted: false → 프론트/백 배포 시점 차이로 인한 400 에러 방지
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    })
  );

  await app.listen(port);
  new Logger('Bootstrap').log(`Webhard API is running on: http://localhost:${port}/api/v1`);
}
bootstrap();
