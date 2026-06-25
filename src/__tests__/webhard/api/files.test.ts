/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

const mockGetSearchParams = jest.fn();
const mockProxyToNestJS = jest.fn();

jest.mock('@/lib/api/webhard-proxy', () => ({
  getSearchParams: (request: NextRequest) => mockGetSearchParams(request),
  proxyToNestJS: (
    request: NextRequest,
    path: string,
    options?: { searchParams?: URLSearchParams }
  ) => mockProxyToNestJS(request, path, options),
}));

import { GET } from '@/app/api/webhard/files/route';

function buildRequest(query: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/webhard/files?${query}`);
}

describe('GET /api/webhard/files', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSearchParams.mockImplementation((request: NextRequest) => request.nextUrl.searchParams);
    mockProxyToNestJS.mockResolvedValue(Response.json({ files: [], total: 0 }));
  });

  it('파일 목록 조회를 NestJS /files 프록시로 위임한다', async () => {
    const request = buildRequest('folderId=folder-1&companyId=7&page=2&limit=20');

    const response = await GET(request);
    const body = (await response.json()) as { files: unknown[]; total: number };

    expect(response.status).toBe(200);
    expect(body).toEqual({ files: [], total: 0 });
    expect(mockGetSearchParams).toHaveBeenCalledWith(request);
    expect(mockProxyToNestJS).toHaveBeenCalledWith(request, '/files', {
      searchParams: request.nextUrl.searchParams,
    });
  });

  it('정렬/페이지 query string을 변형하지 않고 백엔드로 전달한다', async () => {
    const request = buildRequest('sortBy=name&sortOrder=asc&page=3');

    await GET(request);

    const [, , options] = mockProxyToNestJS.mock.calls[0] as [
      NextRequest,
      string,
      { searchParams: URLSearchParams },
    ];
    expect(options.searchParams.get('sortBy')).toBe('name');
    expect(options.searchParams.get('sortOrder')).toBe('asc');
    expect(options.searchParams.get('page')).toBe('3');
  });
});
