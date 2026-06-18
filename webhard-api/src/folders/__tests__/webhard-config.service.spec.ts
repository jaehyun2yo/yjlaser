/**
 * WebhardConfigService 테스트
 *
 * 커버리지:
 * - getStoredMappings: DB 없으면 기본값 + 시딩, 캐시 TTL, 캐시 만료
 * - getFolderStatusMapping: 저장 매핑 → 풀 매핑 변환
 * - updateFolderStatusMapping: upsert + 캐시 무효화
 * - getExcludedFolders: DB 없으면 기본값 + 시딩, 캐시 TTL, 캐시 만료
 * - updateExcludedFolders: upsert + 캐시 무효화
 * - classifyByFolderPath: 세그먼트 정확 매칭, 부분 매칭 거부, 미매칭 null
 * - getStatusForInquiryType: 알려진 / 미알려진 / null 입력
 * - validateMappings: 유효하지 않은 데이터 처리
 * - validateStringArray: 유효하지 않은 데이터 처리
 * - 동시 시딩(create catch) 예외 무시
 */

import { WebhardConfigService, FolderStatusMappingStored } from '../webhard-config.service';
import { FolderStatusMappingItemDto } from '../dto/webhard-config.dto';

// ============================================================
// Mock factories
// ============================================================

type MockSystemSetting = {
  key: string;
  value: unknown;
};

function makeSystemSetting(key: string, value: unknown): MockSystemSetting {
  return { key, value };
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    systemSetting: {
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    ...overrides,
  };
}

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = makePrisma(prismaOverrides);
  const service = new WebhardConfigService(prisma as never);
  return { service, prisma };
}

// ============================================================
// 상수 참조용 (소스와 동기화 유지)
// ============================================================

const STATUS_MAPPING_KEY = 'webhard_folder_status_mapping';
const EXCLUDED_FOLDERS_KEY = 'webhard_excluded_folders';

const DEFAULT_MAPPINGS: FolderStatusMappingStored[] = [
  { folderName: '목형의뢰', processStage: 'drawing_confirmed' },
  { folderName: '칼선의뢰', processStage: 'drawing' },
];

const DEFAULT_EXCLUDED_FOLDERS: string[] = [
  '올리기전용',
  '내리기전용',
  '목형의뢰',
  '칼선의뢰',
  '완료',
];

const AUTO_CONTACT_EXCLUDED_KEY = 'webhard_auto_contact_excluded_folders';

// ============================================================
// getStoredMappings
// ============================================================

describe('WebhardConfigService.getStoredMappings', () => {
  it('DB에 설정이 없으면 기본값을 반환하고 DB에 시딩한다', async () => {
    const { service, prisma } = makeService();
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.systemSetting.create as jest.Mock).mockResolvedValue(
      makeSystemSetting(STATUS_MAPPING_KEY, DEFAULT_MAPPINGS)
    );

    const result = await service.getStoredMappings();

    expect(result).toEqual(DEFAULT_MAPPINGS);
    expect(prisma.systemSetting.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ key: STATUS_MAPPING_KEY }),
      })
    );
  });

  it('DB에 설정이 있으면 저장된 값을 반환한다', async () => {
    const { service, prisma } = makeService();
    const storedMappings: FolderStatusMappingStored[] = [
      { folderName: '커스텀폴더', processStage: 'laser' },
    ];
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(
      makeSystemSetting(STATUS_MAPPING_KEY, storedMappings)
    );

    const result = await service.getStoredMappings();

    expect(result).toEqual(storedMappings);
    expect(prisma.systemSetting.create).not.toHaveBeenCalled();
  });

  it('TTL 내 두 번째 호출은 캐시를 반환하고 DB를 다시 조회하지 않는다', async () => {
    const { service, prisma } = makeService();
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(
      makeSystemSetting(STATUS_MAPPING_KEY, DEFAULT_MAPPINGS)
    );

    await service.getStoredMappings();
    await service.getStoredMappings();

    expect(prisma.systemSetting.findUnique).toHaveBeenCalledTimes(1);
  });

  it('TTL 만료 후에는 DB를 다시 조회한다', async () => {
    jest.useFakeTimers();

    const { service, prisma } = makeService();
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(
      makeSystemSetting(STATUS_MAPPING_KEY, DEFAULT_MAPPINGS)
    );

    await service.getStoredMappings();

    // 캐시 TTL(60초) + 1ms 경과
    jest.advanceTimersByTime(60_001);

    await service.getStoredMappings();

    expect(prisma.systemSetting.findUnique).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  it('동시 시딩 시 create가 거부되어도 예외를 던지지 않는다', async () => {
    const { service, prisma } = makeService();
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(null);
    // 동시 생성 충돌 시뮬레이션
    (prisma.systemSetting.create as jest.Mock).mockRejectedValue(
      new Error('Unique constraint failed')
    );

    await expect(service.getStoredMappings()).resolves.toEqual(DEFAULT_MAPPINGS);
  });
});

// ============================================================
// getFolderStatusMapping
// ============================================================

describe('WebhardConfigService.getFolderStatusMapping', () => {
  it('저장된 매핑을 풀 매핑(inquiryType, status 포함)으로 변환하여 반환한다', async () => {
    const { service, prisma } = makeService();
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(
      makeSystemSetting(STATUS_MAPPING_KEY, DEFAULT_MAPPINGS)
    );

    const result = await service.getFolderStatusMapping();

    expect(result).toHaveLength(2);

    const mokhyung = result.find((m) => m.folderName === '목형의뢰');
    expect(mokhyung).toEqual({
      folderName: '목형의뢰',
      inquiryType: 'mold_request',
      status: 'confirmed',
      processStage: 'drawing_confirmed',
    });

    const kalson = result.find((m) => m.folderName === '칼선의뢰');
    expect(kalson).toEqual({
      folderName: '칼선의뢰',
      inquiryType: 'cutting_request',
      status: 'drawing',
      processStage: 'drawing',
    });
  });

  it('KNOWN_INQUIRY_TYPES에 없는 폴더명은 folderName 자체를 inquiryType으로 사용한다', async () => {
    const { service, prisma } = makeService();
    const custom: FolderStatusMappingStored[] = [{ folderName: '신규폴더', processStage: 'laser' }];
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(
      makeSystemSetting(STATUS_MAPPING_KEY, custom)
    );

    const result = await service.getFolderStatusMapping();

    expect(result[0].inquiryType).toBe('신규폴더');
  });

  it('PROCESS_STAGE_TO_STATUS에 없는 processStage는 status = "received"로 파생된다', async () => {
    const { service, prisma } = makeService();
    const custom: FolderStatusMappingStored[] = [
      { folderName: '테스트폴더', processStage: 'unknown_stage' },
    ];
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(
      makeSystemSetting(STATUS_MAPPING_KEY, custom)
    );

    const result = await service.getFolderStatusMapping();

    expect(result[0].status).toBe('received');
  });
});

// ============================================================
// updateFolderStatusMapping
// ============================================================

describe('WebhardConfigService.updateFolderStatusMapping', () => {
  it('매핑을 DB에 upsert하고 캐시를 무효화한다', async () => {
    const { service, prisma } = makeService();
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(
      makeSystemSetting(STATUS_MAPPING_KEY, DEFAULT_MAPPINGS)
    );
    (prisma.systemSetting.upsert as jest.Mock).mockResolvedValue(
      makeSystemSetting(STATUS_MAPPING_KEY, [])
    );

    // 먼저 캐시를 채운다
    await service.getStoredMappings();
    expect(prisma.systemSetting.findUnique).toHaveBeenCalledTimes(1);

    const newMappings: FolderStatusMappingItemDto[] = [
      { folderName: '새폴더', processStage: 'delivery' },
    ];
    const updateResult = await service.updateFolderStatusMapping(newMappings);

    expect(updateResult).toEqual({ success: true });
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: STATUS_MAPPING_KEY },
        update: expect.objectContaining({
          value: [{ folderName: '새폴더', processStage: 'delivery' }],
        }),
        create: expect.objectContaining({ key: STATUS_MAPPING_KEY }),
      })
    );

    // 캐시가 무효화됐으므로 다음 조회는 DB를 다시 읽어야 한다
    const updatedMappings: FolderStatusMappingStored[] = [
      { folderName: '새폴더', processStage: 'delivery' },
    ];
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(
      makeSystemSetting(STATUS_MAPPING_KEY, updatedMappings)
    );

    await service.getStoredMappings();
    expect(prisma.systemSetting.findUnique).toHaveBeenCalledTimes(2);
  });
});

// ============================================================
// getExcludedFolders
// ============================================================

describe('WebhardConfigService.getExcludedFolders', () => {
  it('DB에 설정이 없으면 기본 제외 폴더 목록을 반환하고 시딩한다', async () => {
    const { service, prisma } = makeService();
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.systemSetting.create as jest.Mock).mockResolvedValue(
      makeSystemSetting(EXCLUDED_FOLDERS_KEY, DEFAULT_EXCLUDED_FOLDERS)
    );

    const result = await service.getExcludedFolders();

    expect(result).toEqual(DEFAULT_EXCLUDED_FOLDERS);
    expect(prisma.systemSetting.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ key: EXCLUDED_FOLDERS_KEY }),
      })
    );
  });

  it('DB에 설정이 있으면 저장된 제외 폴더 목록을 반환한다', async () => {
    const { service, prisma } = makeService();
    const customFolders = ['폴더A', '폴더B'];
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(
      makeSystemSetting(EXCLUDED_FOLDERS_KEY, customFolders)
    );

    const result = await service.getExcludedFolders();

    expect(result).toEqual(customFolders);
  });

  it('TTL 내 두 번째 호출은 캐시를 반환하고 DB를 다시 조회하지 않는다', async () => {
    const { service, prisma } = makeService();
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(
      makeSystemSetting(EXCLUDED_FOLDERS_KEY, DEFAULT_EXCLUDED_FOLDERS)
    );

    await service.getExcludedFolders();
    await service.getExcludedFolders();

    expect(prisma.systemSetting.findUnique).toHaveBeenCalledTimes(1);
  });

  it('TTL 만료 후에는 DB를 다시 조회한다', async () => {
    jest.useFakeTimers();

    const { service, prisma } = makeService();
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(
      makeSystemSetting(EXCLUDED_FOLDERS_KEY, DEFAULT_EXCLUDED_FOLDERS)
    );

    await service.getExcludedFolders();

    jest.advanceTimersByTime(60_001);

    await service.getExcludedFolders();

    expect(prisma.systemSetting.findUnique).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  it('동시 시딩 시 create가 거부되어도 예외를 던지지 않는다', async () => {
    const { service, prisma } = makeService();
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.systemSetting.create as jest.Mock).mockRejectedValue(
      new Error('Unique constraint failed')
    );

    await expect(service.getExcludedFolders()).resolves.toEqual(DEFAULT_EXCLUDED_FOLDERS);
  });
});

// ============================================================
// updateExcludedFolders
// ============================================================

describe('WebhardConfigService.updateExcludedFolders', () => {
  it('제외 폴더 목록을 DB에 upsert하고 캐시를 무효화한다', async () => {
    const { service, prisma } = makeService();
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(
      makeSystemSetting(EXCLUDED_FOLDERS_KEY, DEFAULT_EXCLUDED_FOLDERS)
    );
    (prisma.systemSetting.upsert as jest.Mock).mockResolvedValue(
      makeSystemSetting(EXCLUDED_FOLDERS_KEY, [])
    );

    // 먼저 캐시를 채운다
    await service.getExcludedFolders();
    expect(prisma.systemSetting.findUnique).toHaveBeenCalledTimes(1);

    const newFolders = ['새폴더1', '새폴더2'];
    const updateResult = await service.updateExcludedFolders(newFolders);

    expect(updateResult).toEqual({ success: true });
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: EXCLUDED_FOLDERS_KEY },
        update: expect.objectContaining({ value: newFolders }),
        create: expect.objectContaining({ key: EXCLUDED_FOLDERS_KEY }),
      })
    );

    // 캐시가 무효화됐으므로 다음 조회는 DB를 다시 읽어야 한다
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(
      makeSystemSetting(EXCLUDED_FOLDERS_KEY, newFolders)
    );

    await service.getExcludedFolders();
    expect(prisma.systemSetting.findUnique).toHaveBeenCalledTimes(2);
  });
});

// ============================================================
// classifyByFolderPath
// ============================================================

describe('WebhardConfigService.classifyByFolderPath', () => {
  function setupWithDefaultMappings(prisma: ReturnType<typeof makePrisma>) {
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(
      makeSystemSetting(STATUS_MAPPING_KEY, DEFAULT_MAPPINGS)
    );
  }

  it('"올리기전용/목형의뢰"는 "목형의뢰" 세그먼트가 정확히 매칭되어 "mold_request"를 반환한다', async () => {
    const { service, prisma } = makeService();
    setupWithDefaultMappings(prisma);

    const result = await service.classifyByFolderPath('올리기전용/목형의뢰');

    expect(result).toBe('mold_request');
  });

  it('"올리기전용/칼선의뢰"는 "칼선의뢰" 세그먼트가 정확히 매칭되어 "cutting_request"를 반환한다', async () => {
    const { service, prisma } = makeService();
    setupWithDefaultMappings(prisma);

    const result = await service.classifyByFolderPath('올리기전용/칼선의뢰');

    expect(result).toBe('cutting_request');
  });

  it('"새목형의뢰"는 "목형의뢰"와 부분 일치이므로 null을 반환한다', async () => {
    const { service, prisma } = makeService();
    setupWithDefaultMappings(prisma);

    const result = await service.classifyByFolderPath('올리기전용/새목형의뢰');

    expect(result).toBeNull();
  });

  it('"목형의뢰추가"는 "목형의뢰"와 부분 일치이므로 null을 반환한다', async () => {
    const { service, prisma } = makeService();
    setupWithDefaultMappings(prisma);

    const result = await service.classifyByFolderPath('올리기전용/목형의뢰추가');

    expect(result).toBeNull();
  });

  it('폴더명만 단독으로 전달되어도 정확히 매칭된다', async () => {
    const { service, prisma } = makeService();
    setupWithDefaultMappings(prisma);

    const result = await service.classifyByFolderPath('목형의뢰');

    expect(result).toBe('mold_request');
  });

  it('매칭되는 세그먼트가 없으면 null을 반환한다', async () => {
    const { service, prisma } = makeService();
    setupWithDefaultMappings(prisma);

    const result = await service.classifyByFolderPath('올리기전용/박스메이커스/알수없는폴더');

    expect(result).toBeNull();
  });

  it('빈 문자열 경로는 null을 반환한다', async () => {
    const { service, prisma } = makeService();
    setupWithDefaultMappings(prisma);

    const result = await service.classifyByFolderPath('');

    expect(result).toBeNull();
  });

  it('세그먼트 앞뒤 공백을 트리밍하여 매칭한다', async () => {
    const { service, prisma } = makeService();
    setupWithDefaultMappings(prisma);

    const result = await service.classifyByFolderPath('올리기전용/ 목형의뢰 ');

    expect(result).toBe('mold_request');
  });
});

// ============================================================
// getStatusForInquiryType
// ============================================================

describe('WebhardConfigService.getStatusForInquiryType', () => {
  function setupWithDefaultMappings(prisma: ReturnType<typeof makePrisma>) {
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(
      makeSystemSetting(STATUS_MAPPING_KEY, DEFAULT_MAPPINGS)
    );
  }

  it('"mold_request"는 status="confirmed", processStage="drawing_confirmed"를 반환한다', async () => {
    const { service, prisma } = makeService();
    setupWithDefaultMappings(prisma);

    const result = await service.getStatusForInquiryType('mold_request');

    expect(result).toEqual({ status: 'confirmed', processStage: 'drawing_confirmed' });
  });

  it('"cutting_request"는 status="drawing", processStage="drawing"를 반환한다', async () => {
    const { service, prisma } = makeService();
    setupWithDefaultMappings(prisma);

    const result = await service.getStatusForInquiryType('cutting_request');

    expect(result).toEqual({ status: 'drawing', processStage: 'drawing' });
  });

  it('알 수 없는 inquiryType은 status="received", processStage=null을 반환한다', async () => {
    const { service, prisma } = makeService();
    setupWithDefaultMappings(prisma);

    const result = await service.getStatusForInquiryType('unknown_type');

    expect(result).toEqual({ status: 'received', processStage: null });
  });

  it('inquiryType이 null이면 status="received", processStage=null을 반환한다', async () => {
    const { service, prisma } = makeService();

    const result = await service.getStatusForInquiryType(null);

    // null이면 DB 조회 없이 즉시 반환
    expect(prisma.systemSetting.findUnique).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'received', processStage: null });
  });
});

// ============================================================
// validateMappings (private → getStoredMappings를 통해 간접 테스트)
// ============================================================

describe('WebhardConfigService - validateMappings', () => {
  it('배열이 아닌 값이 DB에 저장돼 있으면 기본값을 반환한다', async () => {
    const { service, prisma } = makeService();
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(
      makeSystemSetting(STATUS_MAPPING_KEY, 'not_an_array')
    );

    const result = await service.getStoredMappings();

    expect(result).toEqual(DEFAULT_MAPPINGS);
  });

  it('배열 요소 중 유효하지 않은 항목(folderName/processStage 누락)은 필터링된다', async () => {
    const { service, prisma } = makeService();
    const mixedData = [
      { folderName: '유효폴더', processStage: 'drawing' },
      { folderName: '누락processStage' },
      { processStage: 'drawing' },
      null,
      42,
      { folderName: 123, processStage: 'drawing' },
    ];
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(
      makeSystemSetting(STATUS_MAPPING_KEY, mixedData)
    );

    const result = await service.getStoredMappings();

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ folderName: '유효폴더', processStage: 'drawing' });
  });

  it('빈 배열이 저장돼 있으면 빈 배열을 반환한다', async () => {
    const { service, prisma } = makeService();
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(
      makeSystemSetting(STATUS_MAPPING_KEY, [])
    );

    const result = await service.getStoredMappings();

    expect(result).toEqual([]);
  });
});

// ============================================================
// validateStringArray (private → getExcludedFolders를 통해 간접 테스트)
// ============================================================

describe('WebhardConfigService - validateStringArray', () => {
  it('배열이 아닌 값이 DB에 저장돼 있으면 기본 제외 폴더 목록을 반환한다', async () => {
    const { service, prisma } = makeService();
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(
      makeSystemSetting(EXCLUDED_FOLDERS_KEY, { invalid: true })
    );

    const result = await service.getExcludedFolders();

    expect(result).toEqual(DEFAULT_EXCLUDED_FOLDERS);
  });

  it('배열 요소 중 문자열이 아닌 항목은 필터링된다', async () => {
    const { service, prisma } = makeService();
    const mixedData = ['유효폴더', 42, null, true, '다른폴더', { name: '객체' }];
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(
      makeSystemSetting(EXCLUDED_FOLDERS_KEY, mixedData)
    );

    const result = await service.getExcludedFolders();

    expect(result).toEqual(['유효폴더', '다른폴더']);
  });

  it('빈 배열이 저장돼 있으면 빈 배열을 반환한다', async () => {
    const { service, prisma } = makeService();
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(
      makeSystemSetting(EXCLUDED_FOLDERS_KEY, [])
    );

    const result = await service.getExcludedFolders();

    expect(result).toEqual([]);
  });
});

// ============================================================
// isAutoContactExcluded
// ============================================================

describe('WebhardConfigService.isAutoContactExcluded', () => {
  it('경로 세그먼트에 제외 폴더명이 정확 일치하면 true', async () => {
    const { service, prisma } = makeService();
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(
      makeSystemSetting(AUTO_CONTACT_EXCLUDED_KEY, ['ㄱ 내리기전용'])
    );

    const result = await service.isAutoContactExcluded('/업체A/ㄱ 내리기전용/하위폴더');

    expect(result).toBe(true);
  });

  it('부분 문자열 매칭은 false (정확 일치만)', async () => {
    const { service, prisma } = makeService();
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(
      makeSystemSetting(AUTO_CONTACT_EXCLUDED_KEY, ['ㄱ 내리기전용'])
    );

    const result = await service.isAutoContactExcluded('/업체A/ㄱ 내리기전용2/파일');

    expect(result).toBe(false);
  });

  it('제외 목록에 없는 경로는 false', async () => {
    const { service, prisma } = makeService();
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(
      makeSystemSetting(AUTO_CONTACT_EXCLUDED_KEY, ['ㄱ 내리기전용'])
    );

    const result = await service.isAutoContactExcluded('/업체A/칼선의뢰');

    expect(result).toBe(false);
  });

  it('DB 미설정 시 기본값 ["ㄱ 내리기전용"] 사용', async () => {
    const { service, prisma } = makeService();
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.systemSetting.create as jest.Mock).mockResolvedValue(
      makeSystemSetting(AUTO_CONTACT_EXCLUDED_KEY, ['ㄱ 내리기전용'])
    );

    const result = await service.isAutoContactExcluded('/업체A/ㄱ 내리기전용');

    expect(result).toBe(true);
    // 기본값 시딩 확인
    expect(prisma.systemSetting.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ key: AUTO_CONTACT_EXCLUDED_KEY }),
      })
    );
  });
});
