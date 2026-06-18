/**
 * 초기 도면 revision (reason='initial', version=1) 백필 스크립트.
 *
 * 사용법:
 *   cd webhard-api
 *   npx tsx scripts/backfill-initial-revisions.ts            # dry-run (대상 집계만 출력)
 *   npx tsx scripts/backfill-initial-revisions.ts --apply    # 실제 INSERT 수행
 *
 * 대상: contact.drawingFileUrl 이 존재하지만 drawing_revisions 에 reason='initial' 행이 없는 문의.
 * 동작: createInitialRevision 을 createdAt=Contact.createdAt + skipInitial=true 로 호출.
 *       skipInitial=true → WebhardFile 자동 등록 skip (이미 존재할 가능성 → 중복 방지).
 *
 * 멱등성: 재실행 시 동일 필터로 즉시 0건 (이미 initial 이 있는 문의는 자동 skip).
 */

// 루트 .env.local 먼저 로드 (ConfigService/Prisma 가 사용 가능하도록)
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { DrawingRevisionService } from '../src/contacts/drawing-revision.service';

interface BackfillTarget {
  id: string;
  drawingFileUrl: string;
  drawingFileName: string | null;
  createdAt: Date;
}

interface BackfillResult {
  scanned: number;
  applied: number;
  failed: number;
  failures: Array<{ contactId: string; error: string }>;
}

export async function findBackfillTargets(prisma: PrismaService): Promise<BackfillTarget[]> {
  const rows = await prisma.contact.findMany({
    where: {
      drawingFileUrl: { not: null },
      drawingRevisions: { none: { reason: 'initial' } },
    },
    select: {
      id: true,
      drawingFileUrl: true,
      drawingFileName: true,
      createdAt: true,
    },
  });

  return rows
    .filter((row): row is BackfillTarget & { drawingFileUrl: string } => row.drawingFileUrl != null)
    .map((row) => ({
      id: row.id,
      drawingFileUrl: row.drawingFileUrl,
      drawingFileName: row.drawingFileName,
      createdAt: row.createdAt,
    }));
}

export async function applyBackfill(
  drawingRevisionService: DrawingRevisionService,
  targets: BackfillTarget[],
  logger: Pick<Logger, 'log' | 'error'>
): Promise<BackfillResult> {
  const result: BackfillResult = {
    scanned: targets.length,
    applied: 0,
    failed: 0,
    failures: [],
  };

  for (const target of targets) {
    try {
      await drawingRevisionService.createInitialRevision(
        target.id,
        target.drawingFileUrl,
        target.drawingFileName,
        { createdAt: target.createdAt, skipInitial: true }
      );
      result.applied += 1;
    } catch (err) {
      result.failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      result.failures.push({ contactId: target.id, error: message });
      logger.error(`backfill failed for ${target.id}: ${message}`);
    }
  }

  return result;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const logger = new Logger('backfill-initial-revisions');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const drawingRevisionService = app.get(DrawingRevisionService);

    const targets = await findBackfillTargets(prisma);
    logger.log(`scanned ${targets.length} contact(s) missing initial revision`);

    if (!apply) {
      logger.log('dry-run mode — pass --apply to insert');
      for (const target of targets) {
        logger.log(`  - ${target.id} (${target.drawingFileName ?? '(no name)'})`);
      }
      return;
    }

    const result = await applyBackfill(drawingRevisionService, targets, logger);
    logger.log(`done. applied=${result.applied} failed=${result.failed}`);
  } finally {
    await app.close();
  }
}

const invokedDirectly = require.main === module;
if (invokedDirectly) {
  main().catch((err) => {
    console.error('[backfill-initial-revisions] fatal:', err);
    process.exit(1);
  });
}
