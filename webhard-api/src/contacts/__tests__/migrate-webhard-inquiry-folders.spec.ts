/**
 * WebhardFile 마이그레이션 스크립트 통합 단위 테스트.
 *
 * 스펙: tasks/18-drawing-consistency/phase7.md
 *
 * 검증:
 *   argv 파싱 — --apply / --company-id / --backfill-folder-kind 조합
 *   findMigrationTargets — inquiryType 있고 번호 있는 contact 만, company-id 필터 동작
 *   migrateContact —
 *     M1: cutting_request + O → move + rename 계획 (dry-run, DB 무변경)
 *     M2: mold_request + F → 동일
 *     M3: O+F 둘 다 + 파일 3개 → 모두 계획
 *     M4: 미분류 → status='unclassified', DB 무변경
 *     M5: 이미 제자리 + 이름 일치 → alreadyInPlace/alreadyCorrectName 카운트
 *     M6: 분할 문의 (parentContactId 있음) → 번호 suffix -1 유지
 *     A1: --apply 시 ensureInquiryFolder + relocateContactFiles + webhardFile.update(name) + WebhardLog
 *     A2: 재실행 idempotent — 변경 없음
 *     A3: ensureInquiryFolder 실패 → status='no-target-folder', DB 무변경
 *   backfillFolderKind — root/template/inquiry 분류 + contactId 역추적
 */

import {
  backfillFolderKind,
  findMigrationTargets,
  migrateContact,
  parseArgs,
  runMigration,
  type TargetContact,
} from '../../../scripts/migrate-webhard-inquiry-folders';
import {
  DRAWING_CONSISTENCY_CONTACT_IDS,
  DRAWING_CONSISTENCY_FILE_IDS,
  DRAWING_CONSISTENCY_FOLDER_IDS,
  seedDrawingConsistencyFixtures,
  type DrawingConsistencyFile,
  type DrawingConsistencyFolder,
} from '../../../prisma/seed';

// ─── Mock helpers ────────────────────────────────────────────

type Logger = { log: jest.Mock; error: jest.Mock; warn: jest.Mock };

function makeLogger(): Logger {
  return { log: jest.fn(), error: jest.fn(), warn: jest.fn() };
}

function toTargetContact(
  c: ReturnType<typeof seedDrawingConsistencyFixtures>['contacts'][number],
  revisions: ReturnType<typeof seedDrawingConsistencyFixtures>['revisions']
): TargetContact {
  return {
    id: c.id,
    companyName: c.companyName,
    inquiryNumber: c.inquiryNumber,
    workNumber: c.workNumber,
    inquiryType: c.inquiryType,
    processStage: c.processStage,
    drawingRevisions: revisions
      .filter((r) => r.contactId === c.id)
      .map((r) => ({ processStage: r.processStage, webhardFileIds: r.webhardFileIds })),
  };
}

interface WorldState {
  company: { id: number; companyName: string };
  folders: DrawingConsistencyFolder[];
  files: DrawingConsistencyFile[];
  webhardLogs: Array<{
    action: string;
    fileName: string;
    folderPath: string | null;
    status: string;
  }>;
}

function buildPrismaMock(world: WorldState) {
  const clone = <T>(v: T): T => (v === null || v === undefined ? v : structuredClone(v));

  const prisma = {
    contact: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(async () => {
        // 기본은 null — backfillFolderKind 테스트가 개별적으로 mockImplementation 으로 덮어씀.
        return null;
      }),
    },
    company: {
      findUnique: jest.fn(async (args: { where: { id: number } }) => {
        if (args.where.id === world.company.id) return clone(world.company);
        return null;
      }),
      findFirst: jest.fn(async (args: { where: { companyName: string } }) => {
        if (args.where.companyName === world.company.companyName) return clone(world.company);
        return null;
      }),
      findMany: jest.fn(async () => [clone(world.company)]),
    },
    webhardFolder: {
      findFirst: jest.fn(
        async (args: { where: { contactId?: string; folderKind?: string; deletedAt?: null } }) => {
          const match = world.folders.find(
            (f) =>
              (args.where.contactId === undefined || f.contactId === args.where.contactId) &&
              (args.where.folderKind === undefined || f.folderKind === args.where.folderKind) &&
              f.deletedAt === null
          );
          return match ? clone(match) : null;
        }
      ),
      findMany: jest.fn(async () => world.folders.filter((f) => f.deletedAt === null).map(clone)),
      update: jest.fn(
        async (args: {
          where: { id: string };
          data: Partial<DrawingConsistencyFolder> & {
            folderKind?: string;
            contactId?: string | null;
          };
        }) => {
          const idx = world.folders.findIndex((f) => f.id === args.where.id);
          if (idx < 0) throw new Error(`folder not found: ${args.where.id}`);
          world.folders[idx] = {
            ...world.folders[idx],
            ...(args.data as Partial<DrawingConsistencyFolder>),
          };
          return clone(world.folders[idx]);
        }
      ),
    },
    webhardFile: {
      findMany: jest.fn(
        async (args: {
          where: {
            deletedAt?: null;
            OR?: Array<{
              id?: { in: string[] };
              companyId?: number;
              inquiryNumber?: { in: string[] };
            }>;
          };
        }) => {
          const all = world.files.filter((f) => f.deletedAt === null);
          const matchIds = new Set<string>();
          for (const clause of args.where.OR ?? []) {
            if (clause.id?.in) {
              for (const id of clause.id.in) {
                if (all.some((f) => f.id === id)) matchIds.add(id);
              }
            }
            if (clause.companyId !== undefined && clause.inquiryNumber?.in) {
              for (const f of all) {
                if (
                  f.companyId === clause.companyId &&
                  clause.inquiryNumber.in.includes(f.inquiryNumber ?? '')
                ) {
                  matchIds.add(f.id);
                }
              }
            }
          }
          return all
            .filter((f) => matchIds.has(f.id))
            .map((f) => ({
              id: f.id,
              folderId: f.folderId,
              name: f.name,
              originalName: f.originalName,
            }));
        }
      ),
      update: jest.fn(
        async (args: { where: { id: string }; data: { name?: string; path?: string } }) => {
          const idx = world.files.findIndex((f) => f.id === args.where.id);
          if (idx < 0) throw new Error(`file not found: ${args.where.id}`);
          if (args.data.name !== undefined) world.files[idx].name = args.data.name;
          if (args.data.path !== undefined) world.files[idx].path = args.data.path;
          return clone(world.files[idx]);
        }
      ),
    },
    webhardLog: {
      create: jest.fn(async (args: { data: WorldState['webhardLogs'][number] }) => {
        world.webhardLogs.push({ ...args.data });
        return { id: BigInt(world.webhardLogs.length) };
      }),
    },
    drawingRevision: {
      findMany: jest.fn(async () => []),
    },
  };

  return prisma;
}

function buildFoldersMock(world: WorldState) {
  const rootPath = `/${world.company.companyName}`;
  type EnsureResult = { id: string; path: string | null } | null;
  // ensureInquiryFolder: 적절한 template 확보 → contactId 별 inquiry folder.
  const ensureInquiryFolder: jest.Mock<Promise<EnsureResult>, [string]> = jest.fn(
    async (contactId: string) => {
      // 테스트 맥락에서는 fixture 의 contact 정보를 외부에서 주입하기 어렵기 때문에
      // world.folders 에 이미 같은 contactId 로 inquiry 가 있으면 반환,
      // 없으면 새로 만들어 folders 에 push.
      const existing = world.folders.find(
        (f) => f.contactId === contactId && f.folderKind === 'inquiry'
      );
      if (existing) return { id: existing.id, path: existing.path };

      // contact 정보가 외부 인자에서 결정되므로 호출자가 contextually 폴더 이름/번호를
      // 제공한다. 간단하게 contact id 에서 마지막 문자로 구분 — 실제 FoldersService 는
      // DB 를 읽으므로 단순화.
      const newFolderId = `new-inquiry-${contactId.slice(-3)}`;
      const newFolder: DrawingConsistencyFolder = {
        id: newFolderId,
        name: contactId.slice(-6),
        parentId: DRAWING_CONSISTENCY_FOLDER_IDS.templateCutting,
        companyId: world.company.id,
        path: `${rootPath}/칼선의뢰/${contactId.slice(-6)}`,
        folderKind: 'inquiry',
        contactId,
        deletedAt: null,
      };
      world.folders.push(newFolder);
      return { id: newFolder.id, path: newFolder.path };
    }
  );

  const relocateContactFiles = jest.fn(async (contactId: string, targetFolderId: string) => {
    const targetFolder = world.folders.find((f) => f.id === targetFolderId);
    const targetPath = targetFolder?.path ?? null;
    const movedIds: string[] = [];
    // 마이그레이션 스크립트가 plan.moves 기준으로 호출하므로 여기서는 contactId 로 필터링된
    // 파일을 단순히 targetFolderId 로 이동시킨다.
    for (const f of world.files) {
      if (f.deletedAt !== null) continue;
      const belongs = matchFileToContact(f, contactId);
      if (!belongs) continue;
      if (f.folderId === targetFolderId) continue;
      f.folderId = targetFolderId;
      f.path = targetPath ? `${targetPath}/${f.name}` : f.name;
      movedIds.push(f.id);
    }
    return { movedIds };
  });

  return { ensureInquiryFolder, relocateContactFiles };
}

// 테스트 편의: contact id ↔ fixture 파일 매핑 테이블
function matchFileToContact(f: DrawingConsistencyFile, contactId: string): boolean {
  const map: Record<string, string[]> = {
    [DRAWING_CONSISTENCY_CONTACT_IDS.c1]: [DRAWING_CONSISTENCY_FILE_IDS.f1],
    [DRAWING_CONSISTENCY_CONTACT_IDS.c2]: [DRAWING_CONSISTENCY_FILE_IDS.f2],
    [DRAWING_CONSISTENCY_CONTACT_IDS.c3]: [
      DRAWING_CONSISTENCY_FILE_IDS.f3a,
      DRAWING_CONSISTENCY_FILE_IDS.f3b,
      DRAWING_CONSISTENCY_FILE_IDS.f3c,
    ],
    [DRAWING_CONSISTENCY_CONTACT_IDS.c4]: [DRAWING_CONSISTENCY_FILE_IDS.f4],
    [DRAWING_CONSISTENCY_CONTACT_IDS.c5]: [DRAWING_CONSISTENCY_FILE_IDS.f5],
    [DRAWING_CONSISTENCY_CONTACT_IDS.c6]: [DRAWING_CONSISTENCY_FILE_IDS.f6],
  };
  return (map[contactId] ?? []).includes(f.id);
}

function makeWorld(): WorldState {
  const fx = seedDrawingConsistencyFixtures();
  return {
    company: fx.company,
    folders: structuredClone(fx.folders),
    files: structuredClone(fx.files),
    webhardLogs: [],
  };
}

// ═══════════════════════════════════════════════════════════
// parseArgs
// ═══════════════════════════════════════════════════════════

describe('parseArgs', () => {
  it('기본: dry-run', () => {
    expect(parseArgs(['node', 'script'])).toEqual({
      apply: false,
      companyId: undefined,
      backfillFolderKind: false,
    });
  });

  it('--apply 감지', () => {
    expect(parseArgs(['node', 'script', '--apply']).apply).toBe(true);
  });

  it('--company-id 숫자 파싱', () => {
    expect(parseArgs(['node', 'script', '--company-id', '42']).companyId).toBe(42);
  });

  it('--company-id 비숫자면 무시', () => {
    expect(parseArgs(['node', 'script', '--company-id', 'abc']).companyId).toBeUndefined();
  });

  it('--backfill-folder-kind + --apply 동시 설정', () => {
    const flags = parseArgs(['node', 'script', '--backfill-folder-kind', '--apply']);
    expect(flags.backfillFolderKind).toBe(true);
    expect(flags.apply).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// findMigrationTargets
// ═══════════════════════════════════════════════════════════

describe('findMigrationTargets', () => {
  it('inquiryType 있고 번호 있는 contact 만 반환', async () => {
    const prisma = {
      contact: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'c1',
            companyName: 'X',
            inquiryNumber: 'O-1',
            workNumber: null,
            inquiryType: 'cutting_request',
            processStage: null,
            drawingRevisions: [],
          },
        ]),
      },
      company: { findUnique: jest.fn() },
    } as unknown as Parameters<typeof findMigrationTargets>[0];

    const result = await findMigrationTargets(prisma);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c1');
    const where = (prisma.contact.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.inquiryType).toEqual({ not: null });
    expect(where.OR).toEqual([{ inquiryNumber: { not: null } }, { workNumber: { not: null } }]);
  });

  it('--company-id 전달 시 해당 회사의 companyName 으로 필터링', async () => {
    const prisma = {
      contact: { findMany: jest.fn().mockResolvedValue([]) },
      company: {
        findUnique: jest.fn().mockResolvedValue({ companyName: '거래처X' }),
      },
    } as unknown as Parameters<typeof findMigrationTargets>[0];

    await findMigrationTargets(prisma, { companyId: 42 });
    expect(prisma.company.findUnique).toHaveBeenCalledWith({
      where: { id: 42 },
      select: { companyName: true },
    });
    const where = (prisma.contact.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.companyName).toBe('거래처X');
  });

  it('--company-id 에 매칭되는 회사 없으면 빈 배열', async () => {
    const prisma = {
      contact: { findMany: jest.fn() },
      company: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as Parameters<typeof findMigrationTargets>[0];

    const result = await findMigrationTargets(prisma, { companyId: 999 });
    expect(result).toEqual([]);
    expect(prisma.contact.findMany).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════
// migrateContact — per-case
// ═══════════════════════════════════════════════════════════

describe('migrateContact — dry-run (phase7 6 contact 케이스)', () => {
  it('M1: cutting_request + O → move + rename 계획, DB 무변경', async () => {
    const world = makeWorld();
    const prisma = buildPrismaMock(world);
    const foldersService = buildFoldersMock(world);
    const fx = seedDrawingConsistencyFixtures();
    const c1 = toTargetContact(
      fx.contacts.find((c) => c.id === DRAWING_CONSISTENCY_CONTACT_IDS.c1)!,
      fx.revisions
    );

    const plan = await migrateContact({
      prisma: prisma as never,
      foldersService,
      contact: c1,
      apply: false,
      logger: makeLogger(),
    });

    expect(plan.status).toBe('planned');
    expect(plan.templateName).toBe('칼선의뢰');
    expect(plan.folderName).toBe('260420-O-101');
    expect(plan.moves).toHaveLength(1);
    expect(plan.moves[0].fileId).toBe(DRAWING_CONSISTENCY_FILE_IDS.f1);
    expect(plan.renames).toHaveLength(1);
    expect(plan.renames[0]).toMatchObject({
      fileId: DRAWING_CONSISTENCY_FILE_IDS.f1,
      from: '원본1.dxf',
      to: '[260420-O-101] 원본1.dxf',
    });
    // DB 무변경
    expect(foldersService.ensureInquiryFolder).not.toHaveBeenCalled();
    expect(foldersService.relocateContactFiles).not.toHaveBeenCalled();
    expect(prisma.webhardFile.update).not.toHaveBeenCalled();
    expect(prisma.webhardLog.create).not.toHaveBeenCalled();
  });

  it('M2: mold_request + F 만 (inquiryNumber 없음) → F 번호 폴더 계획', async () => {
    const world = makeWorld();
    const prisma = buildPrismaMock(world);
    const foldersService = buildFoldersMock(world);
    const fx = seedDrawingConsistencyFixtures();
    const c2 = toTargetContact(
      fx.contacts.find((c) => c.id === DRAWING_CONSISTENCY_CONTACT_IDS.c2)!,
      fx.revisions
    );

    const plan = await migrateContact({
      prisma: prisma as never,
      foldersService,
      contact: c2,
      apply: false,
      logger: makeLogger(),
    });

    expect(plan.status).toBe('planned');
    expect(plan.folderName).toBe('260420-F-101');
    expect(plan.moves).toHaveLength(1);
    expect(plan.renames).toHaveLength(1);
    expect(plan.renames[0]).toMatchObject({
      fileId: DRAWING_CONSISTENCY_FILE_IDS.f2,
      from: '원본2.dxf',
      to: '[260420-F-101] 원본2.dxf',
    });
    expect(foldersService.ensureInquiryFolder).not.toHaveBeenCalled();
  });

  it('M3: O+F 양쪽 번호 + 파일 3개 → 3개 계획 (폴더명 O_F)', async () => {
    const world = makeWorld();
    const prisma = buildPrismaMock(world);
    const foldersService = buildFoldersMock(world);
    const fx = seedDrawingConsistencyFixtures();
    const c3 = toTargetContact(
      fx.contacts.find((c) => c.id === DRAWING_CONSISTENCY_CONTACT_IDS.c3)!,
      fx.revisions
    );

    const plan = await migrateContact({
      prisma: prisma as never,
      foldersService,
      contact: c3,
      apply: false,
      logger: makeLogger(),
    });

    expect(plan.templateName).toBe('목형의뢰');
    expect(plan.folderName).toBe('260420-O-102_260420-F-102');
    expect(plan.moves.length + plan.alreadyInPlace).toBe(3);
    expect(plan.renames).toHaveLength(3);
    // processStage='drawing_confirmed' → FIELD → workNumber prefix
    expect(plan.renames.every((r) => r.to.startsWith('[260420-F-102] '))).toBe(true);
  });

  it('M4: 미분류 (inquiryType=null) → status=unclassified, 파일 무시', async () => {
    const world = makeWorld();
    const prisma = buildPrismaMock(world);
    const foldersService = buildFoldersMock(world);
    const fx = seedDrawingConsistencyFixtures();
    const c4 = toTargetContact(
      fx.contacts.find((c) => c.id === DRAWING_CONSISTENCY_CONTACT_IDS.c4)!,
      fx.revisions
    );

    const plan = await migrateContact({
      prisma: prisma as never,
      foldersService,
      contact: c4,
      apply: false,
      logger: makeLogger(),
    });

    expect(plan.status).toBe('unclassified');
    expect(plan.moves).toHaveLength(0);
    expect(plan.renames).toHaveLength(0);
    // DB 무변경
    expect(foldersService.ensureInquiryFolder).not.toHaveBeenCalled();
  });

  it('M5: 이미 제자리·정확한 이름 → 계획 0건, alreadyInPlace/Correct 카운트', async () => {
    const world = makeWorld();
    const prisma = buildPrismaMock(world);
    const foldersService = buildFoldersMock(world);
    const fx = seedDrawingConsistencyFixtures();
    const c5 = toTargetContact(
      fx.contacts.find((c) => c.id === DRAWING_CONSISTENCY_CONTACT_IDS.c5)!,
      fx.revisions
    );

    const plan = await migrateContact({
      prisma: prisma as never,
      foldersService,
      contact: c5,
      apply: false,
      logger: makeLogger(),
    });

    expect(plan.moves).toHaveLength(0);
    expect(plan.renames).toHaveLength(0);
    expect(plan.alreadyInPlace).toBe(1);
    expect(plan.alreadyCorrectName).toBe(1);
  });

  it('M6: 분할 문의 (parentContactId) → 번호 suffix -1 포함 폴더명', async () => {
    const world = makeWorld();
    const prisma = buildPrismaMock(world);
    const foldersService = buildFoldersMock(world);
    const fx = seedDrawingConsistencyFixtures();
    const c6 = toTargetContact(
      fx.contacts.find((c) => c.id === DRAWING_CONSISTENCY_CONTACT_IDS.c6)!,
      fx.revisions
    );

    const plan = await migrateContact({
      prisma: prisma as never,
      foldersService,
      contact: c6,
      apply: false,
      logger: makeLogger(),
    });

    expect(plan.folderName).toBe('260417-O-002-1');
    expect(plan.renames[0].to).toBe('[260417-O-002-1] 원본6.dxf');
  });
});

// ═══════════════════════════════════════════════════════════
// migrateContact — apply + idempotency + failure
// ═══════════════════════════════════════════════════════════

describe('migrateContact — apply 모드', () => {
  it('A1: --apply 시 ensureInquiryFolder + relocateContactFiles + updateMany(name) + WebhardLog 기록', async () => {
    const world = makeWorld();
    const prisma = buildPrismaMock(world);
    const foldersService = buildFoldersMock(world);
    const fx = seedDrawingConsistencyFixtures();
    const c1 = toTargetContact(
      fx.contacts.find((c) => c.id === DRAWING_CONSISTENCY_CONTACT_IDS.c1)!,
      fx.revisions
    );

    const plan = await migrateContact({
      prisma: prisma as never,
      foldersService,
      contact: c1,
      apply: true,
      logger: makeLogger(),
    });

    expect(plan.status).toBe('applied');
    expect(foldersService.ensureInquiryFolder).toHaveBeenCalledWith(c1.id);
    expect(foldersService.relocateContactFiles).toHaveBeenCalledTimes(1);
    // 파일 이름/path 가 실제로 변경됐는지 (prisma mock 이 world.files 를 갱신)
    const updatedFile = world.files.find((f) => f.id === DRAWING_CONSISTENCY_FILE_IDS.f1)!;
    expect(updatedFile.name).toBe('[260420-O-101] 원본1.dxf');
    // WebhardLog 기록 — 이동 1건 + rename 1건
    const moveLogs = world.webhardLogs.filter((l) => l.action === 'migrate_move');
    const renameLogs = world.webhardLogs.filter((l) => l.action === 'migrate_rename');
    expect(moveLogs).toHaveLength(1);
    expect(renameLogs).toHaveLength(1);
  });

  it('A2: 재실행 idempotent — 제자리 파일은 move skip, name 일치 → rename skip, 로그 없음', async () => {
    const world = makeWorld();
    const prisma = buildPrismaMock(world);
    const foldersService = buildFoldersMock(world);
    const fx = seedDrawingConsistencyFixtures();
    const c5 = toTargetContact(
      fx.contacts.find((c) => c.id === DRAWING_CONSISTENCY_CONTACT_IDS.c5)!,
      fx.revisions
    );

    const plan = await migrateContact({
      prisma: prisma as never,
      foldersService,
      contact: c5,
      apply: true,
      logger: makeLogger(),
    });

    expect(plan.status).toBe('applied');
    expect(foldersService.relocateContactFiles).not.toHaveBeenCalled();
    expect(prisma.webhardFile.update).not.toHaveBeenCalled();
    expect(world.webhardLogs).toHaveLength(0);
  });

  it('A3: ensureInquiryFolder 가 null 반환 → status=no-target-folder, DB 무변경', async () => {
    const world = makeWorld();
    const prisma = buildPrismaMock(world);
    const foldersService = buildFoldersMock(world);
    foldersService.ensureInquiryFolder.mockResolvedValueOnce(null);

    const fx = seedDrawingConsistencyFixtures();
    const c1 = toTargetContact(
      fx.contacts.find((c) => c.id === DRAWING_CONSISTENCY_CONTACT_IDS.c1)!,
      fx.revisions
    );

    const plan = await migrateContact({
      prisma: prisma as never,
      foldersService,
      contact: c1,
      apply: true,
      logger: makeLogger(),
    });

    expect(plan.status).toBe('no-target-folder');
    expect(foldersService.relocateContactFiles).not.toHaveBeenCalled();
    expect(prisma.webhardFile.update).not.toHaveBeenCalled();
    expect(world.webhardLogs).toHaveLength(0);
    expect(world.files.find((f) => f.id === DRAWING_CONSISTENCY_FILE_IDS.f1)!.name).toBe(
      '원본1.dxf'
    );
  });
});

// ═══════════════════════════════════════════════════════════
// runMigration — aggregated flow
// ═══════════════════════════════════════════════════════════

describe('runMigration — 6 Contact 통합', () => {
  it('dry-run: 6 contact 스캔, 미분류 1 skip, 나머지 계획 생성 (DB 무변경)', async () => {
    const world = makeWorld();
    const prisma = buildPrismaMock(world);
    const foldersService = buildFoldersMock(world);
    const fx = seedDrawingConsistencyFixtures();
    const logger = makeLogger();

    // findMigrationTargets 가 prisma.contact.findMany 로 모든 케이스를 가져오도록 mock.
    (prisma.contact.findMany as jest.Mock).mockResolvedValue(
      fx.contacts
        .filter((c) => c.inquiryType !== null || c.inquiryNumber) // unclassified 도 inquiryNumber 있으므로 포함됨
        .filter((c) => c.inquiryNumber || c.workNumber)
        .map((c) => ({
          id: c.id,
          companyName: c.companyName,
          inquiryNumber: c.inquiryNumber,
          workNumber: c.workNumber,
          inquiryType: c.inquiryType,
          processStage: c.processStage,
          drawingRevisions: fx.revisions
            .filter((r) => r.contactId === c.id)
            .map((r) => ({ processStage: r.processStage, webhardFileIds: r.webhardFileIds })),
        }))
    );

    const stats = await runMigration({
      prisma: prisma as never,
      foldersService,
      flags: { apply: false, backfillFolderKind: false },
      logger,
    });

    // 6 contact 중 inquiryType=null 인 c4 는 findMany 의 `not: null` 필터가 실제 DB 에선 제외하지만,
    // mock 에선 필터가 mockResolvedValue 결과에만 의존 — 스크립트는 unclassified 를 status 로 처리.
    expect(stats.scannedContacts).toBeGreaterThanOrEqual(5);
    expect(stats.plannedMoves).toBeGreaterThan(0);
    expect(stats.plannedRenames).toBeGreaterThan(0);
    expect(stats.appliedMoves).toBe(0);
    expect(stats.appliedRenames).toBe(0);
    // DB 무변경
    expect(foldersService.ensureInquiryFolder).not.toHaveBeenCalled();
    expect(world.webhardLogs).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════
// backfillFolderKind
// ═══════════════════════════════════════════════════════════

describe('backfillFolderKind', () => {
  it('root / template / inquiry 분류 + contactId 역추적', async () => {
    const world = makeWorld();
    const prisma = buildPrismaMock(world);
    // 기존 inquiry 폴더의 folderKind 를 'generic' 으로 낮춰 백필 대상으로 만듦
    const c5Folder = world.folders.find((f) => f.id === DRAWING_CONSISTENCY_FOLDER_IDS.inquiryC5)!;
    c5Folder.folderKind = 'generic';
    c5Folder.contactId = null;

    // 문의 이름에서 번호로 contact lookup 하는 findFirst 가 호출된다.
    type FindFirstArgs = {
      where?: {
        OR?: Array<{
          inquiryNumber?: { in: string[] };
          workNumber?: { in: string[] };
        }>;
      };
    };
    (prisma.contact.findFirst as jest.Mock).mockImplementation(async (args: FindFirstArgs) => {
      const or = args.where?.OR;
      const candidates = new Set<string>();
      for (const clause of or ?? []) {
        for (const v of clause.inquiryNumber?.in ?? []) candidates.add(v);
        for (const v of clause.workNumber?.in ?? []) candidates.add(v);
      }
      const fx = seedDrawingConsistencyFixtures();
      const match = fx.contacts.find(
        (c) =>
          (c.inquiryNumber && candidates.has(c.inquiryNumber)) ||
          (c.workNumber && candidates.has(c.workNumber))
      );
      return match ? { id: match.id } : null;
    });

    const logger = makeLogger();
    const result = await backfillFolderKind(prisma as never, { apply: true, logger });

    expect(result.root).toBe(1);
    expect(result.template).toBe(2);
    expect(result.inquiry).toBe(1);
    // 적용 후 DB 상태
    const rootFolder = world.folders.find((f) => f.id === DRAWING_CONSISTENCY_FOLDER_IDS.root)!;
    expect(rootFolder.folderKind).toBe('root');
    const cuttingTemplate = world.folders.find(
      (f) => f.id === DRAWING_CONSISTENCY_FOLDER_IDS.templateCutting
    )!;
    expect(cuttingTemplate.folderKind).toBe('template');
    const c5Updated = world.folders.find((f) => f.id === DRAWING_CONSISTENCY_FOLDER_IDS.inquiryC5)!;
    expect(c5Updated.folderKind).toBe('inquiry');
    expect(c5Updated.contactId).toBe(DRAWING_CONSISTENCY_CONTACT_IDS.c5);
  });

  it('dry-run 이면 folderKind 를 수정하지 않는다', async () => {
    const world = makeWorld();
    const prisma = buildPrismaMock(world);
    const before = world.folders.map((f) => f.folderKind);
    (prisma.contact.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await backfillFolderKind(prisma as never, {
      apply: false,
      logger: makeLogger(),
    });

    expect(result.scanned).toBe(world.folders.length);
    expect(world.folders.map((f) => f.folderKind)).toEqual(before);
    expect(prisma.webhardFolder.update).not.toHaveBeenCalled();
  });
});
