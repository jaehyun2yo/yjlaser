import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CompanyFolderAlias, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ContactFolderSyncService } from '../contacts/contact-folder-sync.service';
import { normalizeCompanyName } from '../folders/_lib/company-name-match.util';
import {
  ApproveFolderAliasDto,
  CreateFolderAliasDto,
  ListFolderAliasesDto,
} from './dto/folder-alias.dto';

/**
 * task 26: alias 1건 승인 시 발생하는 backfill 결과.
 * - relocated/skipped: contact 단위 통합 (`relocateAfterAliasApproved`)
 * - movedFolders/movedFiles/deletedExternalFolders/conflicts: 폴더 트리 이전
 *   (`migrateExternalFolderTreeToCompany`)
 * - externalRootFound: `/외부웹하드/{folderName}` depth=2 root 가 존재했는지 여부.
 *   false 면 migrate 단계 skip — 운영 UI 에서 "이름 불일치/이미 정리됨" 진단용.
 */
export interface FolderAliasBackfillResult {
  relocated: number;
  skipped: number;
  movedFolders: number;
  movedFiles: number;
  deletedExternalFolders: number;
  conflicts: Array<{ originalName: string; renamedTo: string }>;
  externalRootFound: boolean;
}

@Injectable()
export class FolderAliasService {
  private readonly logger = new Logger(FolderAliasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contactFolderSync: ContactFolderSyncService
  ) {}

  /**
   * Folder alias 목록 조회 (관리자용).
   * status 필터링 + 페이지네이션. company 정보 포함.
   */
  async list(query: ListFolderAliasesDto) {
    const where: Prisma.CompanyFolderAliasWhereInput = query.status ? { status: query.status } : {};
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.companyFolderAlias.findMany({
        where,
        include: {
          company: { select: { id: true, companyName: true, isApproved: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.companyFolderAlias.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  /**
   * Alias 승인. 단일 트랜잭션:
   * 1. 동일 folderName 의 다른 pending → rejected
   * 2. 본 alias → approved + approvedBy/At 기록
   * 3. cascadeBackfill=true 시 미통합 Contact 일괄 통합
   *
   * 멱등 — 이미 approved 면 부작용 없이 반환.
   */
  async approve(id: number, dto: ApproveFolderAliasDto, approvedBy: string) {
    return this.prisma.$transaction(async (tx) => {
      const alias = await tx.companyFolderAlias.findUnique({ where: { id } });
      if (!alias) {
        throw new NotFoundException(`FolderAlias ${id} not found`);
      }

      if (alias.status === 'approved') {
        return { alias };
      }

      await tx.companyFolderAlias.updateMany({
        where: {
          folderName: alias.folderName,
          id: { not: id },
          status: 'pending',
        },
        data: { status: 'rejected' },
      });

      const updated = await tx.companyFolderAlias.update({
        where: { id },
        data: {
          status: 'approved',
          approvedBy,
          approvedAt: new Date(),
        },
      });

      let backfill: FolderAliasBackfillResult | undefined;
      if (dto.cascadeBackfill) {
        backfill = await this.runCascadeBackfill(
          tx as Prisma.TransactionClient,
          alias.folderName,
          alias.companyId
        );
      }

      this.logger.log(
        {
          aliasId: id,
          folderName: alias.folderName,
          companyId: alias.companyId,
          approvedBy,
          cascadeBackfill: !!dto.cascadeBackfill,
          backfill,
        },
        'folder alias approved'
      );

      return { alias: updated, backfill };
    });
  }

  /**
   * 운영자가 직접 (folderName, companyId) 매핑을 등록 + 즉시 승인 (task 25).
   *
   * 기존 `approve(id, ...)` 와의 차이:
   * - approve: 외부 동기화로 자동 생성된 pending alias 를 검수 후 승인
   * - createApprovedAlias: pending row 가 없는 신규 매핑을 운영자가 즉시 등록
   *
   * 동작:
   * 1. company 존재 검증 (없으면 NotFoundException — cascadeBackfill 분기 전에 선검사)
   * 2. (folderName, companyId) upsert → status='approved' 정규화 (멱등 — 이미 approved 면 동일 결과)
   * 3. 동일 folderName 의 다른 pending alias → 자동 rejected
   * 4. cascadeBackfill (default true) 시 `relocateAfterAliasApproved` 호출 — 단일 진입점 정책 준수
   *
   * 멱등성: `relocateAfterAliasApproved` 자체가 `companyId IS NULL` 필터로 이미 이동된 contact 자동 제외.
   */
  async createApprovedAlias(
    dto: CreateFolderAliasDto,
    approvedBy: string
  ): Promise<{
    alias: CompanyFolderAlias;
    backfill?: FolderAliasBackfillResult;
  }> {
    const cascadeBackfill = dto.cascadeBackfill ?? true;

    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: dto.companyId } });
      if (!company) {
        throw new NotFoundException(`Company ${dto.companyId} not found`);
      }

      const now = new Date();
      const alias = await tx.companyFolderAlias.upsert({
        where: {
          folderName_companyId: { folderName: dto.folderName, companyId: dto.companyId },
        },
        update: {
          status: 'approved',
          approvedBy,
          approvedAt: now,
        },
        create: {
          folderName: dto.folderName,
          companyId: dto.companyId,
          status: 'approved',
          approvedBy,
          approvedAt: now,
        },
      });

      await tx.companyFolderAlias.updateMany({
        where: {
          folderName: dto.folderName,
          status: 'pending',
          NOT: { id: alias.id },
        },
        data: { status: 'rejected' },
      });

      let backfill: FolderAliasBackfillResult | undefined;
      if (cascadeBackfill) {
        backfill = await this.runCascadeBackfill(
          tx as Prisma.TransactionClient,
          dto.folderName,
          dto.companyId
        );
      }

      this.logger.log(
        {
          aliasId: alias.id,
          folderName: dto.folderName,
          companyId: dto.companyId,
          approvedBy,
          cascadeBackfill,
          backfill,
        },
        'folder alias created (manual)'
      );

      return backfill ? { alias, backfill } : { alias };
    });
  }

  /**
   * task 26 + task 27: cascadeBackfill 흐름 — relocate (contact 단위) → migrate (폴더 트리 통째 이전)
   * 두 단계를 단일 tx 안에서 chained 실행. 동일 alias 1건당 1 tx 원칙 유지.
   *
   * - relocate: 미통합 Contact 의 companyId/companyName 갱신, 분류된 contact 는 폴더 hooks 위임
   * - migrate: 외부웹하드 root 폴더 트리를 가입 업체 폴더로 통째 이전 (root 미존재 시 0 반환)
   *
   * task 27 변경: migrate 가 외부 폴더를 husk 로 유지 → `deletedExternalFolders` 는 항상 0.
   * husk 정리는 admin 명시 액션 (`DELETE /folders/external-husk/:rootId`) 으로 분리.
   *
   * 외부 root lookup (task 29 Phase 1: depth=2 보장 + 3-step fallback):
   * - 1차: `path = '/외부웹하드/{folderName}'` 정확 매칭 (가장 안전).
   * - 2차: 외부웹하드 root 직속 자식 중 `name = folderName.trim()` 일치 (공백 변형 흡수).
   * - 3차: 외부웹하드 직속 자식 전부 조회 후 `normalizeCompanyName` 으로 정규화 매칭
   *        (NFKC + 공백/괄호/특수문자 흡수 — `대성 목형 (2265-1295)` ↔ `대성목형(2265-1295)`).
   * - 모두 외부웹하드 root 직속 자식만 후보로 삼아 depth=2 보장 → 깊은 경로 false-match 차단.
   *
   * 외부 root 미존재 → migrate 부분 skip, 카운트 0 + `externalRootFound=false` 반환.
   * 운영 UI 는 false 일 때 "외부 폴더 트리를 찾지 못했습니다" 가이드 표시.
   */
  private async runCascadeBackfill(
    tx: Prisma.TransactionClient,
    folderName: string,
    companyId: number
  ): Promise<FolderAliasBackfillResult> {
    const reloc = await this.contactFolderSync.relocateAfterAliasApproved(
      folderName,
      companyId,
      tx
    );

    // 1차: path 정확 매칭 (가장 안전한 경로 우선)
    let externalRoot = await tx.webhardFolder.findFirst({
      where: {
        name: folderName,
        path: `/외부웹하드/${folderName}`,
        deletedAt: null,
      },
      select: { id: true, name: true, path: true, parentId: true },
    });

    // 2/3차 fallback 을 위한 외부웹하드 parent 조회 (lazy — 1차 실패 시에만)
    let externalParent: { id: string } | null = null;
    if (!externalRoot) {
      externalParent = await tx.webhardFolder.findFirst({
        where: { name: '외부웹하드', parentId: null, deletedAt: null },
        select: { id: true },
      });
    }

    // 2차 fallback: 외부웹하드 root 직속 자식 중 name 일치 (공백 변형 흡수)
    if (!externalRoot && externalParent) {
      externalRoot = await tx.webhardFolder.findFirst({
        where: {
          parentId: externalParent.id,
          name: folderName.trim(),
          deletedAt: null,
        },
        select: { id: true, name: true, path: true, parentId: true },
      });
    }

    // 3차 fallback: 정규화 매칭 (NFKC + 공백/특수문자 흡수)
    if (!externalRoot && externalParent) {
      const normalized = normalizeCompanyName(folderName);
      if (normalized) {
        const candidates = await tx.webhardFolder.findMany({
          where: { parentId: externalParent.id, deletedAt: null },
          select: { id: true, name: true, path: true, parentId: true },
          orderBy: { createdAt: 'asc' },
        });
        externalRoot = candidates.find((f) => normalizeCompanyName(f.name) === normalized) ?? null;
      }
    }

    let migration: {
      movedFolders: number;
      movedFiles: number;
      deletedExternalFolders: number;
      conflicts: Array<{ originalName: string; renamedTo: string }>;
    } = {
      movedFolders: 0,
      movedFiles: 0,
      deletedExternalFolders: 0,
      conflicts: [],
    };
    if (externalRoot) {
      migration = await this.contactFolderSync.migrateExternalFolderTreeToCompany(
        externalRoot.id,
        companyId,
        tx
      );
    }

    return {
      relocated: reloc.relocated,
      skipped: reloc.skipped,
      movedFolders: migration.movedFolders,
      movedFiles: migration.movedFiles,
      deletedExternalFolders: migration.deletedExternalFolders,
      conflicts: migration.conflicts,
      externalRootFound: !!externalRoot,
    };
  }

  /**
   * Alias 거절 — status='rejected' 단일 update.
   */
  async reject(id: number) {
    const alias = await this.prisma.companyFolderAlias.findUnique({ where: { id } });
    if (!alias) {
      throw new NotFoundException(`FolderAlias ${id} not found`);
    }

    return this.prisma.companyFolderAlias.update({
      where: { id },
      data: { status: 'rejected' },
    });
  }

  /**
   * Alias hard delete — 운영자가 등록된 alias 를 정리할 때 사용.
   */
  async delete(id: number): Promise<void> {
    await this.prisma.companyFolderAlias.delete({ where: { id } });
  }
}
