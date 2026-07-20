import * as express from 'express';
import * as request from 'supertest';
import {
  createDeviceAuthBearerTransportMiddleware,
  DEVICE_AUTH_BEARER_CANARY_PATH,
  DEVICE_AUTH_BEARER_HEARTBEAT_PATH,
  shouldSkipGenericBodyParserForDeviceAuthBearer,
} from './device-auth-bearer-transport.middleware';

const GENERIC_ERROR_CODE = 'DEVICE_AUTH_BEARER_REQUEST_REJECTED';

function createTestApp() {
  const app = express();
  app.use(createDeviceAuthBearerTransportMiddleware());
  app.use(express.json({ limit: '10mb' }));
  app.post([DEVICE_AUTH_BEARER_HEARTBEAT_PATH, DEVICE_AUTH_BEARER_CANARY_PATH], (req, res) => {
    res.status(200).json({ received: req.body ?? null });
  });
  app.post('/api/v1/integration/programs/heartbeat', (req, res) => {
    res.status(200).json({ legacy: req.body });
  });
  return app;
}

function expectTransportError(response: request.Response, statusCode: 400 | 413 | 415): void {
  expect(response.status).toBe(statusCode);
  expect(response.headers['cache-control']).toContain('no-store');
  expect(response.headers['cache-control']).toContain('private');
  expect(response.body).toEqual({
    statusCode,
    code: GENERIC_ERROR_CODE,
    message: GENERIC_ERROR_CODE,
  });
}

function jsonBodyOfExactByteLength(byteLength: number): string {
  const prefix = '{"appVersion":"';
  const suffix = '"}';
  return `${prefix}${'1'.repeat(byteLength - Buffer.byteLength(prefix) - Buffer.byteLength(suffix))}${suffix}`;
}

describe('DeviceAuthBearerTransportMiddleware', () => {
  it('reserves a rotation prepare alias from the generic parser', () => {
    expect(
      shouldSkipGenericBodyParserForDeviceAuthBearer({
        method: 'POST',
        url: '/api/v1/integration/devices/credential-rotations/123e4567-e89b-12d3-a456-426614174000/prepare/',
      })
    ).toBe(true);
  });

  const app = createTestApp();

  it('accepts a canonical bearer heartbeat with a strict JSON object', async () => {
    const response = await request(app)
      .post(DEVICE_AUTH_BEARER_HEARTBEAT_PATH)
      .set('Authorization', 'Bearer synthetic-access-token')
      .set('Content-Type', 'application/json; charset=utf-8')
      .send({ appVersion: '1.2.3' })
      .expect(200);

    expect(response.body).toEqual({ received: { appVersion: '1.2.3' } });
    expect(response.headers['cache-control']).toContain('no-store');
  });

  it('accepts canary with no body or exactly an empty JSON object', async () => {
    const absent = await request(app)
      .post(DEVICE_AUTH_BEARER_CANARY_PATH)
      .set('Authorization', 'Bearer synthetic-access-token')
      .expect(200);
    expect(absent.body).toEqual({ received: {} });

    const emptyObject = await request(app)
      .post(DEVICE_AUTH_BEARER_CANARY_PATH)
      .set('Authorization', 'Bearer synthetic-access-token')
      .set('Content-Type', 'application/json')
      .send({})
      .expect(200);
    expect(emptyObject.body).toEqual({ received: {} });
  });

  it.each([
    `${DEVICE_AUTH_BEARER_HEARTBEAT_PATH}?unexpected=1`,
    `${DEVICE_AUTH_BEARER_HEARTBEAT_PATH}/`,
    `${DEVICE_AUTH_BEARER_HEARTBEAT_PATH}/%2e`,
    `${DEVICE_AUTH_BEARER_HEARTBEAT_PATH}%2f`,
    '/API/V1/INTEGRATION/DEVICES/HEARTBEAT',
    `${DEVICE_AUTH_BEARER_CANARY_PATH}?unexpected=1`,
    `${DEVICE_AUTH_BEARER_CANARY_PATH}/`,
    '/api/v1/integration/devices%2fcanary',
  ])('rejects query or Express-compatible route alias %s before generic parsing', async (path) => {
    const response = await request(app)
      .post(path)
      .set('Authorization', 'Bearer synthetic-access-token')
      .set('Content-Type', 'application/json')
      .send({});

    expectTransportError(response, 400);
  });

  it.each([
    'http://service/api/v1/integration/devices/canary',
    'http://service/api/v1/integration/devices/canary?unexpected=1',
    'https://service/api/v1/integration/devices/heartbeat',
  ])('reserves and rejects absolute-form request-target %s before generic parsing', (target) => {
    expect(
      shouldSkipGenericBodyParserForDeviceAuthBearer({
        method: 'POST',
        originalUrl: target,
      })
    ).toBe(true);

    const middleware = createDeviceAuthBearerTransportMiddleware();
    const setHeader = jest.fn();
    const json = jest.fn();
    const set = jest.fn().mockReturnThis();
    const status = jest.fn().mockReturnValue({ set, json });
    const response = { setHeader, status } as unknown as express.Response;
    const next = jest.fn();
    const fakeRequest = {
      method: 'POST',
      originalUrl: target,
      rawHeaders: [
        'Authorization',
        'Bearer synthetic-access-token',
        'Content-Type',
        'application/json',
      ],
      headers: {
        authorization: 'Bearer synthetic-access-token',
        'content-type': 'application/json',
      },
    } as unknown as express.Request;

    middleware(fakeRequest, response, next);

    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store, private');
    expect(status).toHaveBeenCalledWith(400);
    expect(set).toHaveBeenCalledWith('Cache-Control', 'no-store, private');
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      code: GENERIC_ERROR_CODE,
      message: GENERIC_ERROR_CODE,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    'Cookie',
    'X-API-Key',
    'X-Account-Recovery-Key',
    'X-CSRF-Token',
    'X-Session-Token',
    'Origin',
    'Referer',
    'Proxy-Authorization',
  ])('rejects ambient %s even when empty', async (headerName) => {
    const response = await request(app)
      .post(DEVICE_AUTH_BEARER_HEARTBEAT_PATH)
      .set('Authorization', 'Bearer synthetic-access-token')
      .set(headerName, '')
      .set('Content-Type', 'application/json')
      .send({});

    expectTransportError(response, 400);
  });

  it.each(['gzip', 'br', 'identity, gzip', ''])('rejects compression %p', async (encoding) => {
    const response = await request(app)
      .post(DEVICE_AUTH_BEARER_HEARTBEAT_PATH)
      .set('Authorization', 'Bearer synthetic-access-token')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', encoding)
      .send('{}');

    expectTransportError(response, 415);
  });

  it('rejects transfer-encoding before body parsing', async () => {
    const middleware = createDeviceAuthBearerTransportMiddleware();
    const setHeader = jest.fn();
    const json = jest.fn();
    const set = jest.fn().mockReturnThis();
    const status = jest.fn().mockReturnValue({ set, json });
    const fakeResponse = { setHeader, status } as unknown as express.Response;
    const next = jest.fn();
    const fakeRequest = {
      method: 'POST',
      originalUrl: DEVICE_AUTH_BEARER_HEARTBEAT_PATH,
      rawHeaders: [
        'Authorization',
        'Bearer synthetic-access-token',
        'Content-Type',
        'application/json',
        'Transfer-Encoding',
        'chunked',
      ],
      headers: {
        authorization: 'Bearer synthetic-access-token',
        'content-type': 'application/json',
        'transfer-encoding': 'chunked',
      },
    } as unknown as express.Request;

    middleware(fakeRequest, fakeResponse, next);

    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store, private');
    expect(status).toHaveBeenCalledWith(400);
    expect(set).toHaveBeenCalledWith('Cache-Control', 'no-store, private');
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      code: GENERIC_ERROR_CODE,
      message: GENERIC_ERROR_CODE,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it.each([undefined, 'text/plain', 'application/problem+json'])(
    'rejects non-canonical heartbeat content type %p',
    async (contentType) => {
      let testRequest = request(app)
        .post(DEVICE_AUTH_BEARER_HEARTBEAT_PATH)
        .set('Authorization', 'Bearer synthetic-access-token');
      if (contentType !== undefined) {
        testRequest = testRequest.set('Content-Type', contentType);
      }

      const response = await testRequest.send('{"appVersion":"1.2.3"}');
      expectTransportError(response, 415);
    }
  );

  it('rejects malformed, primitive, array, and non-empty canary JSON', async () => {
    for (const [path, body] of [
      [DEVICE_AUTH_BEARER_HEARTBEAT_PATH, '{"appVersion":'],
      [DEVICE_AUTH_BEARER_HEARTBEAT_PATH, '"primitive"'],
      [DEVICE_AUTH_BEARER_HEARTBEAT_PATH, '[]'],
      [DEVICE_AUTH_BEARER_CANARY_PATH, '{"unexpected":true}'],
    ] as const) {
      const response = await request(app)
        .post(path)
        .set('Authorization', 'Bearer synthetic-access-token')
        .set('Content-Type', 'application/json')
        .send(body);
      expectTransportError(response, 400);
    }
  });

  it('accepts exactly 4 KiB and rejects 4 KiB plus one for heartbeat', async () => {
    const exact = jsonBodyOfExactByteLength(4 * 1024);
    await request(app)
      .post(DEVICE_AUTH_BEARER_HEARTBEAT_PATH)
      .set('Authorization', 'Bearer synthetic-access-token')
      .set('Content-Type', 'application/json')
      .send(exact)
      .expect(200);

    const oversized = await request(app)
      .post(DEVICE_AUTH_BEARER_HEARTBEAT_PATH)
      .set('Authorization', 'Bearer synthetic-access-token')
      .set('Content-Type', 'application/json')
      .send(jsonBodyOfExactByteLength(4 * 1024 + 1));
    expectTransportError(oversized, 413);
  });

  it('reserves only the new canonical bearer routes and aliases', async () => {
    expect(
      shouldSkipGenericBodyParserForDeviceAuthBearer({
        method: 'POST',
        originalUrl: DEVICE_AUTH_BEARER_HEARTBEAT_PATH,
      })
    ).toBe(true);
    expect(
      shouldSkipGenericBodyParserForDeviceAuthBearer({
        method: 'POST',
        originalUrl: `${DEVICE_AUTH_BEARER_CANARY_PATH}/%2e`,
      })
    ).toBe(true);
    expect(
      shouldSkipGenericBodyParserForDeviceAuthBearer({
        method: 'GET',
        originalUrl: DEVICE_AUTH_BEARER_HEARTBEAT_PATH,
      })
    ).toBe(false);
    expect(
      shouldSkipGenericBodyParserForDeviceAuthBearer({
        method: 'POST',
        originalUrl: '/api/v1/integration/programs/heartbeat',
      })
    ).toBe(false);

    const legacy = await request(app)
      .post('/api/v1/integration/programs/heartbeat')
      .send({ hostname: 'legacy-compatible' })
      .expect(200);
    expect(legacy.body).toEqual({ legacy: { hostname: 'legacy-compatible' } });
  });
});
