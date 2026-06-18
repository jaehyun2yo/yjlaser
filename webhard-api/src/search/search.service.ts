import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SessionUser } from '../auth/auth.service';
import { SearchQueryDto, SearchResponseDto } from './dto/search.dto';
import { FileResponseDto } from '../files/dto/file.dto';
import { FolderResponseDto } from '../folders/dto/folder.dto';
import { FoldersService } from '../folders/folders.service';

@Injectable()
export class SearchService {
  constructor(
    private prisma: PrismaService,
    private foldersService: FoldersService
  ) {}

  /**
   * Unified search for files and folders
   */
  async search(query: SearchQueryDto, user: SessionUser): Promise<SearchResponseDto> {
    const { q: searchQuery, type = 'all', companyId, limit = 50 } = query;

    // 업체 사용자는 자신의 데이터만 조회 가능
    const effectiveCompanyId = user.userType === 'company' ? user.companyId : companyId;

    // 파일 검색 조건
    const fileWhere: Record<string, unknown> = {
      deletedAt: null,
      OR: [
        { name: { contains: searchQuery, mode: 'insensitive' } },
        { originalName: { contains: searchQuery, mode: 'insensitive' } },
      ],
    };

    // 폴더 검색 조건
    const folderWhere: Record<string, unknown> = {
      deletedAt: null,
      name: { contains: searchQuery, mode: 'insensitive' },
    };

    // Company access control — 업체 사용자는 자기 회사 데이터만 검색 가능
    // companyId: null (공유/외부웹하드) 데이터는 제외
    if (user.userType === 'company') {
      fileWhere.companyId = user.companyId;
      folderWhere.companyId = user.companyId;
    } else if (effectiveCompanyId !== undefined) {
      fileWhere.companyId = effectiveCompanyId;
      folderWhere.companyId = effectiveCompanyId;
    }

    // type에 따라 검색 대상 결정
    const searchFiles = type === 'all' || type === 'file';
    const searchFolders = type === 'all' || type === 'folder';

    // 병렬로 파일과 폴더 검색 (executeWithRetry로 감싸서 08P01 에러 시 자동 재시도)
    const [files, folders] = await this.prisma.executeWithRetry(
      () =>
        Promise.all([
          searchFiles
            ? this.prisma.webhardFile.findMany({
                where: fileWhere,
                include: {
                  company: {
                    select: {
                      companyName: true,
                      managerName: true,
                    },
                  },
                  folder: {
                    select: {
                      id: true,
                      name: true,
                      parentId: true,
                      path: true,
                    },
                  },
                },
                take: limit,
                orderBy: { createdAt: 'desc' },
              })
            : Promise.resolve([]),
          searchFolders
            ? this.prisma.webhardFolder.findMany({
                where: folderWhere,
                include: {
                  company: {
                    select: {
                      companyName: true,
                    },
                  },
                },
                take: limit,
                orderBy: { name: 'asc' },
              })
            : Promise.resolve([]),
        ]),
      { operationName: 'search' }
    );

    // 폴더 경로 구성을 위해 관련 폴더 ID 수집
    const folderIdsToResolve = new Set<string>();

    // 파일이 속한 폴더
    for (const file of files) {
      if (file.folder) {
        folderIdsToResolve.add(file.folder.id);
        if (file.folder.parentId) folderIdsToResolve.add(file.folder.parentId);
      }
    }

    // 검색된 폴더의 부모
    for (const folder of folders) {
      if (folder.parentId) folderIdsToResolve.add(folder.parentId);
    }

    // 부모 체인을 위해 모든 폴더를 조회 (경로 구성용)
    const folderPathMap = await this.buildFolderPathMap(folderIdsToResolve);

    return {
      files: files.map((file) => ({
        ...this.mapFileToDto(file),
        folder_path: file.folder
          ? this.getFolderPath(
              file.folder.id,
              file.folder.name,
              file.folder.parentId,
              folderPathMap
            )
          : null,
      })),
      folders: folders.map((folder) => ({
        ...this.mapFolderToDto(folder),
        path: this.getParentPath(folder.parentId, folderPathMap),
      })),
      total: files.length + folders.length,
    };
  }

  /**
   * 전체 폴더를 캐시에서 가져와 경로 맵 구성 (FoldersService 공유 캐시 사용)
   */
  private async buildFolderPathMap(
    _folderIds: Set<string>
  ): Promise<Map<string, { name: string; parentId: string | null }>> {
    const allFolders = await this.foldersService.getAllFoldersForPathMap();

    const folderMap = new Map<string, { name: string; parentId: string | null }>();
    for (const folder of allFolders) {
      folderMap.set(folder.id, { name: folder.name, parentId: folder.parentId });
    }
    return folderMap;
  }

  /**
   * 폴더 ID로부터 전체 경로 문자열 구성 (예: /폴더A/폴더B/폴더C)
   */
  private getFolderPath(
    folderId: string,
    folderName: string,
    parentId: string | null,
    folderMap: Map<string, { name: string; parentId: string | null }>
  ): string {
    const parts: string[] = [folderName];
    let currentParentId = parentId;

    // 부모 체인을 따라 경로 구성 (최대 20단계 보호)
    let depth = 0;
    while (currentParentId && depth < 20) {
      const parent = folderMap.get(currentParentId);
      if (!parent) break;
      parts.unshift(parent.name);
      currentParentId = parent.parentId;
      depth++;
    }

    return '/' + parts.join('/');
  }

  /**
   * 폴더 자기 자신을 제외한 부모 경로만 반환 (예: /업체)
   * 루트 직속 폴더이면 null 반환
   */
  private getParentPath(
    parentId: string | null,
    folderMap: Map<string, { name: string; parentId: string | null }>
  ): string | null {
    if (!parentId) return null;
    const parts: string[] = [];
    let currentId: string | null = parentId;
    let depth = 0;
    while (currentId && depth < 20) {
      const folder = folderMap.get(currentId);
      if (!folder) break;
      parts.unshift(folder.name);
      currentId = folder.parentId;
      depth++;
    }
    return parts.length > 0 ? '/' + parts.join('/') : null;
  }

  /**
   * Map file database model to DTO
   */
  private mapFileToDto = (file: {
    id: string;
    name: string;
    originalName: string;
    size: bigint;
    mimeType: string;
    path: string;
    folderId: string | null;
    companyId: number | null;
    uploadedBy: string;
    inquiryNumber: string | null;
    isDownloaded: boolean;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    deletedBy: string | null;
    company?: { companyName: string; managerName: string | null } | null;
    folder?: { id: string; name: string; parentId: string | null; path: string | null } | null;
  }): FileResponseDto => ({
    id: file.id,
    name: file.name,
    original_name: file.originalName,
    size: Number(file.size),
    mime_type: file.mimeType,
    path: file.path,
    folder_id: file.folderId,
    company_id: file.companyId,
    uploaded_by: file.uploadedBy,
    inquiry_number: file.inquiryNumber,
    is_downloaded: file.isDownloaded,
    created_at: file.createdAt.toISOString(),
    updated_at: file.updatedAt.toISOString(),
    deleted_at: file.deletedAt?.toISOString() ?? null,
    deleted_by: file.deletedBy ? Number(file.deletedBy) : null,
    companies: file.company
      ? {
          company_name: file.company.companyName,
          manager_name: file.company.managerName,
        }
      : null,
  });

  /**
   * Map folder database model to DTO
   */
  private mapFolderToDto = (folder: {
    id: string;
    name: string;
    parentId: string | null;
    companyId: number | null;
    path: string | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    company?: { companyName: string } | null;
  }): FolderResponseDto => ({
    id: folder.id,
    name: folder.name,
    parent_id: folder.parentId,
    company_id: folder.companyId,
    path: folder.path,
    created_at: folder.createdAt.toISOString(),
    updated_at: folder.updatedAt.toISOString(),
    deleted_at: folder.deletedAt?.toISOString() ?? null,
    companies: folder.company
      ? {
          company_name: folder.company.companyName,
        }
      : null,
  });
}
