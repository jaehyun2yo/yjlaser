import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { createHash, createHmac } from 'crypto';
import {
  InMemoryLogIngestionKeyStore,
  InMemoryLogIngestionRateLimiter,
  InMemoryLogIngestionReplayStore,
  LogIngestionAuthVerifier,
  type LogIngestionRequest,
} from './log-ingestion-auth';

const CLIENT_ID = 'company-site';
const KEY_ID = 'local-test-key';
const HMAC_KEY = 'test-log-hmac-key-32-bytes-minimum';

function sign(rawBody: Buffer, timestamp: string, nonce: string, key = HMAC_KEY): string {
  const bodyHash = createHash('sha256').update(rawBody).digest('hex');
  return createHmac('sha256', key).update(`${timestamp}.${nonce}.${bodyHash}`).digest('base64url');
}

function makeRawBody(project = 'company_site'): Buffer {
  return Buffer.from(
    JSON.stringify({
      events: [
        {
          schema_version: 1,
          event_id: 'evt-auth-1',
          trace_id: 'trace-auth-1',
          occurred_at: '2026-06-22T00:00:00.000Z',
          project,
          subsystem: 'api',
          event_type: 'test.event',
          severity: 'info',
          message: 'safe event',
          metadata: { safe_count: 1 },
          payload_hash: 'hash-auth-1',
          hash_key_version: 'v1',
        },
      ],
    })
  );
}

function makeRequest(input: {
  rawBody?: Buffer;
  timestamp?: string;
  nonce?: string;
  signature?: string;
  project?: string;
}): LogIngestionRequest {
  const rawBody = input.rawBody ?? makeRawBody(input.project);
  const timestamp = input.timestamp ?? new Date().toISOString();
  const nonce = input.nonce ?? 'nonce-1';
  const signature = input.signature ?? sign(rawBody, timestamp, nonce);

  return {
    headers: {
      'x-log-client-id': CLIENT_ID,
      'x-log-key-id': KEY_ID,
      'x-log-timestamp': timestamp,
      'x-log-nonce': nonce,
      'x-log-signature': signature,
    },
    ip: '127.0.0.1',
    rawBody,
  };
}

function makeVerifier(input?: { maxRequests?: number }) {
  return new LogIngestionAuthVerifier(
    new InMemoryLogIngestionKeyStore([
      {
        clientId: CLIENT_ID,
        keyId: KEY_ID,
        secret: HMAC_KEY,
        allowedProjects: ['company_site'],
        hashKeyVersion: 'v1',
      },
    ]),
    new InMemoryLogIngestionReplayStore(),
    new InMemoryLogIngestionRateLimiter({
      maxRequests: input?.maxRequests ?? 100,
      windowMs: 60_000,
    }),
    { allowedClockSkewMs: 300_000 }
  );
}

describe('LogIngestionAuthVerifier', () => {
  it('필수 HMAC 헤더가 없으면 401로 거부한다', async () => {
    const verifier = makeVerifier();
    const request = makeRequest({});
    delete request.headers['x-log-signature'];

    await expect(verifier.verifyRequest(request, ['company_site'])).rejects.toThrow(
      UnauthorizedException
    );
  });

  it('서명이 raw body와 일치하지 않으면 401로 거부한다', async () => {
    const verifier = makeVerifier();
    const rawBody = makeRawBody();
    const request = makeRequest({
      rawBody,
      signature: sign(Buffer.from('{"events":[]}'), new Date().toISOString(), 'nonce-2'),
      nonce: 'nonce-2',
    });

    await expect(verifier.verifyRequest(request, ['company_site'])).rejects.toThrow(
      UnauthorizedException
    );
  });

  it('허용된 프로젝트와 유효한 서명은 인증 컨텍스트를 반환한다', async () => {
    const verifier = makeVerifier();
    const context = await verifier.verifyRequest(makeRequest({ nonce: 'nonce-3' }), [
      'company_site',
    ]);

    expect(context).toEqual({
      clientId: CLIENT_ID,
      keyId: KEY_ID,
      hashKeyVersion: 'v1',
    });
  });

  it('클라이언트 allowlist 밖의 프로젝트는 403으로 거부한다', async () => {
    const verifier = makeVerifier();
    const request = makeRequest({ nonce: 'nonce-4', project: 'management_program' });

    await expect(verifier.verifyRequest(request, ['management_program'])).rejects.toThrow(
      ForbiddenException
    );
  });

  it('허용 시간 창 밖의 timestamp는 401로 거부한다', async () => {
    const verifier = makeVerifier();
    const timestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const rawBody = makeRawBody();
    const request = makeRequest({
      rawBody,
      timestamp,
      nonce: 'nonce-5',
      signature: sign(rawBody, timestamp, 'nonce-5'),
    });

    await expect(verifier.verifyRequest(request, ['company_site'])).rejects.toThrow(
      UnauthorizedException
    );
  });

  it('같은 nonce 재사용은 replay로 보고 409로 거부한다', async () => {
    const verifier = makeVerifier();
    const request = makeRequest({ nonce: 'nonce-6' });

    await verifier.verifyRequest(request, ['company_site']);
    await expect(verifier.verifyRequest(request, ['company_site'])).rejects.toThrow(
      ConflictException
    );
  });

  it('rate limit을 넘으면 429로 거부한다', async () => {
    const verifier = makeVerifier({ maxRequests: 1 });

    await verifier.verifyRequest(makeRequest({ nonce: 'nonce-7' }), ['company_site']);
    await expect(
      verifier.verifyRequest(makeRequest({ nonce: 'nonce-8' }), ['company_site'])
    ).rejects.toMatchObject({
      status: 429,
    });
  });
});
