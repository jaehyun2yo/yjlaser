import {
  serverUpdateContactProcessStage,
  serverUpdateContactStatus,
  serverToggleStageCompleted,
} from '@/lib/api/nestjs/contacts.client';
import { serverAddWorkerNote, serverBatchStartDelivery } from '@/lib/api/nestjs/operations.client';
import { nestjsFetch } from '@/lib/api/nestjs/core.client';

jest.mock('@/lib/api/nestjs/core.client', () => ({
  nestjsFetch: jest.fn(),
  getNestjsClientDiagnostics: jest.fn(() => ({
    apiKeySet: true,
    apiPrefix: '/api/v1',
    baseUrl: 'http://localhost:4000',
  })),
  nestjsLogger: {
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockedNestjsFetch = nestjsFetch as jest.MockedFunction<typeof nestjsFetch>;

describe('NestJS worker actor client boundary', () => {
  beforeEach(() => {
    mockedNestjsFetch.mockReset();
    mockedNestjsFetch.mockResolvedValue({
      ok: true,
      status: 200,
      data: {},
    });
  });

  it('worker actor 공정 변경은 backend API key 대신 session cookie 경로를 사용한다', async () => {
    await serverUpdateContactProcessStage('contact-1', 'laser', {
      actorType: 'worker',
      actorName: '검증작업자',
    });

    expect(mockedNestjsFetch).toHaveBeenCalledWith(
      '/contacts/contact-1/process-stage',
      expect.objectContaining({ forwardedCookieNames: ['erp-session', 'csrf-token'] })
    );
  });

  it('admin actor 상태 변경도 session cookie 경로를 사용한다', async () => {
    await serverUpdateContactStatus('contact-1', 'delivered', {
      actorType: 'admin',
      actorName: 'admin',
    });

    expect(mockedNestjsFetch).toHaveBeenCalledWith(
      '/contacts/contact-1/status',
      expect.not.objectContaining({ useApiKey: true })
    );
  });

  it('system actor 자동 처리만 backend API key 경로를 유지한다', async () => {
    await serverUpdateContactProcessStage('contact-1', null, {
      actorType: 'system',
      actorName: '자동완료',
    });

    expect(mockedNestjsFetch).toHaveBeenCalledWith(
      '/contacts/contact-1/process-stage',
      expect.objectContaining({ useApiKey: true })
    );
  });

  it('worker actor 일괄 납품 시작은 backend API key를 사용하지 않는다', async () => {
    mockedNestjsFetch.mockResolvedValue({
      ok: true,
      status: 200,
      data: { results: [] },
    });

    await serverBatchStartDelivery(['contact-1'], undefined, {
      actorType: 'worker',
      actorName: '검증작업자',
    });

    expect(mockedNestjsFetch).toHaveBeenCalledWith(
      '/contacts/batch-start-delivery',
      expect.objectContaining({ forwardedCookieNames: ['erp-session', 'csrf-token'] })
    );
  });

  it('worker actor 단계 완료 토글도 worker session 쿠키만 전달한다', async () => {
    await serverToggleStageCompleted(
      'contact-1',
      { stageCompleted: true },
      { actorType: 'worker', actorName: '검증작업자' }
    );

    expect(mockedNestjsFetch).toHaveBeenCalledWith(
      '/contacts/contact-1/stage-completed',
      expect.objectContaining({ forwardedCookieNames: ['erp-session', 'csrf-token'] })
    );
  });

  it('worker actor 작업자 노트 추가도 worker session 쿠키만 전달한다', async () => {
    await serverAddWorkerNote(
      'contact-1',
      { type: 'memo', content: '확인', createdBy: '검증작업자' },
      { actorType: 'worker', actorName: '검증작업자' }
    );

    expect(mockedNestjsFetch).toHaveBeenCalledWith(
      '/contacts/contact-1/notes',
      expect.objectContaining({ forwardedCookieNames: ['erp-session', 'csrf-token'] })
    );
  });
});
