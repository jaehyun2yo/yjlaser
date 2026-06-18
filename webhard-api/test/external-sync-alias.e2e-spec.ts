import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp, getAdminSessionCookie, getTestPrismaClient } from './helpers/test-utils';
import { PrismaService } from '../src/prisma/prisma.service';
import { AutoContactService } from '../src/integration/orders/auto-contact.service';

/**
 * task 24 — 외부 동기화 → 가입 업체 폴더 통합 워크플로우 e2e.
 *
 * 검증 범위:
 *  - matchCompanyInfo 0차/3차 (CompanyFolderAlias 자동 등록)
 *  - admin approve endpoint + cascadeBackfill
 *  - reject 멱등성 (rejected alias 가 후속 동기화에서 status 변동 없음)
 *  - 미승인 fallback (alias 'pending' 상태에서 contact.companyId 미통합)
 *
 * 환경 의존: DATABASE_URL 등 설정된 환경에서만 실제 실행. 미설정 환경에서도
 * 본 파일은 컴파일/타입체크 통과해야 한다 (phase5 AC).
 */
describe('External sync alias workflow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let autoContactService: AutoContactService;
  const adminCookie = getAdminSessionCookie();

  // 테스트별로 unique 한 prefix — 다른 e2e 테스트와 충돌 방지.
  const ALIAS_E2E_PREFIX = `alias-e2e-${Date.now()}`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = await getTestPrismaClient();
    autoContactService = app.get(AutoContactService);
  });

  afterAll(async () => {
    await cleanupAliasE2eData(prisma, ALIAS_E2E_PREFIX);
    await app.close();
  });

  /**
   * 시나리오 1: 정규화 매칭 후보 자동 등록 → admin 승인 (cascadeBackfill=true) → 폴더 통합.
   *
   * 흐름:
   *  1) seed: Company { companyName: '대성목형(주)', isApproved: true }
   *  2) AutoContactService.detectAndCreate({ companyName: '대성목형' })
   *     - 1차/2차 fail (insensitive equals 불일치)
   *     - 3차에서 normalizeCompanyName 매칭 → CompanyFolderAlias status='pending' upsert
   *     - Contact 생성, companyId=null, companyName='대성목형' (폴더명 원본 trim)
   *  3) POST /companies/folder-aliases/:id/approve { cascadeBackfill: true }
   *     - alias status='approved', approvedBy / approvedAt 기록
   *     - relocateAfterAliasApproved 호출 → contact.companyName 정규형, contact.companyId 채워짐
   *     - inquiryType=null Contact 는 skipped 카운트로 분리 (현행 미분류 정책 유지)
   */
  it('정규화 매칭 → admin 승인 (cascadeBackfill=true) → Contact 통합', async () => {
    const seedCompanyName = `${ALIAS_E2E_PREFIX} 대성목형`;
    const folderName = `${ALIAS_E2E_PREFIX}-대성목형`;

    const company = await prisma.company.create({
      data: createCompanySeed({ companyName: seedCompanyName, isApproved: true }),
    });

    const result = await autoContactService.detectAndCreate({
      fileName: `${ALIAS_E2E_PREFIX}-file.pdf`,
      fileUrl: 'https://example.com/test.pdf',
      folderId: '00000000-0000-0000-0000-000000000000',
      folderPath: `외부웹하드/${folderName}/free`,
      companyName: folderName,
    });

    expect(result?.action).toBe('created');
    const contactId = result!.contactId;

    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    expect(contact).not.toBeNull();
    expect(contact!.companyName).toBe(folderName);
    expect(contact!.companyId).toBeNull();

    const aliases = await prisma.companyFolderAlias.findMany({
      where: { folderName, companyId: company.id },
    });
    expect(aliases).toHaveLength(1);
    expect(aliases[0].status).toBe('pending');

    const aliasId = aliases[0].id;

    const approveResp = await request(app.getHttpServer())
      .post(`/companies/folder-aliases/${aliasId}/approve`)
      .set('Cookie', `admin-session=${adminCookie}`)
      .send({ cascadeBackfill: true })
      .expect(200);

    expect(approveResp.body.alias.status).toBe('approved');
    expect(approveResp.body.alias.approvedBy).toBeDefined();
    expect(approveResp.body.alias.approvedAt).toBeDefined();
    expect(approveResp.body.backfill).toBeDefined();
    expect(approveResp.body.backfill).toEqual(
      expect.objectContaining({
        relocated: expect.any(Number),
        skipped: expect.any(Number),
      })
    );

    // 승인된 alias 는 문의 분류 여부와 무관하게 Contact 회사 매핑에 반영되어야 한다.
    const contactAfter = await prisma.contact.findUnique({ where: { id: contactId } });
    expect(contactAfter?.companyId).toBe(company.id);
    expect(contactAfter?.companyName).toBe(seedCompanyName);
  });

  /**
   * 시나리오 2: admin 이 거절한 alias 가 다음 동기화에서 다시 pending 으로 살아나지 않는다.
   *
   * matchCompanyInfo 3차 단계의 upsert 가 `update: {}` 빈 객체로 호출되어 기존 status 보존.
   */
  it('reject 멱등성 — rejected alias 는 후속 동기화에서 status 변동 없음', async () => {
    const seedCompanyName = `${ALIAS_E2E_PREFIX}-거절업체(주)`;
    const folderName = `${ALIAS_E2E_PREFIX}-거절업체`;

    const company = await prisma.company.create({
      data: createCompanySeed({ companyName: seedCompanyName, isApproved: true }),
    });

    await prisma.companyFolderAlias.create({
      data: {
        folderName,
        companyId: company.id,
        status: 'rejected',
      },
    });

    await autoContactService.detectAndCreate({
      fileName: `${ALIAS_E2E_PREFIX}-rejected.pdf`,
      fileUrl: 'https://example.com/rejected.pdf',
      folderId: '00000000-0000-0000-0000-000000000001',
      folderPath: `외부웹하드/${folderName}/free`,
      companyName: folderName,
    });

    const aliasAfter = await prisma.companyFolderAlias.findFirst({
      where: { folderName, companyId: company.id },
    });
    expect(aliasAfter).not.toBeNull();
    expect(aliasAfter!.status).toBe('rejected');
  });

  /**
   * 시나리오 3: alias 미승인 상태에서 매칭 실패 fallback 동작.
   *
   * normalizeCompanyName 매칭으로 후보가 등록되지만 admin 승인 전이므로 Contact 의 companyId 는 null.
   * companyName 은 폴더명 원본 trim 사용 (resolvedCompanyName fallback).
   */
  it('미승인 fallback — alias pending 등록 + Contact.companyId 미통합', async () => {
    const seedCompanyName = `${ALIAS_E2E_PREFIX} ABC주식회사`;
    const folderName = `${ALIAS_E2E_PREFIX}-ABC주식회사`;

    const company = await prisma.company.create({
      data: createCompanySeed({ companyName: seedCompanyName, isApproved: false }),
    });

    const result = await autoContactService.detectAndCreate({
      fileName: `${ALIAS_E2E_PREFIX}-fallback.pdf`,
      fileUrl: 'https://example.com/fallback.pdf',
      folderId: '00000000-0000-0000-0000-000000000002',
      folderPath: `외부웹하드/${folderName}/free`,
      companyName: folderName,
    });

    expect(result?.action).toBe('created');
    const contactId = result!.contactId;

    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    expect(contact).not.toBeNull();
    expect(contact!.companyName).toBe(folderName);
    expect(contact!.companyId).toBeNull();

    const alias = await prisma.companyFolderAlias.findFirst({
      where: { folderName, companyId: company.id },
    });
    expect(alias).not.toBeNull();
    expect(alias!.status).toBe('pending');
  });
});

/**
 * 테스트용 Company seed payload — companies 테이블의 NOT NULL 컬럼을 모두 채운다.
 */
function createCompanySeed(overrides: {
  companyName: string;
  isApproved: boolean;
}): Prisma.CompanyCreateInput {
  const suffix = Math.random().toString(36).slice(2, 10);
  return {
    companyName: overrides.companyName,
    username: `e2e-user-${suffix}`,
    passwordHash: 'e2e-test-hash',
    businessRegistrationNumber: `000-00-${suffix.slice(0, 5)}`,
    representativeName: 'e2e-rep',
    businessAddress: 'e2e-address',
    managerName: 'e2e-manager',
    managerPosition: 'e2e-position',
    managerPhone: '010-0000-0000',
    managerEmail: 'e2e@yjlaser.test',
    isApproved: overrides.isApproved,
  };
}

/**
 * E2E 데이터 cleanup — alias / contact / company 순으로 삭제 (FK 제약 회피).
 * Cascade onDelete 가 alias 를 자동 정리하지만 명시적으로도 한 번 더 삭제.
 */
async function cleanupAliasE2eData(prisma: PrismaService, prefix: string): Promise<void> {
  await prisma.companyFolderAlias.deleteMany({
    where: { folderName: { startsWith: prefix } },
  });
  await prisma.contact.deleteMany({
    where: { companyName: { startsWith: prefix } },
  });
  await prisma.notification.deleteMany({
    where: { message: { contains: prefix } },
  });
  await prisma.company.deleteMany({
    where: { companyName: { startsWith: prefix } },
  });
}
