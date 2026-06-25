import { isIP } from 'net';
import { normalizeCompanyName } from '../folders/_lib/company-name-match.util';

type DatabaseTarget = 'local' | 'remote-or-unknown';

interface CountDelegate {
  count(args: unknown): Promise<number>;
}

interface ContactDelegate extends CountDelegate {
  groupBy(args: unknown): Promise<Array<{ _count: number }>>;
}

interface WebhardFolderDelegate extends CountDelegate {
  findMany(args: unknown): Promise<Array<{ id: string; name: string; path: string | null }>>;
}

interface CompanyFolderAliasDelegate {
  findMany(args: unknown): Promise<unknown[]>;
}

interface CompanyDelegate {
  findMany(args: unknown): Promise<Array<{ companyName: string }>>;
}

export interface OperationalBackfillDryRunPrisma {
  contact: ContactDelegate;
  webhardFolder: WebhardFolderDelegate;
  webhardFile: CountDelegate;
  companyFolderAlias: CompanyFolderAliasDelegate;
  company: CompanyDelegate;
}

export interface OperationalBackfillDryRunContext {
  generatedAt?: string;
  databaseTarget: DatabaseTarget;
  remoteAllowed: boolean;
}

interface DuplicateSummary {
  duplicateGroups: number;
  duplicateRows: number;
}

export interface OperationalBackfillDryRunReport {
  generatedAt: string;
  mode: 'dry-run';
  dataSafety: {
    output: 'aggregate-counts-only';
    rowValuesPrinted: false;
    writes: false;
    databaseTarget: DatabaseTarget;
    remoteAllowed: boolean;
  };
  counts: {
    contacts: {
      totalActive: number;
      missingCompanyId: number;
      missingWebhardFolderId: number;
      missingInquiryNumber: number;
      missingWorkNumber: number;
    };
    webhardFolders: {
      totalActive: number;
      missingContactId: number;
      missingInquiryNumber: number;
      missingWorkNumber: number;
    };
    webhardFiles: {
      totalActive: number;
      missingFolderId: number;
      missingCompanyId: number;
      missingInquiryNumber: number;
    };
    duplicates: {
      inquiryNumber: DuplicateSummary;
      workNumber: DuplicateSummary;
    };
    externalMapping: {
      depth2Candidates: number;
      approvedAliasCandidates: number;
      ambiguousApprovedAliasCandidates: number;
      staleApprovedAliasCandidates: number;
      unmatchedCandidates: number;
      ambiguousCompanyNameCandidates: number;
      exactOneCompanyCandidate: number;
      noCompanyCandidate: number;
    };
  };
  schemaGaps: Array<{
    field: string;
    impact: string;
    action: string;
  }>;
  stopThresholds: Array<{
    id: string;
    condition: string;
    action: string;
  }>;
  proposedBackfillBatches: Array<{
    id: string;
    source: string;
    target: string;
    rollbackUnit: string;
    precondition: string;
  }>;
}

interface ExternalCandidate {
  id: string;
  name: string;
  path: string | null;
}

interface ExternalMappingSummary {
  depth2Candidates: number;
  approvedAliasCandidates: number;
  ambiguousApprovedAliasCandidates: number;
  staleApprovedAliasCandidates: number;
  unmatchedCandidates: number;
  ambiguousCompanyNameCandidates: number;
  exactOneCompanyCandidate: number;
  noCompanyCandidate: number;
}

interface ApprovedFolderAliasCandidate {
  folderName: string;
  companyId: number;
  company: {
    deletedAt: Date | null;
    status: string | null;
    isApproved: boolean;
  } | null;
}

export function classifyDatabaseTarget(databaseUrl: string | undefined): DatabaseTarget {
  const raw = databaseUrl?.trim();
  if (!raw) return 'remote-or-unknown';

  if (raw.startsWith('file:')) return 'local';

  try {
    const parsed = new URL(raw);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost') return 'local';
    if (isLoopbackIp(hostname)) return 'local';
    return 'remote-or-unknown';
  } catch {
    return 'remote-or-unknown';
  }
}

function isLoopbackIp(hostname: string): boolean {
  const normalized = hostname.replace(/^\[/, '').replace(/\]$/, '');
  if (normalized === '::1') return true;
  if (isIP(normalized) !== 4) return false;

  const [firstOctet] = normalized.split('.');
  return firstOctet === '127';
}

export function shouldBlockOperationalDryRun({
  databaseUrl,
  allowRemote,
}: {
  databaseUrl: string | undefined;
  allowRemote: boolean;
}): boolean {
  return classifyDatabaseTarget(databaseUrl) !== 'local' && !allowRemote;
}

export async function buildOperationalBackfillDryRunReport(
  prisma: OperationalBackfillDryRunPrisma,
  context: OperationalBackfillDryRunContext
): Promise<OperationalBackfillDryRunReport> {
  const contacts = await countContacts(prisma);
  const duplicates = await countDuplicateNumbers(prisma);
  const webhardFolders = await countWebhardFolders(prisma);
  const externalMapping = await countExternalMapping(prisma);
  const webhardFiles = await countWebhardFiles(prisma);

  return {
    generatedAt: context.generatedAt ?? new Date().toISOString(),
    mode: 'dry-run',
    dataSafety: {
      output: 'aggregate-counts-only',
      rowValuesPrinted: false,
      writes: false,
      databaseTarget: context.databaseTarget,
      remoteAllowed: context.remoteAllowed,
    },
    counts: {
      contacts,
      webhardFolders,
      webhardFiles,
      duplicates,
      externalMapping,
    },
    schemaGaps: [
      {
        field: 'WebhardFile.contactId',
        impact: '파일 단위 Contact 직접 추적은 현재 folderId/문의번호 경유로만 가능',
        action: '백필 적용 전 WebhardFile에 Contact identity 저장 컬럼 또는 별도 연결 정책 결정',
      },
      {
        field: 'WebhardFile.workNumber',
        impact: '파일 단위 작업번호 누락 규모는 현재 스키마에서 직접 집계 불가',
        action: '업로드 confirm 응답 identity 저장 설계와 함께 컬럼/계약 확정',
      },
    ],
    stopThresholds: [
      {
        id: 'duplicate-contact-numbers',
        condition: 'duplicate inquiry/work number groups > 0',
        action: '자동 백필 중단, 중복 번호 수동 정리 후 재실행',
      },
      {
        id: 'external-mapping-ambiguity',
        condition: 'ambiguousCompanyNameCandidates > 0',
        action: '업체명 자동 매핑 제외, admin alias 승인 큐로 이동',
      },
      {
        id: 'ambiguous-approved-aliases',
        condition: 'ambiguousApprovedAliasCandidates > 0',
        action: '동일 외부 폴더명의 approved alias 중복 정리 후 재실행',
      },
      {
        id: 'stale-approved-aliases',
        condition: 'staleApprovedAliasCandidates > 0',
        action: '삭제/비활성/미승인 업체를 가리키는 approved alias 정리 후 재실행',
      },
      {
        id: 'remote-database',
        condition: 'databaseTarget is remote-or-unknown without explicit allow flag',
        action: 'dry-run 실행 전 사용자 승인과 ALLOW_REMOTE_OPERATIONAL_BACKFILL_DRY_RUN=true 필요',
      },
    ],
    proposedBackfillBatches: [
      {
        id: 'contact-company-from-approved-alias',
        source: 'CompanyFolderAlias(status=approved)',
        target: 'Contact.companyId / WebhardFolder.companyId',
        rollbackUnit: 'alias folderName + companyId 단위',
        precondition: '중복 번호 0, ambiguous external mapping 0 또는 수동 제외 목록 확정',
      },
      {
        id: 'contact-folder-link',
        source: 'WebhardFolder.contactId/webhardFolderId/inquiryNumber',
        target: 'Contact.webhardFolderId',
        rollbackUnit: 'Contact.id 단위',
        precondition: '폴더가 deletedAt=null이고 단일 Contact로만 해석됨',
      },
      {
        id: 'file-identity-capture',
        source: 'WebhardFile.folderId + Contact/WebhardFolder identity',
        target: 'WebhardFile inquiry identity columns or replacement link table',
        rollbackUnit: 'WebhardFile.id batch 단위',
        precondition: 'WebhardFile Contact/workNumber 스키마 gap 해결',
      },
    ],
  };
}

async function countContacts(prisma: OperationalBackfillDryRunPrisma) {
  const activeWhere = {
    deletedAt: null,
    status: { not: 'deleting' },
  };

  const [
    totalActive,
    missingCompanyId,
    missingWebhardFolderId,
    missingInquiryNumber,
    missingWorkNumber,
  ] = await Promise.all([
    prisma.contact.count({ where: activeWhere }),
    prisma.contact.count({ where: { ...activeWhere, companyId: null } }),
    prisma.contact.count({ where: { ...activeWhere, webhardFolderId: null } }),
    prisma.contact.count({ where: { ...activeWhere, inquiryNumber: null } }),
    prisma.contact.count({ where: { ...activeWhere, workNumber: null } }),
  ]);

  return {
    totalActive,
    missingCompanyId,
    missingWebhardFolderId,
    missingInquiryNumber,
    missingWorkNumber,
  };
}

async function countDuplicateNumbers(prisma: OperationalBackfillDryRunPrisma) {
  const [inquiryGroups, workGroups] = await Promise.all([
    prisma.contact.groupBy({
      by: ['inquiryNumber'],
      where: {
        deletedAt: null,
        status: { not: 'deleting' },
        inquiryNumber: { not: null },
      },
      _count: true,
    }),
    prisma.contact.groupBy({
      by: ['workNumber'],
      where: {
        deletedAt: null,
        status: { not: 'deleting' },
        workNumber: { not: null },
      },
      _count: true,
    }),
  ]);

  return {
    inquiryNumber: summarizeDuplicateGroups(inquiryGroups),
    workNumber: summarizeDuplicateGroups(workGroups),
  };
}

function summarizeDuplicateGroups(groups: Array<{ _count: number }>): DuplicateSummary {
  return groups.reduce<DuplicateSummary>(
    (summary, group) => {
      if (group._count > 1) {
        summary.duplicateGroups += 1;
        summary.duplicateRows += group._count;
      }
      return summary;
    },
    { duplicateGroups: 0, duplicateRows: 0 }
  );
}

async function countWebhardFolders(prisma: OperationalBackfillDryRunPrisma) {
  const activeWhere = { deletedAt: null };
  const [totalActive, missingContactId, missingInquiryNumber, missingWorkNumber] =
    await Promise.all([
      prisma.webhardFolder.count({ where: activeWhere }),
      prisma.webhardFolder.count({ where: { ...activeWhere, contactId: null } }),
      prisma.webhardFolder.count({ where: { ...activeWhere, inquiryNumber: null } }),
      prisma.webhardFolder.count({ where: { ...activeWhere, workNumber: null } }),
    ]);

  return {
    totalActive,
    missingContactId,
    missingInquiryNumber,
    missingWorkNumber,
  };
}

async function countExternalMapping(
  prisma: OperationalBackfillDryRunPrisma
): Promise<ExternalMappingSummary> {
  const candidates = await prisma.webhardFolder.findMany({
    where: {
      path: { startsWith: '/외부웹하드/' },
      companyId: null,
      deletedAt: null,
      folderKind: { in: ['root', 'generic'] },
    },
    select: {
      id: true,
      name: true,
      path: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  const depth2 = candidates.filter(isExternalDepth2Folder);

  if (depth2.length === 0) {
    return {
      depth2Candidates: 0,
      approvedAliasCandidates: 0,
      ambiguousApprovedAliasCandidates: 0,
      staleApprovedAliasCandidates: 0,
      unmatchedCandidates: 0,
      ambiguousCompanyNameCandidates: 0,
      exactOneCompanyCandidate: 0,
      noCompanyCandidate: 0,
    };
  }

  const candidateNames = Array.from(new Set(depth2.map((candidate) => candidate.name)));
  const approvedAliases = (await prisma.companyFolderAlias.findMany({
    where: {
      folderName: { in: candidateNames },
      status: 'approved',
    },
    select: {
      folderName: true,
      companyId: true,
      company: {
        select: {
          deletedAt: true,
          status: true,
          isApproved: true,
        },
      },
    },
  })) as ApprovedFolderAliasCandidate[];
  const approvedAliasCountByName = new Map<string, { valid: number; stale: number }>();
  for (const alias of approvedAliases) {
    const counts = approvedAliasCountByName.get(alias.folderName) ?? { valid: 0, stale: 0 };
    if (isApprovedAliasTargetValid(alias)) {
      counts.valid += 1;
    } else {
      counts.stale += 1;
    }
    approvedAliasCountByName.set(alias.folderName, counts);
  }
  const approvedSafe = depth2.filter(
    (candidate) =>
      approvedAliasCountByName.get(candidate.name)?.valid === 1 &&
      approvedAliasCountByName.get(candidate.name)?.stale === 0
  );
  const approvedAmbiguous = depth2.filter(
    (candidate) => (approvedAliasCountByName.get(candidate.name)?.valid ?? 0) > 1
  );
  const approvedStale = depth2.filter(
    (candidate) => (approvedAliasCountByName.get(candidate.name)?.stale ?? 0) > 0
  );
  const unmatched = depth2.filter((candidate) => !approvedAliasCountByName.has(candidate.name));

  const unmatchedNames = Array.from(new Set(unmatched.map((candidate) => candidate.name)));
  const matchingCompanies =
    unmatchedNames.length > 0
      ? await prisma.company.findMany({
          where: {
            deletedAt: null,
            status: 'active',
            isApproved: true,
          },
          select: { companyName: true },
        })
      : [];
  const companyCountByName = new Map<string, number>();
  for (const company of matchingCompanies) {
    companyCountByName.set(
      company.companyName,
      (companyCountByName.get(company.companyName) ?? 0) + 1
    );
  }
  const companyCountByNormalizedName = new Map<string, number>();
  for (const company of matchingCompanies) {
    const normalized = normalizeCompanyName(company.companyName);
    if (!normalized) continue;
    companyCountByNormalizedName.set(
      normalized,
      (companyCountByNormalizedName.get(normalized) ?? 0) + 1
    );
  }

  let ambiguousCompanyNameCandidates = 0;
  let exactOneCompanyCandidate = 0;
  let noCompanyCandidate = 0;
  for (const candidate of unmatched) {
    const exactCompanyMatches = companyCountByName.get(candidate.name) ?? 0;
    const normalized = normalizeCompanyName(candidate.name);
    const normalizedCompanyMatches = normalized
      ? (companyCountByNormalizedName.get(normalized) ?? 0)
      : 0;
    const companyMatches = Math.max(exactCompanyMatches, normalizedCompanyMatches);
    if (companyMatches > 1) {
      ambiguousCompanyNameCandidates += 1;
    } else if (companyMatches === 1) {
      exactOneCompanyCandidate += 1;
    } else {
      noCompanyCandidate += 1;
    }
  }

  return {
    depth2Candidates: depth2.length,
    approvedAliasCandidates: approvedSafe.length,
    ambiguousApprovedAliasCandidates: approvedAmbiguous.length,
    staleApprovedAliasCandidates: approvedStale.length,
    unmatchedCandidates: unmatched.length,
    ambiguousCompanyNameCandidates,
    exactOneCompanyCandidate,
    noCompanyCandidate,
  };
}

function isApprovedAliasTargetValid(alias: {
  company: { deletedAt: Date | null; status: string | null; isApproved: boolean } | null;
}): boolean {
  return Boolean(
    alias.company &&
    alias.company.deletedAt === null &&
    alias.company.status === 'active' &&
    alias.company.isApproved
  );
}

function isExternalDepth2Folder(folder: ExternalCandidate): boolean {
  const segments = (folder.path ?? '').split('/').filter((segment) => segment.length > 0);
  return segments.length === 2 && segments[0] === '외부웹하드';
}

async function countWebhardFiles(prisma: OperationalBackfillDryRunPrisma) {
  const activeWhere = { deletedAt: null };
  const [totalActive, missingFolderId, missingCompanyId, missingInquiryNumber] = await Promise.all([
    prisma.webhardFile.count({ where: activeWhere }),
    prisma.webhardFile.count({ where: { ...activeWhere, folderId: null } }),
    prisma.webhardFile.count({ where: { ...activeWhere, companyId: null } }),
    prisma.webhardFile.count({ where: { ...activeWhere, inquiryNumber: null } }),
  ]);

  return {
    totalActive,
    missingFolderId,
    missingCompanyId,
    missingInquiryNumber,
  };
}

export function formatOperationalBackfillDryRunText(
  report: OperationalBackfillDryRunReport
): string {
  const lines = [
    'Operational backfill dry-run report',
    `generatedAt: ${report.generatedAt}`,
    `databaseTarget: ${report.dataSafety.databaseTarget}`,
    `contacts.totalActive: ${report.counts.contacts.totalActive}`,
    `contacts.missingCompanyId: ${report.counts.contacts.missingCompanyId}`,
    `contacts.missingWebhardFolderId: ${report.counts.contacts.missingWebhardFolderId}`,
    `duplicates.inquiryNumber.groups: ${report.counts.duplicates.inquiryNumber.duplicateGroups}`,
    `duplicates.workNumber.groups: ${report.counts.duplicates.workNumber.duplicateGroups}`,
    `externalMapping.approvedAliasCandidates: ${report.counts.externalMapping.approvedAliasCandidates}`,
    `externalMapping.ambiguousApprovedAliasCandidates: ${report.counts.externalMapping.ambiguousApprovedAliasCandidates}`,
    `externalMapping.staleApprovedAliasCandidates: ${report.counts.externalMapping.staleApprovedAliasCandidates}`,
    `externalMapping.unmatchedCandidates: ${report.counts.externalMapping.unmatchedCandidates}`,
    `externalMapping.ambiguousCompanyNameCandidates: ${report.counts.externalMapping.ambiguousCompanyNameCandidates}`,
    `webhardFiles.missingInquiryNumber: ${report.counts.webhardFiles.missingInquiryNumber}`,
    `schemaGaps: ${report.schemaGaps.length}`,
    'No row values, customer names, file names, or folder names are printed.',
  ];
  return lines.join('\n');
}

export function formatOperationalBackfillDryRunError(_error: unknown): string {
  return 'Operational backfill dry-run failed. See application logs for details.';
}
