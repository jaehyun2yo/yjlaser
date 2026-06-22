import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash, createHmac } from 'crypto';
import type { Request, RequestHandler } from 'express';
import * as request from 'supertest';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { InMemoryLogIngestionKeyStore, LOG_INGESTION_KEY_STORE } from './auth/log-ingestion-auth';
import { LogEventsModule } from './log-events.module';

const CLIENT_ID = 'company-site';
const KEY_ID = 'local-test-key';
const HMAC_KEY = 'test-log-hmac-key-32-bytes-minimum';

type RequestWithRawBody = Request & {
  rawBody?: Buffer;
};

function makePayload(message = 'safe event') {
  return {
    events: [
      {
        schema_version: 1,
        event_id: `evt-controller-${message.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`,
        timestamp: '2026-06-22T00:00:00.000Z',
        level: 'info',
        project: 'company_site',
        component: 'LogEventsControllerSpec',
        feature: 'log_collection',
        event: 'controller_test',
        action: 'collect',
        status: 'success',
        channel: 'audit',
        correlation_id: 'log-20260622-000000-controller',
        hash_key_version: 'v1',
        metadata: { processed_count: 1 },
      },
    ],
  };
}

function sign(rawBody: Buffer, timestamp: string, nonce: string): string {
  const bodyHash = createHash('sha256').update(rawBody).digest('hex');
  return createHmac('sha256', HMAC_KEY)
    .update(`${timestamp}.${nonce}.${bodyHash}`)
    .digest('base64url');
}

function signedHeaders(rawBody: Buffer, nonce = 'nonce-controller-1') {
  const timestamp = new Date().toISOString();
  return {
    'X-Log-Client-Id': CLIENT_ID,
    'X-Log-Key-Id': KEY_ID,
    'X-Log-Timestamp': timestamp,
    'X-Log-Nonce': nonce,
    'X-Log-Signature': sign(rawBody, timestamp, nonce),
  };
}

describe('LogEventsController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [LogEventsModule],
    })
      .overrideProvider(LOG_INGESTION_KEY_STORE)
      .useValue(
        new InMemoryLogIngestionKeyStore([
          {
            clientId: CLIENT_ID,
            keyId: KEY_ID,
            secret: HMAC_KEY,
            allowedProjects: ['company_site'],
            hashKeyVersion: 'v1',
          },
        ])
      )
      .compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    const rawExpressApp = app.getHttpAdapter().getInstance();
    const { json } = await import('express');
    const captureRawBody: NonNullable<Parameters<typeof json>[0]>['verify'] = (req, _res, buf) => {
      (req as RequestWithRawBody).rawBody = Buffer.from(buf);
    };
    rawExpressApp.use(json({ limit: '256kb', verify: captureRawBody }) as RequestHandler);
    app.useGlobalFilters(new GlobalExceptionFilter());
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
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('HMAC 헤더가 없으면 401로 거부한다', async () => {
    await request(app.getHttpServer())
      .post('/integration/log-events')
      .send(makePayload())
      .expect(401);
  });

  it('유효한 서명과 안전한 이벤트 배치는 accepted로 저장한다', async () => {
    const payload = makePayload('safe accepted');
    const rawBody = Buffer.from(JSON.stringify(payload));

    const response = await request(app.getHttpServer())
      .post('/integration/log-events')
      .set(signedHeaders(rawBody, 'nonce-controller-2'))
      .send(payload)
      .expect(201);

    expect(response.body).toMatchObject({
      accepted: 1,
      duplicate: 0,
      rejected: 0,
      conflict: 0,
    });
  });

  it('원문 payload에 민감 키가 있으면 DTO 처리 전에 400으로 거부한다', async () => {
    const payload = makePayload('safe rejected') as ReturnType<typeof makePayload> & {
      access_token?: string;
    };
    payload.access_token = 'raw-sensitive-token';
    const rawBody = Buffer.from(JSON.stringify(payload));

    const response = await request(app.getHttpServer())
      .post('/integration/log-events')
      .set(signedHeaders(rawBody, 'nonce-controller-3'))
      .send(payload)
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'LOG_RAW_SENSITIVE_VALUE',
      message: 'LOG_RAW_SENSITIVE_VALUE',
    });
    expect(JSON.stringify(response.body)).not.toContain('raw-sensitive-token');
  });

  it('256 KiB를 넘는 log ingestion body는 parser 단계에서 413으로 거부한다', async () => {
    const payload = {
      events: [
        {
          ...makePayload('too large').events[0],
          metadata: {
            large_text: 'x'.repeat(270 * 1024),
          },
        },
      ],
    };

    await request(app.getHttpServer()).post('/integration/log-events').send(payload).expect(413);
  });

  it('100개를 넘는 log ingestion batch는 413으로 거부한다', async () => {
    const payload = {
      events: Array.from({ length: 101 }, (_, index) => ({
        ...makePayload('batch-too-large').events[0],
        event_id: `evt-controller-batch-${index}`,
      })),
    };
    const rawBody = Buffer.from(JSON.stringify(payload));

    const response = await request(app.getHttpServer())
      .post('/integration/log-events')
      .set(signedHeaders(rawBody, 'nonce-controller-4'))
      .send(payload)
      .expect(413);

    expect(response.body).toMatchObject({
      statusCode: 413,
      code: 'LOG_BATCH_TOO_LARGE',
      message: 'LOG_BATCH_TOO_LARGE',
    });
  });
});
