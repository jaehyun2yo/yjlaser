/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

const mockParseBody = jest.fn();
const mockProxyToNestJS = jest.fn();

jest.mock('@/lib/api/webhard-proxy', () => ({
  parseBody: (request: NextRequest) => mockParseBody(request),
  proxyToNestJS: (request: NextRequest, path: string, options?: Record<string, unknown>) =>
    mockProxyToNestJS(request, path, options),
}));

import { POST } from '@/app/api/webhard/upload/batch-complete/route';

const files = [
  {
    fileName: 'sample.pdf',
    originalName: 'sample.pdf',
    fileSize: 1024,
    folderId: 'folder-1',
    objectKey: 'uploads/folder-1/sample.pdf',
    publicUrl: 'https://r2.example.com/uploads/folder-1/sample.pdf',
    mimeType: 'application/pdf',
  },
];

function buildRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/webhard/upload/batch-complete', {
    method: 'POST',
  });
}

describe('POST /api/webhard/upload/batch-complete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParseBody.mockResolvedValue({ files });
  });

  it('returns 200 with per-file failure when NestJS batch confirm reports a partial failure', async () => {
    mockProxyToNestJS.mockResolvedValue(
      Response.json({ success: false, failed: 1, errors: ['sample.pdf: failed'] }, { status: 200 })
    );

    const response = await POST(buildRequest());
    const body = (await response.json()) as {
      success?: boolean;
      data?: { failed?: number; results?: Array<{ success?: boolean; fileName?: string }> };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.data?.failed).toBe(1);
    expect(body.data?.results?.[0]).toEqual({
      success: false,
      fileName: 'sample.pdf',
      error: 'sample.pdf: failed',
    });
  });

  it('returns 200 with failure metadata when NestJS reports failed files despite a truthy success field', async () => {
    mockProxyToNestJS.mockResolvedValue(
      Response.json({ success: true, failed: 1, errors: ['sample.pdf: failed'] }, { status: 200 })
    );

    const response = await POST(buildRequest());
    const body = (await response.json()) as { success?: boolean; data?: { failed?: number } };

    expect(response.status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.data?.failed).toBe(1);
  });

  it('maps non-prefix NestJS error text to the matching failed file', async () => {
    mockProxyToNestJS.mockResolvedValue(
      Response.json(
        {
          success: 0,
          failed: 1,
          errors: ['폴더 접근 권한 없음: sample.pdf (folderId: folder-1)'],
        },
        { status: 200 }
      )
    );

    const response = await POST(buildRequest());
    const body = (await response.json()) as {
      success?: boolean;
      data?: { results?: Array<{ success?: boolean; fileName?: string; error?: string }> };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.data?.results?.[0]).toEqual({
      success: false,
      fileName: 'sample.pdf',
      error: '폴더 접근 권한 없음: sample.pdf (folderId: folder-1)',
    });
  });

  it('preserves upstream non-2xx status for failed batch confirm responses', async () => {
    mockProxyToNestJS.mockResolvedValue(Response.json({ message: 'forbidden' }, { status: 403 }));

    const response = await POST(buildRequest());
    const body = (await response.json()) as { success?: boolean; data?: { failed?: number } };

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.data?.failed).toBe(files.length);
  });

  it('returns success only after NestJS confirms all uploaded files', async () => {
    mockProxyToNestJS.mockResolvedValue(Response.json({ success: 1, failed: 0 }, { status: 200 }));

    const response = await POST(buildRequest());
    const body = (await response.json()) as { success?: boolean; data?: { success?: number } };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.success).toBe(1);
  });
});
