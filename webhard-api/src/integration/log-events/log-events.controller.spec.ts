import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash, createHmac } from 'crypto';
import type { Request, RequestHandler } from 'express';
import * as request from 'supertest';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { hashIdentifier } from '../../common/logging/log-event';
import { InMemoryLogIngestionKeyStore, LOG_INGESTION_KEY_STORE } from './auth/log-ingestion-auth';
import { LogEventsModule } from './log-events.module';

const CLIENT_ID = 'company-site';
const KEY_ID = 'local-test-key';
const HMAC_KEY = 'test-log-hmac-key-32-bytes-minimum';

type RequestWithRawBody = Request & {
  rawBody?: Buffer;
};

type LoggedBackendEvent = {
  schema_version: 1;
  event: string;
  level: string;
  project: string;
  component: string;
  feature: string;
  action: string;
  status: string;
  channel: string;
  correlation_id: string;
  metadata?: Record<string, unknown>;
  actor_id_hash?: string;
  error_code?: string;
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

function serializeLoggerCalls(...spies: jest.SpyInstance[]): string {
  return JSON.stringify(readLoggerMessages(spies));
}

function parseJsonLogEvents(...spies: jest.SpyInstance[]): LoggedBackendEvent[] {
  return readLoggerMessages(spies)
    .map((value) => {
      try {
        return JSON.parse(value) as Partial<LoggedBackendEvent>;
      } catch {
        return null;
      }
    })
    .filter(
      (value): value is LoggedBackendEvent =>
        value?.schema_version === 1 && typeof value.event === 'string'
    );
}

function readLoggerMessages(spies: jest.SpyInstance[]): string[] {
  return spies.flatMap((spy) =>
    spy.mock.calls.flatMap((call: unknown[]) => call.map((value: unknown) => String(value)))
  );
}

function findJsonLogEvent(spy: jest.SpyInstance, eventName: string): LoggedBackendEvent {
  const event = parseJsonLogEvents(spy).find((candidate) => candidate.event === eventName);
  if (!event) {
    throw new Error(`Missing JSON log event: ${eventName}`);
  }
  return event;
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
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    await request(app.getHttpServer())
      .post('/integration/log-events')
      .send(makePayload())
      .expect(401);

    const event = findJsonLogEvent(warnSpy, 'log_ingestion_failed');
    expect(event).toMatchObject({
      level: 'warn',
      project: 'company_site',
      component: 'LogEventsController',
      feature: 'log_ingestion',
      action: 'collect',
      status: 'failure',
      channel: 'security',
      error_code: 'LOG_AUTH_REQUIRED',
    });
  });

  it('유효한 서명과 안전한 이벤트 배치는 accepted로 저장한다', async () => {
    const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const payload = makePayload('safe accepted');
    const rawBody = Buffer.from(JSON.stringify(payload));
    const headers = signedHeaders(rawBody, 'nonce-controller-2');

    const response = await request(app.getHttpServer())
      .post('/integration/log-events')
      .set(headers)
      .send(payload)
      .expect(201);

    expect(response.body).toMatchObject({
      accepted: 1,
      duplicate: 0,
      rejected: 0,
      conflict: 0,
    });

    expect(findJsonLogEvent(debugSpy, 'log_ingestion_started')).toMatchObject({
      level: 'debug',
      project: 'company_site',
      component: 'LogEventsController',
      feature: 'log_ingestion',
      action: 'collect',
      status: 'start',
      channel: 'audit',
      metadata: {
        event_count: 1,
        project_count: 1,
      },
    });
    expect(findJsonLogEvent(logSpy, 'log_ingestion_succeeded')).toMatchObject({
      level: 'info',
      project: 'company_site',
      component: 'LogEventsController',
      feature: 'log_ingestion',
      action: 'collect',
      status: 'success',
      channel: 'audit',
      actor_id_hash: hashIdentifier(CLIENT_ID),
      metadata: {
        event_count: 1,
        accepted: 1,
        duplicate: 0,
        conflict: 0,
      },
    });

    const serialized = serializeLoggerCalls(debugSpy, logSpy, warnSpy);
    expect(serialized).not.toContain(CLIENT_ID);
    expect(serialized).not.toContain(KEY_ID);
    expect(serialized).not.toContain(HMAC_KEY);
    expect(serialized).not.toContain(headers['X-Log-Signature']);
  });

  it('서명 불일치 로그는 client/header 원문 없이 security event로 남긴다', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const payload = makePayload('bad signature');
    const rawBody = Buffer.from(JSON.stringify(payload));
    const headers = {
      ...signedHeaders(rawBody, 'nonce-controller-bad-signature'),
      'X-Log-Signature': 'invalid-signature-value',
    };

    await request(app.getHttpServer())
      .post('/integration/log-events')
      .set(headers)
      .send(payload)
      .expect(401);

    const event = findJsonLogEvent(warnSpy, 'log_ingestion_failed');
    expect(event).toMatchObject({
      level: 'warn',
      project: 'company_site',
      component: 'LogEventsController',
      feature: 'log_ingestion',
      action: 'collect',
      status: 'failure',
      channel: 'security',
      actor_id_hash: hashIdentifier(CLIENT_ID),
      error_code: 'LOG_SIGNATURE_INVALID',
    });

    const serialized = serializeLoggerCalls(warnSpy);
    expect(serialized).not.toContain(CLIENT_ID);
    expect(serialized).not.toContain(KEY_ID);
    expect(serialized).not.toContain(HMAC_KEY);
    expect(serialized).not.toContain(headers['X-Log-Signature']);
  });

  it('원문 payload에 민감 키가 있으면 DTO 처리 전에 400으로 거부한다', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
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

    const event = findJsonLogEvent(warnSpy, 'log_event_payload_rejected');
    expect(event).toMatchObject({
      level: 'warn',
      project: 'company_site',
      component: 'LogEventRequestPipe',
      feature: 'log_ingestion',
      action: 'validate',
      status: 'failure',
      channel: 'security',
      error_code: 'LOG_RAW_SENSITIVE_VALUE',
      metadata: {
        reason: 'sensitive_key',
        match_count: 1,
      },
    });

    expect(serializeLoggerCalls(warnSpy)).not.toContain('raw-sensitive-token');
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
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
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

    const event = findJsonLogEvent(warnSpy, 'log_event_payload_rejected');
    expect(event).toMatchObject({
      level: 'warn',
      project: 'company_site',
      component: 'LogEventRequestPipe',
      feature: 'log_ingestion',
      action: 'validate',
      status: 'failure',
      channel: 'security',
      error_code: 'LOG_BATCH_TOO_LARGE',
      metadata: {
        reason: 'batch_too_large',
        event_count: 101,
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
