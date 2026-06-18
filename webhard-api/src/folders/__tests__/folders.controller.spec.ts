/**
 * FoldersController E2E 테스트
 * Phase 3: 웹하드 ORM 위반 전환 후 폴더 CRUD 엔드포인트 검증
 *
 * 테스트 전략: Controller 레이어를 직접 테스트하며,
 * FoldersService를 mock하여 인터페이스 계약만 검증
 */

import { BadRequestException } from '@nestjs/common';
import { FoldersController } from '../folders.controller';
import { FoldersService } from '../folders.service';
import { WebhardConfigService } from '../webhard-config.service';
import { SessionUser } from '../../auth/auth.service';
import {
  FolderResponseDto,
  FolderListResponseDto,
  FolderTreeNodeDto,
  FolderDetailResponseDto,
  GetFoldersQueryDto,
  CreateFolderDto,
  RenameFolderDto,
  MoveFolderDto,
  BatchDeleteFoldersDto,
  BatchDeleteStatsResponseDto,
  BatchDeleteResultResponseDto,
} from '../dto/folder.dto';

// ============================================================
// Mock factories
// ============================================================

function makeAdminUser(): SessionUser {
  return {
    userType: 'admin',
    userId: 'admin-1',
    companyId: null,
  };
}

function makeCompanyUser(companyId = 123): SessionUser {
  return {
    userType: 'company',
    userId: `company-${companyId}`,
    companyId,
  };
}

function makeFolderResponse(overrides: Partial<FolderResponseDto> = {}): FolderResponseDto {
  return {
    id: 'folder-uuid-1',
    name: '올리기전용',
    parent_id: null,
    company_id: null,
    path: '/올리기전용',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

function makeFolderTreeNode(overrides: Partial<FolderTreeNodeDto> = {}): FolderTreeNodeDto {
  return {
    id: 'folder-uuid-1',
    name: '올리기전용',
    parent_id: null,
    children: [],
    file_count: 0,
    undownloaded_count: 0,
    ...overrides,
  };
}

// ============================================================
// Test Suite
// ============================================================

describe('FoldersController', () => {
  let controller: FoldersController;
  let foldersService: jest.Mocked<FoldersService>;

  beforeEach(() => {
    foldersService = {
      getFolders: jest.fn(),
      getFolderTree: jest.fn(),
      getChildFolders: jest.fn(),
      getBatchDeleteStats: jest.fn(),
      batchDeleteFolders: jest.fn(),
      getAncestors: jest.fn(),
      getFolderDetail: jest.fn(),
      createFolder: jest.fn(),
      renameFolder: jest.fn(),
      moveFolder: jest.fn(),
      deleteFolder: jest.fn(),
    } as unknown as jest.Mocked<FoldersService>;

    const webhardConfigService = {} as unknown as jest.Mocked<WebhardConfigService>;
    controller = new FoldersController(foldersService, webhardConfigService);
  });

  // ─── GET /folders ──────────────────────────────────────────

  describe('getFolders', () => {
    it('관리자가 전체 폴더 목록을 조회할 수 있어야 함', async () => {
      const query: GetFoldersQueryDto = {};
      const user = makeAdminUser();
      const expectedResponse: FolderListResponseDto = {
        folders: [makeFolderResponse()],
        total: 1,
      };

      foldersService.getFolders.mockResolvedValue(expectedResponse);

      const result = await controller.getFolders(query, user);

      expect(foldersService.getFolders).toHaveBeenCalledWith(query, user);
      expect(result).toEqual(expectedResponse);
    });

    it('상위 폴더 ID로 하위 폴더를 조회할 수 있어야 함', async () => {
      const query: GetFoldersQueryDto = {
        parentId: 'parent-uuid-1',
        includeFileCounts: true,
      };
      const user = makeAdminUser();
      const childFolder = makeFolderResponse({
        id: 'child-uuid-1',
        name: '하위폴더',
        parent_id: 'parent-uuid-1',
        file_count: 5,
      });
      const expectedResponse: FolderListResponseDto = {
        folders: [childFolder],
        total: 1,
      };

      foldersService.getFolders.mockResolvedValue(expectedResponse);

      const result = await controller.getFolders(query, user);

      expect(result.folders[0].parent_id).toBe('parent-uuid-1');
      expect(result.folders[0].file_count).toBe(5);
    });

    it('회사별로 폴더를 조회할 수 있어야 함', async () => {
      const query: GetFoldersQueryDto = { companyId: 123 };
      const user = makeCompanyUser();
      const expectedResponse: FolderListResponseDto = {
        folders: [makeFolderResponse({ company_id: 123 })],
        total: 1,
      };

      foldersService.getFolders.mockResolvedValue(expectedResponse);

      const result = await controller.getFolders(query, user);

      expect(foldersService.getFolders).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: 123 }),
        user
      );
      expect(result.folders[0].company_id).toBe(123);
    });
  });

  // ─── GET /folders/tree ─────────────────────────────────────

  describe('getFolderTree', () => {
    it('전체 폴더 트리를 조회할 수 있어야 함', async () => {
      const user = makeAdminUser();
      const treeNodes: FolderTreeNodeDto[] = [
        makeFolderTreeNode({
          children: [
            makeFolderTreeNode({
              id: 'child-uuid-1',
              name: '하위폴더',
              parent_id: 'folder-uuid-1',
            }),
          ],
        }),
      ];

      foldersService.getFolderTree.mockResolvedValue(treeNodes);

      const result = await controller.getFolderTree(user);

      expect(foldersService.getFolderTree).toHaveBeenCalledWith(user);
      expect(result).toEqual(treeNodes);
      expect(result[0].children).toHaveLength(1);
    });
  });

  // ─── GET /folders/children ─────────────────────────────────

  describe('getChildFolders', () => {
    it('지정 폴더의 하위 폴더를 지연 로딩할 수 있어야 함', async () => {
      const user = makeAdminUser();
      const parentId = 'parent-uuid-1';
      const children = [
        makeFolderResponse({ id: 'child-1', parent_id: parentId }),
        makeFolderResponse({ id: 'child-2', parent_id: parentId }),
      ];

      foldersService.getChildFolders.mockResolvedValue(children);

      const result = await controller.getChildFolders(parentId, user);

      expect(foldersService.getChildFolders).toHaveBeenCalledWith(parentId, user);
      expect(result).toHaveLength(2);
    });

    it('parentId가 없으면 루트 폴더를 반환해야 함', async () => {
      const user = makeAdminUser();
      const rootFolders = [makeFolderResponse()];

      foldersService.getChildFolders.mockResolvedValue(rootFolders);

      const result = await controller.getChildFolders(undefined, user);

      expect(foldersService.getChildFolders).toHaveBeenCalledWith(null, user);
      expect(result).toHaveLength(1);
    });

    it('parentId가 빈 문자열이면 null로 변환해야 함', async () => {
      const user = makeAdminUser();

      foldersService.getChildFolders.mockResolvedValue([]);

      await controller.getChildFolders('', user);

      expect(foldersService.getChildFolders).toHaveBeenCalledWith(null, user);
    });
  });

  // ─── GET /folders/batch-delete (stats) ─────────────────────

  describe('getBatchDeleteStats', () => {
    it('배치 삭제 통계를 조회할 수 있어야 함', async () => {
      const user = makeAdminUser();
      const folderIds = '550e8400-e29b-41d4-a716-446655440000,550e8400-e29b-41d4-a716-446655440001';
      const expectedStats: BatchDeleteStatsResponseDto = {
        folderCount: 2,
        fileCount: 10,
      };

      foldersService.getBatchDeleteStats.mockResolvedValue(expectedStats);

      const result = await controller.getBatchDeleteStats(folderIds, user);

      expect(foldersService.getBatchDeleteStats).toHaveBeenCalledWith(
        ['550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440001'],
        user
      );
      expect(result).toEqual(expectedStats);
    });

    it('유효하지 않은 UUID는 필터링되어야 함', async () => {
      const user = makeAdminUser();
      const folderIds = '550e8400-e29b-41d4-a716-446655440000,invalid-id,not-uuid';
      const expectedStats: BatchDeleteStatsResponseDto = {
        folderCount: 1,
        fileCount: 5,
      };

      foldersService.getBatchDeleteStats.mockResolvedValue(expectedStats);

      const result = await controller.getBatchDeleteStats(folderIds, user);

      // 유효한 UUID만 전달
      expect(foldersService.getBatchDeleteStats).toHaveBeenCalledWith(
        ['550e8400-e29b-41d4-a716-446655440000'],
        user
      );
      expect(result).toEqual(expectedStats);
    });

    it('유효한 UUID가 하나도 없으면 BadRequestException이 발생해야 함', async () => {
      const user = makeAdminUser();
      const folderIds = 'invalid-1,invalid-2';

      await expect(controller.getBatchDeleteStats(folderIds, user)).rejects.toThrow(
        BadRequestException
      );
    });
  });

  // ─── DELETE /folders/batch-delete ──────────────────────────

  describe('batchDeleteFolders', () => {
    it('여러 폴더를 일괄 삭제할 수 있어야 함', async () => {
      const user = makeAdminUser();
      const dto: BatchDeleteFoldersDto = {
        folderIds: ['550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440001'],
      };
      const expectedResult: BatchDeleteResultResponseDto = {
        foldersDeleted: 2,
        filesDeleted: 8,
        durationMs: 150,
      };

      foldersService.batchDeleteFolders.mockResolvedValue(expectedResult);

      const result = await controller.batchDeleteFolders(dto, user);

      expect(foldersService.batchDeleteFolders).toHaveBeenCalledWith(dto.folderIds, user);
      expect(result).toEqual(expectedResult);
    });
  });

  // ─── GET /folders/:id/ancestors ────────────────────────────

  describe('getFolderAncestors', () => {
    it('폴더의 조상(breadcrumb)을 조회할 수 있어야 함', async () => {
      const user = makeAdminUser();
      const folderId = '550e8400-e29b-41d4-a716-446655440000';
      const ancestorsResponse = {
        ancestors: [
          makeFolderResponse({ id: 'root-uuid', name: '루트' }),
          makeFolderResponse({ id: 'parent-uuid', name: '상위', parent_id: 'root-uuid' }),
        ],
        current: makeFolderResponse({ id: folderId, name: '현재폴더' }),
      };

      foldersService.getAncestors.mockResolvedValue(ancestorsResponse);

      const result = await controller.getFolderAncestors(folderId, user);

      expect(foldersService.getAncestors).toHaveBeenCalledWith(folderId, user);
      expect(result.ancestors).toHaveLength(2);
      expect(result.current.id).toBe(folderId);
    });
  });

  // ─── GET /folders/:id ──────────────────────────────────────

  describe('getFolderDetail', () => {
    it('폴더 상세 정보(하위 폴더 + 파일 포함)를 조회할 수 있어야 함', async () => {
      const user = makeAdminUser();
      const folderId = '550e8400-e29b-41d4-a716-446655440000';
      const detail: FolderDetailResponseDto = {
        ...makeFolderResponse({ id: folderId }),
        subfolders: [makeFolderResponse({ id: 'sub-1', parent_id: folderId })],
        files: [
          {
            id: 'file-1',
            name: 'test.dxf',
            original_name: 'test.dxf',
            size: 1024,
            mime_type: 'application/octet-stream',
            is_downloaded: false,
            created_at: '2026-03-19T00:00:00.000Z',
          },
        ],
      };

      foldersService.getFolderDetail.mockResolvedValue(detail);

      const result = await controller.getFolderDetail(folderId, user);

      expect(foldersService.getFolderDetail).toHaveBeenCalledWith(folderId, user);
      expect(result.subfolders).toHaveLength(1);
      expect(result.files).toHaveLength(1);
    });
  });

  // ─── POST /folders ─────────────────────────────────────────

  describe('createFolder', () => {
    it('새 폴더를 생성할 수 있어야 함', async () => {
      const user = makeAdminUser();
      const dto: CreateFolderDto = {
        name: '새폴더',
        parentId: 'parent-uuid-1',
      };
      const createdFolder = makeFolderResponse({
        id: 'new-folder-uuid',
        name: '새폴더',
        parent_id: 'parent-uuid-1',
      });

      foldersService.createFolder.mockResolvedValue(createdFolder);

      const result = await controller.createFolder(dto, user);

      expect(foldersService.createFolder).toHaveBeenCalledWith(dto, user);
      expect(result.name).toBe('새폴더');
      expect(result.parent_id).toBe('parent-uuid-1');
    });

    it('루트에 폴더를 생성할 수 있어야 함 (parentId 없음)', async () => {
      const user = makeAdminUser();
      const dto: CreateFolderDto = { name: '루트폴더' };
      const createdFolder = makeFolderResponse({
        id: 'root-folder-uuid',
        name: '루트폴더',
      });

      foldersService.createFolder.mockResolvedValue(createdFolder);

      const result = await controller.createFolder(dto, user);

      expect(result.parent_id).toBeNull();
    });

    it('회사 사용자가 회사 전용 폴더를 생성할 수 있어야 함', async () => {
      const user = makeCompanyUser();
      const dto: CreateFolderDto = {
        name: '업체폴더',
        companyId: 123,
      };
      const createdFolder = makeFolderResponse({
        name: '업체폴더',
        company_id: 123,
      });

      foldersService.createFolder.mockResolvedValue(createdFolder);

      const result = await controller.createFolder(dto, user);

      expect(result.company_id).toBe(123);
    });
  });

  // ─── PATCH /folders/:id/rename ─────────────────────────────

  describe('renameFolder', () => {
    it('폴더 이름을 변경할 수 있어야 함', async () => {
      const user = makeAdminUser();
      const folderId = '550e8400-e29b-41d4-a716-446655440000';
      const dto: RenameFolderDto = { name: '새이름' };
      const renamedFolder = makeFolderResponse({ name: '새이름' });

      foldersService.renameFolder.mockResolvedValue(renamedFolder);

      const result = await controller.renameFolder(folderId, dto, user);

      expect(foldersService.renameFolder).toHaveBeenCalledWith(folderId, dto, user);
      expect(result.name).toBe('새이름');
    });
  });

  // ─── PATCH /folders/:id/move ───────────────────────────────

  describe('moveFolder', () => {
    it('폴더를 다른 폴더로 이동할 수 있어야 함', async () => {
      const user = makeAdminUser();
      const folderId = '550e8400-e29b-41d4-a716-446655440000';
      const dto: MoveFolderDto = { parentId: 'new-parent-uuid' };
      const movedFolder = makeFolderResponse({ parent_id: 'new-parent-uuid' });

      foldersService.moveFolder.mockResolvedValue(movedFolder);

      const result = await controller.moveFolder(folderId, dto, user);

      expect(foldersService.moveFolder).toHaveBeenCalledWith(folderId, dto, user);
      expect(result.parent_id).toBe('new-parent-uuid');
    });

    it('폴더를 루트로 이동할 수 있어야 함', async () => {
      const user = makeAdminUser();
      const folderId = '550e8400-e29b-41d4-a716-446655440000';
      const dto: MoveFolderDto = { parentId: null };
      const movedFolder = makeFolderResponse({ parent_id: null });

      foldersService.moveFolder.mockResolvedValue(movedFolder);

      const result = await controller.moveFolder(folderId, dto, user);

      expect(result.parent_id).toBeNull();
    });
  });

  // ─── DELETE /folders/:id ───────────────────────────────────

  describe('deleteFolder', () => {
    it('폴더를 소프트 삭제할 수 있어야 함', async () => {
      const user = makeAdminUser();
      const folderId = '550e8400-e29b-41d4-a716-446655440000';

      foldersService.deleteFolder.mockResolvedValue(undefined);

      const result = await controller.deleteFolder(folderId, user);

      expect(foldersService.deleteFolder).toHaveBeenCalledWith(folderId, user);
      expect(result).toEqual({ success: true });
    });
  });
});
