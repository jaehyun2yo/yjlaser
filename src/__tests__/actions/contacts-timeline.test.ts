import {
  batchStartDelivery,
  addWorkerNote,
  deleteWorkerNoteAction,
  getContactTimeline,
  updateProcessStage,
  uploadDeliveryProofImage,
} from '@/app/actions/contacts';
import { revalidatePath } from 'next/cache';
import {
  serverAddWorkerNote,
  serverBatchStartDelivery,
  serverDeleteWorkerNote,
  serverGetCompany,
  serverGetContact,
  serverGetContactTimeline,
  serverGetContactTimelineForSession,
  serverUpdateContactProcessStage,
} from '@/lib/api/nestjs-server-client';
import { getSessionUser } from '@/lib/auth/session';
import { getErpWorkerSession } from '@/lib/auth/erp-session';

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

jest.mock('@/lib/utils/contactDataProcessor', () => ({
  prepareContactInsertData: jest.fn(),
}));

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    createLogger: () => ({
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    }),
  },
}));

jest.mock('@/lib/utils/constants', () => ({
  FILE_SIZE_LIMITS: {
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
  serverGetCompany: jest.fn(),
  serverGetContact: jest.fn(),
  serverGetContactTimeline: jest.fn(),
  serverGetContactTimelineForSession: jest.fn(),
  serverToggleUrgent: jest.fn(),
  serverAddWorkerNote: jest.fn(),
  serverDeleteWorkerNote: jest.fn(),
  serverBatchStartDelivery: jest.fn(),
  serverBatchCompleteDelivery: jest.fn(),
  serverSplitContact: jest.fn(),
  serverToggleStageCompleted: jest.fn(),
  serverAdvanceSplitGroupStage: jest.fn(),
  serverCompleteLaserOnlyContact: jest.fn(),
}));

const mockedServerGetContactTimeline = serverGetContactTimeline as jest.MockedFunction<
  typeof serverGetContactTimeline
>;
const mockedServerGetContactTimelineForSession =
  serverGetContactTimelineForSession as jest.MockedFunction<
    typeof serverGetContactTimelineForSession
  >;
const mockedServerGetContact = serverGetContact as jest.MockedFunction<typeof serverGetContact>;
const mockedServerGetCompany = serverGetCompany as jest.MockedFunction<typeof serverGetCompany>;
const mockedServerBatchStartDelivery = serverBatchStartDelivery as jest.MockedFunction<
  typeof serverBatchStartDelivery
>;
const mockedServerUpdateContactProcessStage =
  serverUpdateContactProcessStage as jest.MockedFunction<typeof serverUpdateContactProcessStage>;
const mockedServerAddWorkerNote = serverAddWorkerNote as jest.MockedFunction<
  typeof serverAddWorkerNote
>;
const mockedServerDeleteWorkerNote = serverDeleteWorkerNote as jest.MockedFunction<
  typeof serverDeleteWorkerNote
>;
const mockedGetSessionUser = getSessionUser as jest.MockedFunction<typeof getSessionUser>;
const mockedGetErpWorkerSession = getErpWorkerSession as jest.MockedFunction<
  typeof getErpWorkerSession
>;
const mockedRevalidatePath = revalidatePath as jest.MockedFunction<typeof revalidatePath>;

describe('getContactTimeline', () => {
  beforeEach(() => {
    mockedServerGetContactTimeline.mockReset();
    mockedServerGetContactTimelineForSession.mockReset();
    mockedServerGetContact.mockReset();
    mockedServerGetCompany.mockReset();
    mockedGetSessionUser.mockReset();
  });

  it('worker 추가도면 반영을 막지 않도록 서버 fetch 캐시 revalidate 옵션을 넘기지 않는다', async () => {
    mockedServerGetContactTimeline.mockResolvedValue([]);

    await getContactTimeline('contact-1');

    expect(mockedServerGetContactTimeline).toHaveBeenCalledWith('contact-1');
  });

  it('company session fetches timeline through session-authenticated NestJS path', async () => {
    mockedGetSessionUser.mockResolvedValue({ userType: 'company', userId: 7 });
    mockedServerGetCompany.mockResolvedValue({
      id: 7,
      company_name: '업체A',
    } as Awaited<ReturnType<typeof serverGetCompany>>);
    mockedServerGetContact.mockResolvedValue({ id: 'contact-1', company_name: '업체A' });
    mockedServerGetContactTimeline.mockResolvedValue([]);
    mockedServerGetContactTimelineForSession.mockResolvedValue([]);

    const result = await getContactTimeline('contact-1');

    expect(result).toEqual({ success: true, data: [] });
    expect(mockedServerGetContactTimelineForSession).toHaveBeenCalledWith('contact-1');
    expect(mockedServerGetContactTimeline).not.toHaveBeenCalled();
  });

  it('company session cannot fetch another company timeline through server action', async () => {
    mockedGetSessionUser.mockResolvedValue({ userType: 'company', userId: 7 });
    mockedServerGetCompany.mockResolvedValue({
      id: 7,
      company_name: '업체A',
    } as Awaited<ReturnType<typeof serverGetCompany>>);
    mockedServerGetContact.mockResolvedValue({ id: 'contact-1', company_name: '업체B' });
    mockedServerGetContactTimeline.mockResolvedValue([]);
    mockedServerGetContactTimelineForSession.mockResolvedValue([]);

    const result = await getContactTimeline('contact-1');

    expect(result).toEqual({ success: false, data: [] });
    expect(mockedServerGetContactTimelineForSession).not.toHaveBeenCalled();
    expect(mockedServerGetContactTimeline).not.toHaveBeenCalled();
  });
});

describe('delivery proof actions', () => {
  beforeEach(() => {
    mockedServerBatchStartDelivery.mockReset();
    mockedGetErpWorkerSession.mockReset();
    mockedRevalidatePath.mockReset();
  });

  it('uploadDeliveryProofImage는 R2 직접 업로드를 중단하고 Drive 납품완료 흐름을 요구한다', async () => {
    const formData = new FormData();
    formData.append('file', new File(['proof'], 'proof.webp', { type: 'image/webp' }));

    const result = await uploadDeliveryProofImage(formData);

    expect(result).toEqual({
      success: false,
      error: '납품증빙은 납품완료 처리와 함께 Drive 문의폴더에 직접 저장해야 합니다.',
    });
  });

  it('batchStartDelivery는 증빙 파일 메타데이터를 API로 전달하고 업체 대시보드를 revalidate한다', async () => {
    mockedGetErpWorkerSession.mockResolvedValue({
      workerId: 'worker-1',
      workerName: '김작업',
    });
    mockedServerBatchStartDelivery.mockResolvedValue({
      success: true,
      results: [{ contactId: 'contact-delivery', success: true }],
    });

    const file = {
      originalName: 'proof.webp',
      size: 5,
      mimeType: 'image/webp',
    };

    const result = await batchStartDelivery(
      ['contact-delivery'],
      'https://cdn.yjlaser.net/contacts/delivery-proofs/proof.webp',
      file
    );

    expect(result.success).toBe(true);
    expect(mockedServerBatchStartDelivery).toHaveBeenCalledWith(
      ['contact-delivery'],
      'https://cdn.yjlaser.net/contacts/delivery-proofs/proof.webp',
      { actorType: 'worker', actorName: '김작업' },
      file
    );
    expect(mockedRevalidatePath).toHaveBeenCalledWith('/company/dashboard');
  });
});

describe('worker-facing mutation authorization', () => {
  beforeEach(() => {
    mockedGetErpWorkerSession.mockReset();
    mockedGetSessionUser.mockReset();
    mockedServerUpdateContactProcessStage.mockReset();
    mockedServerAddWorkerNote.mockReset();
    mockedServerDeleteWorkerNote.mockReset();
  });

  it('updateProcessStage는 인증 없는 호출에서 backend API를 호출하지 않는다', async () => {
    mockedGetErpWorkerSession.mockResolvedValue(null);
    mockedGetSessionUser.mockResolvedValue(null);

    const result = await updateProcessStage('contact-1', 'laser');

    expect(result.success).toBe(false);
    expect(mockedServerUpdateContactProcessStage).not.toHaveBeenCalled();
  });

  it('addWorkerNote는 인증 없는 호출에서 backend API를 호출하지 않는다', async () => {
    mockedGetErpWorkerSession.mockResolvedValue(null);
    mockedGetSessionUser.mockResolvedValue(null);

    const result = await addWorkerNote('contact-1', {
      type: 'memo',
      content: '작업 메모',
      workerName: '위조 작업자',
    });

    expect(result.success).toBe(false);
    expect(mockedServerAddWorkerNote).not.toHaveBeenCalled();
  });

  it('addWorkerNote는 검증된 worker session 이름으로 메모/이슈를 저장한다', async () => {
    mockedGetErpWorkerSession.mockResolvedValue({
      workerId: 'worker-1',
      workerName: '김작업',
    });
    mockedGetSessionUser.mockResolvedValue(null);
    mockedServerAddWorkerNote.mockResolvedValue({
      success: true,
      data: { id: 1, type: 'issue', content: '칼선 확인 필요' },
    });

    const result = await addWorkerNote('contact-1', {
      type: 'issue',
      content: '칼선 확인 필요',
      workerName: '위조 작업자',
    });

    expect(result.success).toBe(true);
    expect(mockedServerAddWorkerNote).toHaveBeenCalledWith(
      'contact-1',
      {
        type: 'issue',
        content: '칼선 확인 필요',
        createdBy: '김작업',
      },
      { actorType: 'worker', actorName: '김작업' }
    );
    expect(mockedRevalidatePath).toHaveBeenCalledWith('/worker/dashboard');
    expect(mockedRevalidatePath).toHaveBeenCalledWith('/company/dashboard');
  });

  it('deleteWorkerNoteAction은 인증 없는 호출에서 backend API를 호출하지 않는다', async () => {
    mockedGetErpWorkerSession.mockResolvedValue(null);
    mockedGetSessionUser.mockResolvedValue(null);

    const result = await deleteWorkerNoteAction('contact-1', 1);

    expect(result.success).toBe(false);
    expect(mockedServerDeleteWorkerNote).not.toHaveBeenCalled();
  });
});
