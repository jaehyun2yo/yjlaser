/**
 * @jest-environment node
 */

import type { FolderStatusMapping, FolderTemplateNode } from '@/lib/api/nestjs-server-client';

jest.mock('@/lib/auth/session', () => ({
  getSessionUser: jest.fn(),
}));

jest.mock('@/lib/api/nestjs-server-client', () => ({
  serverInitializeCompanyFolders: jest.fn(),
  serverGetFolderTemplate: jest.fn(),
  serverUpdateFolderTemplate: jest.fn(),
  serverGetFolderStatusMapping: jest.fn(),
  serverUpdateFolderStatusMapping: jest.fn(),
  serverGetExcludedFolders: jest.fn(),
  serverUpdateExcludedFolders: jest.fn(),
  serverGetAutoContactExcludedFolders: jest.fn(),
  serverUpdateAutoContactExcludedFolders: jest.fn(),
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

import {
  getFolderTemplate,
  initializeCompanyFolders,
  updateAutoContactExcludedFolders,
  updateFolderStatusMapping,
} from '@/app/actions/webhard';
import { getSessionUser } from '@/lib/auth/session';
import {
  serverGetFolderTemplate,
  serverInitializeCompanyFolders,
  serverUpdateAutoContactExcludedFolders,
  serverUpdateFolderStatusMapping,
} from '@/lib/api/nestjs-server-client';

const mockedGetSessionUser = getSessionUser as jest.MockedFunction<typeof getSessionUser>;
const mockedServerInitializeCompanyFolders = serverInitializeCompanyFolders as jest.MockedFunction<
  typeof serverInitializeCompanyFolders
>;
const mockedServerGetFolderTemplate = serverGetFolderTemplate as jest.MockedFunction<
  typeof serverGetFolderTemplate
>;
const mockedServerUpdateFolderStatusMapping =
  serverUpdateFolderStatusMapping as jest.MockedFunction<typeof serverUpdateFolderStatusMapping>;
const mockedServerUpdateAutoContactExcludedFolders =
  serverUpdateAutoContactExcludedFolders as jest.MockedFunction<
    typeof serverUpdateAutoContactExcludedFolders
  >;

const adminUser = { userType: 'admin' as const, userId: 'admin' };
const companyUser = { userType: 'company' as const, userId: 7 };

describe('webhard server actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initializeCompanyFolders', () => {
    it('인증되지 않은 요청은 NestJS 초기화 호출 전에 거부한다', async () => {
      mockedGetSessionUser.mockResolvedValue(null);

      const result = await initializeCompanyFolders(7, '테스트업체');

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
      expect(mockedServerInitializeCompanyFolders).not.toHaveBeenCalled();
    });

    it('다른 업체 세션으로는 폴더 초기화를 실행하지 않는다', async () => {
      mockedGetSessionUser.mockResolvedValue({ userType: 'company', userId: 8 });

      const result = await initializeCompanyFolders(7, '테스트업체');

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
      expect(mockedServerInitializeCompanyFolders).not.toHaveBeenCalled();
    });

    it('동일 업체 세션이면 NestJS 폴더 초기화를 호출한다', async () => {
      mockedGetSessionUser.mockResolvedValue(companyUser);
      mockedServerInitializeCompanyFolders.mockResolvedValue({ success: true });

      const result = await initializeCompanyFolders(7, '테스트업체');

      expect(result).toEqual({ success: true });
      expect(mockedServerInitializeCompanyFolders).toHaveBeenCalledWith(7, '테스트업체');
    });

    it('업체 등록 흐름에서는 명시적으로 인증 검사를 건너뛴다', async () => {
      mockedServerInitializeCompanyFolders.mockResolvedValue({ success: true });

      const result = await initializeCompanyFolders(22, '신규업체', true);

      expect(result).toEqual({ success: true });
      expect(mockedGetSessionUser).not.toHaveBeenCalled();
      expect(mockedServerInitializeCompanyFolders).toHaveBeenCalledWith(22, '신규업체');
    });

    it('NestJS 초기화 실패를 성공으로 숨기지 않는다', async () => {
      mockedGetSessionUser.mockResolvedValue(companyUser);
      mockedServerInitializeCompanyFolders.mockResolvedValue({
        success: false,
        error: 'Drive folder creation failed',
      });

      const result = await initializeCompanyFolders(7, '테스트업체');

      expect(result).toEqual({ success: false, error: 'Drive folder creation failed' });
    });
  });

  describe('configuration actions', () => {
    it('관리자만 폴더 템플릿을 조회할 수 있다', async () => {
      const template: FolderTemplateNode[] = [
        { name: '올리기', children: [{ name: '완료함' }] },
        { name: '내리기' },
      ];
      mockedGetSessionUser.mockResolvedValue(adminUser);
      mockedServerGetFolderTemplate.mockResolvedValue(template);

      const result = await getFolderTemplate();

      expect(result).toEqual({ success: true, template });
      expect(mockedServerGetFolderTemplate).toHaveBeenCalledTimes(1);
    });

    it('업체 세션은 관리자 전용 매핑 수정을 실행할 수 없다', async () => {
      const mappings: FolderStatusMapping[] = [{ folderName: '완료함', processStage: 'completed' }];
      mockedGetSessionUser.mockResolvedValue(companyUser);

      const result = await updateFolderStatusMapping(mappings);

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
      expect(mockedServerUpdateFolderStatusMapping).not.toHaveBeenCalled();
    });

    it('관리자 전용 설정 저장 중 발생한 예외를 실패 응답으로 돌려준다', async () => {
      mockedGetSessionUser.mockResolvedValue(adminUser);
      mockedServerUpdateAutoContactExcludedFolders.mockRejectedValue(
        new Error('config service unavailable')
      );

      const result = await updateAutoContactExcludedFolders(['완료함']);

      expect(result).toEqual({ success: false, error: 'config service unavailable' });
    });
  });
});
