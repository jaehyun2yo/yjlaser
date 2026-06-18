/**
 * AutoContactService.updateFileNamePrefix 단위 테스트
 *
 * 스펙: docs/specs/features/drawing-revision-history.md (파일명 prefix 규칙)
 * 태스크: tasks/18-drawing-consistency/phase4.md
 *
 * 검증: WebhardFile.name 이 "[번호] 원본명" 대괄호 포맷으로 업데이트 (공백 구분 포맷 사용 안 함).
 */

import { AutoContactService } from './auto-contact.service';

interface PrismaMock {
  webhardFile: {
    findFirst: jest.Mock;
    update: jest.Mock;
  };
}

function makePrisma(): PrismaMock {
  return {
    webhardFile: {
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

function buildService() {
  const prisma = makePrisma();
  const webhardConfigService = {};
  const numberService = {};
  const timelineService = {};
  const drawingRevisionService = {};
  const laserOnlyMappingService = {};
  const foldersService = {};
  const contactFolderSync = {
    onContactCreated: jest.fn().mockResolvedValue(undefined),
    onInquiryTypeClassified: jest.fn().mockResolvedValue(undefined),
    onProcessStageChanged: jest.fn().mockResolvedValue(undefined),
  };

  const service = new AutoContactService(
    prisma as never,
    webhardConfigService as never,
    numberService as never,
    timelineService as never,
    drawingRevisionService as never,
    laserOnlyMappingService as never,
    foldersService as never,
    contactFolderSync as never
  );

  return { service, prisma };
}

type UpdateFileNamePrefix = (
  folderId: string,
  originalName: string,
  contactInfo: {
    inquiryNumber: string | null;
    workNumber: string | null;
    processStage: string | null;
    inquiryType: string | null;
  }
) => Promise<void>;

function callPrivate(service: AutoContactService): UpdateFileNamePrefix {
  return (
    service as unknown as {
      updateFileNamePrefix: UpdateFileNamePrefix;
    }
  ).updateFileNamePrefix.bind(service);
}

const O_NUMBER = '260417-O-002';
const F_NUMBER = '260420-F-004';
const FOLDER_ID = 'folder-uuid';
const FILE_ID = 'file-uuid';

describe('AutoContactService.updateFileNamePrefix — 대괄호 포맷 적용', () => {
  it('processStage=laser(field) → [workNumber] 원본명', async () => {
    const { service, prisma } = buildService();
    prisma.webhardFile.findFirst.mockResolvedValue({
      id: FILE_ID,
      originalName: 'sample.DXF',
    });

    await callPrivate(service)(FOLDER_ID, 'sample.DXF', {
      inquiryNumber: O_NUMBER,
      workNumber: F_NUMBER,
      processStage: 'laser',
      inquiryType: 'laser_cutting',
    });

    expect(prisma.webhardFile.update).toHaveBeenCalledTimes(1);
    const updateCall = prisma.webhardFile.update.mock.calls[0][0] as {
      where: { id: string };
      data: { name: string };
    };
    expect(updateCall.where.id).toBe(FILE_ID);
    expect(updateCall.data.name).toBe(`[${F_NUMBER}] sample.DXF`);
  });

  it('processStage=drawing(office) → [inquiryNumber] 원본명', async () => {
    const { service, prisma } = buildService();
    prisma.webhardFile.findFirst.mockResolvedValue({
      id: FILE_ID,
      originalName: 'plan.DXF',
    });

    await callPrivate(service)(FOLDER_ID, 'plan.DXF', {
      inquiryNumber: O_NUMBER,
      workNumber: null,
      processStage: 'drawing',
      inquiryType: 'cutting_request',
    });

    expect(prisma.webhardFile.update).toHaveBeenCalledTimes(1);
    const updateCall = prisma.webhardFile.update.mock.calls[0][0] as {
      data: { name: string };
    };
    expect(updateCall.data.name).toBe(`[${O_NUMBER}] plan.DXF`);
  });

  it('processStage=drawing(office) 이더라도 workNumber가 있으면 [workNumber] 원본명', async () => {
    const { service, prisma } = buildService();
    prisma.webhardFile.findFirst.mockResolvedValue({
      id: FILE_ID,
      originalName: 'plan.DXF',
    });

    await callPrivate(service)(FOLDER_ID, 'plan.DXF', {
      inquiryNumber: O_NUMBER,
      workNumber: F_NUMBER,
      processStage: 'drawing',
      inquiryType: 'cutting_request',
    });

    expect(prisma.webhardFile.update).toHaveBeenCalledTimes(1);
    const updateCall = prisma.webhardFile.update.mock.calls[0][0] as {
      data: { name: string };
    };
    expect(updateCall.data.name).toBe(`[${F_NUMBER}] plan.DXF`);
  });

  it('공백 구분 포맷을 절대 생성하지 않음 (기존 `${prefix} ${name}` 포맷 회귀 방지)', async () => {
    const { service, prisma } = buildService();
    prisma.webhardFile.findFirst.mockResolvedValue({
      id: FILE_ID,
      originalName: '배경.dxf',
    });

    await callPrivate(service)(FOLDER_ID, '배경.dxf', {
      inquiryNumber: null,
      workNumber: F_NUMBER,
      processStage: 'laser',
      inquiryType: 'laser_cutting',
    });

    const updateCall = prisma.webhardFile.update.mock.calls[0][0] as {
      data: { name: string };
    };
    expect(updateCall.data.name).toBe(`[${F_NUMBER}] 배경.dxf`);
    // 공백 구분 포맷(앞에 대괄호 없이 "{번호} {이름}") 이면 실패
    expect(updateCall.data.name).not.toMatch(/^\d{6}-[OF]-\d{3,4}\s+/);
  });

  it('WebhardFile 못 찾으면 update 미호출', async () => {
    const { service, prisma } = buildService();
    prisma.webhardFile.findFirst.mockResolvedValue(null);

    await callPrivate(service)(FOLDER_ID, 'missing.DXF', {
      inquiryNumber: O_NUMBER,
      workNumber: null,
      processStage: null,
      inquiryType: null,
    });

    expect(prisma.webhardFile.update).not.toHaveBeenCalled();
  });
});
