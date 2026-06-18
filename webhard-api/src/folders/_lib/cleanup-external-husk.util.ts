// webhard-api/src/folders/_lib/cleanup-external-husk.util.ts

import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface HuskCheckResult {
  /** 빈 husk 여부 — 자식 폴더 0 + 직접 파일 0 + path startsWith /외부웹하드/ + companyId IS NULL */
  empty: boolean;
  /** depth=2 root husk 인지 (UI 후보 목록 필터용) */
  isExternalRoot: boolean;
  childFolderCount: number;
  directFileCount: number;
  reason?: string;
}

/**
 * task 27 Phase C: 외부웹하드 husk (빈 껍데기) 안전 검증.
 *
 * husk 정의: `path startsWith '/외부웹하드/'` + `companyId IS NULL` + `deletedAt IS NULL`.
 * 정리 가능 조건: 자식 폴더 0 + 직접 파일 0.
 *
 * @returns HuskCheckResult — empty=false 면 reason 에 사유 포함.
 */
export async function checkEmptyHusk(
  tx: Prisma.TransactionClient,
  folderId: string
): Promise<HuskCheckResult> {
  const folder = await tx.webhardFolder.findUnique({
    where: { id: folderId },
    select: {
      id: true,
      name: true,
      path: true,
      companyId: true,
      deletedAt: true,
    },
  });

  if (!folder) {
    throw new BadRequestException(`Folder ${folderId} not found`);
  }

  if (folder.deletedAt) {
    throw new BadRequestException(
      `Folder ${folderId} already soft-deleted (deletedAt=${folder.deletedAt.toISOString()})`
    );
  }

  if (!folder.path?.startsWith('/외부웹하드/')) {
    throw new BadRequestException(
      `Folder ${folderId} is not under /외부웹하드/ (path=${folder.path ?? 'null'})`
    );
  }

  if (folder.companyId !== null) {
    throw new BadRequestException(
      `Folder ${folderId} has companyId=${folder.companyId} — not a husk (companyId must be NULL)`
    );
  }

  const segments = folder.path.split('/').filter((s) => s.length > 0);
  const isExternalRoot = segments.length === 2;

  const [childFolderCount, directFileCount] = await Promise.all([
    tx.webhardFolder.count({
      where: { parentId: folderId, deletedAt: null },
    }),
    tx.webhardFile.count({
      where: { folderId, deletedAt: null },
    }),
  ]);

  if (childFolderCount > 0 || directFileCount > 0) {
    return {
      empty: false,
      isExternalRoot,
      childFolderCount,
      directFileCount,
      reason: `not empty (children=${childFolderCount}, files=${directFileCount})`,
    };
  }

  return {
    empty: true,
    isExternalRoot,
    childFolderCount: 0,
    directFileCount: 0,
  };
}

/**
 * task 27 Phase C: 검증 통과 후 husk 를 cascade soft-delete.
 *
 * 단일 폴더 + 확인된 자식 0 인 케이스만 처리하므로 BFS cascade 불필요.
 * deletedAt=NOW() set + WebhardFolder.updatedAt 갱신.
 */
export async function softDeleteHusk(
  tx: Prisma.TransactionClient,
  folderId: string
): Promise<void> {
  const now = new Date();
  await tx.webhardFolder.update({
    where: { id: folderId },
    data: { deletedAt: now, updatedAt: now },
  });
}

/**
 * task 27 Phase C: depth=2 husk 의 빈 자식 트리 cascade soft-delete.
 *
 * UI 시나리오: depth=2 root 가 husk 인데 그 아래 빈 자식 husk (template) 들이 남아있는 경우,
 * root 와 자식들 모두 deletedAt set. 검증: BFS 로 모든 descendants 가 빈 husk 인지 확인 후
 * 한 번에 deletedAt set.
 *
 * 위반 (자식 트리 어딘가에 파일·companyId!=null·외부 외 path) 시 throw.
 */
export async function cleanupEmptyExternalRootHusk(
  tx: Prisma.TransactionClient,
  rootId: string
): Promise<{ deletedFolderIds: string[] }> {
  // 1. root 자체 검증 (depth=2 husk)
  const rootCheck = await checkEmptyHusk(tx, rootId);
  if (!rootCheck.isExternalRoot) {
    throw new BadRequestException(
      `Folder ${rootId} is not an external root (depth=2 under /외부웹하드/)`
    );
  }
  if (!rootCheck.empty) {
    throw new UnprocessableEntityException(
      `Folder ${rootId} is not empty (children=${rootCheck.childFolderCount}, files=${rootCheck.directFileCount}) — abort cleanup`
    );
  }

  // 2. BFS 로 descendants 수집
  const allIds: string[] = [rootId];
  const queue: string[] = [rootId];
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    const children = await tx.webhardFolder.findMany({
      where: { parentId: cur, deletedAt: null },
      select: { id: true, companyId: true, path: true },
    });
    for (const c of children) {
      // descendants 도 husk 조건 (companyId IS NULL + path startsWith /외부웹하드/) 만족해야 안전
      if (c.companyId !== null) {
        throw new UnprocessableEntityException(
          `Descendant ${c.id} has companyId=${c.companyId} — abort cleanup (data inconsistency)`
        );
      }
      if (!c.path?.startsWith('/외부웹하드/')) {
        throw new UnprocessableEntityException(
          `Descendant ${c.id} path=${c.path ?? 'null'} is not under /외부웹하드/ — abort cleanup`
        );
      }
      allIds.push(c.id);
      queue.push(c.id);
    }
  }

  // 3. 모든 descendants 가 빈지 확인 (직접 파일 0)
  const directFileCount = await tx.webhardFile.count({
    where: { folderId: { in: allIds }, deletedAt: null },
  });
  if (directFileCount > 0) {
    throw new UnprocessableEntityException(
      `External husk root ${rootId} contains ${directFileCount} active files — abort cleanup`
    );
  }

  // 4. cascade soft-delete
  const now = new Date();
  await tx.webhardFolder.updateMany({
    where: { id: { in: allIds } },
    data: { deletedAt: now, updatedAt: now },
  });

  return { deletedFolderIds: allIds };
}
