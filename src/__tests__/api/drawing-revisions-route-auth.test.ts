/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/auth/session', () => ({
  getSessionUser: jest.fn(),
  verifySession: jest.fn(),
}));

jest.mock('@/lib/auth/erp-session', () => ({
  getErpWorkerSession: jest.fn(),
}));

jest.mock('@/lib/api/nestjs-server-client', () => ({
  serverGetContact: jest.fn(),
  serverGetContactLatestDrawingUrl: jest.fn(),
  serverGetCompany: jest.fn(),
  serverGetDrawingRevisionInfo: jest.fn(),
  serverGetDrawingRevisionDownloadUrl: jest.fn(),
  serverGetLatestDrawing: jest.fn(),
  serverUpdateDrawingRevisionVisibility: jest.fn(),
}));

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    createLogger: () => ({
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { getErpWorkerSession } from '@/lib/auth/erp-session';
import { getSessionUser, verifySession } from '@/lib/auth/session';
import {
  serverGetContact,
  serverGetContactLatestDrawingUrl,
  serverGetCompany,
  serverGetDrawingRevisionDownloadUrl,
  serverGetDrawingRevisionInfo,
  serverGetLatestDrawing,
  serverUpdateDrawingRevisionVisibility,
} from '@/lib/api/nestjs-server-client';
import { GET as downloadRevision } from '@/app/api/drawing-revisions/[revisionId]/download/route';
import { PATCH as updateVisibility } from '@/app/api/drawing-revisions/[revisionId]/visibility/route';
import { GET as getLatestDrawing } from '@/app/api/contacts/[id]/latest-drawing/route';
import { GET as downloadLatestDrawing } from '@/app/api/contacts/[id]/latest-drawing/download/route';
import { AuthorizationError } from '@/lib/utils/errors';

const mockedGetSessionUser = getSessionUser as jest.MockedFunction<typeof getSessionUser>;
const mockedVerifySession = verifySession as jest.MockedFunction<typeof verifySession>;
const mockedGetErpWorkerSession = getErpWorkerSession as jest.MockedFunction<
  typeof getErpWorkerSession
>;
const mockedServerGetContact = serverGetContact as jest.MockedFunction<typeof serverGetContact>;
const mockedServerGetContactLatestDrawingUrl =
  serverGetContactLatestDrawingUrl as jest.MockedFunction<typeof serverGetContactLatestDrawingUrl>;
const mockedServerGetCompany = serverGetCompany as jest.MockedFunction<typeof serverGetCompany>;
const mockedServerGetDrawingRevisionInfo = serverGetDrawingRevisionInfo as jest.MockedFunction<
  typeof serverGetDrawingRevisionInfo
>;
const mockedServerGetDrawingRevisionDownloadUrl =
  serverGetDrawingRevisionDownloadUrl as jest.MockedFunction<
    typeof serverGetDrawingRevisionDownloadUrl
  >;
const mockedServerUpdateDrawingRevisionVisibility =
  serverUpdateDrawingRevisionVisibility as jest.MockedFunction<
    typeof serverUpdateDrawingRevisionVisibility
  >;
const mockedServerGetLatestDrawing = serverGetLatestDrawing as jest.MockedFunction<
  typeof serverGetLatestDrawing
>;

const REVISION_ID = '11111111-1111-1111-1111-111111111111';

function makeRequest(path: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${path}`), init);
}

function mockCompanySession(companyName: string) {
  mockedVerifySession.mockResolvedValue(true);
  mockedGetSessionUser.mockResolvedValue({ userType: 'company', userId: 7 });
  mockedServerGetCompany.mockResolvedValue({
    id: 7,
    company_name: companyName,
  } as Awaited<ReturnType<typeof serverGetCompany>>);
}

describe('drawing revision Next routes authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedServerGetContact.mockResolvedValue({
      inquiry_number: '260521-O-001',
      work_number: null,
    } as Awaited<ReturnType<typeof serverGetContact>>);
  });

  it('rejects company revision downloads for another company revision', async () => {
    mockCompanySession('업체A');
    mockedGetErpWorkerSession.mockResolvedValue(null);
    mockedServerGetDrawingRevisionInfo.mockResolvedValue({
      id: REVISION_ID,
      contactId: 'contact-b',
      companyName: '업체B',
    });
    mockedServerGetDrawingRevisionDownloadUrl.mockResolvedValue({
      url: 'https://r2.example.com/file.dxf',
      fileName: 'file.dxf',
    });

    const response = await downloadRevision(
      makeRequest(`/api/drawing-revisions/${REVISION_ID}/download?fileIndex=0`),
      { params: Promise.resolve({ revisionId: REVISION_ID }) }
    );

    expect(response.status).toBe(403);
    expect(mockedServerGetDrawingRevisionDownloadUrl).not.toHaveBeenCalled();
  });

  it('allows company revision downloads only after revision owner check passes', async () => {
    mockCompanySession('업체A');
    mockedGetErpWorkerSession.mockResolvedValue(null);
    mockedServerGetDrawingRevisionInfo.mockResolvedValue({
      id: REVISION_ID,
      contactId: 'contact-a',
      companyName: '업체A',
      isPublic: true,
    });
    mockedServerGetDrawingRevisionDownloadUrl.mockResolvedValue({
      url: 'https://r2.example.com/file.dxf',
      fileName: 'file.dxf',
    });

    const response = await downloadRevision(
      makeRequest(`/api/drawing-revisions/${REVISION_ID}/download?fileIndex=0`),
      { params: Promise.resolve({ revisionId: REVISION_ID }) }
    );

    expect(response.status).toBe(200);
    expect(mockedServerGetDrawingRevisionInfo).toHaveBeenCalledWith(REVISION_ID, {
      authMode: 'session',
    });
    expect(mockedServerGetDrawingRevisionDownloadUrl).toHaveBeenCalledWith(REVISION_ID, 0, {
      authMode: 'session',
    });
    expect(await response.json()).toEqual({
      url: 'https://r2.example.com/file.dxf',
      fileName: '260521-O-001 - 업체A - file.dxf',
    });
  });

  it('rejects company revision downloads when an owned revision is not public', async () => {
    mockCompanySession('업체A');
    mockedGetErpWorkerSession.mockResolvedValue(null);
    mockedServerGetDrawingRevisionInfo.mockResolvedValue({
      id: REVISION_ID,
      contactId: 'contact-a',
      companyName: '업체A',
      isPublic: false,
    });
    mockedServerGetDrawingRevisionDownloadUrl.mockResolvedValue({
      url: 'https://r2.example.com/file.dxf',
      fileName: 'file.dxf',
    });

    const response = await downloadRevision(
      makeRequest(`/api/drawing-revisions/${REVISION_ID}/download?fileIndex=0`),
      { params: Promise.resolve({ revisionId: REVISION_ID }) }
    );

    expect(response.status).toBe(403);
    expect(mockedServerGetDrawingRevisionDownloadUrl).not.toHaveBeenCalled();
  });

  it('keeps ERP worker revision downloads available through worker-session backend auth', async () => {
    mockedVerifySession.mockResolvedValue(false);
    mockedGetSessionUser.mockResolvedValue(null);
    mockedGetErpWorkerSession.mockResolvedValue({ workerId: 'worker-1', workerName: '작업자' });
    mockedServerGetContact.mockResolvedValue({
      inquiry_number: null,
      work_number: '260519-F-004',
    } as Awaited<ReturnType<typeof serverGetContact>>);
    mockedServerGetDrawingRevisionInfo.mockResolvedValue({
      id: REVISION_ID,
      contactId: 'contact-a',
      companyName: '업체A',
      isPublic: false,
    });
    mockedServerGetDrawingRevisionDownloadUrl.mockResolvedValue({
      url: 'https://r2.example.com/file.dxf',
      fileName: '[260519-F-004] file.dxf',
    });

    const response = await downloadRevision(
      makeRequest(`/api/drawing-revisions/${REVISION_ID}/download?fileIndex=0`),
      { params: Promise.resolve({ revisionId: REVISION_ID }) }
    );

    expect(response.status).toBe(200);
    expect(mockedServerGetDrawingRevisionInfo).toHaveBeenCalledWith(REVISION_ID, {
      authMode: 'workerSession',
    });
    expect(mockedServerGetDrawingRevisionDownloadUrl).toHaveBeenCalledWith(REVISION_ID, 0, {
      authMode: 'workerSession',
    });
    expect(await response.json()).toEqual({
      url: 'https://r2.example.com/file.dxf',
      fileName: '260519-F-004 - 업체A - file.dxf',
    });
  });

  it('preserves backend ACL rejection for ERP worker revision downloads', async () => {
    mockedVerifySession.mockResolvedValue(false);
    mockedGetSessionUser.mockResolvedValue(null);
    mockedGetErpWorkerSession.mockResolvedValue({ workerId: 'worker-1', workerName: '작업자' });
    mockedServerGetDrawingRevisionInfo.mockRejectedValue(
      new AuthorizationError('Worker contact access denied')
    );

    const response = await downloadRevision(
      makeRequest(`/api/drawing-revisions/${REVISION_ID}/download?fileIndex=0`),
      { params: Promise.resolve({ revisionId: REVISION_ID }) }
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('Worker contact access denied');
    expect(mockedServerGetDrawingRevisionInfo).toHaveBeenCalledWith(REVISION_ID, {
      authMode: 'workerSession',
    });
    expect(mockedServerGetDrawingRevisionDownloadUrl).not.toHaveBeenCalled();
  });

  it('rejects company sessions on revision visibility updates', async () => {
    mockCompanySession('업체A');
    mockedServerUpdateDrawingRevisionVisibility.mockResolvedValue({ id: REVISION_ID } as Awaited<
      ReturnType<typeof serverUpdateDrawingRevisionVisibility>
    >);

    const response = await updateVisibility(
      makeRequest(`/api/drawing-revisions/${REVISION_ID}/visibility`, {
        method: 'PATCH',
        body: JSON.stringify({ isPublic: true }),
      }),
      { params: Promise.resolve({ revisionId: REVISION_ID }) }
    );

    expect(response.status).toBe(403);
    expect(mockedServerUpdateDrawingRevisionVisibility).not.toHaveBeenCalled();
  });

  it('allows admin sessions on revision visibility updates', async () => {
    mockedVerifySession.mockResolvedValue(true);
    mockedGetSessionUser.mockResolvedValue({ userType: 'admin', userId: 'admin' });
    mockedServerUpdateDrawingRevisionVisibility.mockResolvedValue({ id: REVISION_ID } as Awaited<
      ReturnType<typeof serverUpdateDrawingRevisionVisibility>
    >);

    const response = await updateVisibility(
      makeRequest(`/api/drawing-revisions/${REVISION_ID}/visibility`, {
        method: 'PATCH',
        body: JSON.stringify({ isPublic: true }),
      }),
      { params: Promise.resolve({ revisionId: REVISION_ID }) }
    );

    expect(response.status).toBe(200);
    expect(mockedServerUpdateDrawingRevisionVisibility).toHaveBeenCalledWith(REVISION_ID, true);
  });

  it('uses session-scoped backend auth for company latest drawing lookup', async () => {
    mockCompanySession('업체A');
    mockedServerGetContact.mockResolvedValue({
      id: 'contact-a',
      company_name: '업체A',
    } as Awaited<ReturnType<typeof serverGetContact>>);
    mockedServerGetLatestDrawing.mockResolvedValue({ drawing: null });

    const response = await getLatestDrawing(makeRequest('/api/contacts/contact-a/latest-drawing'), {
      params: Promise.resolve({ id: 'contact-a' }),
    });

    expect(response.status).toBe(200);
    expect(mockedServerGetLatestDrawing).toHaveBeenCalledWith('contact-a', {
      authMode: 'session',
    });
  });

  it('preserves backend ACL rejection for ERP worker latest drawing downloads', async () => {
    mockedVerifySession.mockResolvedValue(false);
    mockedGetSessionUser.mockResolvedValue(null);
    mockedGetErpWorkerSession.mockResolvedValue({ workerId: 'worker-1', workerName: '작업자' });
    mockedServerGetContact.mockResolvedValue({
      id: 'contact-a',
      company_name: '업체A',
      inquiry_number: '260521-O-001',
      work_number: null,
    } as Awaited<ReturnType<typeof serverGetContact>>);
    mockedServerGetContactLatestDrawingUrl.mockRejectedValue(
      new AuthorizationError('Worker contact access denied')
    );

    const response = await downloadLatestDrawing(
      makeRequest('/api/contacts/contact-a/latest-drawing/download'),
      { params: Promise.resolve({ id: 'contact-a' }) }
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('Worker contact access denied');
    expect(mockedServerGetContactLatestDrawingUrl).toHaveBeenCalledWith('contact-a', {
      authMode: 'workerSession',
    });
  });

  it('does not expose latest drawing fallback to company sessions when backend has no public drawing', async () => {
    mockCompanySession('업체A');
    mockedServerGetContact.mockResolvedValue({
      id: 'contact-a',
      company_name: '업체A',
      inquiry_number: '260521-O-001',
      work_number: null,
    } as Awaited<ReturnType<typeof serverGetContact>>);
    mockedServerGetContactLatestDrawingUrl.mockResolvedValue(null);

    const response = await downloadLatestDrawing(
      makeRequest('/api/contacts/contact-a/latest-drawing/download'),
      { params: Promise.resolve({ id: 'contact-a' }) }
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: '도면이 없습니다.' });
    expect(mockedServerGetContactLatestDrawingUrl).toHaveBeenCalledWith('contact-a', {
      authMode: 'session',
    });
  });
});
