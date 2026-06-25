import {
  buildOperationalBackfillDryRunReport,
  classifyDatabaseTarget,
  formatOperationalBackfillDryRunError,
  formatOperationalBackfillDryRunText,
  shouldBlockOperationalDryRun,
} from './operational-backfill-dry-run';

function makePrismaMock() {
  return {
    contact: {
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    webhardFolder: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    webhardFile: {
      count: jest.fn(),
    },
    companyFolderAlias: {
      findMany: jest.fn(),
    },
    company: {
      findMany: jest.fn(),
    },
  };
}

describe('operational backfill dry-run', () => {
  it('집계 결과는 count-only이며 외부 폴더명과 번호 값을 출력하지 않는다', async () => {
    const prisma = makePrismaMock();
    prisma.contact.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(6);
    prisma.contact.groupBy
      .mockResolvedValueOnce([
        { inquiryNumber: '260624-O-001', _count: 2 },
        { inquiryNumber: '260624-O-002', _count: 1 },
      ])
      .mockResolvedValueOnce([
        { workNumber: '260624-F-001', _count: 3 },
        { workNumber: '260624-F-002', _count: 1 },
      ]);
    prisma.webhardFolder.count
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(9);
    prisma.webhardFolder.findMany.mockResolvedValueOnce([
      {
        id: 'external-a',
        name: '외부업체A',
        path: '/외부웹하드/외부업체A',
      },
      {
        id: 'external-b',
        name: '외부업체B',
        path: '/외부웹하드/외부업체B',
      },
      {
        id: 'external-normalized',
        name: 'ABC 회사',
        path: '/외부웹하드/ABC 회사',
      },
      {
        id: 'external-approved',
        name: '승인완료업체',
        path: '/외부웹하드/승인완료업체',
      },
      {
        id: 'external-approved-ambiguous',
        name: '중복승인업체',
        path: '/외부웹하드/중복승인업체',
      },
      {
        id: 'external-stale-approved',
        name: '삭제업체승인',
        path: '/외부웹하드/삭제업체승인',
      },
      {
        id: 'external-mixed-approved',
        name: '혼합승인업체',
        path: '/외부웹하드/혼합승인업체',
      },
      {
        id: 'external-child',
        name: '하위폴더',
        path: '/외부웹하드/외부업체A/하위폴더',
      },
    ]);
    prisma.companyFolderAlias.findMany.mockResolvedValueOnce([
      {
        folderName: '승인완료업체',
        companyId: 1,
        company: { deletedAt: null, status: 'active', isApproved: true },
      },
      {
        folderName: '중복승인업체',
        companyId: 2,
        company: { deletedAt: null, status: 'active', isApproved: true },
      },
      {
        folderName: '중복승인업체',
        companyId: 3,
        company: { deletedAt: null, status: 'active', isApproved: true },
      },
      {
        folderName: '삭제업체승인',
        companyId: 4,
        company: {
          deletedAt: new Date('2026-06-01T00:00:00.000Z'),
          status: 'deleted',
          isApproved: true,
        },
      },
      {
        folderName: '혼합승인업체',
        companyId: 5,
        company: { deletedAt: null, status: 'active', isApproved: true },
      },
      {
        folderName: '혼합승인업체',
        companyId: 6,
        company: { deletedAt: null, status: 'active', isApproved: true },
      },
      {
        folderName: '혼합승인업체',
        companyId: 7,
        company: { deletedAt: null, status: 'inactive', isApproved: true },
      },
    ]);
    prisma.company.findMany.mockResolvedValueOnce([
      { companyName: '외부업체A' },
      { companyName: '외부업체A' },
      { companyName: 'ABC회사' },
      { companyName: 'ABC-회사' },
    ]);
    prisma.webhardFile.count
      .mockResolvedValueOnce(30)
      .mockResolvedValueOnce(11)
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(13);

    const report = await buildOperationalBackfillDryRunReport(prisma as never, {
      generatedAt: '2026-06-24T00:00:00.000Z',
      databaseTarget: 'local',
      remoteAllowed: false,
    });

    expect(report.counts.duplicates.inquiryNumber).toEqual({
      duplicateGroups: 1,
      duplicateRows: 2,
    });
    expect(report.counts.duplicates.workNumber).toEqual({
      duplicateGroups: 1,
      duplicateRows: 3,
    });
    expect(report.counts.externalMapping).toMatchObject({
      depth2Candidates: 7,
      approvedAliasCandidates: 1,
      ambiguousApprovedAliasCandidates: 2,
      staleApprovedAliasCandidates: 2,
      unmatchedCandidates: 3,
      ambiguousCompanyNameCandidates: 2,
      noCompanyCandidate: 1,
    });
    expect(report.stopThresholds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'ambiguous-approved-aliases',
          condition: 'ambiguousApprovedAliasCandidates > 0',
        }),
        expect.objectContaining({
          id: 'stale-approved-aliases',
          condition: 'staleApprovedAliasCandidates > 0',
        }),
      ])
    );
    expect(report.schemaGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'WebhardFile.contactId' }),
        expect.objectContaining({ field: 'WebhardFile.workNumber' }),
      ])
    );

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('외부업체A');
    expect(serialized).not.toContain('외부업체B');
    expect(serialized).not.toContain('ABC 회사');
    expect(serialized).not.toContain('ABC회사');
    expect(serialized).not.toContain('중복승인업체');
    expect(serialized).not.toContain('삭제업체승인');
    expect(serialized).not.toContain('혼합승인업체');
    expect(serialized).not.toContain('승인완료업체');
    expect(serialized).not.toContain('260624-O-001');
    expect(serialized).not.toContain('260624-F-001');

    const text = formatOperationalBackfillDryRunText(report);
    expect(text).toContain('externalMapping.approvedAliasCandidates: 1');
    expect(text).toContain('externalMapping.ambiguousApprovedAliasCandidates: 2');
    expect(text).toContain('externalMapping.staleApprovedAliasCandidates: 2');
    expect(text).not.toContain('중복승인업체');
    expect(text).not.toContain('삭제업체승인');
    expect(text).not.toContain('혼합승인업체');
  });

  it('실패 메시지는 row 값을 그대로 출력하지 않는 generic 문구로 축약한다', () => {
    const error = new Error('query failed for folderName=외부업체A and inquiryNumber=260624-O-001');

    const message = formatOperationalBackfillDryRunError(error);

    expect(message).toBe('Operational backfill dry-run failed. See application logs for details.');
    expect(message).not.toContain('외부업체A');
    expect(message).not.toContain('260624-O-001');
  });

  it('remote/prod-like DATABASE_URL은 명시 허용 없이는 차단한다', () => {
    expect(classifyDatabaseTarget('postgresql://user:pass@localhost:5432/yjlaser')).toBe('local');
    expect(classifyDatabaseTarget('postgresql://user:pass@127.0.0.1:5432/yjlaser')).toBe('local');
    expect(classifyDatabaseTarget('postgresql://user:pass@[::1]:5432/yjlaser')).toBe('local');
    expect(classifyDatabaseTarget('postgresql://user:pass@db.supabase.co:5432/postgres')).toBe(
      'remote-or-unknown'
    );
    expect(classifyDatabaseTarget('postgresql://user:pass@127.prod-db.example.com:5432/db')).toBe(
      'remote-or-unknown'
    );

    expect(
      shouldBlockOperationalDryRun({
        databaseUrl: 'postgresql://user:pass@db.supabase.co:5432/postgres',
        allowRemote: false,
      })
    ).toBe(true);
    expect(
      shouldBlockOperationalDryRun({
        databaseUrl: 'postgresql://user:pass@db.supabase.co:5432/postgres',
        allowRemote: true,
      })
    ).toBe(false);
  });
});
