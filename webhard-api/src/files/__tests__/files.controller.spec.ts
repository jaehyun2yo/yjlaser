/**
 * FilesController E2E 테스트
 * Phase 3: 웹하드 ORM 위반 전환 후 파일 CRUD 엔드포인트 검증
 *
 * 테스트 전략: Controller 레이어를 직접 테스트하며,
 * Service/Storage/Zip을 mock하여 인터페이스 계약만 검증
 */

import { ForbiddenException } from '@nestjs/common';
import { FilesController } from '../files.controller';
import { FilesService } from '../files.service';
import { StorageService } from '../../storage/storage.service';
import { ZipService } from '../zip.service';
import { SessionUser } from '../../auth/auth.service';
import type { CurrentIntegrationPrincipalValue } from '../../integration/auth/current-integration-principal.decorator';
import {
  FileResponseDto,
  FileListResponseDto,
  GetFilesQueryDto,
  SearchFilesQueryDto,
  CreatePresignedUrlDto,
  ConfirmUploadDto,
  BatchConfirmUploadDto,
  RenameFileDto,
  MoveFileDto,
  BatchMoveFilesDto,
  BatchDeleteFilesDto,
} from '../dto/file.dto';

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

function asSessionPrincipal(user: SessionUser): CurrentIntegrationPrincipalValue {
  return {
    mode: user.userType === 'admin' ? 'admin_session' : 'company_session',
    user,
  };
}

function makeFileResponse(overrides: Partial<FileResponseDto> = {}): FileResponseDto {
  return {
    id: 'file-uuid-1',
    name: 'test.dxf',
    original_name: 'test.dxf',
    size: 1024,
    mime_type: 'application/octet-stream',
    path: 'webhard/admin/test.dxf',
    folder_id: null,
    company_id: null,
    uploaded_by: 'admin',
    inquiry_number: null,
    is_downloaded: false,
    created_at: '2026-03-19T00:00:00.000Z',
    updated_at: '2026-03-19T00:00:00.000Z',
    deleted_at: null,
    deleted_by: null,
    ...overrides,
  };
}

function makeFileListResponse(
  files: FileResponseDto[] = [makeFileResponse()],
  overrides: Partial<FileListResponseDto> = {}
): FileListResponseDto {
  return {
    files,
    total: files.length,
    page: 1,
    limit: 50,
    hasMore: false,
    ...overrides,
  };
}

// ============================================================
// Test Suite
// ============================================================

describe('FilesController', () => {
  let controller: FilesController;
  let filesService: jest.Mocked<FilesService>;
  let storageService: jest.Mocked<StorageService>;
  let zipService: jest.Mocked<ZipService>;

  beforeEach(() => {
    filesService = {
      getFiles: jest.fn(),
      searchFiles: jest.fn(),
      getBadgeCounts: jest.fn(),
      getNewFiles: jest.fn(),
      markDownloaded: jest.fn(),
      getUploadPresignedUrl: jest.fn(),
      getBatchUploadPresignedUrls: jest.fn(),
      confirmUpload: jest.fn(),
      batchConfirmUpload: jest.fn(),
      getDownloadUrl: jest.fn(),
      renameFile: jest.fn(),
      moveFile: jest.fn(),
      batchMoveFiles: jest.fn(),
      deleteFile: jest.fn(),
      batchDeleteFiles: jest.fn(),
      getFilesForZip: jest.fn(),
    } as unknown as jest.Mocked<FilesService>;

    storageService = {
      generateStoragePath: jest.fn(),
      getUploadPresignedUrl: jest.fn(),
      getDownloadPresignedUrl: jest.fn(),
      initiateMultipartUpload: jest.fn(),
      getMultipartPresignedUrl: jest.fn(),
      completeMultipartUpload: jest.fn(),
      abortMultipartUpload: jest.fn(),
    } as unknown as jest.Mocked<StorageService>;

    zipService = {
      createZipStream: jest.fn(),
    } as unknown as jest.Mocked<ZipService>;

    controller = new FilesController(filesService, storageService, zipService);
  });

  // ─── GET /files ────────────────────────────────────────────

  describe('getFiles', () => {
    it('관리자가 전체 파일 목록을 조회할 수 있어야 함', async () => {
      const query: GetFilesQueryDto = { page: 1, limit: 50 };
      const user = makeAdminUser();
      const expectedResponse = makeFileListResponse();

      filesService.getFiles.mockResolvedValue(expectedResponse);

      const result = await controller.getFiles(query, asSessionPrincipal(user));

      expect(filesService.getFiles).toHaveBeenCalledWith(query, user);
      expect(result).toEqual(expectedResponse);
    });

    it('회사 사용자가 폴더별 파일을 조회할 수 있어야 함', async () => {
      const query: GetFilesQueryDto = {
        folderId: 'folder-uuid-1',
        page: 1,
        limit: 20,
      };
      const user = makeCompanyUser();
      const companyFile = makeFileResponse({
        company_id: 123,
        folder_id: 'folder-uuid-1',
      });
      const expectedResponse = makeFileListResponse([companyFile]);

      filesService.getFiles.mockResolvedValue(expectedResponse);

      const result = await controller.getFiles(query, asSessionPrincipal(user));

      expect(filesService.getFiles).toHaveBeenCalledWith(query, user);
      expect(result.files[0].company_id).toBe(123);
    });

    it('정렬 옵션을 사용하여 파일을 조회할 수 있어야 함', async () => {
      const query: GetFilesQueryDto = {
        sortBy: 'name',
        sortOrder: 'asc',
        page: 1,
        limit: 50,
      };
      const user = makeAdminUser();
      const expectedResponse = makeFileListResponse();

      filesService.getFiles.mockResolvedValue(expectedResponse);

      await controller.getFiles(query, asSessionPrincipal(user));

      expect(filesService.getFiles).toHaveBeenCalledWith(
        expect.objectContaining({ sortBy: 'name', sortOrder: 'asc' }),
        user
      );
    });
  });

  // ─── GET /files/search ─────────────────────────────────────

  describe('searchFiles', () => {
    it('파일명으로 검색할 수 있어야 함', async () => {
      const query: SearchFilesQueryDto = { query: 'test.dxf', limit: 50 };
      const user = makeAdminUser();
      const expectedFiles = [makeFileResponse()];

      filesService.searchFiles.mockResolvedValue(expectedFiles);

      const result = await controller.searchFiles(query, user);

      expect(filesService.searchFiles).toHaveBeenCalledWith(query, user);
      expect(result).toEqual(expectedFiles);
    });

    it('회사별로 검색 범위를 제한할 수 있어야 함', async () => {
      const query: SearchFilesQueryDto = {
        query: 'doc',
        companyId: 123,
        limit: 10,
      };
      const user = makeCompanyUser();

      filesService.searchFiles.mockResolvedValue([]);

      await controller.searchFiles(query, user);

      expect(filesService.searchFiles).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: 123 }),
        user
      );
    });
  });

  // ─── GET /files/badge-counts ───────────────────────────────

  describe('getBadgeCounts', () => {
    it('미다운로드 파일 수를 조회할 수 있어야 함', async () => {
      const user = makeCompanyUser();
      const expectedCounts = {
        totalCount: 5,
        companyId: 123,
        folderCounts: { 'folder-1': 3, 'folder-2': 2 },
      };

      filesService.getBadgeCounts.mockResolvedValue(expectedCounts);

      const result = await controller.getBadgeCounts({}, user);

      expect(filesService.getBadgeCounts).toHaveBeenCalledWith({}, user);
      expect(result).toEqual(expectedCounts);
    });
  });

  // ─── GET /files/new ────────────────────────────────────────

  describe('getNewFiles', () => {
    it('새 파일(미다운로드) 목록을 조회할 수 있어야 함', async () => {
      const user = makeCompanyUser();
      const newFilesResponse = {
        files: [
          {
            ...makeFileResponse({ is_downloaded: false }),
            folder_path: null,
            uploader_display_name: 'admin',
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
        hasMore: false,
      };

      filesService.getNewFiles.mockResolvedValue(newFilesResponse);

      const result = await controller.getNewFiles({}, user);

      expect(filesService.getNewFiles).toHaveBeenCalledWith({}, user);
      expect(result).toEqual(newFilesResponse);
    });
  });

  // ─── POST /files/mark-downloaded ───────────────────────────

  describe('markDownloaded', () => {
    it('파일을 다운로드 완료로 표시할 수 있어야 함', async () => {
      const user = makeCompanyUser();
      const dto = { fileIds: ['file-uuid-1', 'file-uuid-2'] };

      filesService.markDownloaded.mockResolvedValue({ success: true, updatedCount: 2 });

      const result = await controller.markDownloaded(dto, user);

      expect(filesService.markDownloaded).toHaveBeenCalledWith(dto, user);
      expect(result).toEqual({ success: true, updatedCount: 2 });
    });
  });

  // ─── POST /files/presigned-url ─────────────────────────────

  describe('getPresignedUrl', () => {
    it('업로드용 presigned URL을 생성할 수 있어야 함', async () => {
      const user = makeAdminUser();
      const dto: CreatePresignedUrlDto = {
        filename: 'upload.dxf',
        contentType: 'application/octet-stream',
      };
      const expectedUrl = {
        url: 'https://r2/upload',
        key: 'webhard/admin/upload.dxf',
        expiresAt: new Date().toISOString(),
      };

      filesService.getUploadPresignedUrl.mockResolvedValue(expectedUrl);

      const result = await controller.getPresignedUrl(dto, asSessionPrincipal(user));

      expect(filesService.getUploadPresignedUrl).toHaveBeenCalledWith(dto, user);
      expect(result).toEqual(expectedUrl);
    });
  });

  // ─── POST /files/confirm ──────────────────────────────────

  describe('confirmUpload', () => {
    it('업로드 확인 후 파일 메타데이터를 저장할 수 있어야 함', async () => {
      const user = makeAdminUser();
      const dto: ConfirmUploadDto = {
        key: 'webhard/admin/test.dxf',
        name: 'test.dxf',
        originalName: 'test.dxf',
        size: 1024,
        mimeType: 'application/octet-stream',
        folderId: 'folder-uuid-1',
      };
      const savedFile = makeFileResponse({ folder_id: 'folder-uuid-1' });

      filesService.confirmUpload.mockResolvedValue(savedFile);

      const result = await controller.confirmUpload(dto, asSessionPrincipal(user));

      expect(filesService.confirmUpload).toHaveBeenCalledWith(dto, user);
      expect(result).toEqual(savedFile);
    });
  });

  // ─── POST /files/batch/confirm ─────────────────────────────

  describe('batchConfirmUpload', () => {
    it('배치 업로드를 확인할 수 있어야 함 (최대 500개)', async () => {
      const user = makeAdminUser();
      const dto: BatchConfirmUploadDto = {
        files: [
          {
            key: 'webhard/admin/file1.dxf',
            name: 'file1.dxf',
            originalName: 'file1.dxf',
            size: 1024,
            mimeType: 'application/octet-stream',
          },
          {
            key: 'webhard/admin/file2.dxf',
            name: 'file2.dxf',
            originalName: 'file2.dxf',
            size: 2048,
            mimeType: 'application/octet-stream',
          },
        ],
      };
      const expectedResult = {
        success: 2,
        failed: 0,
        errors: [] as string[],
        results: [
          { fileName: 'file1.dxf', success: true },
          { fileName: 'file2.dxf', success: true },
        ],
      };

      filesService.batchConfirmUpload.mockResolvedValue(expectedResult);

      const result = await controller.batchConfirmUpload(dto, user);

      expect(filesService.batchConfirmUpload).toHaveBeenCalledWith(dto, user);
      expect(result).toEqual(expectedResult);
    });
  });

  // ─── GET /files/:id/download ───────────────────────────────

  describe('getDownloadUrl', () => {
    it('파일 다운로드 URL을 생성할 수 있어야 함', async () => {
      const user = makeAdminUser();
      const fileId = '550e8400-e29b-41d4-a716-446655440000';
      const expectedUrl = {
        url: 'https://r2/download',
        key: 'webhard/admin/test.dxf',
        expiresAt: new Date().toISOString(),
      };

      filesService.getDownloadUrl.mockResolvedValue(expectedUrl);

      const result = await controller.getDownloadUrl(fileId, user);

      expect(filesService.getDownloadUrl).toHaveBeenCalledWith(fileId, user);
      expect(result).toEqual(expectedUrl);
    });
  });

  // ─── PATCH /files/:id/rename ───────────────────────────────

  describe('renameFile', () => {
    it('파일 이름을 변경할 수 있어야 함', async () => {
      const user = makeAdminUser();
      const fileId = '550e8400-e29b-41d4-a716-446655440000';
      const dto: RenameFileDto = { name: 'renamed.dxf' };
      const renamedFile = makeFileResponse({ name: 'renamed.dxf' });

      filesService.renameFile.mockResolvedValue(renamedFile);

      const result = await controller.renameFile(fileId, dto, asSessionPrincipal(user));

      expect(filesService.renameFile).toHaveBeenCalledWith(fileId, dto, user);
      expect(result).toEqual(renamedFile);
    });
  });

  // ─── PATCH /files/:id/move ─────────────────────────────────

  describe('moveFile', () => {
    it('파일을 다른 폴더로 이동할 수 있어야 함', async () => {
      const user = makeAdminUser();
      const fileId = '550e8400-e29b-41d4-a716-446655440000';
      const dto: MoveFileDto = { folderId: 'folder-uuid-2' };
      const movedFile = makeFileResponse({ folder_id: 'folder-uuid-2' });

      filesService.moveFile.mockResolvedValue(movedFile);

      const result = await controller.moveFile(fileId, dto, asSessionPrincipal(user));

      expect(filesService.moveFile).toHaveBeenCalledWith(fileId, dto, user);
      expect(result).toEqual(movedFile);
    });

    it('파일을 루트로 이동할 수 있어야 함 (folderId=null)', async () => {
      const user = makeAdminUser();
      const fileId = '550e8400-e29b-41d4-a716-446655440000';
      const dto: MoveFileDto = { folderId: undefined };
      const movedFile = makeFileResponse({ folder_id: null });

      filesService.moveFile.mockResolvedValue(movedFile);

      const result = await controller.moveFile(fileId, dto, asSessionPrincipal(user));

      expect(result.folder_id).toBeNull();
    });
  });

  // ─── POST /files/batch/move ────────────────────────────────

  describe('batchMoveFiles', () => {
    it('여러 파일을 일괄 이동할 수 있어야 함', async () => {
      const user = makeAdminUser();
      const dto: BatchMoveFilesDto = {
        fileIds: ['file-uuid-1', 'file-uuid-2', 'file-uuid-3'],
        targetFolderId: 'folder-uuid-2',
      };
      const expectedResult = {
        success: true,
        processed: 3,
        failed: 0,
        errors: [] as string[],
        durationMs: 50,
      };

      filesService.batchMoveFiles.mockResolvedValue(expectedResult);

      const result = await controller.batchMoveFiles(dto, user);

      expect(filesService.batchMoveFiles).toHaveBeenCalledWith(dto, user);
      expect(result).toEqual(expectedResult);
    });
  });

  // ─── DELETE /files/:id ─────────────────────────────────────

  describe('deleteFile', () => {
    it('파일을 소프트 삭제(휴지통 이동)할 수 있어야 함', async () => {
      const user = makeAdminUser();
      const fileId = '550e8400-e29b-41d4-a716-446655440000';

      filesService.deleteFile.mockResolvedValue(undefined);

      const result = await controller.deleteFile(fileId, user);

      expect(filesService.deleteFile).toHaveBeenCalledWith(fileId, user);
      expect(result).toEqual({ success: true });
    });
  });

  // ─── POST /files/batch/delete ──────────────────────────────

  describe('batchDeleteFiles', () => {
    it('여러 파일을 일괄 소프트 삭제할 수 있어야 함', async () => {
      const user = makeAdminUser();
      const dto: BatchDeleteFilesDto = {
        fileIds: ['file-uuid-1', 'file-uuid-2'],
      };
      const expectedResult = {
        success: true,
        processed: 2,
        failed: 0,
        errors: [] as string[],
        durationMs: 30,
      };

      filesService.batchDeleteFiles.mockResolvedValue(expectedResult);

      const result = await controller.batchDeleteFiles(dto, user);

      expect(filesService.batchDeleteFiles).toHaveBeenCalledWith(dto, user);
      expect(result).toEqual(expectedResult);
    });
  });

  // ─── Multipart Upload Endpoints ────────────────────────────

  describe('initiateMultipartUpload', () => {
    it('관리자가 멀티파트 업로드를 시작할 수 있어야 함', async () => {
      const user = makeAdminUser();
      const body = { key: 'webhard/admin/large-file.dxf', contentType: 'application/octet-stream' };
      const expectedResult = { uploadId: 'upload-123', key: body.key };

      storageService.initiateMultipartUpload.mockResolvedValue(expectedResult);

      const result = await controller.initiateMultipartUpload(body, user);

      expect(storageService.initiateMultipartUpload).toHaveBeenCalledWith(
        body.key,
        body.contentType
      );
      expect(result).toEqual(expectedResult);
    });

    it('회사 사용자가 자기 경로에만 업로드할 수 있어야 함', async () => {
      const user = makeCompanyUser(123);
      const body = { key: 'webhard/company-123/file.dxf', contentType: 'application/octet-stream' };
      const expectedResult = { uploadId: 'upload-456', key: body.key };

      storageService.initiateMultipartUpload.mockResolvedValue(expectedResult);

      const result = await controller.initiateMultipartUpload(body, user);

      expect(result).toEqual(expectedResult);
    });

    it('회사 사용자가 다른 회사의 경로에 업로드 시 ForbiddenException이 발생해야 함', async () => {
      const user = makeCompanyUser(123);
      const body = { key: 'webhard/company-456/file.dxf', contentType: 'application/octet-stream' };

      await expect(controller.initiateMultipartUpload(body, user)).rejects.toThrow(
        ForbiddenException
      );
    });

    it('회사 사용자가 admin 경로에 업로드 시 ForbiddenException이 발생해야 함', async () => {
      const user = makeCompanyUser(123);
      const body = { key: 'webhard/admin/file.dxf', contentType: 'application/octet-stream' };

      await expect(controller.initiateMultipartUpload(body, user)).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  describe('getMultipartPresignedUrl', () => {
    it('파트별 presigned URL을 생성할 수 있어야 함', async () => {
      const user = makeAdminUser();
      const body = {
        key: 'webhard/admin/large-file.dxf',
        uploadId: 'upload-123',
        partNumber: 1,
      };
      const expectedUrl = 'https://r2/part/1';

      storageService.getMultipartPresignedUrl.mockResolvedValue(expectedUrl);

      const result = await controller.getMultipartPresignedUrl(body, user);

      expect(storageService.getMultipartPresignedUrl).toHaveBeenCalledWith(
        body.key,
        body.uploadId,
        body.partNumber
      );
      expect(result).toEqual({ url: expectedUrl });
    });
  });

  describe('completeMultipartUpload', () => {
    it('멀티파트 업로드를 완료할 수 있어야 함', async () => {
      const user = makeAdminUser();
      const body = {
        key: 'webhard/admin/large-file.dxf',
        uploadId: 'upload-123',
        parts: [
          { PartNumber: 1, ETag: 'etag-1' },
          { PartNumber: 2, ETag: 'etag-2' },
        ],
      };

      storageService.completeMultipartUpload.mockResolvedValue(undefined);

      const result = await controller.completeMultipartUpload(body, user);

      expect(storageService.completeMultipartUpload).toHaveBeenCalledWith(
        body.key,
        body.uploadId,
        body.parts
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('abortMultipartUpload', () => {
    it('멀티파트 업로드를 취소할 수 있어야 함', async () => {
      const user = makeAdminUser();
      const body = {
        key: 'webhard/admin/large-file.dxf',
        uploadId: 'upload-123',
      };

      storageService.abortMultipartUpload.mockResolvedValue(undefined);

      const result = await controller.abortMultipartUpload(body, user);

      expect(storageService.abortMultipartUpload).toHaveBeenCalledWith(body.key, body.uploadId);
      expect(result).toEqual({ success: true });
    });
  });
});
