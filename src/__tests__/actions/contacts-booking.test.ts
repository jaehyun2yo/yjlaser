import { submitContact } from '@/app/actions/contacts';
import {
  serverCreateBooking,
  serverCreateContact,
  serverGetAvailableSlots,
} from '@/lib/api/nestjs-server-client';
import { getSessionUser } from '@/lib/auth/session';
import { prepareContactInsertData } from '@/lib/utils/contactDataProcessor';

jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

jest.mock('@/lib/utils/fileUpload', () => ({
  uploadFileToR2: jest.fn(),
  uploadFilesInParallel: jest.fn(),
}));

jest.mock('@/lib/utils/contactDataProcessor', () => ({
  prepareContactInsertData: jest.fn(),
}));

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    createLogger: () => ({
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    }),
  },
}));

jest.mock('@/lib/utils/constants', () => ({
  FILE_SIZE_LIMITS: {
    ATTACHMENT: 20 * 1024 * 1024,
    DRAWING: 50 * 1024 * 1024,
    REFERENCE_PHOTO: 10 * 1024 * 1024,
  },
}));

jest.mock('@/lib/auth/session', () => ({
  getSessionUser: jest.fn(),
}));

jest.mock('@/lib/auth/erp-session', () => ({
  getErpWorkerSession: jest.fn(),
}));

jest.mock('@/lib/api/nestjs-server-client', () => ({
  serverUpdateContact: jest.fn(),
  serverCreateContact: jest.fn(),
  serverUpdateContactStatus: jest.fn(),
  serverUpdateContactProcessStage: jest.fn(),
  serverGetContactTimeline: jest.fn(),
  serverToggleUrgent: jest.fn(),
  serverAddWorkerNote: jest.fn(),
  serverDeleteWorkerNote: jest.fn(),
  serverBatchStartDelivery: jest.fn(),
  serverBatchCompleteDelivery: jest.fn(),
  serverSplitContact: jest.fn(),
  serverToggleStageCompleted: jest.fn(),
  serverAdvanceSplitGroupStage: jest.fn(),
  serverCompleteLaserOnlyContact: jest.fn(),
  serverGetAvailableSlots: jest.fn(),
  serverCreateBooking: jest.fn(),
}));

const mockedPrepareContactInsertData = prepareContactInsertData as jest.MockedFunction<
  typeof prepareContactInsertData
>;
const mockedServerCreateContact = serverCreateContact as jest.MockedFunction<
  typeof serverCreateContact
>;
const mockedServerGetAvailableSlots = serverGetAvailableSlots as jest.MockedFunction<
  typeof serverGetAvailableSlots
>;
const mockedServerCreateBooking = serverCreateBooking as jest.MockedFunction<
  typeof serverCreateBooking
>;
const mockedGetSessionUser = getSessionUser as jest.MockedFunction<typeof getSessionUser>;

function buildVisitFormData() {
  const formData = new FormData();
  formData.set('inquiry_title', '방문 견적');
  formData.set('contact_type', 'company');
  formData.set('company_name', '테스트업체');
  formData.set('name', '홍길동');
  formData.set('position', '대표');
  formData.set('phone', '010-1234-5678');
  formData.set('email', 'test@example.com');
  formData.set('drawing_type', 'create');
  formData.set('receipt_method', 'visit');
  formData.set('visit_date', '2026-05-20');
  formData.set('visit_time_slot', '9:00~10:00');
  return formData;
}

describe('submitContact booking creation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.INTEGRATION_API_KEY;

    mockedPrepareContactInsertData.mockReturnValue({
      inquiryTitle: '테스트업체 방문 견적',
      companyName: '테스트업체',
      name: '홍길동',
      position: '대표',
      phone: '010-1234-5678',
      email: 'test@example.com',
      receiptMethod: 'visit',
      visitDate: '2026-05-20',
      visitTimeSlot: '9:00~10:00',
      status: 'received',
      source: 'website',
    });
    mockedServerCreateContact.mockResolvedValue({
      success: true,
      data: {
        id: 'contact-visit-1',
        inquiry_number: '260520-O-001',
      },
    });
    mockedServerGetAvailableSlots.mockResolvedValue({
      date: '2026-05-20',
      slotCounts: {
        '9:00~10:00': 0,
      },
      maxCapacity: 2,
    });
    mockedServerCreateBooking.mockResolvedValue({
      success: true,
      booking: {
        id: 1,
      },
    });
    mockedGetSessionUser.mockResolvedValue(null);
  });

  it('방문 예약 생성 시 NestJS CreateBookingDto의 camelCase 필드로 전송한다', async () => {
    const result = await submitContact(buildVisitFormData());

    expect(result).toEqual({
      success: true,
      bookingCreated: true,
      bookingError: undefined,
    });
    expect(mockedServerCreateBooking).toHaveBeenCalledWith({
      visitDate: '2026-05-20',
      visitTimeSlot: '9:00~10:00',
      companyName: '테스트업체',
      contactId: 'contact-visit-1',
      createdBy: 'company',
    });
  });
});
