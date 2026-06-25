import { Logger } from '@nestjs/common';
import { LaserCompletionsService } from './laser-completions.service';

interface MockPrisma {
  executeWithRetry: jest.Mock;
  contact: {
    findFirst: jest.Mock;
  };
}

interface MockContactsService {
  completeLaserOnlyContact: jest.Mock;
  updateProcessStage: jest.Mock;
}

function makePrisma(): MockPrisma {
  return {
    executeWithRetry: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
    contact: {
      findFirst: jest.fn(),
    },
  };
}

function buildService() {
  const prisma = makePrisma();
  const contactsService: MockContactsService = {
    completeLaserOnlyContact: jest.fn().mockResolvedValue({ id: 'contact-1' }),
    updateProcessStage: jest.fn().mockResolvedValue({ id: 'contact-1' }),
  };

  const service = new LaserCompletionsService(prisma as never, contactsService as never);

  return { service, prisma, contactsService };
}

function makeContact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'contact-1',
    inquiryType: 'laser_cutting',
    status: 'cutting',
    processStage: 'laser',
    ...overrides,
  };
}

describe('LaserCompletionsService.completeByWorkNumbers', () => {
  it('workNumber 단건 레이저 전용 문의를 완료 처리한다', async () => {
    const { service, prisma, contactsService } = buildService();
    prisma.contact.findFirst.mockResolvedValue(makeContact());

    const result = await service.completeByWorkNumbers({
      workNumbers: ['260409-F-001'],
      actorName: 'nesting_program',
      source: 'laser_nesting_program',
      message: '네스팅 배치완료 후 레이저 전용 문의 자동 완료',
    });

    expect(result.success).toBe(true);
    expect(result.summary).toEqual({
      requested: 1,
      completed: 1,
      alreadyCompleted: 0,
      notFound: 0,
      skipped: 0,
      failed: 0,
    });
    expect(result.results).toEqual([
      {
        workNumber: '260409-F-001',
        status: 'completed',
        contactId: 'contact-1',
        message: '레이저 전용 문의 완료 처리됨',
      },
    ]);
    expect(contactsService.updateProcessStage).toHaveBeenCalledWith(
      'contact-1',
      'cutting',
      {
        actorType: 'system',
        actorName: 'nesting_program',
      },
      {
        expectedCurrentStage: 'laser',
        note: '네스팅 배치완료 후 레이저 전용 문의 자동 완료',
      }
    );
    expect(contactsService.completeLaserOnlyContact).not.toHaveBeenCalled();
  });

  it('여러 workNumber를 배치로 완료 처리한다', async () => {
    const { service, prisma, contactsService } = buildService();
    prisma.contact.findFirst
      .mockResolvedValueOnce(makeContact({ id: 'contact-1' }))
      .mockResolvedValueOnce(makeContact({ id: 'contact-2' }));

    const result = await service.completeByWorkNumbers({
      workNumbers: ['260409-F-001', '260409-F-002'],
    });

    expect(result.summary.completed).toBe(2);
    expect(result.results.map((item) => item.contactId)).toEqual(['contact-1', 'contact-2']);
    expect(contactsService.updateProcessStage).toHaveBeenCalledTimes(2);
  });

  it('중복 workNumber를 제거하고 첫 순서를 유지한다', async () => {
    const { service, prisma, contactsService } = buildService();
    prisma.contact.findFirst
      .mockResolvedValueOnce(makeContact({ id: 'contact-1' }))
      .mockResolvedValueOnce(makeContact({ id: 'contact-2' }));

    const result = await service.completeByWorkNumbers({
      workNumbers: ['260409-F-001', '260409-F-001', ' 260409-F-002 '],
    });

    expect(result.summary.requested).toBe(2);
    expect(result.results.map((item) => item.workNumber)).toEqual(['260409-F-001', '260409-F-002']);
    expect(prisma.contact.findFirst).toHaveBeenCalledTimes(2);
    expect(contactsService.updateProcessStage).toHaveBeenCalledTimes(2);
  });

  it('Contact가 없으면 not_found로 반환하고 나머지 항목 처리를 계속한다', async () => {
    const { service, prisma, contactsService } = buildService();
    prisma.contact.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeContact({ id: 'contact-2' }));

    const result = await service.completeByWorkNumbers({
      workNumbers: ['260409-F-404', '260409-F-002'],
    });

    expect(result.summary.notFound).toBe(1);
    expect(result.summary.completed).toBe(1);
    expect(result.results[0]).toEqual({
      workNumber: '260409-F-404',
      status: 'not_found',
      message: '해당 workNumber의 문의를 찾을 수 없음',
    });
    expect(contactsService.updateProcessStage).toHaveBeenCalledTimes(1);
  });

  it('laser_cutting이 아닌 문의는 not_laser_only로 건너뛴다', async () => {
    const { service, prisma, contactsService } = buildService();
    prisma.contact.findFirst.mockResolvedValue(
      makeContact({ id: 'contact-mold', inquiryType: 'mold_request' })
    );

    const result = await service.completeByWorkNumbers({
      workNumbers: ['260409-F-001'],
    });

    expect(result.summary.skipped).toBe(1);
    expect(result.results[0]).toEqual({
      workNumber: '260409-F-001',
      status: 'not_laser_only',
      contactId: 'contact-mold',
      message: '레이저 전용 문의가 아니므로 완료 처리하지 않음',
    });
    expect(contactsService.updateProcessStage).not.toHaveBeenCalled();
  });

  it('이미 completed + processStage=null이면 멱등 성공으로 반환한다', async () => {
    const { service, prisma, contactsService } = buildService();
    prisma.contact.findFirst.mockResolvedValue(
      makeContact({ id: 'contact-done', status: 'completed', processStage: null })
    );

    const result = await service.completeByWorkNumbers({
      workNumbers: ['260409-F-001'],
    });

    expect(result.summary.alreadyCompleted).toBe(1);
    expect(result.results[0]).toEqual({
      workNumber: '260409-F-001',
      status: 'already_completed',
      contactId: 'contact-done',
      message: '이미 완료 처리된 레이저 전용 문의',
    });
    expect(contactsService.updateProcessStage).not.toHaveBeenCalled();
  });

  it('updateProcessStage가 이미 완료된 retry no-op을 반환하면 already_completed로 분류한다', async () => {
    const { service, prisma, contactsService } = buildService();
    prisma.contact.findFirst.mockResolvedValue(makeContact({ id: 'contact-race' }));
    contactsService.updateProcessStage.mockResolvedValue({
      id: 'contact-race',
      process_stage: null,
      status: 'completed',
      status_changed: false,
    });

    const result = await service.completeByWorkNumbers({
      workNumbers: ['260409-F-001'],
    });

    expect(result.success).toBe(true);
    expect(result.summary.alreadyCompleted).toBe(1);
    expect(result.summary.completed).toBe(0);
    expect(result.results[0]).toEqual({
      workNumber: '260409-F-001',
      status: 'already_completed',
      contactId: 'contact-race',
      message: '이미 완료 처리된 레이저 전용 문의',
    });
  });

  it('completeLaserOnlyContact 내부 실패는 해당 항목 failed로 기록하고 나머지는 계속 처리한다', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { service, prisma, contactsService } = buildService();
    prisma.contact.findFirst
      .mockResolvedValueOnce(makeContact({ id: 'contact-fail' }))
      .mockResolvedValueOnce(makeContact({ id: 'contact-ok' }));
    contactsService.updateProcessStage
      .mockRejectedValueOnce(new Error('folder lock timeout'))
      .mockResolvedValueOnce({ id: 'contact-ok' });

    const result = await service.completeByWorkNumbers({
      workNumbers: ['260409-F-001', '260409-F-002'],
    });

    expect(result.success).toBe(false);
    expect(result.summary.failed).toBe(1);
    expect(result.summary.completed).toBe(1);
    expect(result.results).toEqual([
      {
        workNumber: '260409-F-001',
        status: 'failed',
        contactId: 'contact-fail',
        message: 'folder lock timeout',
      },
      {
        workNumber: '260409-F-002',
        status: 'completed',
        contactId: 'contact-ok',
        message: '레이저 전용 문의 완료 처리됨',
      },
    ]);
    warnSpy.mockRestore();
  });
});
