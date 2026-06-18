/**
 * WebhardFile 일괄 마이그레이션: 기존 업로드 도면에 번호 전용 문의 폴더 + `[번호] 원본명` 적용.
 *
 * 사용법:
 *   cd webhard-api
 *   npx tsx scripts/migrate-webhard-inquiry-folders.ts                       # dry-run (기본)
 *   npx tsx scripts/migrate-webhard-inquiry-folders.ts --apply               # 실제 실행
 *   npx tsx scripts/migrate-webhard-inquiry-folders.ts --company-id 3        # 특정 회사만
 *   npx tsx scripts/migrate-webhard-inquiry-folders.ts --backfill-folder-kind        # folder_kind 백필 dry-run
 *   npx tsx scripts/migrate-webhard-inquiry-folders.ts --backfill-folder-kind --apply # folder_kind 백필 실제
 *
 * 동작:
 *   - 대상: inquiryType 분류 완료 + inquiryNumber 또는 workNumber 가 있는 Contact.
 *   - 각 Contact 마다 `FoldersService.ensureInquiryFolder` + `relocateContactFiles` 재사용으로
 *     `{업체명}/문의/{번호}` 로 이동 + `[번호] 원본명` 으로 rename.
 *   - 재실행 시 이미 제자리인 파일/이름은 skip (idempotent).
 *   - apply 시 WebhardLog 에 action='migrate_move' / 'migrate_rename' 기록.
 *
 * 주의:
 *   - 백업 필수 — R2 object key 는 유지되지만 `WebhardFile.folderId/name/path` 가 변경된다.
 *   - R2 object key 는 **이동시키지 않음**. 논리 경로만 변경.
 *   - 대용량 대비 batch 처리 (BATCH_SIZE=100) + Contact 마다 트랜잭션.
 */

// 루트 .env.local 먼저 로드 (ConfigService/Prisma 가 사용 가능하도록)
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { FoldersService } from '../src/folders/folders.service';
import {
  buildInquiryFileName,
  buildInquiryFolderName,
  getInquiryTemplateName,
} from '../src/common/inquiry-filename.util';

// ─── Types ──────────────────────────────────────────────────────

export interface MigrationFlags {
  apply: boolean;
  companyId?: number;
  backfillFolderKind: boolean;
}

export interface TargetContact {
  id: string;
  companyName: string | null;
  inquiryNumber: string | null;
  workNumber: string | null;
  inquiryType: string | null;
  processStage: string | null;
  drawingRevisions: Array<{ processStage: string | null; webhardFileIds: string[] }>;
}

export interface MovePlan {
  fileId: string;
  fromFolderId: string | null;
  toFolderId: string;
}

export interface RenamePlan {
  fileId: string;
  from: string;
  to: string;
}

export type ContactPlanStatus =
  | 'unclassified'
  | 'no-number'
  | 'no-company'
  | 'no-target-folder'
  | 'planned'
  | 'applied'
  | 'failed';

export interface ContactPlan {
  contactId: string;
  status: ContactPlanStatus;
  folderId: string | null;
  folderName: string | null;
  templateName: string | null;
  moves: MovePlan[];
  renames: RenamePlan[];
  alreadyInPlace: number;
  alreadyCorrectName: number;
  error?: string;
}

export interface MigrationStats {
  scannedContacts: number;
  plannedMoves: number;
  plannedRenames: number;
  appliedMoves: number;
  appliedRenames: number;
  skipUnclassified: number;
  skipNoCompany: number;
  failed: number;
}

export interface FolderKindBackfillResult {
  scanned: number;
  root: number;
  template: number;
  inquiry: number;
  unchanged: number;
}

// 내부적으로 script 에서 의존하는 메서드만 골라낸 인터페이스. 테스트에서 쉽게 mock 하기 위함.
type PrismaLike = Pick<
  PrismaService,
  'contact' | 'company' | 'webhardFile' | 'webhardFolder' | 'webhardLog' | 'drawingRevision'
>;

interface FoldersLike {
  ensureInquiryFolder: (
    contactId: string,
    tx?: Prisma.TransactionClient
  ) => Promise<{ id: string; path: string | null } | null>;
  relocateContactFiles: (
    contactId: string,
    targetFolderId: string,
    tx?: Prisma.TransactionClient
  ) => Promise<{ movedIds: string[] }>;
}

type ScriptLogger = Pick<Logger, 'log' | 'error' | 'warn'>;

// ─── argv 파싱 ──────────────────────────────────────────────────

export function parseArgs(argv: string[]): MigrationFlags {
  const apply = argv.includes('--apply');
  const backfillFolderKind = argv.includes('--backfill-folder-kind');
  const idx = argv.indexOf('--company-id');
  const raw = idx >= 0 ? argv[idx + 1] : undefined;
  const companyId = raw && /^\d+$/.test(raw) ? parseInt(raw, 10) : undefined;
  return { apply, companyId, backfillFolderKind };
}

// ─── 대상 Contact 조회 ─────────────────────────────────────────

export async function findMigrationTargets(
  prisma: PrismaLike,
  { companyId }: { companyId?: number } = {}
): Promise<TargetContact[]> {
  let companyNameFilter: string | null = null;
  if (companyId !== undefined) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { companyName: true },
    });
    if (!company) return [];
    companyNameFilter = company.companyName;
  }

  const where: Prisma.ContactWhereInput = {
    inquiryType: { not: null },
    deletedAt: null,
    OR: [{ inquiryNumber: { not: null } }, { workNumber: { not: null } }],
  };
  if (companyNameFilter !== null) {
    where.companyName = companyNameFilter;
  }

  const rows = await prisma.contact.findMany({
    where,
    select: {
      id: true,
      companyName: true,
      inquiryNumber: true,
      workNumber: true,
      inquiryType: true,
      processStage: true,
      drawingRevisions: {
        select: { processStage: true, webhardFileIds: true },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    companyName: r.companyName,
    inquiryNumber: r.inquiryNumber,
    workNumber: r.workNumber,
    inquiryType: r.inquiryType,
    processStage: r.processStage,
    drawingRevisions: r.drawingRevisions.map((rev) => ({
      processStage: rev.processStage,
      webhardFileIds: rev.webhardFileIds ?? [],
    })),
  }));
}

// ─── Contact 별 파일 후보 수집 ────────────────────────────────

async function collectContactFiles(
  prisma: PrismaLike,
  contact: TargetContact
): Promise<Array<{ id: string; folderId: string | null; name: string; originalName: string }>> {
  const revisionFileIds = Array.from(
    new Set(contact.drawingRevisions.flatMap((r) => r.webhardFileIds ?? []))
  );

  const numberFilter: string[] = [];
  if (contact.inquiryNumber) numberFilter.push(contact.inquiryNumber);
  if (contact.workNumber) numberFilter.push(contact.workNumber);

  let companyId: number | null = null;
  if (contact.companyName) {
    const company = await prisma.company.findFirst({
      where: { companyName: contact.companyName },
      select: { id: true },
    });
    companyId = company?.id ?? null;
  }

  const orClauses: Prisma.WebhardFileWhereInput[] = [];
  if (revisionFileIds.length > 0) {
    orClauses.push({ id: { in: revisionFileIds } });
  }
  if (numberFilter.length > 0 && companyId !== null) {
    orClauses.push({
      companyId,
      inquiryNumber: { in: numberFilter },
    });
  }

  if (orClauses.length === 0) return [];

  return prisma.webhardFile.findMany({
    where: { deletedAt: null, OR: orClauses },
    select: { id: true, folderId: true, name: true, originalName: true },
  });
}

// ─── Contact 하나를 마이그레이션 ──────────────────────────────

export async function migrateContact(args: {
  prisma: PrismaLike;
  foldersService: FoldersLike;
  contact: TargetContact;
  apply: boolean;
  logger: ScriptLogger;
}): Promise<ContactPlan> {
  const { prisma, foldersService, contact, apply, logger } = args;

  const templateName = getInquiryTemplateName(contact.inquiryType);
  const folderName = buildInquiryFolderName({
    inquiryNumber: contact.inquiryNumber,
    workNumber: contact.workNumber,
  });

  const basePlan: ContactPlan = {
    contactId: contact.id,
    status: 'planned',
    folderId: null,
    folderName,
    templateName,
    moves: [],
    renames: [],
    alreadyInPlace: 0,
    alreadyCorrectName: 0,
  };

  if (!templateName) {
    logger.log(`  SKIP unclassified contact=${contact.id}`);
    return { ...basePlan, status: 'unclassified' };
  }
  if (!folderName) {
    return { ...basePlan, status: 'no-number' };
  }
  if (!contact.companyName) {
    return { ...basePlan, status: 'no-company' };
  }

  const files = await collectContactFiles(prisma, contact);

  let targetFolderId: string | null = null;
  let targetFolderPath: string | null = null;

  if (apply) {
    try {
      const folder = await foldersService.ensureInquiryFolder(contact.id);
      if (!folder) {
        return { ...basePlan, status: 'no-target-folder' };
      }
      targetFolderId = folder.id;
      targetFolderPath = folder.path ?? null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`ensureInquiryFolder failed for contact=${contact.id}: ${msg}`);
      return { ...basePlan, status: 'failed', error: msg };
    }
  } else {
    // dry-run: 기존 inquiry 폴더가 있으면 비교 기준으로 사용, 없으면 placeholder id
    // (실제 DB 와 충돌하지 않는 값) 로 대체해 "이동 필요" 계획이 산출되도록 한다.
    const existing = await prisma.webhardFolder.findFirst({
      where: { contactId: contact.id, folderKind: 'inquiry', deletedAt: null },
      select: { id: true, path: true },
    });
    targetFolderId = existing?.id ?? `(pending:${contact.id})`;
    targetFolderPath = existing?.path ?? null;
  }

  const plan: ContactPlan = {
    ...basePlan,
    folderId: targetFolderId,
  };

  for (const f of files) {
    const desiredName = buildInquiryFileName({
      contact: {
        inquiryNumber: contact.inquiryNumber,
        workNumber: contact.workNumber,
        processStage: contact.processStage,
        inquiryType: contact.inquiryType,
      },
      originalName: f.originalName,
    });

    const needsMove = targetFolderId !== null && f.folderId !== targetFolderId;
    const needsRename = f.name !== desiredName;

    if (needsMove) {
      plan.moves.push({
        fileId: f.id,
        fromFolderId: f.folderId,
        toFolderId: targetFolderId!,
      });
    } else if (targetFolderId !== null) {
      plan.alreadyInPlace += 1;
    }

    if (needsRename) {
      plan.renames.push({ fileId: f.id, from: f.name, to: desiredName });
    } else {
      plan.alreadyCorrectName += 1;
    }
  }

  if (!apply) {
    for (const m of plan.moves) {
      logger.log(
        `  PLAN MOVE   file=${m.fileId} from=${m.fromFolderId ?? '(none)'} → ${m.toFolderId}`
      );
    }
    for (const r of plan.renames) {
      logger.log(`  PLAN RENAME file=${r.fileId} "${r.from}" → "${r.to}"`);
    }
    if (plan.moves.length === 0 && plan.renames.length === 0) {
      logger.log(
        `  already in place: contact=${contact.id} files=${files.length} (moves=0 renames=0)`
      );
    }
    return plan;
  }

  // ─── apply ───
  try {
    if (plan.moves.length > 0) {
      await foldersService.relocateContactFiles(contact.id, targetFolderId!);
    }
    // 각 rename: path 도 함께 재계산 (relocate 후에는 old name 기준 path 이므로).
    for (const r of plan.renames) {
      const newPath = targetFolderPath ? `${targetFolderPath}/${r.to}` : r.to;
      await prisma.webhardFile.update({
        where: { id: r.fileId },
        data: { name: r.to, path: newPath },
      });
    }
    // WebhardLog 기록 — 건별.
    for (const m of plan.moves) {
      await writeLog(prisma, 'migrate_move', {
        fileName: files.find((f) => f.id === m.fileId)?.name ?? '(unknown)',
        folderPath: targetFolderPath,
      });
    }
    for (const r of plan.renames) {
      await writeLog(prisma, 'migrate_rename', {
        fileName: r.to,
        folderPath: targetFolderPath,
      });
    }

    return { ...plan, status: 'applied' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`apply failed for contact=${contact.id}: ${msg}`);
    return { ...plan, status: 'failed', error: msg };
  }
}

async function writeLog(
  prisma: PrismaLike,
  action: string,
  entry: { fileName: string; folderPath: string | null }
): Promise<void> {
  await prisma.webhardLog.create({
    data: {
      action,
      fileName: entry.fileName,
      folderPath: entry.folderPath,
      status: 'success',
    },
  });
}

// ─── folder_kind 백필 ─────────────────────────────────────────

export async function backfillFolderKind(
  prisma: PrismaLike,
  opts: { apply: boolean; logger: ScriptLogger }
): Promise<FolderKindBackfillResult> {
  const folders = await prisma.webhardFolder.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      parentId: true,
      companyId: true,
      folderKind: true,
      contactId: true,
    },
  });

  const companies = await prisma.company.findMany({
    select: { id: true, companyName: true },
  });
  const companyNameById = new Map<number, string>(companies.map((c) => [c.id, c.companyName]));

  const result: FolderKindBackfillResult = {
    scanned: folders.length,
    root: 0,
    template: 0,
    inquiry: 0,
    unchanged: 0,
  };

  for (const f of folders) {
    const { kind, contactId } = await classifyFolderKind(prisma, f, companyNameById);

    if (kind === null) {
      result.unchanged += 1;
      continue;
    }
    if (kind === f.folderKind && (kind !== 'inquiry' || contactId === f.contactId)) {
      result.unchanged += 1;
      continue;
    }

    const data: Prisma.WebhardFolderUpdateInput = { folderKind: kind };
    if (kind === 'inquiry' && contactId) {
      data.contactId = contactId;
    }
    if (opts.apply) {
      await prisma.webhardFolder.update({ where: { id: f.id }, data });
    } else {
      opts.logger.log(
        `  PLAN folder_kind folder=${f.id} name="${f.name}" ${f.folderKind} → ${kind}${
          contactId ? ` contactId=${contactId}` : ''
        }`
      );
    }

    if (kind === 'root') result.root += 1;
    else if (kind === 'template') result.template += 1;
    else if (kind === 'inquiry') result.inquiry += 1;
  }

  return result;
}

const TEMPLATE_FOLDER_NAMES: readonly string[] = ['칼선의뢰', '목형의뢰', '완료'];

async function classifyFolderKind(
  prisma: PrismaLike,
  folder: {
    id: string;
    name: string;
    parentId: string | null;
    companyId: number | null;
    folderKind: string;
    contactId: string | null;
  },
  companyNameById: Map<number, string>
): Promise<{ kind: 'root' | 'template' | 'inquiry' | null; contactId?: string | null }> {
  if (folder.parentId === null && folder.companyId !== null) {
    const companyName = companyNameById.get(folder.companyId);
    if (companyName && companyName === folder.name) {
      return { kind: 'root' };
    }
  }

  if (folder.parentId !== null && TEMPLATE_FOLDER_NAMES.includes(folder.name)) {
    return { kind: 'template' };
  }

  if (folder.parentId !== null) {
    const legacyPrefix = '문의-';
    const nameWithoutLegacyPrefix = folder.name.startsWith(legacyPrefix)
      ? folder.name.slice(legacyPrefix.length)
      : folder.name;
    const candidates = nameWithoutLegacyPrefix.split('_').filter(Boolean);
    if (candidates.length === 0) return { kind: null };
    const contact = await prisma.contact.findFirst({
      where: {
        deletedAt: null,
        OR: [{ inquiryNumber: { in: candidates } }, { workNumber: { in: candidates } }],
      },
      select: { id: true },
    });
    if (contact) return { kind: 'inquiry', contactId: contact.id };
  }

  return { kind: null };
}

// ─── runMigration ────────────────────────────────────────────

export async function runMigration(args: {
  prisma: PrismaLike;
  foldersService: FoldersLike;
  flags: MigrationFlags;
  logger: ScriptLogger;
}): Promise<MigrationStats> {
  const { prisma, foldersService, flags, logger } = args;

  const targets = await findMigrationTargets(prisma, { companyId: flags.companyId });
  logger.log(
    `scanned ${targets.length} contact(s) for inquiry-folder migration${
      flags.apply ? '' : ' (dry-run — pass --apply to mutate)'
    }`
  );

  const stats: MigrationStats = {
    scannedContacts: targets.length,
    plannedMoves: 0,
    plannedRenames: 0,
    appliedMoves: 0,
    appliedRenames: 0,
    skipUnclassified: 0,
    skipNoCompany: 0,
    failed: 0,
  };

  for (const contact of targets) {
    const plan = await migrateContact({
      prisma,
      foldersService,
      contact,
      apply: flags.apply,
      logger,
    });

    if (plan.status === 'unclassified') stats.skipUnclassified += 1;
    else if (plan.status === 'no-company') stats.skipNoCompany += 1;
    else if (plan.status === 'failed') stats.failed += 1;

    stats.plannedMoves += plan.moves.length;
    stats.plannedRenames += plan.renames.length;
    if (plan.status === 'applied') {
      stats.appliedMoves += plan.moves.length;
      stats.appliedRenames += plan.renames.length;
    }
  }

  return stats;
}

// ─── main ────────────────────────────────────────────────────

async function main(): Promise<void> {
  const flags = parseArgs(process.argv);
  const logger = new Logger('migrate-webhard-inquiry-folders');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const foldersService = app.get(FoldersService);

    if (flags.backfillFolderKind) {
      const r = await backfillFolderKind(prisma, { apply: flags.apply, logger });
      logger.log(
        `folder_kind backfill: scanned=${r.scanned} root=${r.root} template=${r.template} inquiry=${r.inquiry} unchanged=${r.unchanged}${
          flags.apply ? ' [APPLIED]' : ' [dry-run]'
        }`
      );
      return;
    }

    const stats = await runMigration({
      prisma,
      foldersService,
      flags,
      logger,
    });

    logger.log(
      `summary: contacts=${stats.scannedContacts} plannedMoves=${stats.plannedMoves} plannedRenames=${stats.plannedRenames} appliedMoves=${stats.appliedMoves} appliedRenames=${stats.appliedRenames} skipUnclassified=${stats.skipUnclassified} skipNoCompany=${stats.skipNoCompany} failed=${stats.failed}`
    );
  } finally {
    await app.close();
  }
}

const invokedDirectly = require.main === module;
if (invokedDirectly) {
  main().catch((err) => {
    console.error('[migrate-webhard-inquiry-folders] fatal:', err);
    process.exit(1);
  });
}
