import * as express from 'express';
import * as request from 'supertest';
import {
  createDeviceAuthBootstrapTransportMiddleware,
  DEVICE_AUTH_BOOTSTRAP_ENROLL_PATH,
  DEVICE_AUTH_BOOTSTRAP_STATUS_PATH,
  DEVICE_AUTH_TOKEN_PATH,
  shouldSkipGenericBodyParserForDeviceAuthBootstrap,
} from './device-auth-bootstrap-transport.middleware';

const GENERIC_ERROR_CODE = 'DEVICE_AUTH_BOOTSTRAP_REQUEST_REJECTED';

function createTestApp() {
  const app = express();
  app.use(createDeviceAuthBootstrapTransportMiddleware());
  app.use(express.json({ limit: '10mb' }));
  app.post(
    [DEVICE_AUTH_BOOTSTRAP_ENROLL_PATH, DEVICE_AUTH_BOOTSTRAP_STATUS_PATH, DEVICE_AUTH_TOKEN_PATH],
    (req, res) => {
      res.status(200).json({ received: req.body });
    }
  );
  app.post('/api/v1/integration/device-auth/other', (req, res) => {
    res.status(200).json({ received: req.body });
  });
  return app;
}

function expectGenericTransportError(
  response: request.Response,
  statusCode: 400 | 413 | 415
): void {
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
  const prefix = '{"value":"';
  const suffix = '"}';
  return `${prefix}${'a'.repeat(byteLength - Buffer.byteLength(prefix) - Buffer.byteLength(suffix))}${suffix}`;
}

const BOOTSTRAP_PATHS = [
  DEVICE_AUTH_BOOTSTRAP_ENROLL_PATH,
  DEVICE_AUTH_BOOTSTRAP_STATUS_PATH,
  DEVICE_AUTH_TOKEN_PATH,
] as const;

const ABSOLUTE_FORM_CASES = BOOTSTRAP_PATHS.flatMap(
  (path) =>
    [
      [`plain absolute-form for ${path}`, `http://service${path}`, []],
      [`absolute-form with query for ${path}`, `http://service${path}?unexpected=1`, []],
      [
        `compressed absolute-form for ${path}`,
        `https://service${path}`,
        [['Content-Encoding', 'gzip']],
      ],
      [
        `chunked absolute-form for ${path}`,
        `http://service${path}`,
        [['Transfer-Encoding', 'chunked']],
      ],
      [
        `oversized absolute-form for ${path}`,
        `http://service${path}`,
        [['Content-Length', String(4 * 1024 + 1)]],
      ],
    ] as const
);

describe('DeviceAuthBootstrapTransportMiddleware', () => {
  const app = createTestApp();

  it.each([
    DEVICE_AUTH_BOOTSTRAP_ENROLL_PATH,
    DEVICE_AUTH_BOOTSTRAP_STATUS_PATH,
    DEVICE_AUTH_TOKEN_PATH,
  ])('allows an exact POST JSON request for %s', async (path) => {
    const response = await request(app)
      .post(path)
      .set('Content-Type', 'application/json; charset=UTF-8')
      .set('Content-Encoding', 'identity')
      .send({ enrollmentAttemptId: 'attempt-fixture' })
      .expect(200);

    expect(response.body).toEqual({ received: { enrollmentAttemptId: 'attempt-fixture' } });
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.headers['cache-control']).toContain('private');
  });

  it.each(ABSOLUTE_FORM_CASES)(
    'reserves and rejects %s before generic parsing',
    (_label, target, extraHeaders) => {
      expect(
        shouldSkipGenericBodyParserForDeviceAuthBootstrap({
          method: 'POST',
          originalUrl: target,
        })
      ).toBe(true);

      const middleware = createDeviceAuthBootstrapTransportMiddleware();
      const setHeader = jest.fn();
      const json = jest.fn();
      const set = jest.fn().mockReturnThis();
      const status = jest.fn().mockReturnValue({ set, json });
      const response = { setHeader, status } as unknown as express.Response;
      const next = jest.fn();
      const headerEntries = [['Content-Type', 'application/json'], ...extraHeaders] as const;
      const fakeRequest = {
        method: 'POST',
        originalUrl: target,
        rawHeaders: headerEntries.flatMap(([name, value]) => [name, value]),
        headers: Object.fromEntries(
          headerEntries.map(([name, value]) => [name.toLowerCase(), value])
        ),
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
    }
  );

  it.each(BOOTSTRAP_PATHS)('rejects chunked canonical %s before body parsing', (path) => {
    const middleware = createDeviceAuthBootstrapTransportMiddleware();
    const setHeader = jest.fn();
    const json = jest.fn();
    const set = jest.fn().mockReturnThis();
    const status = jest.fn().mockReturnValue({ set, json });
    const response = { setHeader, status } as unknown as express.Response;
    const next = jest.fn();
    const fakeRequest = {
      method: 'POST',
      originalUrl: path,
      rawHeaders: ['Content-Type', 'application/json', 'Transfer-Encoding', 'chunked'],
      headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' },
    } as unknown as express.Request;

    middleware(fakeRequest, response, next);

    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store, private');
    expect(status).toHaveBeenCalledWith(400);
    expect(set).toHaveBeenCalledWith('Cache-Control', 'no-store, private');
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts exactly 4 KiB of uncompressed JSON', async () => {
    const body = jsonBodyOfExactByteLength(4 * 1024);
    expect(Buffer.byteLength(body)).toBe(4 * 1024);

    const response = await request(app)
      .post(DEVICE_AUTH_TOKEN_PATH)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(200);

    expect(response.body.received.value).toHaveLength(4 * 1024 - Buffer.byteLength('{"value":""}'));
  });

  it('rejects query parameters before parsing bootstrap JSON', async () => {
    const rawCredential = 'credential-that-must-not-be-echoed';
    const response = await request(app)
      .post(`${DEVICE_AUTH_TOKEN_PATH}?credential=${rawCredential}`)
      .set('Content-Type', 'application/json')
      .send({ enrollmentAttemptId: 'attempt-fixture' });

    expectGenericTransportError(response, 400);
    expect(JSON.stringify(response.body)).not.toContain(rawCredential);
  });

  it.each([
    `${DEVICE_AUTH_BOOTSTRAP_ENROLL_PATH}/`,
    `${DEVICE_AUTH_BOOTSTRAP_ENROLL_PATH}/.`,
    `${DEVICE_AUTH_BOOTSTRAP_ENROLL_PATH}/%2e`,
    `${DEVICE_AUTH_BOOTSTRAP_ENROLL_PATH}/%2e/`,
    '/API/V1/INTEGRATION/DEVICE-AUTH/ENROLL',
    '/Api/V1/Integration/Device-Auth/Enrollment-Status',
    `${DEVICE_AUTH_TOKEN_PATH}/`,
    `${DEVICE_AUTH_TOKEN_PATH}/%2e`,
    `${DEVICE_AUTH_TOKEN_PATH}%2f`,
    '/api/v1/integration/device-auth%2ftoken',
    '/api/v1/integration/device%2dauth/token',
    '/API/V1/INTEGRATION/DEVICE-AUTH/TOKEN',
  ])(
    'rejects Express-compatible route alias %s before the generic parser can accept it',
    async (path) => {
      const response = await request(app)
        .post(path)
        .set('Content-Type', 'application/json')
        .send({ enrollmentAttemptId: 'attempt-fixture' });

      expectGenericTransportError(response, 400);
    }
  );

  it.each([
    'Authorization',
    'Proxy-Authorization',
    'Cookie',
    'X-API-Key',
    'X-Account-Recovery-Key',
    'X-CSRF-Token',
    'X-Session-Token',
    'Origin',
    'Referer',
  ])('rejects the ambient %s header even when its value is empty', async (headerName) => {
    const response = await request(app)
      .post(DEVICE_AUTH_TOKEN_PATH)
      .set('Content-Type', 'application/json')
      .set(headerName, '')
      .send({ enrollmentAttemptId: 'attempt-fixture' });

    expectGenericTransportError(response, 400);
  });

  it.each([
    undefined,
    'text/plain',
    'application/problem+json',
    'application/json; charset=iso-8859-1',
    'application/json; boundary=unexpected',
  ])('rejects non-canonical content type %p', async (contentType) => {
    let testRequest = request(app).post(DEVICE_AUTH_TOKEN_PATH);
    if (contentType !== undefined) {
      testRequest = testRequest.set('Content-Type', contentType);
    }

    const response = await testRequest.send('{"enrollmentAttemptId":"attempt-fixture"}');
    expectGenericTransportError(response, 415);
  });

  it.each(['gzip', 'br', 'identity, gzip', ''])(
    'rejects disallowed content encoding %p',
    async (encoding) => {
      const response = await request(app)
        .post(DEVICE_AUTH_TOKEN_PATH)
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', encoding)
        .send('{"enrollmentAttemptId":"attempt-fixture"}');

      expectGenericTransportError(response, 415);
    }
  );

  it('rejects malformed or non-object JSON without echoing the body', async () => {
    const rawBody = '{"credential":"secret-value"';
    const malformed = await request(app)
      .post(DEVICE_AUTH_TOKEN_PATH)
      .set('Content-Type', 'application/json')
      .send(rawBody);
    expectGenericTransportError(malformed, 400);
    expect(JSON.stringify(malformed.body)).not.toContain('secret-value');

    const primitive = await request(app)
      .post(DEVICE_AUTH_TOKEN_PATH)
      .set('Content-Type', 'application/json')
      .send('"not-an-object"');
    expectGenericTransportError(primitive, 400);
  });

  it('rejects a body larger than 4 KiB before any controller sees it', async () => {
    const body = jsonBodyOfExactByteLength(4 * 1024 + 1);
    const response = await request(app)
      .post(DEVICE_AUTH_TOKEN_PATH)
      .set('Content-Type', 'application/json')
      .send(body);

    expectGenericTransportError(response, 413);
  });

  it('does not claim similarly named routes and reserves generic parsing for them', async () => {
    const response = await request(app)
      .post('/api/v1/integration/device-auth/other')
      .send({ compatibility: true })
      .expect(200);

    expect(response.body).toEqual({ received: { compatibility: true } });
  });

  it('reserves POST bootstrap paths and Express-compatible aliases from generic parsers', () => {
    expect(
      shouldSkipGenericBodyParserForDeviceAuthBootstrap({
        method: 'POST',
        originalUrl: DEVICE_AUTH_BOOTSTRAP_ENROLL_PATH,
      })
    ).toBe(true);
    expect(
      shouldSkipGenericBodyParserForDeviceAuthBootstrap({
        method: 'POST',
        originalUrl: `${DEVICE_AUTH_BOOTSTRAP_STATUS_PATH}?unexpected=1`,
      })
    ).toBe(true);
    expect(
      shouldSkipGenericBodyParserForDeviceAuthBootstrap({
        method: 'GET',
        originalUrl: DEVICE_AUTH_BOOTSTRAP_ENROLL_PATH,
      })
    ).toBe(false);
    expect(
      shouldSkipGenericBodyParserForDeviceAuthBootstrap({
        method: 'POST',
        originalUrl: `${DEVICE_AUTH_BOOTSTRAP_ENROLL_PATH}/`,
      })
    ).toBe(true);
    expect(
      shouldSkipGenericBodyParserForDeviceAuthBootstrap({
        method: 'POST',
        originalUrl: `${DEVICE_AUTH_BOOTSTRAP_ENROLL_PATH}/%2e`,
      })
    ).toBe(true);
    expect(
      shouldSkipGenericBodyParserForDeviceAuthBootstrap({
        method: 'POST',
        originalUrl: `${DEVICE_AUTH_TOKEN_PATH}?unexpected=1`,
      })
    ).toBe(true);
    expect(
      shouldSkipGenericBodyParserForDeviceAuthBootstrap({
        method: 'POST',
        originalUrl: `${DEVICE_AUTH_TOKEN_PATH}/%2e`,
      })
    ).toBe(true);
    expect(
      shouldSkipGenericBodyParserForDeviceAuthBootstrap({
        method: 'POST',
        originalUrl: `${DEVICE_AUTH_TOKEN_PATH}%2f`,
      })
    ).toBe(true);
    expect(
      shouldSkipGenericBodyParserForDeviceAuthBootstrap({
        method: 'POST',
        originalUrl: '/api/v1/integration/device-auth%2ftoken',
      })
    ).toBe(true);
    expect(
      shouldSkipGenericBodyParserForDeviceAuthBootstrap({
        method: 'POST',
        originalUrl: '/API/V1/INTEGRATION/DEVICE-AUTH/ENROLL',
      })
    ).toBe(true);
    expect(
      shouldSkipGenericBodyParserForDeviceAuthBootstrap({
        method: 'POST',
        originalUrl: `${DEVICE_AUTH_BOOTSTRAP_ENROLL_PATH}/suffix`,
      })
    ).toBe(false);
    expect(
      shouldSkipGenericBodyParserForDeviceAuthBootstrap({
        method: 'POST',
        originalUrl: 'http://service/api/v1/integration/device-auth/other',
      })
    ).toBe(false);
  });

  it('reserves the token exchange route from generic body parsers', () => {
    expect(
      shouldSkipGenericBodyParserForDeviceAuthBootstrap({
        method: 'POST',
        originalUrl: '/api/v1/integration/device-auth/token',
      })
    ).toBe(true);
  });
});
