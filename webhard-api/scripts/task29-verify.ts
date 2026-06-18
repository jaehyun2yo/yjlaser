/**
 * task 29 (laser-only-folder-lifecycle) — dev DB read-only verification.
 *
 * 운영자가 직접 브라우저로 manual QA 하지 않고도 Phase 1~3 효과를 자동 검증.
 * 모든 쿼리 read-only, write 없음.
 *
 * 사용법:
 *   cd webhard-api
 *   npx tsx scripts/task29-verify.ts                       # 모든 laser_only 업체
 *   npx tsx scripts/task29-verify.ts --company "대성목형"   # 특정 업체만
 *   npx tsx scripts/task29-verify.ts --json                # JSON 출력
 *
 * 검증 항목:
 *   1. company 존재 + laserOnly 플래그
 *   2. 정식 root 폴더 (parentId=null, companyId=company.id, name=companyName) 존재
 *   3. 외부웹하드 husk 잔존 여부 (외부웹하드 root 직속 자식 + 정규화 매칭)
 *   4. 정식 root 하위 분류 폴더 (칼선의뢰/목형의뢰/완료) 존재
 *   5. 활성 inquiry 폴더 트리 — 분류별 + 완료별 카운트
 *   6. contacts.webhardFolderId 분포 — null / husk(/외부웹하드/) / 정식 / orphan
 *   7. 회복 절차 필요 여부 진단
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { PrismaClient } from '@prisma/client';
import { normalizeCompanyName } from '../src/folders/_lib/company-name-match.util';

interface Args {
  company: string | null;
  json: boolean;
  verbose: boolean;
}

function parseArgs(argv: string[]): Args {
  const idx = argv.indexOf('--company');
  const company = idx >= 0 ? (argv[idx + 1] ?? null) : null;
  const json = argv.includes('--json');
  const verbose = argv.includes('--verbose');
  return { company, json, verbose };
}

interface CompanyReport {
  companyId: number;
  companyName: string;
  laserOnly: boolean;
  rootFolder: {
    id: string;
    name: string;
    path: string | null;
  } | null;
  huskCandidates: Array<{
    id: string;
    name: string;
    path: string | null;
    childFolderCount: number;
    childFileCount: number;
    matchKind: 'exact-path' | 'exact-name' | 'normalized';
  }>;
  templateFolders: Array<{ id: string; name: string; folderKind: string }>;
  inquiryFolders: {
    total: number;
    underInquiry: number;
    underWork: number;
    underCompleted: number;
    underOther: number;
  };
  contacts: {
    total: number;
    withFolderId: number;
    nullFolderId: number;
    huskFolderId: number;
    properFolderId: number;
    orphanFolderId: number;
    samples: Array<{
      contactId: string;
      processStage: string | null;
      status: string | null;
      webhardFolderId: string | null;
      folderClassification: 'null' | 'husk' | 'proper' | 'orphan';
    }>;
  };
  diagnosis: {
    huskRemaining: boolean;
    huskFolderHasChildren: boolean;
    huskContactsRemaining: number;
    rootFolderMissing: boolean;
    needsRemigration: boolean;
    explanation: string[];
  };
}

async function findHuskCandidates(
  prisma: PrismaClient,
  companyName: string,
  rootFolderId: string | null
): Promise<CompanyReport['huskCandidates']> {
  // 1차 path 정확 일치 — 가장 안전
  const exactPath = await prisma.webhardFolder.findFirst({
    where: {
      name: companyName,
      path: `/외부웹하드/${companyName}`,
      deletedAt: null,
    },
    select: { id: true, name: true, path: true },
  });

  // 2/3차: 외부웹하드 root 직속 자식
  const externalRoot = await prisma.webhardFolder.findFirst({
    where: { name: '외부웹하드', parentId: null, deletedAt: null },
    select: { id: true },
  });

  if (!externalRoot) {
    return exactPath
      ? [
          {
            ...exactPath,
            childFolderCount: 0,
            childFileCount: 0,
            matchKind: 'exact-path' as const,
          },
        ]
      : [];
  }

  const directChildren = await prisma.webhardFolder.findMany({
    where: { parentId: externalRoot.id, deletedAt: null },
    select: { id: true, name: true, path: true },
    orderBy: { createdAt: 'asc' },
  });

  const normalized = normalizeCompanyName(companyName);
  const seen = new Set<string>();
  const out: CompanyReport['huskCandidates'] = [];

  if (exactPath) {
    seen.add(exactPath.id);
    const [folderCount, fileCount] = await countChildren(prisma, exactPath.id);
    out.push({
      ...exactPath,
      childFolderCount: folderCount,
      childFileCount: fileCount,
      matchKind: 'exact-path',
    });
  }

  for (const c of directChildren) {
    if (seen.has(c.id)) continue;
    let matchKind: 'exact-name' | 'normalized' | null = null;
    if (c.name === companyName.trim()) {
      matchKind = 'exact-name';
    } else if (normalized && normalizeCompanyName(c.name) === normalized) {
      matchKind = 'normalized';
    }
    if (!matchKind) continue;
    if (rootFolderId && c.id === rootFolderId) continue;

    const [folderCount, fileCount] = await countChildren(prisma, c.id);
    out.push({
      ...c,
      childFolderCount: folderCount,
      childFileCount: fileCount,
      matchKind,
    });
    seen.add(c.id);
  }

  return out;
}

async function countChildren(prisma: PrismaClient, folderId: string): Promise<[number, number]> {
  const [folders, files] = await Promise.all([
    prisma.webhardFolder.count({
      where: { parentId: folderId, deletedAt: null },
    }),
    prisma.webhardFile.count({
      where: { folderId, deletedAt: null },
    }),
  ]);
  return [folders, files];
}

async function classifyContactFolder(
  prisma: PrismaClient,
  webhardFolderId: string | null
): Promise<'null' | 'husk' | 'proper' | 'orphan'> {
  if (!webhardFolderId) return 'null';
  const folder = await prisma.webhardFolder.findUnique({
    where: { id: webhardFolderId },
    select: { path: true, deletedAt: true },
  });
  if (!folder || folder.deletedAt) return 'orphan';
  if (folder.path?.startsWith('/외부웹하드/')) return 'husk';
  return 'proper';
}

async function buildReport(
  prisma: PrismaClient,
  company: { id: number; companyName: string; laserOnly: boolean }
): Promise<CompanyReport> {
  const root = await prisma.webhardFolder.findFirst({
    where: {
      companyId: company.id,
      parentId: null,
      deletedAt: null,
      name: company.companyName,
    },
    select: { id: true, name: true, path: true },
  });

  const huskCandidates = await findHuskCandidates(prisma, company.companyName, root?.id ?? null);

  const templateFolders = root
    ? await prisma.webhardFolder.findMany({
        where: {
          parentId: root.id,
          deletedAt: null,
          name: { in: ['칼선의뢰', '목형의뢰', '완료'] },
        },
        select: { id: true, name: true, folderKind: true },
      })
    : [];

  const inquiryRows = root
    ? await prisma.webhardFolder.findMany({
        where: {
          deletedAt: null,
          folderKind: 'inquiry',
          path: { startsWith: `/${company.companyName}/` },
        },
        select: { id: true, path: true },
      })
    : [];

  const inquiryStats = {
    total: inquiryRows.length,
    underInquiry: 0,
    underWork: 0,
    underCompleted: 0,
    underOther: 0,
  };
  for (const f of inquiryRows) {
    const p = f.path ?? '';
    if (p.includes('/칼선의뢰/')) inquiryStats.underInquiry += 1;
    else if (p.includes('/목형의뢰/')) inquiryStats.underWork += 1;
    else if (p.includes('/완료/')) inquiryStats.underCompleted += 1;
    else inquiryStats.underOther += 1;
  }

  const allContacts = await prisma.contact.findMany({
    where: {
      companyName: company.companyName,
      deletedAt: null,
    },
    select: {
      id: true,
      processStage: true,
      status: true,
      webhardFolderId: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  const contactStats = {
    total: allContacts.length,
    withFolderId: 0,
    nullFolderId: 0,
    huskFolderId: 0,
    properFolderId: 0,
    orphanFolderId: 0,
    samples: [] as CompanyReport['contacts']['samples'],
  };

  for (const c of allContacts) {
    const klass = await classifyContactFolder(prisma, c.webhardFolderId);
    if (klass === 'null') contactStats.nullFolderId += 1;
    else contactStats.withFolderId += 1;
    if (klass === 'husk') contactStats.huskFolderId += 1;
    if (klass === 'proper') contactStats.properFolderId += 1;
    if (klass === 'orphan') contactStats.orphanFolderId += 1;
  }

  // sample: husk 케이스 우선, 그 다음 proper, null. 최대 5개.
  const huskContacts = await Promise.all(
    allContacts.slice(0, 100).map(async (c) => ({
      contact: c,
      klass: await classifyContactFolder(prisma, c.webhardFolderId),
    }))
  );
  const samplesPriority = [
    ...huskContacts.filter((x) => x.klass === 'husk'),
    ...huskContacts.filter((x) => x.klass === 'orphan'),
    ...huskContacts.filter((x) => x.klass === 'proper'),
    ...huskContacts.filter((x) => x.klass === 'null'),
  ].slice(0, 5);
  contactStats.samples = samplesPriority.map((x) => ({
    contactId: x.contact.id,
    processStage: x.contact.processStage,
    status: x.contact.status,
    webhardFolderId: x.contact.webhardFolderId,
    folderClassification: x.klass,
  }));

  const huskRemaining = huskCandidates.length > 0;
  const huskHasChildren = huskCandidates.some(
    (h) => h.childFolderCount > 0 || h.childFileCount > 0
  );
  const explanation: string[] = [];
  if (!root) {
    explanation.push(
      `정식 root 폴더 미존재 — 매핑이 아직 등록되지 않았거나 cascade 가 아예 실행되지 않음.`
    );
  }
  if (huskHasChildren) {
    explanation.push(
      `외부웹하드 husk 에 자식 폴더/파일 잔존 — Phase 1 cascade 가 자식을 옮기지 못함. "재마이그레이션" 실행 권장.`
    );
  } else if (huskRemaining) {
    explanation.push(
      `외부웹하드 husk 자체는 남아있지만 자식 없음 (예상 동작 — 정식 트리로 자식만 이동됨).`
    );
  }
  if (contactStats.huskFolderId > 0) {
    explanation.push(
      `contact.webhardFolderId 가 husk 가리키는 케이스 ${contactStats.huskFolderId} 건 — Phase 2 syncContactWebhardFolderId 가 아직 동작 안 했거나 ensureInquiryFolder 미경유. inquiry 폴더 ensure 시 자동 정정.`
    );
  }
  if (contactStats.orphanFolderId > 0) {
    explanation.push(
      `contact.webhardFolderId 가 deleted/missing 폴더 가리키는 orphan ${contactStats.orphanFolderId} 건 — 별도 cleanup 필요.`
    );
  }
  if (
    root &&
    !huskRemaining &&
    contactStats.huskFolderId === 0 &&
    contactStats.orphanFolderId === 0
  ) {
    explanation.push(`✅ 모든 검증 정상 — Phase 1~3 효과 확인됨.`);
  }

  const needsRemigration = huskHasChildren;

  return {
    companyId: company.id,
    companyName: company.companyName,
    laserOnly: company.laserOnly,
    rootFolder: root,
    huskCandidates,
    templateFolders,
    inquiryFolders: inquiryStats,
    contacts: contactStats,
    diagnosis: {
      huskRemaining,
      huskFolderHasChildren: huskHasChildren,
      huskContactsRemaining: contactStats.huskFolderId,
      rootFolderMissing: !root,
      needsRemigration,
      explanation,
    },
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const prisma = new PrismaClient();

  try {
    const where = args.company ? { companyName: { contains: args.company } } : { laserOnly: true };
    const companies = await prisma.company.findMany({
      where,
      select: { id: true, companyName: true, laserOnly: true },
      orderBy: { companyName: 'asc' },
    });

    if (companies.length === 0) {
      console.error(
        args.company
          ? `[task29-verify] 매칭 업체 없음: "${args.company}"`
          : `[task29-verify] laser_only 업체 없음`
      );
      process.exit(1);
    }

    const reports: CompanyReport[] = [];
    for (const c of companies) {
      reports.push(await buildReport(prisma, c));
    }

    if (args.json) {
      console.log(JSON.stringify(reports, null, 2));
      return;
    }

    if (args.verbose) {
      // 회사별 alias 조회 + alias folderName 으로 husk 정확 매칭
      for (const r of reports) {
        const aliases = await prisma.companyFolderAlias.findMany({
          where: { companyId: r.companyId },
          select: {
            id: true,
            folderName: true,
            status: true,
            createdAt: true,
            approvedAt: true,
          },
          orderBy: { createdAt: 'asc' },
        });
        if (aliases.length === 0) {
          console.log(`\n━━━ ${r.companyName} — alias (none) ⚠️  매핑 미등록 ━━━`);
          continue;
        }
        console.log(`\n━━━ ${r.companyName} — CompanyFolderAlias (${aliases.length}) ━━━`);
        for (const a of aliases) {
          const husk = await prisma.webhardFolder.findFirst({
            where: { name: a.folderName, deletedAt: null, path: { startsWith: '/외부웹하드/' } },
            select: { id: true, path: true, createdAt: true },
          });
          let huskInfo = '(husk not found)';
          if (husk) {
            const [folders, files] = await countChildren(prisma, husk.id);
            huskInfo = `husk id=${husk.id.slice(0, 8)}… created=${husk.createdAt.toISOString()} children=${folders}folders/${files}files`;
          }
          console.log(
            `  - alias#${a.id} folderName="${a.folderName}" status=${a.status} approved=${a.approvedAt?.toISOString() ?? '(none)'} → ${huskInfo}`
          );
        }
      }

      // /대성목형/문의/ 같은 비정상 parent 추적
      for (const r of reports) {
        if (!r.rootFolder) continue;
        const wrongParent = await prisma.webhardFolder.findMany({
          where: {
            parentId: r.rootFolder.id,
            deletedAt: null,
            NOT: { name: { in: ['칼선의뢰', '목형의뢰', '완료'] } },
          },
          select: { id: true, name: true, path: true, folderKind: true, createdAt: true },
        });
        if (wrongParent.length > 0) {
          console.log(
            `\n━━━ ${r.companyName} — 정식 root 의 비정상 자식 (${wrongParent.length}) ━━━`
          );
          for (const f of wrongParent) {
            const [folders, files] = await countChildren(prisma, f.id);
            console.log(
              `  - id=${f.id.slice(0, 8)}… name="${f.name}" kind=${f.folderKind} children=${folders}folders/${files}files path=${f.path} created=${f.createdAt.toISOString().slice(0, 16)}`
            );
          }
        }
      }

      // contact ensureInquiryFolder 정정 가능성 진단 — inquiryNumber/workNumber/companyName 유무
      for (const r of reports) {
        const fixableContacts = await prisma.contact.count({
          where: {
            companyName: r.companyName,
            deletedAt: null,
            inquiryType: { not: null },
            OR: [{ inquiryNumber: { not: null } }, { workNumber: { not: null } }],
            NOT: { webhardFolderId: null },
          },
        });
        const totalNonNullFolderId = await prisma.contact.count({
          where: {
            companyName: r.companyName,
            deletedAt: null,
            NOT: { webhardFolderId: null },
          },
        });
        const hasNumber = await prisma.contact.count({
          where: {
            companyName: r.companyName,
            deletedAt: null,
            inquiryType: { not: null },
            OR: [{ inquiryNumber: { not: null } }, { workNumber: { not: null } }],
          },
        });
        console.log(`\n━━━ ${r.companyName} — ensureInquiryFolder 정정 가능성 ━━━`);
        console.log(
          `  totalContacts=${r.contacts.total} hasNumber=${hasNumber} fixableViaEnsure=${fixableContacts} (inquiryType+number+webhardFolderId 보유)`
        );
        console.log(`  totalNonNullFolderId=${totalNonNullFolderId} (husk/proper/orphan 합계)`);
      }

      // 외부웹하드 root 자식 전체 (제일 마지막에)
      const externalRoot = await prisma.webhardFolder.findFirst({
        where: { name: '외부웹하드', parentId: null, deletedAt: null },
        select: { id: true },
      });
      if (externalRoot) {
        const externalChildren = await prisma.webhardFolder.findMany({
          where: { parentId: externalRoot.id, deletedAt: null },
          select: { id: true, name: true, path: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        });
        console.log(
          `\n━━━ 외부웹하드 root 직속 자식 총 ${externalChildren.length} (긴 출력 — 생략) ━━━`
        );
      }

      // 회사별 verbose: husk contact path 추적 + orphan 패턴 + other inquiry path
      for (const r of reports) {
        const allContacts = await prisma.contact.findMany({
          where: { companyName: r.companyName, deletedAt: null },
          select: { id: true, processStage: true, status: true, webhardFolderId: true },
        });

        const huskFolderIds = new Set<string>();
        const orphanFolderIds = new Set<string>();
        for (const c of allContacts) {
          if (!c.webhardFolderId) continue;
          const f = await prisma.webhardFolder.findUnique({
            where: { id: c.webhardFolderId },
            select: { path: true, deletedAt: true },
          });
          if (!f || f.deletedAt) orphanFolderIds.add(c.webhardFolderId);
          else if (f.path?.startsWith('/외부웹하드/')) huskFolderIds.add(c.webhardFolderId);
        }

        if (huskFolderIds.size > 0) {
          console.log(`\n━━━ ${r.companyName} — husk 가리키는 contact 의 실제 folder ━━━`);
          for (const id of huskFolderIds) {
            const f = await prisma.webhardFolder.findUnique({
              where: { id },
              select: { id: true, name: true, path: true, parentId: true, deletedAt: true },
            });
            const cnt = await prisma.contact.count({
              where: { webhardFolderId: id, deletedAt: null, companyName: r.companyName },
            });
            console.log(
              `  - id=${id?.slice(0, 8)}… name="${f?.name}" path=${f?.path} parentId=${f?.parentId?.slice(0, 8)}… deleted=${f?.deletedAt ? 'YES' : 'no'} contactCount=${cnt}`
            );
          }
        }

        if (orphanFolderIds.size > 0) {
          console.log(
            `\n━━━ ${r.companyName} — orphan folder id 패턴 (${orphanFolderIds.size} unique) ━━━`
          );
          let i = 0;
          for (const id of orphanFolderIds) {
            if (i++ >= 10) {
              console.log(`  ... and ${orphanFolderIds.size - 10} more`);
              break;
            }
            const f = await prisma.webhardFolder.findUnique({
              where: { id },
              select: { id: true, name: true, path: true, parentId: true, deletedAt: true },
            });
            const cnt = await prisma.contact.count({
              where: { webhardFolderId: id, deletedAt: null, companyName: r.companyName },
            });
            console.log(
              `  - id=${id.slice(0, 8)}… ${f ? `name="${f.name}" path=${f.path} deleted=${f.deletedAt ? 'YES' : 'no'}` : '(missing — never existed or hard-deleted)'} contactCount=${cnt}`
            );
          }
        }

        // 'other' inquiry path
        if (r.rootFolder && r.inquiryFolders.underOther > 0) {
          const otherInquiry = await prisma.webhardFolder.findMany({
            where: {
              deletedAt: null,
              folderKind: 'inquiry',
              path: { startsWith: `/${r.companyName}/` },
              NOT: [
                { path: { contains: '/칼선의뢰/' } },
                { path: { contains: '/목형의뢰/' } },
                { path: { contains: '/완료/' } },
              ],
            },
            select: { id: true, name: true, path: true },
          });
          console.log(`\n━━━ ${r.companyName} — inquiry 폴더 'other' (${otherInquiry.length}) ━━━`);
          for (const f of otherInquiry) {
            console.log(`  - id=${f.id.slice(0, 8)}… name="${f.name}" path=${f.path}`);
          }
        }
      }
    }

    for (const r of reports) {
      console.log(`\n━━━ ${r.companyName} (id=${r.companyId}, laser_only=${r.laserOnly}) ━━━`);
      console.log(
        `  root folder      : ${r.rootFolder ? `${r.rootFolder.id} path=${r.rootFolder.path}` : '(missing)'}`
      );
      if (r.huskCandidates.length === 0) {
        console.log(`  husk             : (none) ✅`);
      } else {
        for (const h of r.huskCandidates) {
          console.log(
            `  husk [${h.matchKind}]  : id=${h.id} name="${h.name}" path=${h.path} childFolders=${h.childFolderCount} childFiles=${h.childFileCount}`
          );
        }
      }
      console.log(
        `  template folders : ${r.templateFolders.map((t) => `${t.name}(${t.folderKind})`).join(', ') || '(none)'}`
      );
      console.log(
        `  inquiry folders  : total=${r.inquiryFolders.total} 칼선의뢰=${r.inquiryFolders.underInquiry} 목형의뢰=${r.inquiryFolders.underWork} 완료=${r.inquiryFolders.underCompleted} other=${r.inquiryFolders.underOther}`
      );
      console.log(
        `  contacts         : total=${r.contacts.total} null=${r.contacts.nullFolderId} husk=${r.contacts.huskFolderId} proper=${r.contacts.properFolderId} orphan=${r.contacts.orphanFolderId}`
      );
      if (r.contacts.samples.length > 0) {
        console.log(`  samples          :`);
        for (const s of r.contacts.samples) {
          console.log(
            `    - ${s.contactId} stage=${s.processStage ?? '(none)'} status=${s.status ?? '(none)'} folder=${s.folderClassification}${s.webhardFolderId ? `(${s.webhardFolderId.slice(0, 8)}…)` : ''}`
          );
        }
      }
      console.log(`  diagnosis        :`);
      for (const e of r.diagnosis.explanation) {
        console.log(`    • ${e}`);
      }
    }

    // exit code: 비정상이면 1
    const anyAbnormal = reports.some(
      (r) =>
        r.diagnosis.needsRemigration ||
        r.diagnosis.huskContactsRemaining > 0 ||
        r.contacts.orphanFolderId > 0 ||
        r.diagnosis.rootFolderMissing
    );
    if (anyAbnormal) {
      console.log(`\n[task29-verify] ⚠️  Some diagnoses returned abnormal — see above.`);
      process.exit(2);
    }
    console.log(`\n[task29-verify] ✅ All laser_only companies clean.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[task29-verify] fatal:', err);
  process.exit(1);
});
