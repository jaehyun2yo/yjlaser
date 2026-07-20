import type { ExecutionContext } from '@nestjs/common';
import { DeviceRotationAdminRequestShapeGuard } from './device-rotation-admin-request-shape.guard';

const DEVICE_ID = '11111111-1111-4111-8111-111111111111';
const ROTATION_ID = '22222222-2222-4222-8222-222222222222';

function context(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function loadGuard(enabled = true): { canActivate(context: ExecutionContext): boolean } {
  return new DeviceRotationAdminRequestShapeGuard({ rotationRuntimeEnabled: enabled });
}

function validRequest(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    params: { id: DEVICE_ID, rotationId: ROTATION_ID },
    headers: { 'content-length': '0' },
    rawHeaders: ['Content-Length', '0'],
    body: {},
    ...overrides,
  };
}

describe('DeviceRotationAdminRequestShapeGuard', () => {
  it('accepts canonical params and an exact zero-octet POST body', () => {
    expect(loadGuard().canActivate(context(validRequest()))).toBe(true);
  });

  it.each([
    validRequest({
      params: { id: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', rotationId: ROTATION_ID },
    }),
    validRequest({ body: { reason: 'secret' }, headers: {}, rawHeaders: [] }),
    validRequest({ headers: { 'content-length': '2' }, rawHeaders: ['Content-Length', '2'] }),
    validRequest({
      headers: { 'transfer-encoding': 'chunked' },
      rawHeaders: ['Transfer-Encoding', 'chunked'],
    }),
    validRequest({
      headers: { authorization: 'Bearer raw' },
      rawHeaders: ['Authorization', 'Bearer raw'],
    }),
    validRequest({ headers: { 'x-api-key': 'raw' }, rawHeaders: ['X-API-Key', 'raw'] }),
    validRequest({
      headers: { 'x-account-recovery-key': 'raw' },
      rawHeaders: ['X-Account-Recovery-Key', 'raw'],
    }),
    validRequest({ headers: { 'x-session-token': 'raw' }, rawHeaders: ['X-Session-Token', 'raw'] }),
    validRequest({
      headers: { 'proxy-authorization': 'Basic raw' },
      rawHeaders: ['Proxy-Authorization', 'Basic raw'],
    }),
    validRequest({
      headers: { 'content-length': '0', 'content-type': 'text/plain' },
      rawHeaders: ['Content-Length', '0', 'Content-Type', 'text/plain'],
    }),
    validRequest({ query: { debug: '1' } }),
    validRequest({
      headers: { 'content-length': '0', 'content-encoding': 'gzip' },
      rawHeaders: ['Content-Length', '0', 'Content-Encoding', 'gzip'],
    }),
  ])('rejects malformed or ambiguous admin request shape %#', (request) => {
    expect(() => loadGuard().canActivate(context(request))).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'device_rotation_invalid' }),
      })
    );
  });

  it('accepts GET without a body but still validates both canonical ids', () => {
    expect(
      loadGuard().canActivate(
        context(validRequest({ method: 'GET', headers: {}, rawHeaders: [], body: undefined }))
      )
    ).toBe(true);
  });

  it('hides every rotation route while the compatibility flag is disabled', () => {
    expect(() => loadGuard(false).canActivate(context(validRequest()))).toThrow(
      expect.objectContaining({ status: 404 })
    );
  });
});
