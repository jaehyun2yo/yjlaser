import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as express from 'express';
import * as request from 'supertest';
import type { Request, Response } from 'express';
import {
  createDeviceRotationFeatureGateMiddleware,
  DeviceRotationFeatureGateMiddleware,
  isDeviceRotationAdminRequest,
} from './device-rotation-feature-gate.middleware';

function loadMiddleware(enabled: boolean) {
  return new DeviceRotationFeatureGateMiddleware({ rotationRuntimeEnabled: enabled });
}

describe('DeviceRotationFeatureGateMiddleware', () => {
  const rotationRequest = {
    originalUrl:
      '/api/v1/integration/devices/11111111-1111-4111-8111-111111111111/credential-rotations',
  } as Request;

  it('returns the same private no-store 404 before downstream auth and CSRF when disabled', () => {
    const setHeader = jest.fn();
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const next = jest.fn();

    loadMiddleware(false).use(rotationRequest, { setHeader, status } as unknown as Response, next);

    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store, private');
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ statusCode: 404, message: 'Not Found' });
    expect(next).not.toHaveBeenCalled();
  });

  it('sets no-store and delegates exactly once when enabled', () => {
    const setHeader = jest.fn();
    const next = jest.fn();
    loadMiddleware(true).use(rotationRequest, { setHeader } as unknown as Response, next);
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store, private');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['malformed JSON', { contentType: 'application/json', body: '{"broken":' }],
    ['gzip body', { contentType: 'application/json', encoding: 'gzip', body: 'compressed' }],
    ['brotli body', { contentType: 'application/json', encoding: 'br', body: 'compressed' }],
    ['non-empty body', { contentType: 'application/json', body: '{"unexpected":true}' }],
    [
      'authenticated request',
      {
        contentType: 'application/json',
        authorization: 'Bearer must-not-reach-auth',
        body: '{}',
      },
    ],
  ])(
    'returns the identical disabled response before generic parsing for %s',
    async (_label, input) => {
      const downstream = jest.fn((_req: express.Request, res: express.Response) => {
        res.status(200).json({ reached: true });
      });
      const app = express();
      app.use(createDeviceRotationFeatureGateMiddleware({ rotationRuntimeEnabled: false }));
      app.use(express.json({ limit: '10mb' }));
      app.post(rotationRequest.originalUrl, downstream);

      let testRequest = request(app)
        .post(rotationRequest.originalUrl)
        .set('Content-Type', input.contentType);
      if ('encoding' in input && input.encoding !== undefined)
        testRequest = testRequest.set('Content-Encoding', input.encoding);
      if ('authorization' in input && input.authorization !== undefined) {
        testRequest = testRequest.set('Authorization', input.authorization);
      }
      const response = await testRequest.send(input.body);

      expect(response.status).toBe(404);
      expect(response.headers['cache-control']).toBe('no-store, private');
      expect(response.body).toEqual({ statusCode: 404, message: 'Not Found' });
      expect(downstream).not.toHaveBeenCalled();
    }
  );

  it('returns the identical disabled response before a generic payload limit', async () => {
    const downstream = jest.fn();
    const app = express();
    app.use(createDeviceRotationFeatureGateMiddleware({ rotationRuntimeEnabled: false }));
    app.use(express.json({ limit: '1kb' }));
    app.post(rotationRequest.originalUrl, downstream);

    const response = await request(app)
      .post(rotationRequest.originalUrl)
      .set('Content-Type', 'application/json')
      .send(`{"value":"${'a'.repeat(2 * 1024)}"}`);

    expect(response.status).toBe(404);
    expect(response.headers['cache-control']).toBe('no-store, private');
    expect(response.body).toEqual({ statusCode: 404, message: 'Not Found' });
    expect(downstream).not.toHaveBeenCalled();
  });

  it.each([
    [
      '/api/v1/integration/devices/credential-rotations/not-a-uuid/prepare?hostile=1',
      'Authorization',
      'Bearer must-not-reach-auth',
      '{"broken":',
    ],
    [
      '/API/V1/INTEGRATION/DEVICES/CREDENTIAL-ROTATIONS/not-a-uuid/ACK',
      'Authorization',
      'Bearer must-not-reach-auth',
      `{"candidateCredential":"${'a'.repeat(5000)}"}`,
    ],
    [
      '/API/V1/INTEGRATION/DEVICES/not-a-uuid/CREDENTIAL-ROTATIONS',
      'Authorization',
      'Bearer must-not-reach-auth',
      '{}',
    ],
    [
      '/api/v1/integration/devices/not-a-uuid/credential-rotations/',
      'Cookie',
      'session=must-not-reach-auth',
      '{"unexpected":true}',
    ],
    [
      '/api/v1/integration/devices/device%2Did/credential-rotations/rotation%2Did',
      'X-Session-Token',
      'must-not-reach-auth',
      '{"broken":',
    ],
    [
      '/api/v1/integration/devices/device%2Fid/credential-rotations/rotation%2Fid/cancel/',
      'Authorization',
      'Bearer must-not-reach-auth',
      '{"unexpected":true}',
    ],
  ])(
    'reserves the structural controller route %s before auth and body parsing',
    async (path, header, value, body) => {
      const downstream = jest.fn((_req: express.Request, res: express.Response) => {
        res.status(200).json({ reached: true });
      });
      const app = express();
      app.use(createDeviceRotationFeatureGateMiddleware({ rotationRuntimeEnabled: false }));
      app.use(express.json({ limit: '10mb' }));
      app.use(downstream);

      expect(isDeviceRotationAdminRequest({ originalUrl: path } as Request)).toBe(true);
      const response = await request(app)
        .post(path)
        .set('Content-Type', 'application/json')
        .set(header, value)
        .send(body);

      expect(response.status).toBe(404);
      expect(response.headers['cache-control']).toBe('no-store, private');
      expect(response.body).toEqual({ statusCode: 404, message: 'Not Found' });
      expect(downstream).not.toHaveBeenCalled();
    }
  );

  it.each([
    'http://device-auth.invalid/api/v1/integration/devices/credential-rotations/not-a-uuid/prepare?ignored=1',
    'http://device-auth.invalid/api/v1/integration/devices/11111111-1111-4111-8111-111111111111/credential-rotations',
    'HTTP://device-auth.invalid/API/V1/INTEGRATION/DEVICES/not-a-uuid/CREDENTIAL-ROTATIONS',
    'https://device-auth.invalid/api/v1/integration/devices/device%2Did/credential-rotations/rotation%2Did',
    'http://device-auth.invalid/api/v1/integration/devices/device%2Fid/credential-rotations/rotation%2Fid/cancel/?ignored=1',
  ])('reserves the absolute-form structural route %s before parser writes', (target) => {
    const setHeader = jest.fn();
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const next = jest.fn();
    const fakeRequest = { originalUrl: target, url: target } as Request;

    expect(isDeviceRotationAdminRequest(fakeRequest)).toBe(true);
    createDeviceRotationFeatureGateMiddleware({ rotationRuntimeEnabled: false })(
      fakeRequest,
      { setHeader, status } as unknown as Response,
      next
    );

    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store, private');
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ statusCode: 404, message: 'Not Found' });
    expect(next).not.toHaveBeenCalled();
  });

  it('registers the raw rotation gate before generic parsers and excludes enabled routes from them', () => {
    const mainSource = readFileSync(resolve(process.cwd(), 'src/main.ts'), 'utf8');
    const rawGateRegistration = mainSource.indexOf(
      'rawExpressApp.use(createDeviceRotationFeatureGateMiddleware(rotationOptions))'
    );
    const genericJsonRegistration = mainSource.indexOf(
      "rawExpressApp.use(skipBodyParserForDriveUpload(json({ limit: '10mb' })))"
    );

    expect(rawGateRegistration).toBeGreaterThan(-1);
    expect(genericJsonRegistration).toBeGreaterThan(rawGateRegistration);
    expect(mainSource).toContain('isDeviceRotationAdminRequest(req)');
  });
});
