import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SessionUser } from '../auth/auth.service';
import { GetBadgeCountsQueryDto, BadgeCountsResponseDto } from './dto/badge-counts.dto';

@Injectable()
export class BadgeCountsService {
  constructor(private readonly prisma: PrismaService) {}

  async getBadgeCounts(
    query: GetBadgeCountsQueryDto,
    user: SessionUser
  ): Promise<BadgeCountsResponseDto> {
    // 업체 사용자는 자신의 데이터만 조회 가능
    const effectiveCompanyId = user.userType === 'company' ? user.companyId : query.companyId;

    const where: Record<string, unknown> = {
      deletedAt: null,
      isDownloaded: false,
    };

    // Company access control
    if (user.userType === 'company') {
      where.companyId = user.companyId;
    } else if (effectiveCompanyId !== undefined) {
      where.companyId = effectiveCompanyId;
    }

    // 전체 카운트 조회
    const totalCount = await this.prisma.executeWithRetry(
      () => this.prisma.webhardFile.count({ where }),
      { operationName: 'getBadgeCounts.count' }
    );

    const result: BadgeCountsResponseDto = {
      totalCount,
    };

    if (effectiveCompanyId !== undefined && effectiveCompanyId !== null) {
      result.companyId = effectiveCompanyId;
    }

    // 폴더별 카운트 조회 — 직접 카운트 groupBy + 전체 폴더 트리 조회 후 부모 전파
    if (query.includeFolderCounts) {
      // 1. 폴더별 직접 미다운로드 파일 수 (groupBy)
      const folderCountsRaw = await this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardFile.groupBy({
            by: ['folderId'],
            where,
            _count: true,
          }),
        { operationName: 'getBadgeCounts.groupBy' }
      );

      const directCounts: Record<string, number> = {};
      for (const item of folderCountsRaw) {
        const key = item.folderId ?? 'root';
        directCounts[key] = item._count;
      }

      // 2. 전체 폴더 트리 1회 조회 (N+1 방지) — company 사용자는 자기 폴더만
      const folderWhere: Record<string, unknown> = {
        deletedAt: null,
      };
      if (effectiveCompanyId !== undefined && effectiveCompanyId !== null) {
        folderWhere.OR = [{ companyId: effectiveCompanyId }, { companyId: null }];
      }

      const allFolders = await this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardFolder.findMany({
            where: folderWhere,
            select: { id: true, parentId: true },
          }),
        { operationName: 'getBadgeCounts.allFolders' }
      );

      // 3. folderId → childIds 맵 구성 (parentId를 key로 사용, null 포함)
      // null parentId는 Map key로 직접 사용 (string 'root'와 충돌 방지)
      const childrenMap = new Map<string | null, string[]>();
      for (const folder of allFolders) {
        const parentKey = folder.parentId;
        if (!childrenMap.has(parentKey)) {
          childrenMap.set(parentKey, []);
        }
        childrenMap.get(parentKey)!.push(folder.id);
      }

      // 4. 메모이제이션 DFS — 각 폴더의 직접 + 모든 하위 폴더 count 합산
      const memo = new Map<string, number>();

      const getTotalCount = (folderId: string): number => {
        if (memo.has(folderId)) return memo.get(folderId)!;

        const direct = directCounts[folderId] ?? 0;
        const children = childrenMap.get(folderId) ?? [];
        const total = direct + children.reduce((sum, childId) => sum + getTotalCount(childId), 0);

        memo.set(folderId, total);
        return total;
      };

      // 5. 모든 폴더 ID에 대해 전파 카운트 계산 (직접 카운트가 있는 폴더만이 아닌 전체)
      const folderCounts: Record<string, number> = {};

      // directCounts의 'root' key는 folderId=null인 파일 (루트 파일), 그대로 유지
      // 실제 폴더 id에 대한 전파 계산만 수행
      for (const key of Object.keys(directCounts)) {
        if (key === 'root') {
          folderCounts.root = directCounts.root; // 루트 파일은 전파 없음
        } else {
          folderCounts[key] = getTotalCount(key);
        }
      }

      // 직접 파일은 없지만 하위 폴더에 파일 있는 상위 폴더도 포함
      for (const folder of allFolders) {
        if (!(folder.id in folderCounts)) {
          const total = getTotalCount(folder.id);
          if (total > 0) {
            folderCounts[folder.id] = total;
          }
        }
      }

      result.folderCounts = folderCounts;
    }

    return result;
  }
}
