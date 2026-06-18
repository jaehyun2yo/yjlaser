/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from 'next/server';

const mockRequireAuth = jest.fn();
const mockCheckWebhardRateLimit = jest.fn();

jest.mock('@/lib/auth/adminGuard', () => ({
  requireAuth: () => mockRequireAuth(),
}));

jest.mock('@/lib/auth/rateLimit', () => ({
  checkWebhardRateLimit: (request: NextRequest) => mockCheckWebhardRateLimit(request),
}));

describe('GET /api/webhard/preview-dxf', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue({
      authorized: true,
      response: null,
    });
    mockCheckWebhardRateLimit.mockResolvedValue({
      allowed: true,
    });
    global.fetch = jest.fn() as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('returns DXF text by resolving a signed download URL without exposing the URL', async () => {
    const { GET } = await import('@/app/api/webhard/preview-dxf/route');
    const mockedFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    mockedFetch
      .mockResolvedValueOnce(
        NextResponse.json({
          url: 'https://r2.example.com/signed-dxf-url',
          fileName: '현장 가공용 테스트.DXF',
        })
      )
      .mockResolvedValueOnce(
        new Response('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF', {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      );

    const request = new NextRequest(
      'http://localhost:3000/api/webhard/preview-dxf?fileId=11111111-1111-4111-8111-111111111111',
      { headers: { cookie: 'session=abc' } }
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/plain');
    expect(await response.text()).toContain('ENTITIES');
    expect(mockedFetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:4000/api/v1/files/11111111-1111-4111-8111-111111111111/download',
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: 'session=abc',
        }),
      })
    );
    expect(mockedFetch).toHaveBeenNthCalledWith(2, 'https://r2.example.com/signed-dxf-url');
  });

  it('rejects invalid file ids before hitting the backend', async () => {
    const { GET } = await import('@/app/api/webhard/preview-dxf/route');
    const request = new NextRequest('http://localhost:3000/api/webhard/preview-dxf?fileId=bad');

    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
