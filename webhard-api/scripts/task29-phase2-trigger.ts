/**
 * task 29 Phase 2 실효성 1건 mutation 시뮬레이션.
 *
 * 동작:
 *   1. husk(`/외부웹하드/`) 가리키는 contact 중 inquiryType + number 보유한 1건 선정
 *   2. before snapshot (contact.webhardFolderId, 폴더 path)
 *   3. FoldersService.ensureInquiryFolder(contactId) 호출
 *   4. after snapshot — webhardFolderId 변동 + 정식 폴더 가리키는지 어설션
 *   5. PASS/FAIL 리포트
 *
 * 사용법:
 *   cd webhard-api
 *   npx tsx scripts/task29-phase2-trigger.ts                # auto-pick + 실행
 *   npx tsx scripts/task29-phase2-trigger.ts --contact <id> # 특정 contact 지정
 *   npx tsx scripts/task29-phase2-trigger.ts --dry-run      # 후보만 출력 (mutation 없음)
 *
 * 안전성:
 *   - 1 contact 만 대상 (--contact 지정 시 그 1건)
 *   - ensureInquiryFolder 는 멱등 — 이미 정식 inquiry 폴더 있으면 no-op
 *   - workflow status / process_stage 등 미변경
 *   - 실패 시 Prisma rollback 없음 (NestFactory + service 직접 호출)
 */

// CRITICAL: dotenv must load BEFORE any NestJS module imports — TS import 호이스팅이
// import 들을 모두 dotenv.config() 위로 옮기므로, NestJS 가 먼저 로드되어 env 누락 발생.
// require() 로 강제 순서 보장.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dotenv = require('dotenv');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { NestFactory } = require('@nestjs/core');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Logger } = require('@nestjs/common');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AppModule } = require('../src/app.module');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaService } = require('../src/prisma/prisma.service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { FoldersService } = require('../src/folders/folders.service');
type PrismaService = InstanceType<typeof import('../src/prisma/prisma.service').PrismaService>;
type FoldersService = InstanceType<typeof import('../src/folders/folders.service').FoldersService>;

interface Args {
  contactId: string | null;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const idx = argv.indexOf('--contact');
  const contactId = idx >= 0 ? (argv[idx + 1] ?? null) : null;
  const dryRun = argv.includes('--dry-run');
  return { contactId, dryRun };
}

async function pickCandidate(prisma: PrismaService): Promise<string | null> {
  // husk 가리키는 + inquiryType + inquiryNumber 보유한 contact 1건
  // (ensureInquiryFolder 는 inquiryNumber 필수 — task 21, buildInquiryFolderName 정책)
  const candidates = await prisma.contact.findMany({
    where: {
      deletedAt: null,
      inquiryType: { not: null },
      inquiryNumber: { not: null },
      NOT: { webhardFolderId: null },
    },
    select: {
      id: true,
      companyName: true,
      inquiryType: true,
      inquiryNumber: true,
      workNumber: true,
      processStage: true,
      status: true,
      webhardFolderId: true,
    },
    take: 200,
  });

  for (const c of candidates) {
    if (!c.webhardFolderId) continue;
    const f = await prisma.webhardFolder.findUnique({
      where: { id: c.webhardFolderId },
      select: { path: true, deletedAt: true },
    });
    if (!f || f.deletedAt) continue;
    if (f.path?.startsWith('/외부웹하드/')) {
      return c.id;
    }
  }
  return null;
}

async function snapshot(
  prisma: PrismaService,
  contactId: string
): Promise<{
  contactId: string;
  companyName: string | null;
  inquiryType: string | null;
  inquiryNumber: string | null;
  workNumber: string | null;
  processStage: string | null;
  status: string | null;
  webhardFolderId: string | null;
  folderPath: string | null;
  folderName: string | null;
  folderDeleted: boolean;
}> {
  const c = await prisma.contact.findUnique({
    where: { id: contactId },
    select: {
      id: true,
      companyName: true,
      inquiryType: true,
      inquiryNumber: true,
      workNumber: true,
      processStage: true,
      status: true,
      webhardFolderId: true,
    },
  });
  if (!c) throw new Error(`contact not found: ${contactId}`);

  let folderPath: string | null = null;
  let folderName: string | null = null;
  let folderDeleted = false;
  if (c.webhardFolderId) {
    const f = await prisma.webhardFolder.findUnique({
      where: { id: c.webhardFolderId },
      select: { path: true, name: true, deletedAt: true },
    });
    folderPath = f?.path ?? null;
    folderName = f?.name ?? null;
    folderDeleted = !!f?.deletedAt;
  }

  return {
    contactId: c.id,
    companyName: c.companyName,
    inquiryType: c.inquiryType,
    inquiryNumber: c.inquiryNumber,
    workNumber: c.workNumber,
    processStage: c.processStage,
    status: c.status,
    webhardFolderId: c.webhardFolderId,
    folderPath,
    folderName,
    folderDeleted,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const logger = new Logger('task29-phase2-trigger');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const foldersService = app.get(FoldersService);

    const contactId = args.contactId ?? (await pickCandidate(prisma));
    if (!contactId) {
      logger.error('no candidate found (no husk-pointing contact with inquiryType + number)');
      process.exit(1);
    }
    logger.log(`candidate contactId = ${contactId}`);

    const before = await snapshot(prisma, contactId);
    console.log('\n━━━ BEFORE ━━━');
    console.log(JSON.stringify(before, null, 2));

    const isHusk = before.folderPath?.startsWith('/외부웹하드/') ?? false;
    if (!isHusk) {
      logger.warn(
        `contact's current folder is not husk (path=${before.folderPath}) — Phase 2 정정 대상이 아님. 종료.`
      );
      process.exit(2);
    }

    if (args.dryRun) {
      console.log(`\n[dry-run] would call FoldersService.ensureInquiryFolder("${contactId}")`);
      return;
    }

    console.log(`\n━━━ TRIGGER ensureInquiryFolder("${contactId}") ━━━`);
    const folder = await foldersService.ensureInquiryFolder(contactId);
    console.log(`returned folder: ${folder ? `id=${folder.id} path=${folder.path}` : 'null'}`);

    const after = await snapshot(prisma, contactId);
    console.log('\n━━━ AFTER ━━━');
    console.log(JSON.stringify(after, null, 2));

    // ─── Assertions ───
    const assertions: Array<{ name: string; pass: boolean; detail: string }> = [];

    assertions.push({
      name: 'webhardFolderId 변경됨',
      pass: before.webhardFolderId !== after.webhardFolderId,
      detail: `before=${before.webhardFolderId} → after=${after.webhardFolderId}`,
    });

    assertions.push({
      name: 'after path 가 husk 아님 (정식 트리)',
      pass: !!after.folderPath && !after.folderPath.startsWith('/외부웹하드/'),
      detail: `path=${after.folderPath}`,
    });

    if (folder) {
      assertions.push({
        name: 'after webhardFolderId 가 ensureInquiryFolder 반환값과 일치',
        pass: after.webhardFolderId === folder.id,
        detail: `contact.webhardFolderId=${after.webhardFolderId} vs returned=${folder.id}`,
      });
    }

    assertions.push({
      name: 'inquiryType/number/processStage/status 미변경 (workflow 무영향)',
      pass:
        before.inquiryType === after.inquiryType &&
        before.inquiryNumber === after.inquiryNumber &&
        before.workNumber === after.workNumber &&
        before.processStage === after.processStage &&
        before.status === after.status,
      detail: `inquiryType=${after.inquiryType} stage=${after.processStage} status=${after.status}`,
    });

    console.log('\n━━━ ASSERTIONS ━━━');
    let allPass = true;
    for (const a of assertions) {
      const mark = a.pass ? '✅' : '❌';
      console.log(`  ${mark} ${a.name} — ${a.detail}`);
      if (!a.pass) allPass = false;
    }

    console.log(`\n[task29-phase2-trigger] ${allPass ? '✅ ALL PASS' : '❌ FAIL'}`);
    if (!allPass) process.exit(2);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('[task29-phase2-trigger] fatal:', err);
  process.exit(1);
});
