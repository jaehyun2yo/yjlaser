/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

jest.mock('@/lib/auth/session', () => ({
  getSessionUser: jest.fn(),
}));

jest.mock('@/lib/api/nestjs-server-client', () => ({
  serverGetCompany: jest.fn(),
  serverGetBookings: jest.fn(),
  serverCreateBooking: jest.fn(),
  serverGetContact: jest.fn(),
  serverGetBooking: jest.fn(),
  serverUpdateBooking: jest.fn(),
  serverUpdateContact: jest.fn(),
  serverGetAvailableSlots: jest.fn(),
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

import { getSessionUser } from '@/lib/auth/session';
import {
  serverCreateBooking,
  serverGetAvailableSlots,
  serverGetBooking,
  serverGetBookings,
  serverGetCompany,
  serverGetContact,
  serverUpdateBooking,
  serverUpdateContact,
} from '@/lib/api/nestjs-server-client';
import { GET as getBookings, POST as postBooking } from '@/app/api/bookings/route';
import { DELETE as deleteBooking, PUT as putBooking } from '@/app/api/bookings/[id]/route';

const mockedGetSessionUser = getSessionUser as jest.MockedFunction<typeof getSessionUser>;
const mockedServerGetCompany = serverGetCompany as jest.MockedFunction<typeof serverGetCompany>;
const mockedServerGetBookings = serverGetBookings as jest.MockedFunction<typeof serverGetBookings>;
const mockedServerCreateBooking = serverCreateBooking as jest.MockedFunction<
  typeof serverCreateBooking
>;
const mockedServerGetContact = serverGetContact as jest.MockedFunction<typeof serverGetContact>;
const mockedServerGetBooking = serverGetBooking as jest.MockedFunction<typeof serverGetBooking>;
const mockedServerUpdateBooking = serverUpdateBooking as jest.MockedFunction<
  typeof serverUpdateBooking
>;
const mockedServerUpdateContact = serverUpdateContact as jest.MockedFunction<
  typeof serverUpdateContact
>;
const mockedServerGetAvailableSlots = serverGetAvailableSlots as jest.MockedFunction<
  typeof serverGetAvailableSlots
>;

function makeRequest(path: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${path}`), init);
}

function mockCompanySession(companyName: string) {
  mockedGetSessionUser.mockResolvedValue({ userType: 'company', userId: 7 });
  mockedServerGetCompany.mockResolvedValue({
    id: 7,
    company_name: companyName,
  } as Awaited<ReturnType<typeof serverGetCompany>>);
}

describe('bookings Next routes authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects unauthenticated booking list requests', async () => {
    mockedGetSessionUser.mockResolvedValue(null);

    const response = await getBookings(makeRequest('/api/bookings?companyName=업체A'));

    expect(response.status).toBe(401);
    expect(mockedServerGetBookings).not.toHaveBeenCalled();
  });

  it('company booking list ignores arbitrary companyName query and uses session company', async () => {
    mockCompanySession('업체A');
    mockedServerGetBookings.mockResolvedValue([]);

    const response = await getBookings(makeRequest('/api/bookings?companyName=업체B'));

    expect(response.status).toBe(200);
    expect(mockedServerGetBookings).toHaveBeenCalledWith({
      date: undefined,
      companyName: '업체A',
      startDate: undefined,
      endDate: undefined,
    });
  });

  it('rejects company booking creation for a different companyName', async () => {
    mockCompanySession('업체A');
    mockedServerCreateBooking.mockResolvedValue({ success: true, booking: { id: 1 } });

    const response = await postBooking(
      makeRequest('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          visitDate: '2026-05-20',
          visitTimeSlot: '9:00~10:00',
          companyName: '업체B',
        }),
      })
    );

    expect(response.status).toBe(403);
    expect(mockedServerCreateBooking).not.toHaveBeenCalled();
  });

  it('rejects company booking creation when contactId belongs to another company', async () => {
    mockCompanySession('업체A');
    mockedServerGetContact.mockResolvedValue({
      id: 'contact-b',
      company_name: '업체B',
    });
    mockedServerCreateBooking.mockResolvedValue({ success: true, booking: { id: 1 } });

    const response = await postBooking(
      makeRequest('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          visitDate: '2026-05-20',
          visitTimeSlot: '9:00~10:00',
          companyName: '업체A',
          contactId: 'contact-b',
        }),
      })
    );

    expect(response.status).toBe(403);
    expect(mockedServerCreateBooking).not.toHaveBeenCalled();
  });

  it('rejects company booking update for another company booking', async () => {
    mockCompanySession('업체A');
    mockedServerGetBooking.mockResolvedValue({
      id: 10,
      company_name: '업체B',
      visit_date: '2026-05-20',
      visit_time_slot: '9:00~10:00',
    });
    mockedServerUpdateBooking.mockResolvedValue({ success: true, booking: { id: 10 } });

    const response = await putBooking(
      makeRequest('/api/bookings/10', {
        method: 'PUT',
        body: JSON.stringify({
          visitDate: '2026-05-20',
          visitTimeSlot: '10:00~11:00',
        }),
      }),
      { params: Promise.resolve({ id: '10' }) }
    );

    expect(response.status).toBe(403);
    expect(mockedServerUpdateBooking).not.toHaveBeenCalled();
  });

  it('rejects company booking update when the linked contact belongs to another company', async () => {
    mockCompanySession('업체A');
    mockedServerGetBooking.mockResolvedValue({
      id: 10,
      company_name: '업체A',
      contact_id: 'contact-b',
      visit_date: '2026-05-20',
      visit_time_slot: '9:00~10:00',
    });
    mockedServerGetContact.mockResolvedValue({
      id: 'contact-b',
      company_name: '업체B',
    });
    mockedServerGetAvailableSlots.mockResolvedValue({
      date: '2026-05-21',
      slotCounts: { '10:00~11:00': 0 },
      maxCapacity: 2,
    });
    mockedServerUpdateBooking.mockResolvedValue({ success: true, booking: { id: 10 } });

    const response = await putBooking(
      makeRequest('/api/bookings/10', {
        method: 'PUT',
        body: JSON.stringify({
          visitDate: '2026-05-21',
          visitTimeSlot: '10:00~11:00',
        }),
      }),
      { params: Promise.resolve({ id: '10' }) }
    );

    expect(response.status).toBe(403);
    expect(mockedServerUpdateBooking).not.toHaveBeenCalled();
    expect(mockedServerUpdateContact).not.toHaveBeenCalled();
  });

  it('rejects company booking cancellation delivery updates when the linked contact belongs to another company', async () => {
    mockCompanySession('업체A');
    mockedServerGetBooking.mockResolvedValue({
      id: 10,
      company_name: '업체A',
      contact_id: 'contact-b',
      visit_date: '2026-05-20',
      visit_time_slot: '9:00~10:00',
    });
    mockedServerGetContact.mockResolvedValue({
      id: 'contact-b',
      company_name: '업체B',
    });
    mockedServerUpdateBooking.mockResolvedValue({ success: true, booking: { id: 10 } });

    const response = await deleteBooking(
      makeRequest('/api/bookings/10', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          deliveryMethod: 'delivery',
          deliveryName: '홍길동',
          deliveryPhone: '010-0000-0000',
          deliveryAddress: '서울시',
        }),
      }),
      { params: Promise.resolve({ id: '10' }) }
    );

    expect(response.status).toBe(403);
    expect(mockedServerUpdateBooking).not.toHaveBeenCalled();
    expect(mockedServerUpdateContact).not.toHaveBeenCalled();
  });

  it('uses backend maxCapacity instead of hardcoded 2 when changing a booking slot', async () => {
    mockCompanySession('업체A');
    mockedServerGetBooking.mockResolvedValue({
      id: 10,
      company_name: '업체A',
      visit_date: '2026-05-20',
      visit_time_slot: '9:00~10:00',
    });
    mockedServerGetAvailableSlots.mockResolvedValue({
      date: '2026-05-21',
      slotCounts: { '10:00~11:00': 2 },
      maxCapacity: 3,
    });
    mockedServerUpdateBooking.mockResolvedValue({ success: true, booking: { id: 10 } });

    const response = await putBooking(
      makeRequest('/api/bookings/10', {
        method: 'PUT',
        body: JSON.stringify({
          visitDate: '2026-05-21',
          visitTimeSlot: '10:00~11:00',
        }),
      }),
      { params: Promise.resolve({ id: '10' }) }
    );

    expect(response.status).toBe(200);
    expect(mockedServerUpdateBooking).toHaveBeenCalled();
  });
});
