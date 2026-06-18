import { Prisma, PrismaClient, StorageProvider } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const prisma = new PrismaClient();

const SALT_ROUNDS = 12;

function hashPin(pin: string): string {
  return createHash('sha256').update(pin).digest('hex');
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

// Fixed UUIDs for deterministic seeding
const FOLDER_IDS = {
  rootA: 'a0000000-0000-4000-a000-000000000001',
  uploadA: 'a0000000-0000-4000-a000-000000000002',
  downloadA: 'a0000000-0000-4000-a000-000000000003',
  nestedA: 'a0000000-0000-4000-a000-000000000004',
  rootB: 'a0000000-0000-4000-a000-000000000005',
  uploadB: 'a0000000-0000-4000-a000-000000000006',
  downloadB: 'a0000000-0000-4000-a000-000000000007',
  rootC: 'a0000000-0000-4000-a000-000000000008',
  uploadC: 'a0000000-0000-4000-a000-000000000009',
  downloadC: 'a0000000-0000-4000-a000-00000000000a',
};

const FILE_IDS = {
  f1: 'b0000000-0000-4000-a000-000000000001',
  f2: 'b0000000-0000-4000-a000-000000000002',
  f3: 'b0000000-0000-4000-a000-000000000003',
  f4: 'b0000000-0000-4000-a000-000000000004',
  f5: 'b0000000-0000-4000-a000-000000000005',
  f6: 'b0000000-0000-4000-a000-000000000006',
  f7: 'b0000000-0000-4000-a000-000000000007',
  f8: 'b0000000-0000-4000-a000-000000000008',
  f9: 'b0000000-0000-4000-a000-000000000009',
  f10: 'b0000000-0000-4000-a000-00000000000a',
};

const CONTACT_IDS = {
  pending: 'c0000000-0000-4000-a000-000000000001',
  inProgress: 'c0000000-0000-4000-a000-000000000002',
  designReview: 'c0000000-0000-4000-a000-000000000003',
  confirmed: 'c0000000-0000-4000-a000-000000000004',
  completed: 'c0000000-0000-4000-a000-000000000005',
  // task 17 Phase 6 — E2E 긴급 + v2 도면 시나리오 전용
  urgent: '00000000-0000-4000-8000-000000000017',
  // task 17 Phase 6 — E2E S1/S2 (미분류 분류 CTA) 검증 전용
  unclassified: '00000000-0000-4000-8000-000000000018',
  // 통합 타임라인 업체 마스킹 E2E 전용
  companyTimeline: '00000000-0000-4000-8000-000000000019',
  // worker 최신 도면 다운로드 E2E 전용 — 실시간 리비전 추가 테스트와 데이터 경합 방지
  workerDownload: '00000000-0000-4000-8000-000000000020',
  unclassifiedFirefox: '00000000-0000-4000-8000-000000000021',
  unclassifiedWebkit: '00000000-0000-4000-8000-000000000022',
  unclassifiedMobileChrome: '00000000-0000-4000-8000-000000000023',
  unclassifiedMobileSafari: '00000000-0000-4000-8000-000000000024',
  unclassifiedTablet: '00000000-0000-4000-8000-000000000025',
};

const DRAWING_REVISION_IDS = {
  urgentV1: 'd1000000-0000-4000-a000-000000000017',
  urgentV2: 'd1000000-0000-4000-a000-000000000018',
  companyTimelinePrivate: 'd1000000-0000-4000-a000-000000000019',
  companyTimelinePublic: 'd1000000-0000-4000-a000-000000000020',
  workerDownloadV1: 'd1000000-0000-4000-a000-000000000021',
  workerDownloadV2: 'd1000000-0000-4000-a000-000000000022',
};

const URGENT_CONTACT_FOLDER_ID = 'a0000000-0000-4000-a000-000000000017';
const URGENT_CONTACT_FILE_V1_ID = 'b0000000-0000-4000-a000-000000000017';
const URGENT_CONTACT_FILE_V2_ID = 'b0000000-0000-4000-a000-000000000018';
const WORKER_DOWNLOAD_FOLDER_ID = 'a0000000-0000-4000-a000-000000000020';
const WORKER_DOWNLOAD_FILE_V1_ID = 'b0000000-0000-4000-a000-000000000020';
const WORKER_DOWNLOAD_FILE_V2_ID = 'b0000000-0000-4000-a000-000000000021';

const UNCLASSIFIED_CONTACT_CASES = [
  {
    id: CONTACT_IDS.unclassified,
    inquiryNumber: 'E2E-UNCLASSIFIED-18',
    companyName: '[E2E 미분류] Chromium 샘플업체',
  },
  {
    id: CONTACT_IDS.unclassifiedFirefox,
    inquiryNumber: 'E2E-UNCLASSIFIED-18-FIREFOX',
    companyName: '[E2E 미분류] Firefox 샘플업체',
  },
  {
    id: CONTACT_IDS.unclassifiedWebkit,
    inquiryNumber: 'E2E-UNCLASSIFIED-18-WEBKIT',
    companyName: '[E2E 미분류] WebKit 샘플업체',
  },
  {
    id: CONTACT_IDS.unclassifiedMobileChrome,
    inquiryNumber: 'E2E-UNCLASSIFIED-18-MOBILE-CHROME',
    companyName: '[E2E 미분류] Mobile Chrome 샘플업체',
  },
  {
    id: CONTACT_IDS.unclassifiedMobileSafari,
    inquiryNumber: 'E2E-UNCLASSIFIED-18-MOBILE-SAFARI',
    companyName: '[E2E 미분류] Mobile Safari 샘플업체',
  },
  {
    id: CONTACT_IDS.unclassifiedTablet,
    inquiryNumber: 'E2E-UNCLASSIFIED-18-TABLET',
    companyName: '[E2E 미분류] Tablet 샘플업체',
  },
];

const HISTORY_IDS = {
  h1: 'd0000000-0000-4000-a000-000000000001',
  h2: 'd0000000-0000-4000-a000-000000000002',
  h3: 'd0000000-0000-4000-a000-000000000003',
  h4: 'd0000000-0000-4000-a000-000000000004',
  h5: 'd0000000-0000-4000-a000-000000000005',
};

const WORKER_IDS = {
  office: 'e0000000-0000-4000-a000-000000000001',
  field: 'e0000000-0000-4000-a000-000000000002',
  manager: 'e0000000-0000-4000-a000-000000000003',
};

const API_KEY_IDS = {
  sync: 'f0000000-0000-4000-a000-000000000001',
  test: 'f0000000-0000-4000-a000-000000000002',
};

// ====== Seed Functions ======

async function seedCompanies() {
  console.log('  Seeding companies...');
  const passwordHash = bcrypt.hashSync('test1234', SALT_ROUNDS);

  const companies = [
    {
      username: 'test_company_a',
      companyName: '테스트거래처A',
      managerName: '김담당',
      businessRegistrationNumber: '123-45-67890',
      representativeName: '김대표',
      businessAddress: '서울특별시 강남구 테스트로 1',
      managerPosition: '과장',
      managerPhone: '010-1234-5678',
      managerEmail: 'test_a@example.com',
      passwordHash,
      isApproved: true,
      status: 'active',
      webhardAccess: true,
    },
    {
      username: 'test_company_b',
      companyName: '테스트거래처B',
      managerName: '이담당',
      businessRegistrationNumber: '234-56-78901',
      representativeName: '이대표',
      businessAddress: '경기도 성남시 분당구 테스트로 2',
      managerPosition: '대리',
      managerPhone: '010-2345-6789',
      managerEmail: 'test_b@example.com',
      passwordHash,
      isApproved: true,
      status: 'active',
      webhardAccess: true,
    },
    {
      username: 'test_company_c',
      companyName: '테스트거래처C',
      managerName: '박담당',
      businessRegistrationNumber: '345-67-89012',
      representativeName: '박대표',
      businessAddress: '인천광역시 연수구 테스트로 3',
      managerPosition: '사원',
      managerPhone: '010-3456-7890',
      managerEmail: 'test_c@example.com',
      passwordHash,
      isApproved: true,
      status: 'active',
      webhardAccess: true,
    },
    {
      username: 'test_company_d',
      companyName: '테스트거래처D',
      managerName: '최담당',
      businessRegistrationNumber: '456-78-90123',
      representativeName: '최대표',
      businessAddress: '대전광역시 유성구 테스트로 4',
      managerPosition: '대리',
      managerPhone: '010-4567-8901',
      managerEmail: 'test_d@example.com',
      passwordHash,
      isApproved: true,
      status: 'active',
      webhardAccess: true,
    },
    {
      username: 'test_company_e',
      companyName: '테스트거래처E',
      managerName: '정담당',
      businessRegistrationNumber: '567-89-01234',
      representativeName: '정대표',
      businessAddress: '부산광역시 해운대구 테스트로 5',
      managerPosition: '과장',
      managerPhone: '010-5678-9012',
      managerEmail: 'test_e@example.com',
      passwordHash,
      isApproved: true,
      status: 'active',
      webhardAccess: true,
    },
    {
      username: 'test_company_f',
      companyName: '테스트거래처F',
      managerName: '강담당',
      businessRegistrationNumber: '678-90-12345',
      representativeName: '강대표',
      businessAddress: '광주광역시 서구 테스트로 6',
      managerPosition: '팀장',
      managerPhone: '010-6789-0123',
      managerEmail: 'test_f@example.com',
      passwordHash,
      isApproved: true,
      status: 'active',
      webhardAccess: true,
    },
  ];

  const results = [];
  for (const company of companies) {
    const result = await prisma.company.upsert({
      where: { username: company.username },
      update: company,
      create: company,
    });
    results.push(result);
    console.log(`    Company: ${result.companyName} (id: ${result.id})`);
  }

  return results;
}

async function seedWebhardFolders(companyIds: { a: number; b: number; c: number }) {
  console.log('  Seeding webhard folders...');

  const folders = [
    // Company A: root + upload + download + nested
    {
      id: FOLDER_IDS.rootA,
      name: '테스트거래처A',
      parentId: null,
      companyId: companyIds.a,
      path: '/',
    },
    {
      id: FOLDER_IDS.uploadA,
      name: '올리기전용',
      parentId: FOLDER_IDS.rootA,
      companyId: companyIds.a,
      path: '/올리기전용',
    },
    {
      id: FOLDER_IDS.downloadA,
      name: '내리기전용',
      parentId: FOLDER_IDS.rootA,
      companyId: companyIds.a,
      path: '/내리기전용',
    },
    {
      id: FOLDER_IDS.nestedA,
      name: '2024년',
      parentId: FOLDER_IDS.downloadA,
      companyId: companyIds.a,
      path: '/내리기전용/2024년',
    },
    // Company B: root + upload + download
    {
      id: FOLDER_IDS.rootB,
      name: '테스트거래처B',
      parentId: null,
      companyId: companyIds.b,
      path: '/',
    },
    {
      id: FOLDER_IDS.uploadB,
      name: '올리기전용',
      parentId: FOLDER_IDS.rootB,
      companyId: companyIds.b,
      path: '/올리기전용',
    },
    {
      id: FOLDER_IDS.downloadB,
      name: '내리기전용',
      parentId: FOLDER_IDS.rootB,
      companyId: companyIds.b,
      path: '/내리기전용',
    },
    // Company C: root + upload + download
    {
      id: FOLDER_IDS.rootC,
      name: '테스트거래처C',
      parentId: null,
      companyId: companyIds.c,
      path: '/',
    },
    {
      id: FOLDER_IDS.uploadC,
      name: '올리기전용',
      parentId: FOLDER_IDS.rootC,
      companyId: companyIds.c,
      path: '/올리기전용',
    },
    {
      id: FOLDER_IDS.downloadC,
      name: '내리기전용',
      parentId: FOLDER_IDS.rootC,
      companyId: companyIds.c,
      path: '/내리기전용',
    },
  ];

  for (const folder of folders) {
    await prisma.webhardFolder.upsert({
      where: { id: folder.id },
      update: { storageProvider: StorageProvider.R2 },
      create: { ...folder, storageProvider: StorageProvider.R2 },
    });
  }

  console.log(`    ${folders.length} folders created`);
}

async function seedWebhardFiles(companyIds: { a: number; b: number; c: number }) {
  console.log('  Seeding webhard files...');

  const files = [
    // uploadA: 3 files
    {
      id: FILE_IDS.f1,
      name: '도면_A_001.pdf',
      originalName: '도면_A_001.pdf',
      size: BigInt(102400), // 100KB
      mimeType: 'application/pdf',
      path: 'dev/seed/도면_A_001.pdf',
      folderId: FOLDER_IDS.uploadA,
      companyId: companyIds.a,
      uploadedBy: 'test_company_a',
    },
    {
      id: FILE_IDS.f2,
      name: '설계도_A.dxf',
      originalName: '설계도_A.dxf',
      size: BigInt(512000), // 500KB
      mimeType: 'application/dxf',
      path: 'dev/seed/설계도_A.dxf',
      folderId: FOLDER_IDS.uploadA,
      companyId: companyIds.a,
      uploadedBy: 'test_company_a',
    },
    {
      id: FILE_IDS.f3,
      name: '참고이미지.png',
      originalName: '참고이미지.png',
      size: BigInt(2097152), // 2MB
      mimeType: 'image/png',
      path: 'dev/seed/참고이미지.png',
      folderId: FOLDER_IDS.uploadA,
      companyId: companyIds.a,
      uploadedBy: 'test_company_a',
    },
    // downloadA: 2 files
    {
      id: FILE_IDS.f4,
      name: '견적서_2024.xlsx',
      originalName: '견적서_2024.xlsx',
      size: BigInt(51200), // 50KB
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      path: 'dev/seed/견적서_2024.xlsx',
      folderId: FOLDER_IDS.downloadA,
      companyId: companyIds.a,
      uploadedBy: 'admin',
    },
    {
      id: FILE_IDS.f5,
      name: '완성도면_A.pdf',
      originalName: '완성도면_A.pdf',
      size: BigInt(5242880), // 5MB
      mimeType: 'application/pdf',
      path: 'dev/seed/완성도면_A.pdf',
      folderId: FOLDER_IDS.downloadA,
      companyId: companyIds.a,
      uploadedBy: 'admin',
    },
    // nestedA: 2 files
    {
      id: FILE_IDS.f6,
      name: '네스팅결과.dxf',
      originalName: '네스팅결과.dxf',
      size: BigInt(10485760), // 10MB
      mimeType: 'application/dxf',
      path: 'dev/seed/네스팅결과.dxf',
      folderId: FOLDER_IDS.nestedA,
      companyId: companyIds.a,
      uploadedBy: 'admin',
    },
    {
      id: FILE_IDS.f7,
      name: '작업사진.png',
      originalName: '작업사진.png',
      size: BigInt(3145728), // 3MB
      mimeType: 'image/png',
      path: 'dev/seed/작업사진.png',
      folderId: FOLDER_IDS.nestedA,
      companyId: companyIds.a,
      uploadedBy: 'admin',
    },
    // uploadB: 2 files
    {
      id: FILE_IDS.f8,
      name: '도면_B_001.pdf',
      originalName: '도면_B_001.pdf',
      size: BigInt(204800), // 200KB
      mimeType: 'application/pdf',
      path: 'dev/seed/도면_B_001.pdf',
      folderId: FOLDER_IDS.uploadB,
      companyId: companyIds.b,
      uploadedBy: 'test_company_b',
    },
    {
      id: FILE_IDS.f9,
      name: '설계도_B.dxf',
      originalName: '설계도_B.dxf',
      size: BigInt(52428800), // 50MB
      mimeType: 'application/dxf',
      path: 'dev/seed/설계도_B.dxf',
      folderId: FOLDER_IDS.uploadB,
      companyId: companyIds.b,
      uploadedBy: 'test_company_b',
    },
    // uploadC: 1 file
    {
      id: FILE_IDS.f10,
      name: '발주서_C.xlsx',
      originalName: '발주서_C.xlsx',
      size: BigInt(1024), // 1KB
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      path: 'dev/seed/발주서_C.xlsx',
      folderId: FOLDER_IDS.uploadC,
      companyId: companyIds.c,
      uploadedBy: 'test_company_c',
    },
  ];

  for (const file of files) {
    await prisma.webhardFile.upsert({
      where: { id: file.id },
      update: { storageProvider: StorageProvider.R2 },
      create: { ...file, storageProvider: StorageProvider.R2 },
    });
  }

  console.log(`    ${files.length} files created`);
}

async function seedContacts(companyIds: { a: number; b: number; c: number }) {
  console.log('  Seeding contacts...');

  const contacts = [
    {
      id: CONTACT_IDS.pending,
      name: '홍길동',
      email: 'hong@example.com',
      phone: '010-1111-2222',
      companyName: '테스트거래처A',
      subject: '도무송 목형 견적 요청',
      message: '신규 제품 도무송 목형 제작 견적을 요청합니다.',
      status: 'pending',
      inquiryType: 'quotation',
      source: 'website',
    },
    {
      id: CONTACT_IDS.inProgress,
      name: '김철수',
      email: 'kim@example.com',
      phone: '010-3333-4444',
      companyName: '테스트거래처B',
      subject: '레이저 커팅 문의',
      message: '레이저 커팅 작업 관련 문의드립니다.',
      status: 'in_progress',
      inquiryType: 'laser',
      source: 'website',
    },
    {
      id: CONTACT_IDS.designReview,
      name: '이영희',
      email: 'lee@example.com',
      phone: '010-5555-6666',
      subject: '샘플 제작 요청',
      message: '샘플 목형 제작을 요청합니다. 도면 첨부합니다.',
      status: 'design_review',
      inquiryType: 'sample',
      source: 'website',
    },
    {
      id: CONTACT_IDS.confirmed,
      name: '박민수',
      email: 'park@example.com',
      phone: '010-7777-8888',
      companyName: '테스트거래처C',
      subject: '도무송 목형 주문',
      message: '견적 확인 후 주문합니다.',
      status: 'confirmed',
      inquiryType: 'die_cutting',
      source: 'website',
    },
    {
      id: CONTACT_IDS.completed,
      name: '정수진',
      email: 'jung@example.com',
      phone: '010-9999-0000',
      subject: '기타 문의',
      message: '납품 완료된 주문 관련 추가 문의입니다.',
      status: 'completed',
      inquiryType: 'other',
      source: 'website',
    },
    // task 17 Phase 6 — E2E S1/S2 (미분류 분류 CTA) 검증용.
    // Playwright 프로젝트가 병렬로 실행되므로 프로젝트별 전용 미분류 contact를 둔다.
    ...UNCLASSIFIED_CONTACT_CASES.map((contactCase, index) => ({
      id: contactCase.id,
      name: `E2E 미분류 담당자 ${index + 1}`,
      email: `e2e-unclassified-${index + 1}@example.com`,
      phone: `010-18${String(index).padStart(2, '0')}-1800`,
      companyName: contactCase.companyName,
      companyId: companyIds.a,
      subject: '[E2E 미분류 테스트] 분류 CTA 검증',
      message: '[E2E 미분류] 분류 CTA ring/pulse 제거 + actorName 검증용.',
      status: 'received',
      inquiryType: null,
      source: 'webhard',
      inquiryNumber: contactCase.inquiryNumber,
    })),
    // task 17 Phase 6 — E2E 긴급 + 최신 도면(v2) 검증용 contact.
    // is_urgent=true 로 사이렌 overlay E2E (S7), v2 DrawingRevision 으로 worker 카드
    // 다운로드가 v2 파일을 받는지 검증 (S5).
    {
      id: CONTACT_IDS.urgent,
      name: 'E2E 긴급 담당자',
      email: 'e2e-urgent@example.com',
      phone: '010-1700-1700',
      companyName: '[E2E 긴급] 샘플업체',
      companyId: companyIds.a,
      subject: '[E2E 긴급 테스트] 테두리 비닐 긴급 작업',
      message: '[E2E 긴급] 시드 생성 — 사이렌 overlay 와 최신 리비전 다운로드 검증.',
      status: 'drawing',
      inquiryType: 'cutting_request',
      source: 'webhard',
      isUrgent: true,
      urgentAt: new Date('2026-04-20T05:00:00.000Z'),
      inquiryNumber: 'E2E-URGENT-17',
      workNumber: 'O-E2E-17',
      inquiryTitle: '[E2E 긴급 테스트] 테두리 비닐 긴급 작업',
      processStage: 'drawing',
      drawingFileUrl: 'https://r2.example.com/dev/seed/e2e-urgent-drawing-v1.dxf',
      drawingFileName: '[E2E 긴급] 도면-v1.dxf',
      originalFilename: '[E2E 긴급] 도면-v1.dxf',
      webhardFolderId: URGENT_CONTACT_FOLDER_ID,
    },
    {
      id: CONTACT_IDS.workerDownload,
      name: 'E2E 다운로드 담당자',
      email: 'e2e-worker-download@example.com',
      phone: '010-2000-2000',
      companyName: '[E2E 다운로드] 샘플업체',
      companyId: companyIds.a,
      subject: '[E2E 다운로드 테스트] worker 최신 리비전 검증',
      message: '[E2E 다운로드] worker 세션 latest-drawing/download 검증 전용.',
      status: 'drawing',
      inquiryType: 'cutting_request',
      source: 'webhard',
      inquiryNumber: 'E2E-DOWNLOAD-20',
      workNumber: 'O-E2E-20',
      inquiryTitle: '[E2E 다운로드 테스트] worker 최신 리비전 검증',
      processStage: 'drawing',
      drawingFileUrl: 'https://r2.example.com/dev/seed/e2e-worker-download-v1.dxf',
      drawingFileName: '[E2E 다운로드] 도면-v1.dxf',
      originalFilename: '[E2E 다운로드] 도면-v1.dxf',
      webhardFolderId: WORKER_DOWNLOAD_FOLDER_ID,
    },
    {
      id: CONTACT_IDS.companyTimeline,
      name: 'E2E 업체 타임라인 담당자',
      email: 'e2e-company-timeline@example.com',
      phone: '010-1900-1900',
      companyName: '테스트거래처A',
      companyId: companyIds.a,
      subject: '[E2E 업체 타임라인] 공개/비공개 도면 마스킹',
      message: '[E2E 업체 타임라인] 업체 세션의 타임라인 격리와 actorName 마스킹 검증용.',
      status: 'drawing',
      inquiryType: 'cutting_request',
      source: 'webhard',
      inquiryNumber: 'E2E-COMPANY-19',
      workNumber: 'O-E2E-19',
      inquiryTitle: '[E2E 업체 타임라인] 공개/비공개 도면 마스킹',
      processStage: 'drawing',
    },
  ];

  for (const contact of contacts) {
    await prisma.contact.upsert({
      where: { id: contact.id },
      update: contact,
      create: contact,
    });
  }

  console.log(`    ${contacts.length} contacts created`);
}

/**
 * task 17 Phase 6 — E2E 긴급 contact 에 v1/v2 DrawingRevision 시드.
 *
 * worker 카드의 다운로드 버튼이 `getLatestForCurrentStage` 결과(가장 최신 v2)를
 * 가져오는지 검증하기 위해 v1 + v2 두 리비전을 명시적으로 생성한다.
 * v2 파일명에는 'v2' 키워드를 포함시켜 E2E 에서 검증 가능하게 한다.
 *
 * 매칭되는 WebhardFile 도 함께 등록 — webhard_folder_id 가 채워져 있어야
 * worker 카드의 다운로드 아이콘이 렌더된다.
 */
async function seedUrgentContactDrawingRevisions(companyIds: { a: number; b: number; c: number }) {
  console.log('  Seeding urgent contact drawing revisions...');

  // 1) WebhardFolder — 긴급 contact 의 webhard_folder_id 와 매칭
  await prisma.webhardFolder.upsert({
    where: { id: URGENT_CONTACT_FOLDER_ID },
    update: { storageProvider: StorageProvider.R2 },
    create: {
      id: URGENT_CONTACT_FOLDER_ID,
      name: 'O-E2E-17',
      parentId: null,
      companyId: companyIds.a,
      path: '/[E2E 긴급]/문의/O-E2E-17',
      storageProvider: StorageProvider.R2,
    },
  });

  // 2) WebhardFile — v1, v2 파일 (DrawingRevision.files 의 url 과 매칭)
  const webhardFiles = [
    {
      id: URGENT_CONTACT_FILE_V1_ID,
      name: 'O-E2E-17 [E2E 긴급] 도면-v1.dxf',
      originalName: '[E2E 긴급] 도면-v1.dxf',
      size: BigInt(102400),
      mimeType: 'application/dxf',
      path: 'dev/seed/e2e-urgent-drawing-v1.dxf',
      folderId: URGENT_CONTACT_FOLDER_ID,
      companyId: companyIds.a,
      uploadedBy: 'system',
      inquiryNumber: 'E2E-URGENT-17',
    },
    {
      id: URGENT_CONTACT_FILE_V2_ID,
      name: 'O-E2E-17 [E2E 긴급] 도면-v2.dxf',
      originalName: '[E2E 긴급] 도면-v2.dxf',
      size: BigInt(204800),
      mimeType: 'application/dxf',
      path: 'dev/seed/e2e-urgent-drawing-v2.dxf',
      folderId: URGENT_CONTACT_FOLDER_ID,
      companyId: companyIds.a,
      uploadedBy: 'system',
      inquiryNumber: 'E2E-URGENT-17',
    },
  ];
  for (const file of webhardFiles) {
    await prisma.webhardFile.upsert({
      where: { id: file.id },
      update: { storageProvider: StorageProvider.R2 },
      create: { ...file, storageProvider: StorageProvider.R2 },
    });
  }

  // 3) DrawingRevision — v1 (initial), v2 (domuson_fit). createdAt 을 명시해 v2 가 최신.
  // E2E S3 등 테스트가 런타임에 추가한 revision 을 먼저 제거해 '최신=v2' 불변식을 복원한다.
  await prisma.drawingRevision.deleteMany({
    where: { contactId: CONTACT_IDS.urgent },
  });
  const revisions = [
    {
      id: DRAWING_REVISION_IDS.urgentV1,
      contactId: CONTACT_IDS.urgent,
      version: 1,
      processStage: 'drawing',
      reason: 'initial',
      reasonDetail: null,
      files: [
        {
          url: 'https://r2.example.com/dev/seed/e2e-urgent-drawing-v1.dxf',
          name: '[E2E 긴급] 도면-v1.dxf',
          size: 102400,
          mimeType: 'application/dxf',
        },
      ],
      webhardFileIds: [URGENT_CONTACT_FILE_V1_ID],
      actorType: 'system',
      actorName: '웹하드 자동생성',
      source: 'auto_initial',
      isPublic: true,
      note: null,
      createdAt: new Date('2026-04-20T05:01:00.000Z'),
    },
    {
      id: DRAWING_REVISION_IDS.urgentV2,
      contactId: CONTACT_IDS.urgent,
      version: 2,
      processStage: 'drawing',
      reason: 'domuson_fit',
      reasonDetail: null,
      files: [
        {
          url: 'https://r2.example.com/dev/seed/e2e-urgent-drawing-v2.dxf',
          name: '[E2E 긴급] 도면-v2.dxf',
          size: 204800,
          mimeType: 'application/dxf',
        },
      ],
      webhardFileIds: [URGENT_CONTACT_FILE_V2_ID],
      actorType: 'admin',
      actorName: '관리자',
      source: 'manual',
      isPublic: true,
      note: 'E2E 검증용 v2 도면',
      createdAt: new Date('2026-04-20T06:00:00.000Z'),
    },
  ];
  for (const rev of revisions) {
    await prisma.drawingRevision.upsert({
      where: { id: rev.id },
      update: {},
      create: rev,
    });
  }

  console.log(
    `    Urgent contact: 1 folder, ${webhardFiles.length} files, ${revisions.length} revisions`
  );
}

async function seedWorkerDownloadContactDrawingRevisions(companyIds: {
  a: number;
  b: number;
  c: number;
}) {
  console.log('  Seeding worker download contact drawing revisions...');

  await prisma.webhardFolder.upsert({
    where: { id: WORKER_DOWNLOAD_FOLDER_ID },
    update: {
      name: 'O-E2E-20',
      companyId: companyIds.a,
      path: '/[E2E 다운로드]/문의/O-E2E-20',
      storageProvider: StorageProvider.R2,
    },
    create: {
      id: WORKER_DOWNLOAD_FOLDER_ID,
      name: 'O-E2E-20',
      parentId: null,
      companyId: companyIds.a,
      path: '/[E2E 다운로드]/문의/O-E2E-20',
      storageProvider: StorageProvider.R2,
    },
  });

  const webhardFiles = [
    {
      id: WORKER_DOWNLOAD_FILE_V1_ID,
      name: 'O-E2E-20 [E2E 다운로드] 도면-v1.dxf',
      originalName: '[E2E 다운로드] 도면-v1.dxf',
      size: BigInt(102400),
      mimeType: 'application/dxf',
      path: 'dev/seed/e2e-worker-download-v1.dxf',
      folderId: WORKER_DOWNLOAD_FOLDER_ID,
      companyId: companyIds.a,
      uploadedBy: 'system',
      inquiryNumber: 'E2E-DOWNLOAD-20',
    },
    {
      id: WORKER_DOWNLOAD_FILE_V2_ID,
      name: 'O-E2E-20 [E2E 다운로드] 도면-v2.dxf',
      originalName: '[E2E 다운로드] 도면-v2.dxf',
      size: BigInt(204800),
      mimeType: 'application/dxf',
      path: 'dev/seed/e2e-worker-download-v2.dxf',
      folderId: WORKER_DOWNLOAD_FOLDER_ID,
      companyId: companyIds.a,
      uploadedBy: 'system',
      inquiryNumber: 'E2E-DOWNLOAD-20',
    },
  ];
  for (const file of webhardFiles) {
    await prisma.webhardFile.upsert({
      where: { id: file.id },
      update: { ...file, storageProvider: StorageProvider.R2 },
      create: { ...file, storageProvider: StorageProvider.R2 },
    });
  }

  await prisma.drawingRevision.deleteMany({
    where: { contactId: CONTACT_IDS.workerDownload },
  });

  const revisions = [
    {
      id: DRAWING_REVISION_IDS.workerDownloadV1,
      contactId: CONTACT_IDS.workerDownload,
      version: 1,
      processStage: 'drawing',
      reason: 'initial',
      reasonDetail: null,
      files: [
        {
          url: 'https://r2.example.com/dev/seed/e2e-worker-download-v1.dxf',
          name: '[E2E 다운로드] 도면-v1.dxf',
          size: 102400,
          mimeType: 'application/dxf',
        },
      ],
      webhardFileIds: [WORKER_DOWNLOAD_FILE_V1_ID],
      actorType: 'system',
      actorName: '웹하드 자동생성',
      source: 'auto_initial',
      isPublic: true,
      note: null,
      createdAt: new Date('2026-04-20T07:01:00.000Z'),
    },
    {
      id: DRAWING_REVISION_IDS.workerDownloadV2,
      contactId: CONTACT_IDS.workerDownload,
      version: 2,
      processStage: 'drawing',
      reason: 'domuson_fit',
      reasonDetail: null,
      files: [
        {
          url: 'https://r2.example.com/dev/seed/e2e-worker-download-v2.dxf',
          name: '[E2E 다운로드] 도면-v2.dxf',
          size: 204800,
          mimeType: 'application/dxf',
        },
      ],
      webhardFileIds: [WORKER_DOWNLOAD_FILE_V2_ID],
      actorType: 'admin',
      actorName: '관리자',
      source: 'manual',
      isPublic: true,
      note: 'E2E worker 다운로드 검증용 v2 도면',
      createdAt: new Date('2026-04-20T08:00:00.000Z'),
    },
  ];
  for (const rev of revisions) {
    await prisma.drawingRevision.upsert({
      where: { id: rev.id },
      update: rev,
      create: rev,
    });
  }

  console.log(
    `    Worker download contact: 1 folder, ${webhardFiles.length} files, ${revisions.length} revisions`
  );
}

async function seedCompanyTimelineRevisions() {
  console.log('  Seeding company timeline revisions...');

  await prisma.drawingRevision.deleteMany({
    where: { contactId: CONTACT_IDS.companyTimeline },
  });

  const revisions = [
    {
      id: DRAWING_REVISION_IDS.companyTimelinePrivate,
      contactId: CONTACT_IDS.companyTimeline,
      version: 1,
      processStage: 'drawing',
      reason: 'initial',
      reasonDetail: null,
      files: [
        {
          url: 'https://r2.example.com/dev/seed/e2e-company-private-v1.dxf',
          name: '[E2E 업체] 비공개-v1.dxf',
          size: 10000,
          mimeType: 'application/dxf',
        },
      ],
      webhardFileIds: [],
      actorType: 'admin',
      actorName: '관리자',
      source: 'manual',
      isPublic: false,
      note: '업체 세션에 노출되면 안 되는 내부 메모',
      createdAt: new Date('2026-04-20T07:00:00.000Z'),
    },
    {
      id: DRAWING_REVISION_IDS.companyTimelinePublic,
      contactId: CONTACT_IDS.companyTimeline,
      version: 2,
      processStage: 'drawing',
      reason: 'domuson_fit',
      reasonDetail: null,
      files: [
        {
          url: 'https://r2.example.com/dev/seed/e2e-company-public-v2.dxf',
          name: '[E2E 업체] 공개-v2.dxf',
          size: 20000,
          mimeType: 'application/dxf',
        },
      ],
      webhardFileIds: [],
      actorType: 'admin',
      actorName: '관리자',
      source: 'manual',
      isPublic: true,
      note: null,
      createdAt: new Date('2026-04-20T08:00:00.000Z'),
    },
  ];

  for (const revision of revisions) {
    await prisma.drawingRevision.upsert({
      where: { id: revision.id },
      update: revision,
      create: revision,
    });
  }

  console.log(`    Company timeline contact: ${revisions.length} revisions`);
}

async function seedContactStatusHistory() {
  console.log('  Seeding contact status history...');

  const histories = [
    {
      id: HISTORY_IDS.h1,
      contactId: CONTACT_IDS.pending,
      changeType: 'status_change',
      fromStatus: null,
      toStatus: 'pending',
      actorType: 'system',
      source: 'website',
      note: '새 문의 접수',
    },
    {
      id: HISTORY_IDS.h2,
      contactId: CONTACT_IDS.inProgress,
      changeType: 'status_change',
      fromStatus: 'pending',
      toStatus: 'in_progress',
      actorType: 'admin',
      actorName: '관리자',
      source: 'admin_dashboard',
      note: '문의 처리 시작',
    },
    {
      id: HISTORY_IDS.h3,
      contactId: CONTACT_IDS.designReview,
      changeType: 'status_change',
      fromStatus: 'in_progress',
      toStatus: 'design_review',
      actorType: 'admin',
      actorName: '관리자',
      source: 'admin_dashboard',
      note: '도면 검토 중',
    },
    {
      id: HISTORY_IDS.h4,
      contactId: CONTACT_IDS.confirmed,
      changeType: 'status_change',
      fromStatus: 'design_review',
      toStatus: 'confirmed',
      actorType: 'admin',
      actorName: '관리자',
      source: 'admin_dashboard',
      note: '주문 확정',
    },
    {
      id: HISTORY_IDS.h5,
      contactId: CONTACT_IDS.completed,
      changeType: 'status_change',
      fromStatus: 'confirmed',
      toStatus: 'completed',
      actorType: 'admin',
      actorName: '관리자',
      source: 'admin_dashboard',
      note: '작업 완료',
    },
  ];

  for (const history of histories) {
    await prisma.contactStatusHistory.upsert({
      where: { id: history.id },
      update: {},
      create: history,
    });
  }

  console.log(`    ${histories.length} status history entries created`);
}

async function seedErpWorkers() {
  console.log('  Seeding ERP workers...');

  const workers = [
    {
      id: WORKER_IDS.office,
      name: '김테스트',
      pinHash: hashPin('1234'),
      role: 'office_worker',
      workerType: 'office',
      isActive: true,
    },
    {
      id: WORKER_IDS.field,
      name: '이테스트',
      pinHash: hashPin('5678'),
      role: 'field_worker',
      workerType: 'field',
      isActive: true,
    },
    {
      id: WORKER_IDS.manager,
      name: '박테스트',
      pinHash: hashPin('0000'),
      role: 'manager',
      isActive: true,
    },
  ];

  for (const worker of workers) {
    await prisma.erpWorker.upsert({
      where: { id: worker.id },
      update: worker,
      create: worker,
    });
  }

  console.log(`    ${workers.length} workers created`);
}

async function seedApiKeys() {
  console.log('  Seeding API keys...');

  // .env.local의 MIGRATION_API_KEY / INTEGRATION_API_KEY (Next.js↔NestJS 통신용)
  const MIGRATION_KEY =
    process.env.MIGRATION_API_KEY ||
    'b9d3744492cb04d18636daa306754dd2e3cf98ddba84f8548111fde83ee44313';
  const INTEGRATION_KEY =
    process.env.INTEGRATION_API_KEY ||
    'yjl_4512a2a242752e014280df2dc402b84f7286a4e94192c7b81632d3bfa6c38f90';

  const keys = [
    {
      id: 'migration-api',
      name: 'migration-api',
      keyHash: hashKey(MIGRATION_KEY),
      programType: 'migration',
      permissions: ['all'],
      isActive: true,
    },
    {
      id: 'integration-api',
      name: 'integration-api',
      keyHash: hashKey(INTEGRATION_KEY),
      programType: 'integration',
      permissions: ['all'],
      isActive: true,
    },
    {
      id: API_KEY_IDS.sync,
      name: 'sync-dev',
      keyHash: hashKey('yjl_dev_sync_test_key_1234567890'),
      programType: 'sync',
      permissions: ['read', 'write', 'sync'],
      isActive: true,
    },
    {
      id: API_KEY_IDS.test,
      name: 'test-dev',
      keyHash: hashKey('yjl_dev_test_key_0987654321'),
      programType: 'test',
      permissions: ['read'],
      isActive: true,
    },
  ];

  for (const key of keys) {
    await prisma.apiKey.upsert({
      where: { id: key.id },
      update: key,
      create: key,
    });
  }

  console.log(`    ${keys.length} API keys created`);
}

async function seedSystemSettings() {
  console.log('  Seeding system settings...');

  const settings: { key: string; value: unknown }[] = [
    { key: 'maintenance_mode', value: false },
    { key: 'max_upload_size_bytes', value: 52428800 },
    {
      key: 'allowed_file_extensions',
      value: ['.pdf', '.dxf', '.png', '.xlsx', '.zip', '.dwg'],
    },
    { key: 'auto_approve_companies', value: false },
  ];

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: { key: setting.key, value: setting.value as never },
    });
  }

  console.log(`    ${settings.length} system settings created`);
}

async function seedNumberCounters() {
  console.log('  Seeding number counters...');

  const baseDate = new Date('2026-01-01');
  const types = ['inquiry', 'work', 'order', 'delivery', 'nesting', 'drawing'];

  for (const type of types) {
    await prisma.numberCounter.upsert({
      where: { dateKey_type: { dateKey: baseDate, type } },
      update: {},
      create: { dateKey: baseDate, type, lastSeq: 0 },
    });
  }

  console.log(`    ${types.length} number counters created`);
}

// ─── Drawing Consistency (task 18 phase 7) fixtures ──────────────
// 마이그레이션 스크립트(`scripts/migrate-webhard-inquiry-folders.ts`) 의
// 통합 테스트 전용. 기본 seed 커맨드는 이 함수를 호출하지 않는다.
// 6 Contact 케이스 (phase7.md 참조).
export const DRAWING_CONSISTENCY_COMPANY = {
  id: 901,
  companyName: '드로잉일관성테스트거래처',
  username: 'dc_company',
};

export const DRAWING_CONSISTENCY_FOLDER_IDS = {
  root: 'f1000000-0000-4000-a000-000000000901',
  templateCutting: 'f1000000-0000-4000-a000-000000000902',
  templateMold: 'f1000000-0000-4000-a000-000000000903',
  inquiryC1: 'f1000000-0000-4000-a000-000000000904',
  inquiryC3: 'f1000000-0000-4000-a000-000000000905',
  // Contact 5 — 이미 제자리에 있는 파일이 사는 inquiry 폴더.
  inquiryC5: 'f1000000-0000-4000-a000-000000000906',
} as const;

export const DRAWING_CONSISTENCY_CONTACT_IDS = {
  c1: '00000000-0000-4000-b000-000000000901',
  c2: '00000000-0000-4000-b000-000000000902',
  c3: '00000000-0000-4000-b000-000000000903',
  c4: '00000000-0000-4000-b000-000000000904',
  c5: '00000000-0000-4000-b000-000000000905',
  c6: '00000000-0000-4000-b000-000000000906',
} as const;

export const DRAWING_CONSISTENCY_FILE_IDS = {
  f1: 'f2000000-0000-4000-a000-000000000901',
  f2: 'f2000000-0000-4000-a000-000000000902',
  f3a: 'f2000000-0000-4000-a000-000000000903',
  f3b: 'f2000000-0000-4000-a000-000000000904',
  f3c: 'f2000000-0000-4000-a000-000000000905',
  f4: 'f2000000-0000-4000-a000-000000000906',
  f5: 'f2000000-0000-4000-a000-000000000907',
  f6: 'f2000000-0000-4000-a000-000000000908',
} as const;

export interface DrawingConsistencyFolder {
  id: string;
  name: string;
  parentId: string | null;
  companyId: number | null;
  path: string;
  folderKind: string;
  contactId?: string | null;
  inquiryNumber?: string | null;
  workNumber?: string | null;
  deletedAt: Date | null;
}

export interface DrawingConsistencyContact {
  id: string;
  companyName: string | null;
  inquiryType: string | null;
  inquiryNumber: string | null;
  workNumber: string | null;
  processStage: string | null;
  parentContactId: string | null;
  splitIndex: number | null;
  deletedAt: Date | null;
}

export interface DrawingConsistencyFile {
  id: string;
  name: string;
  originalName: string;
  folderId: string | null;
  companyId: number;
  inquiryNumber: string | null;
  path: string;
  deletedAt: Date | null;
}

export interface DrawingConsistencyRevision {
  id: string;
  contactId: string;
  processStage: string | null;
  webhardFileIds: string[];
}

export interface DrawingConsistencyFixtures {
  company: { id: number; companyName: string };
  folders: DrawingConsistencyFolder[];
  contacts: DrawingConsistencyContact[];
  files: DrawingConsistencyFile[];
  revisions: DrawingConsistencyRevision[];
}

/**
 * phase 7 마이그레이션 스크립트 통합 테스트용 fixture.
 * 실제 DB 를 건드리지 않고 in-memory 객체만 반환 — 호출자가 mock 으로 주입.
 */
export function seedDrawingConsistencyFixtures(): DrawingConsistencyFixtures {
  const company = {
    id: DRAWING_CONSISTENCY_COMPANY.id,
    companyName: DRAWING_CONSISTENCY_COMPANY.companyName,
  };
  const rootPath = `/${company.companyName}`;

  const folders: DrawingConsistencyFolder[] = [
    {
      id: DRAWING_CONSISTENCY_FOLDER_IDS.root,
      name: company.companyName,
      parentId: null,
      companyId: company.id,
      path: rootPath,
      folderKind: 'generic',
      deletedAt: null,
    },
    {
      id: DRAWING_CONSISTENCY_FOLDER_IDS.templateCutting,
      name: '칼선의뢰',
      parentId: DRAWING_CONSISTENCY_FOLDER_IDS.root,
      companyId: company.id,
      path: `${rootPath}/칼선의뢰`,
      folderKind: 'generic',
      deletedAt: null,
    },
    {
      id: DRAWING_CONSISTENCY_FOLDER_IDS.templateMold,
      name: '목형의뢰',
      parentId: DRAWING_CONSISTENCY_FOLDER_IDS.root,
      companyId: company.id,
      path: `${rootPath}/목형의뢰`,
      folderKind: 'generic',
      deletedAt: null,
    },
    {
      id: DRAWING_CONSISTENCY_FOLDER_IDS.inquiryC1,
      name: '260420-O-101',
      parentId: DRAWING_CONSISTENCY_FOLDER_IDS.templateCutting,
      companyId: company.id,
      path: `${rootPath}/칼선의뢰/260420-O-101`,
      folderKind: 'inquiry',
      contactId: DRAWING_CONSISTENCY_CONTACT_IDS.c1,
      inquiryNumber: '260420-O-101',
      deletedAt: null,
    },
    {
      id: DRAWING_CONSISTENCY_FOLDER_IDS.inquiryC3,
      name: '260420-O-102_260420-F-102',
      parentId: DRAWING_CONSISTENCY_FOLDER_IDS.templateMold,
      companyId: company.id,
      path: `${rootPath}/목형의뢰/260420-O-102_260420-F-102`,
      folderKind: 'inquiry',
      contactId: DRAWING_CONSISTENCY_CONTACT_IDS.c3,
      inquiryNumber: '260420-O-102',
      workNumber: '260420-F-102',
      deletedAt: null,
    },
    {
      id: DRAWING_CONSISTENCY_FOLDER_IDS.inquiryC5,
      name: '260420-O-104',
      parentId: DRAWING_CONSISTENCY_FOLDER_IDS.templateCutting,
      companyId: company.id,
      path: `${rootPath}/칼선의뢰/260420-O-104`,
      folderKind: 'inquiry',
      contactId: DRAWING_CONSISTENCY_CONTACT_IDS.c5,
      inquiryNumber: '260420-O-104',
      deletedAt: null,
    },
  ];

  const contacts: DrawingConsistencyContact[] = [
    {
      id: DRAWING_CONSISTENCY_CONTACT_IDS.c1,
      companyName: company.companyName,
      inquiryType: 'cutting_request',
      inquiryNumber: '260420-O-101',
      workNumber: null,
      processStage: null,
      parentContactId: null,
      splitIndex: null,
      deletedAt: null,
    },
    {
      id: DRAWING_CONSISTENCY_CONTACT_IDS.c2,
      companyName: company.companyName,
      inquiryType: 'mold_request',
      inquiryNumber: null,
      workNumber: '260420-F-101',
      processStage: 'laser',
      parentContactId: null,
      splitIndex: null,
      deletedAt: null,
    },
    {
      id: DRAWING_CONSISTENCY_CONTACT_IDS.c3,
      companyName: company.companyName,
      inquiryType: 'mold_request',
      inquiryNumber: '260420-O-102',
      workNumber: '260420-F-102',
      processStage: 'drawing_confirmed',
      parentContactId: null,
      splitIndex: null,
      deletedAt: null,
    },
    {
      id: DRAWING_CONSISTENCY_CONTACT_IDS.c4,
      companyName: company.companyName,
      inquiryType: null,
      inquiryNumber: '260420-O-103',
      workNumber: null,
      processStage: null,
      parentContactId: null,
      splitIndex: null,
      deletedAt: null,
    },
    {
      id: DRAWING_CONSISTENCY_CONTACT_IDS.c5,
      companyName: company.companyName,
      inquiryType: 'cutting_request',
      inquiryNumber: '260420-O-104',
      workNumber: null,
      processStage: 'drawing',
      parentContactId: null,
      splitIndex: null,
      deletedAt: null,
    },
    {
      id: DRAWING_CONSISTENCY_CONTACT_IDS.c6,
      companyName: company.companyName,
      inquiryType: 'cutting_request',
      inquiryNumber: '260417-O-002-1',
      workNumber: null,
      processStage: null,
      parentContactId: DRAWING_CONSISTENCY_CONTACT_IDS.c5,
      splitIndex: 1,
      deletedAt: null,
    },
  ];

  const files: DrawingConsistencyFile[] = [
    // Contact 1: 업체 root 에 흩어진 원본
    {
      id: DRAWING_CONSISTENCY_FILE_IDS.f1,
      name: '원본1.dxf',
      originalName: '원본1.dxf',
      folderId: DRAWING_CONSISTENCY_FOLDER_IDS.root,
      companyId: company.id,
      inquiryNumber: '260420-O-101',
      path: `${rootPath}/원본1.dxf`,
      deletedAt: null,
    },
    // Contact 2: 목형의뢰 템플릿 폴더 바로 아래
    {
      id: DRAWING_CONSISTENCY_FILE_IDS.f2,
      name: '원본2.dxf',
      originalName: '원본2.dxf',
      folderId: DRAWING_CONSISTENCY_FOLDER_IDS.templateMold,
      companyId: company.id,
      inquiryNumber: '260420-F-101',
      path: `${rootPath}/목형의뢰/원본2.dxf`,
      deletedAt: null,
    },
    // Contact 3: 파일 3개 — 두 템플릿에 흩어짐
    {
      id: DRAWING_CONSISTENCY_FILE_IDS.f3a,
      name: '원본3a.dxf',
      originalName: '원본3a.dxf',
      folderId: DRAWING_CONSISTENCY_FOLDER_IDS.templateCutting,
      companyId: company.id,
      inquiryNumber: '260420-O-102',
      path: `${rootPath}/칼선의뢰/원본3a.dxf`,
      deletedAt: null,
    },
    {
      id: DRAWING_CONSISTENCY_FILE_IDS.f3b,
      name: '원본3b.dxf',
      originalName: '원본3b.dxf',
      folderId: DRAWING_CONSISTENCY_FOLDER_IDS.templateMold,
      companyId: company.id,
      inquiryNumber: '260420-F-102',
      path: `${rootPath}/목형의뢰/원본3b.dxf`,
      deletedAt: null,
    },
    {
      id: DRAWING_CONSISTENCY_FILE_IDS.f3c,
      name: '원본3c.dxf',
      originalName: '원본3c.dxf',
      folderId: DRAWING_CONSISTENCY_FOLDER_IDS.root,
      companyId: company.id,
      inquiryNumber: '260420-O-102',
      path: `${rootPath}/원본3c.dxf`,
      deletedAt: null,
    },
    // Contact 4: 미분류 — 건드리면 안 됨
    {
      id: DRAWING_CONSISTENCY_FILE_IDS.f4,
      name: '원본4.dxf',
      originalName: '원본4.dxf',
      folderId: DRAWING_CONSISTENCY_FOLDER_IDS.root,
      companyId: company.id,
      inquiryNumber: '260420-O-103',
      path: `${rootPath}/원본4.dxf`,
      deletedAt: null,
    },
    // Contact 5: 이미 올바른 위치·이름 (idempotency)
    {
      id: DRAWING_CONSISTENCY_FILE_IDS.f5,
      name: '[260420-O-104] 원본5.dxf',
      originalName: '원본5.dxf',
      folderId: DRAWING_CONSISTENCY_FOLDER_IDS.inquiryC5,
      companyId: company.id,
      inquiryNumber: '260420-O-104',
      path: `${rootPath}/칼선의뢰/260420-O-104/[260420-O-104] 원본5.dxf`,
      deletedAt: null,
    },
    // Contact 6: 분할 문의 (parentContactId 있음)
    {
      id: DRAWING_CONSISTENCY_FILE_IDS.f6,
      name: '원본6.dxf',
      originalName: '원본6.dxf',
      folderId: DRAWING_CONSISTENCY_FOLDER_IDS.root,
      companyId: company.id,
      inquiryNumber: '260417-O-002-1',
      path: `${rootPath}/원본6.dxf`,
      deletedAt: null,
    },
  ];

  const revisions: DrawingConsistencyRevision[] = [
    {
      id: 'dc-rev-c1',
      contactId: DRAWING_CONSISTENCY_CONTACT_IDS.c1,
      processStage: 'drawing',
      webhardFileIds: [DRAWING_CONSISTENCY_FILE_IDS.f1],
    },
    {
      id: 'dc-rev-c2',
      contactId: DRAWING_CONSISTENCY_CONTACT_IDS.c2,
      processStage: 'laser',
      webhardFileIds: [DRAWING_CONSISTENCY_FILE_IDS.f2],
    },
    {
      id: 'dc-rev-c3',
      contactId: DRAWING_CONSISTENCY_CONTACT_IDS.c3,
      processStage: 'drawing_confirmed',
      webhardFileIds: [
        DRAWING_CONSISTENCY_FILE_IDS.f3a,
        DRAWING_CONSISTENCY_FILE_IDS.f3b,
        DRAWING_CONSISTENCY_FILE_IDS.f3c,
      ],
    },
    {
      id: 'dc-rev-c4',
      contactId: DRAWING_CONSISTENCY_CONTACT_IDS.c4,
      processStage: null,
      webhardFileIds: [DRAWING_CONSISTENCY_FILE_IDS.f4],
    },
    {
      id: 'dc-rev-c5',
      contactId: DRAWING_CONSISTENCY_CONTACT_IDS.c5,
      processStage: 'drawing',
      webhardFileIds: [DRAWING_CONSISTENCY_FILE_IDS.f5],
    },
    {
      id: 'dc-rev-c6',
      contactId: DRAWING_CONSISTENCY_CONTACT_IDS.c6,
      processStage: null,
      webhardFileIds: [DRAWING_CONSISTENCY_FILE_IDS.f6],
    },
  ];

  return { company, folders, contacts, files, revisions };
}

async function seedDrawingConsistencyDbFixtures() {
  console.log('  Seeding drawing consistency DB fixtures...');

  const fixtures = seedDrawingConsistencyFixtures();
  const passwordHash = bcrypt.hashSync('test1234', SALT_ROUNDS);

  const company = await prisma.company.upsert({
    where: { username: DRAWING_CONSISTENCY_COMPANY.username },
    update: {
      companyName: DRAWING_CONSISTENCY_COMPANY.companyName,
      managerName: 'E2E 담당자',
      businessRegistrationNumber: '901-00-00000',
      representativeName: 'E2E 대표',
      businessAddress: 'E2E 테스트 주소',
      managerPosition: '담당',
      managerPhone: '010-9010-9010',
      managerEmail: 'dc_company@example.com',
      isApproved: true,
      status: 'active',
      webhardAccess: true,
    },
    create: {
      username: DRAWING_CONSISTENCY_COMPANY.username,
      companyName: DRAWING_CONSISTENCY_COMPANY.companyName,
      managerName: 'E2E 담당자',
      businessRegistrationNumber: '901-00-00000',
      representativeName: 'E2E 대표',
      businessAddress: 'E2E 테스트 주소',
      managerPosition: '담당',
      managerPhone: '010-9010-9010',
      managerEmail: 'dc_company@example.com',
      passwordHash,
      isApproved: true,
      status: 'active',
      webhardAccess: true,
    },
  });

  for (const folder of fixtures.folders) {
    await prisma.webhardFolder.upsert({
      where: { id: folder.id },
      update: {
        name: folder.name,
        parentId: folder.parentId,
        companyId: company.id,
        path: folder.path,
        folderKind: folder.folderKind,
        contactId: folder.contactId ?? null,
        inquiryNumber: folder.inquiryNumber ?? null,
        workNumber: folder.workNumber ?? null,
        deletedAt: null,
        storageProvider: StorageProvider.R2,
      },
      create: {
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId,
        companyId: company.id,
        path: folder.path,
        folderKind: folder.folderKind,
        contactId: folder.contactId ?? null,
        inquiryNumber: folder.inquiryNumber ?? null,
        workNumber: folder.workNumber ?? null,
        deletedAt: null,
        storageProvider: StorageProvider.R2,
      },
    });
  }

  for (const contact of fixtures.contacts) {
    await prisma.contact.upsert({
      where: { id: contact.id },
      update: {
        name: 'E2E 도면 일관성 담당자',
        email: 'drawing-consistency@example.com',
        phone: '010-9010-0000',
        companyName: DRAWING_CONSISTENCY_COMPANY.companyName,
        companyId: company.id,
        subject: '[E2E 도면 일관성] 시드 문의',
        message: '[E2E 도면 일관성] 폴더/파일명/타임라인 검증용.',
        status: 'drawing',
        inquiryType: contact.inquiryType,
        source: 'webhard',
        inquiryNumber: contact.inquiryNumber,
        workNumber: contact.workNumber,
        processStage: contact.processStage,
        parentContactId: contact.parentContactId,
        splitIndex: contact.splitIndex,
        deletedAt: null,
      },
      create: {
        id: contact.id,
        name: 'E2E 도면 일관성 담당자',
        email: 'drawing-consistency@example.com',
        phone: '010-9010-0000',
        companyName: DRAWING_CONSISTENCY_COMPANY.companyName,
        companyId: company.id,
        subject: '[E2E 도면 일관성] 시드 문의',
        message: '[E2E 도면 일관성] 폴더/파일명/타임라인 검증용.',
        status: 'drawing',
        inquiryType: contact.inquiryType,
        source: 'webhard',
        inquiryNumber: contact.inquiryNumber,
        workNumber: contact.workNumber,
        processStage: contact.processStage,
        parentContactId: contact.parentContactId,
        splitIndex: contact.splitIndex,
        deletedAt: null,
      },
    });
  }

  const fileFolderOverrides: Record<string, { folderId: string; name: string; path: string }> = {
    [DRAWING_CONSISTENCY_FILE_IDS.f1]: {
      folderId: DRAWING_CONSISTENCY_FOLDER_IDS.inquiryC1,
      name: '[260420-O-101] 원본1.dxf',
      path: `/${DRAWING_CONSISTENCY_COMPANY.companyName}/칼선의뢰/260420-O-101/[260420-O-101] 원본1.dxf`,
    },
    [DRAWING_CONSISTENCY_FILE_IDS.f3a]: {
      folderId: DRAWING_CONSISTENCY_FOLDER_IDS.inquiryC3,
      name: '[260420-F-102] 원본3a.dxf',
      path: `/${DRAWING_CONSISTENCY_COMPANY.companyName}/목형의뢰/260420-O-102_260420-F-102/[260420-F-102] 원본3a.dxf`,
    },
    [DRAWING_CONSISTENCY_FILE_IDS.f3b]: {
      folderId: DRAWING_CONSISTENCY_FOLDER_IDS.inquiryC3,
      name: '[260420-F-102] 원본3b.dxf',
      path: `/${DRAWING_CONSISTENCY_COMPANY.companyName}/목형의뢰/260420-O-102_260420-F-102/[260420-F-102] 원본3b.dxf`,
    },
    [DRAWING_CONSISTENCY_FILE_IDS.f3c]: {
      folderId: DRAWING_CONSISTENCY_FOLDER_IDS.inquiryC3,
      name: '[260420-F-102] 원본3c.dxf',
      path: `/${DRAWING_CONSISTENCY_COMPANY.companyName}/목형의뢰/260420-O-102_260420-F-102/[260420-F-102] 원본3c.dxf`,
    },
  };

  for (const file of fixtures.files) {
    const override = fileFolderOverrides[file.id];
    await prisma.webhardFile.upsert({
      where: { id: file.id },
      update: {
        name: override?.name ?? file.name,
        originalName: file.originalName,
        size: BigInt(12345),
        mimeType: 'application/dxf',
        path: override?.path ?? file.path,
        folderId: override?.folderId ?? file.folderId,
        companyId: company.id,
        uploadedBy: 'system',
        inquiryNumber: file.inquiryNumber,
        deletedAt: null,
        storageProvider: StorageProvider.R2,
      },
      create: {
        id: file.id,
        name: override?.name ?? file.name,
        originalName: file.originalName,
        size: BigInt(12345),
        mimeType: 'application/dxf',
        path: override?.path ?? file.path,
        folderId: override?.folderId ?? file.folderId,
        companyId: company.id,
        uploadedBy: 'system',
        inquiryNumber: file.inquiryNumber,
        deletedAt: null,
        storageProvider: StorageProvider.R2,
      },
    });
  }

  await prisma.drawingRevision.deleteMany({
    where: { contactId: { in: fixtures.contacts.map((contact) => contact.id) } },
  });

  const fileById = new Map<string, Prisma.InputJsonObject>(
    fixtures.files.map((file): [string, Prisma.InputJsonObject] => {
      const override = fileFolderOverrides[file.id];
      return [
        file.id,
        {
          url: `https://r2.example.com${override?.path ?? file.path}`,
          name: override?.name ?? file.name,
          size: 12345,
          mimeType: 'application/dxf',
        },
      ];
    })
  );

  for (const [index, revision] of fixtures.revisions.entries()) {
    const revisionFiles: Prisma.InputJsonArray = revision.webhardFileIds
      .map((fileId) => fileById.get(fileId))
      .filter((file): file is Prisma.InputJsonObject => file !== undefined);
    await prisma.drawingRevision.upsert({
      where: { id: revision.id },
      update: {
        contactId: revision.contactId,
        version: 1,
        processStage: revision.processStage,
        reason: 'initial',
        reasonDetail: null,
        files: revisionFiles,
        webhardFileIds: revision.webhardFileIds,
        actorType: 'system',
        actorName: '웹하드 자동생성',
        source: 'auto_initial',
        isPublic: true,
        note: null,
        createdAt: new Date(Date.UTC(2026, 3, 20, 9, index, 0)),
      },
      create: {
        id: revision.id,
        contactId: revision.contactId,
        version: 1,
        processStage: revision.processStage,
        reason: 'initial',
        reasonDetail: null,
        files: revisionFiles,
        webhardFileIds: revision.webhardFileIds,
        actorType: 'system',
        actorName: '웹하드 자동생성',
        source: 'auto_initial',
        isPublic: true,
        note: null,
        createdAt: new Date(Date.UTC(2026, 3, 20, 9, index, 0)),
      },
    });
  }

  console.log(
    `    Drawing consistency: ${fixtures.contacts.length} contacts, ${fixtures.folders.length} folders, ${fixtures.files.length} files`
  );
}

// ====== Main ======

async function main() {
  console.log('Seeding database...');
  const seedLegacyWebhardFixtures = process.env.SEED_LEGACY_WEBHARD_FIXTURES === 'true';

  const companies = await seedCompanies();
  const companyIds = {
    a: companies[0].id,
    b: companies[1].id,
    c: companies[2].id,
  };

  await seedContacts(companyIds);
  await seedContactStatusHistory();
  await seedCompanyTimelineRevisions();
  if (seedLegacyWebhardFixtures) {
    await seedWebhardFolders(companyIds);
    await seedWebhardFiles(companyIds);
    await seedUrgentContactDrawingRevisions(companyIds);
    await seedWorkerDownloadContactDrawingRevisions(companyIds);
    await seedDrawingConsistencyDbFixtures();
  } else {
    console.log(
      '  Skipping legacy webhard DB fixtures (set SEED_LEGACY_WEBHARD_FIXTURES=true to enable)'
    );
  }
  await seedErpWorkers();
  await seedApiKeys();
  await seedSystemSettings();
  await seedNumberCounters();

  console.log('Seeding completed!');
}

// 직접 실행(npx tsx prisma/seed.ts)일 때만 main() 수행. `seedDrawingConsistencyFixtures` 를
// import 하는 테스트에서 실 DB 커넥션이 생기지 않도록 가드.
const invokedDirectly = require.main === module;
if (invokedDirectly) {
  main()
    .catch((e) => {
      console.error('Seeding failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
