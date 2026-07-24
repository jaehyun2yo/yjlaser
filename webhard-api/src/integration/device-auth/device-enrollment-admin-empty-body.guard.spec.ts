import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { DeviceEnrollmentAdminEmptyBodyGuard } from './device-enrollment-admin-empty-body.guard';

type HeaderValue = string | string[] | undefined;

function makeContext(input: {
  body: unknown;
  headers?: Record<string, HeaderValue>;
  rawHeaders?: unknown;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        body: input.body,
        headers: input.headers ?? {},
        rawHeaders: input.rawHeaders ?? [],
      }),
      getResponse: () => ({ setHeader: () => undefined }),
    }),
  } as ExecutionContext;
}

describe('DeviceEnrollmentAdminEmptyBodyGuard', () => {
  it.each([
    { label: 'no body and no framing headers', headers: {} },
    { label: 'an explicit zero content length', headers: { 'content-length': '0' } },
    {
      label: 'an explicit zero JSON content length',
      headers: {
        'content-length': '0',
        'content-type': 'application/json; charset=utf-8',
      },
    },
    {
      label: 'the Express JSON parser zero-octet empty-object artifact',
      body: {},
      headers: { 'content-length': '0' },
      rawHeaders: ['Content-Length', '0'],
    },
  ])('accepts $label', ({ body = undefined, headers, rawHeaders }) => {
    const guard = new DeviceEnrollmentAdminEmptyBodyGuard();

    expect(guard.canActivate(makeContext({ body, headers, rawHeaders }))).toBe(true);
  });

  it('does not throw when a zero-body request has no rawHeaders runtime field', () => {
    const guard = new DeviceEnrollmentAdminEmptyBodyGuard();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ body: undefined, headers: {} }),
        getResponse: () => ({ setHeader: () => undefined }),
      }),
    } as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });

  it.each([{}, 'not-a-header-array'])(
    'treats a non-array rawHeaders value as absent for a zero-body request: %p',
    (rawHeaders) => {
      const guard = new DeviceEnrollmentAdminEmptyBodyGuard();

      expect(
        guard.canActivate(
          makeContext({
            body: undefined,
            headers: {},
            rawHeaders,
          })
        )
      ).toBe(true);
    }
  );

  it.each([
    { label: 'an empty JSON object', body: {}, headers: { 'content-length': '2' } },
    { label: 'a null body', body: null, headers: { 'content-length': '4' } },
    { label: 'an array body', body: [], headers: { 'content-length': '2' } },
    { label: 'a non-empty content length', body: undefined, headers: { 'content-length': '1' } },
    {
      label: 'a non-canonical zero content length',
      body: undefined,
      headers: { 'content-length': '00' },
    },
    {
      label: 'duplicate content length values',
      body: undefined,
      headers: { 'content-length': ['0', '0'] },
    },
    {
      label: 'an empty transfer encoding header',
      body: undefined,
      headers: { 'transfer-encoding': '' },
    },
    {
      label: 'a chunked transfer encoding header',
      body: undefined,
      headers: { 'transfer-encoding': 'chunked' },
    },
    {
      label: 'an unsupported text payload media type',
      body: undefined,
      headers: { 'content-length': '0', 'content-type': 'text/plain' },
    },
    {
      label: 'a raw duplicate content length header',
      body: undefined,
      headers: { 'content-length': '0' },
      rawHeaders: ['Content-Length', '0', 'Content-Length', '0'],
    },
    {
      label: 'a raw transfer encoding header',
      body: undefined,
      headers: {},
      rawHeaders: ['Transfer-Encoding', 'chunked'],
    },
  ])('rejects $label before the action service is invoked', ({ body, headers, rawHeaders }) => {
    const guard = new DeviceEnrollmentAdminEmptyBodyGuard();

    expect(() => guard.canActivate(makeContext({ body, headers, rawHeaders }))).toThrow(
      BadRequestException
    );
  });
});
