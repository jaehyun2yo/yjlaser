/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/auth/session', () => ({
  verifySession: jest.fn(),
  getSessionUser: jest.fn(),
}));

jest.mock('@/lib/api/nestjs-server-client', () => ({
  serverGetCompany: jest.fn(),
  serverGetContact: jest.fn(),
  serverGetContactTimeline: jest.fn(),
  serverGetContactTimelineForSession: jest.fn(),
  serverDeleteContact: jest.fn(),
  serverGetContactsByCompany: jest.fn(),
  serverUpdateContact: jest.fn(),
  serverUpdateContactStatus: jest.fn(),
  serverCleanupContacts: jest.fn(),
  serverCreateDrawingRevision: jest.fn(),
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

import { verifySession, getSessionUser } from '@/lib/auth/session';
import {
  serverDeleteContact,
  serverGetCompany,
  serverGetContact,
  serverGetContactTimeline,
  serverGetContactTimelineForSession,
  serverGetContactsByCompany,
  serverCleanupContacts,
  serverUpdateContact,
  serverUpdateContactStatus,
} from '@/lib/api/nestjs-server-client';
import { GET as getContact, DELETE as deleteContact } from '@/app/api/contacts/[id]/route';
import { GET as getContactsByCompany } from '@/app/api/contacts/by-company/route';
import { PATCH as patchContactStatus } from '@/app/api/contacts/[id]/status/route';
import { POST as cleanupContacts } from '@/app/api/contacts/cleanup/route';
import { GET as getContactTimeline } from '@/app/api/contacts/[id]/timeline/route';
import { POST as postRevisionRequest } from '@/app/api/contacts/[id]/revision-request/route';

const mockedVerifySession = verifySession as jest.MockedFunction<typeof verifySession>;
const mockedGetSessionUser = getSessionUser as jest.MockedFunction<typeof getSessionUser>;
const mockedServerGetCompany = serverGetCompany as jest.MockedFunction<typeof serverGetCompany>;
const mockedServerGetContact = serverGetContact as jest.MockedFunction<typeof serverGetContact>;
const mockedServerGetContactTimeline = serverGetContactTimeline as jest.MockedFunction<
  typeof serverGetContactTimeline
>;
const mockedServerGetContactTimelineForSession =
  serverGetContactTimelineForSession as jest.MockedFunction<
    typeof serverGetContactTimelineForSession
  >;
const mockedServerDeleteContact = serverDeleteContact as jest.MockedFunction<
  typeof serverDeleteContact
>;
const mockedServerGetContactsByCompany = serverGetContactsByCompany as jest.MockedFunction<
  typeof serverGetContactsByCompany
>;
const mockedServerUpdateContactStatus = serverUpdateContactStatus as jest.MockedFunction<
  typeof serverUpdateContactStatus
>;
const mockedServerUpdateContact = serverUpdateContact as jest.MockedFunction<
  typeof serverUpdateContact
>;
const mockedServerCleanupContacts = serverCleanupContacts as jest.MockedFunction<
  typeof serverCleanupContacts
>;

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

describe('contacts Next routes authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('company session cannot read another company contact through /api/contacts/[id]', async () => {
    mockCompanySession('업체A');
    mockedServerGetContact.mockResolvedValue({ id: 'contact-1', company_name: '업체B' });

    const response = await getContact(makeRequest('/api/contacts/contact-1'), {
      params: Promise.resolve({ id: 'contact-1' }),
    });

    expect(response.status).toBe(403);
  });

  it('company session cannot delete contacts through admin contact route', async () => {
    mockCompanySession('업체A');
    mockedServerDeleteContact.mockResolvedValue({ success: true });

    const response = await deleteContact(
      makeRequest('/api/contacts/contact-1', {
        method: 'DELETE',
        body: JSON.stringify({ permanent: true }),
      }),
      { params: Promise.resolve({ id: 'contact-1' }) }
    );

    expect(response.status).toBe(403);
    expect(mockedServerDeleteContact).not.toHaveBeenCalled();
  });

  it('company session cannot update contact status through admin status route', async () => {
    mockCompanySession('업체A');
    mockedServerUpdateContactStatus.mockResolvedValue({ success: true });

    const response = await patchContactStatus(
      makeRequest('/api/contacts/contact-1/status', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'confirmed' }),
      }),
      { params: Promise.resolve({ id: 'contact-1' }) }
    );

    expect(response.status).toBe(403);
    expect(mockedServerUpdateContactStatus).not.toHaveBeenCalled();
  });

  it('company session cannot use companyName query to list another company contacts', async () => {
    mockCompanySession('업체A');
    mockedServerGetContactsByCompany.mockResolvedValue([]);

    const response = await getContactsByCompany(
      makeRequest('/api/contacts/by-company?companyName=%EC%97%85%EC%B2%B4B')
    );

    expect(response.status).toBe(200);
    expect(mockedServerGetContactsByCompany).toHaveBeenCalledWith('업체A');
  });

  it('company session reads owned contact timeline through session-authenticated NestJS call', async () => {
    mockCompanySession('업체A');
    mockedServerGetContact.mockResolvedValue({ id: 'contact-1', company_name: '업체A' });
    mockedServerGetContactTimeline.mockResolvedValue([]);
    mockedServerGetContactTimelineForSession.mockResolvedValue([]);

    const response = await getContactTimeline(makeRequest('/api/contacts/contact-1/timeline'), {
      params: Promise.resolve({ id: 'contact-1' }),
    });

    expect(response.status).toBe(200);
    expect(mockedServerGetContactTimelineForSession).toHaveBeenCalledWith('contact-1');
    expect(mockedServerGetContactTimeline).not.toHaveBeenCalled();
  });

  it('does not upload revision-request files before rejecting another company contact', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    mockCompanySession('업체A');
    mockedServerGetContact.mockResolvedValue({ id: 'contact-1', company_name: '업체B' });
    mockedServerUpdateContact.mockResolvedValue({ success: true });

    const formData = new FormData();
    formData.set('title', '수정 요청');
    formData.set('content', '수정 내용');
    formData.set('file', new File(['drawing'], 'revision.dxf', { type: 'application/dxf' }));

    const response = await postRevisionRequest(
      makeRequest('/api/contacts/contact-1/revision-request', {
        method: 'POST',
        body: formData,
      }),
      { params: Promise.resolve({ id: 'contact-1' }) }
    );

    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockedServerUpdateContact).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('does not run contacts cleanup publicly when CLEANUP_API_KEY is unset', async () => {
    const originalCleanupApiKey = process.env.CLEANUP_API_KEY;
    delete process.env.CLEANUP_API_KEY;
    mockedGetSessionUser.mockResolvedValue(null);
    mockedServerCleanupContacts.mockResolvedValue({ success: true, deletedCount: 1 });

    try {
      const response = await cleanupContacts(
        makeRequest('/api/contacts/cleanup', { method: 'POST' })
      );

      expect(response.status).toBe(401);
      expect(mockedServerCleanupContacts).not.toHaveBeenCalled();
    } finally {
      if (originalCleanupApiKey === undefined) {
        delete process.env.CLEANUP_API_KEY;
      } else {
        process.env.CLEANUP_API_KEY = originalCleanupApiKey;
      }
    }
  });
});
