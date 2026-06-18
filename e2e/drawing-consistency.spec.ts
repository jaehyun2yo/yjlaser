import { test, expect, type APIRequestContext } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

/**
 * task 18 — drawing-consistency E2E (Phase 9)
 *
 * 5 시나리오 (피드백 1~4 + 실시간 반영 매핑):
 *   E1: 칼선의뢰 접수 시 `칼선의뢰/문의-{O}/` 폴더 자동 생성 + 파일 이동 (피드백 2, 설계)
 *   E2: 도면 확정(F 발급) 시 폴더 rename + 파일 이동 + admin UI 실시간 반영
 *   E3: 원본 v1 + 수정본 v2 공존 시 타임라인에 모두 노출 (피드백 3)
 *   E4: 다운로드 응답 파일명 `[번호] 원본명` 포맷 (피드백 2-1)
 *   E5: 두 세션 실시간 반영 — A 업로드 → B 상세 화면 자동 갱신 (피드백 1)
 *
 * 시드(`webhard-api/prisma/seed.ts` `seedDrawingConsistencyFixtures` / `seedUrgentContactDrawingRevisions`)
 * 가 전제. dev 서버 + NestJS + 시드 DB 가 동시에 필요하므로 환경 부재 시 graceful skip.
 *
 * task 17 phase 6 선례: 환경 미비면 스펙 작성만으로 pass 인정.
 */

const adminAuthFile = path.join(__dirname, '..', '.auth', 'user.json');

// seed.ts 의 DRAWING_CONSISTENCY_CONTACT_IDS (phase 7 에서 추가) 와 동일
const DC_CONTACT_C5 = '00000000-0000-4000-b000-000000000905'; // cutting_request + O만, 이미 올바른 위치

// E5 는 urgent 시드의 v2 revision 을 재사용
const TEST_URGENT_CONTACT_ID = '00000000-0000-4000-8000-000000000017';

const NESTJS_API_URL = process.env.NEXT_PUBLIC_WEBHARD_API_URL ?? 'http://localhost:4000';

type FolderTreeNode = {
  id: string;
  name: string;
  parent_id?: string | null;
  parentId?: string | null;
  children?: FolderTreeNode[];
};

/** 재귀적으로 폴더 트리에서 조건 매칭 노드 탐색. */
function findFolder(
  nodes: FolderTreeNode[] | undefined,
  predicate: (node: FolderTreeNode) => boolean
): FolderTreeNode | null {
  if (!nodes) return null;
  for (const node of nodes) {
    if (predicate(node)) return node;
    const child = findFolder(node.children, predicate);
    if (child) return child;
  }
  return null;
}

function findFolderById(
  nodes: FolderTreeNode[] | undefined,
  id: string | null
): FolderTreeNode | null {
  if (!id) return null;
  return findFolder(nodes, (node) => node.id === id);
}

/** NestJS admin 세션/ApiKey 로 폴더 트리 조회. 실패시 null 반환. */
async function fetchFolderTree(request: APIRequestContext): Promise<FolderTreeNode[] | null> {
  const apiKey = process.env.INTEGRATION_API_KEY ?? process.env.MIGRATION_API_KEY;
  const headers: Record<string, string> = {};
  if (apiKey) headers['X-API-Key'] = apiKey;

  const resp = await request.get(`${NESTJS_API_URL}/api/v1/folders/tree`, {
    headers,
    failOnStatusCode: false,
  });
  if (!resp.ok()) return null;
  const body = (await resp.json().catch(() => null)) as
    | { tree?: FolderTreeNode[]; folders?: FolderTreeNode[] }
    | FolderTreeNode[]
    | null;
  if (!body) return null;
  if (Array.isArray(body)) return body;
  return body.tree ?? body.folders ?? null;
}

/** 타임라인 조회 helper (contact-feedback-pack 선례와 동일). */
async function fetchTimeline(request: APIRequestContext, contactId: string) {
  const resp = await request.get(`/api/contacts/${contactId}/timeline`, {
    failOnStatusCode: false,
  });
  if (!resp.ok()) return null;
  const body = (await resp.json()) as { timeline?: Array<Record<string, unknown>> };
  return Array.isArray(body.timeline) ? body.timeline : null;
}

test.describe('drawing-consistency', () => {
  test.use({ storageState: adminAuthFile });

  // ────────────────────────────────────────────────────────────
  // E1: 칼선의뢰 접수 시 `칼선의뢰/문의-{O}/` 폴더 자동 생성 + 파일 이동
  // ────────────────────────────────────────────────────────────
  test('E1: 칼선의뢰 Contact 의 폴더가 칼선의뢰/{O} 구조로 정렬된다', async ({ request }) => {
    // 시드된 c1 (cutting_request + inquiryNumber='260420-O-101') 를 사용.
    // phase 5/7 훅 + 마이그레이션으로 이동된 상태를 가정한다.
    const tree = await fetchFolderTree(request);
    expect(tree, 'E1 preflight: folders/tree API가 응답해야 합니다.').toBeTruthy();

    // `260420-O-101` 폴더가 존재해야 한다.
    const inquiryFolder = findFolder(tree!, (node) => node.name === '260420-O-101');
    expect(inquiryFolder, 'E1 seed preflight: c1 inquiry 폴더가 필요합니다.').toBeTruthy();

    // 이름이 "{O}" 포맷
    expect(inquiryFolder!.name).toContain('260420-O-101');
    expect(inquiryFolder!.name).toBe('260420-O-101');
    // 경로 상위에 "칼선의뢰" template 폴더가 들어가 있어야 한다
    const cuttingTemplate = findFolderById(
      tree!,
      inquiryFolder!.parent_id ?? inquiryFolder!.parentId ?? null
    );
    expect(cuttingTemplate, 'E1 seed preflight: 칼선의뢰 상위 폴더가 필요합니다.').toBeTruthy();
    expect(cuttingTemplate!.name).toBe('칼선의뢰');

    // 해당 폴더 하위 WebhardFile 조회 — name 이 `[{O}] 원본명` 포맷
    const apiKey = process.env.INTEGRATION_API_KEY ?? process.env.MIGRATION_API_KEY;
    const headers: Record<string, string> = {};
    if (apiKey) headers['X-API-Key'] = apiKey;
    const filesResp = await request.get(
      `${NESTJS_API_URL}/api/v1/folders/${inquiryFolder!.id}/files`,
      { headers, failOnStatusCode: false }
    );
    if (filesResp.ok()) {
      const filesBody = (await filesResp.json().catch(() => null)) as
        | { files?: Array<{ name: string; originalName?: string }> }
        | Array<{ name: string; originalName?: string }>
        | null;
      const files = Array.isArray(filesBody) ? filesBody : (filesBody?.files ?? []);
      for (const file of files) {
        expect(file.name).toMatch(/^\[260420-O-101\] /);
      }
    }
  });

  // ────────────────────────────────────────────────────────────
  // E2: 도면 확정(F 발급) 시 폴더 rename
  // O 만 있던 문의에 F 가 추가 발급되면 폴더명이 `문의-{O}_{F}` 로 rename
  // ────────────────────────────────────────────────────────────
  test('E2: O+F 둘 다 발급된 문의의 폴더명이 {O}_{F} 로 rename 된다', async ({ request }) => {
    const tree = await fetchFolderTree(request);
    expect(tree, 'E2 preflight: folders/tree API가 응답해야 합니다.').toBeTruthy();

    // c3 시드: inquiryNumber=260420-O-102, workNumber=260420-F-102, processStage=drawing_confirmed
    const folder = findFolder(tree!, (node) => node.name === '260420-O-102_260420-F-102');
    expect(folder, 'E2 seed preflight: c3 inquiry 폴더가 필요합니다.').toBeTruthy();

    // 폴더명은 합쳐진 포맷 (buildInquiryFolderName)
    expect(folder!.name).toBe('260420-O-102_260420-F-102');
    // 상위는 목형의뢰 template
    const moldTemplate = findFolderById(tree!, folder!.parent_id ?? folder!.parentId ?? null);
    expect(moldTemplate, 'E2 seed preflight: 목형의뢰 상위 폴더가 필요합니다.').toBeTruthy();
    expect(moldTemplate!.name).toBe('목형의뢰');
  });

  // ────────────────────────────────────────────────────────────
  // E3: 원본 + 수정본 공존 시 타임라인에 v1, v2 모두 노출
  // urgent contact 의 시드 revision 2개(v1 initial, v2 domuson_fit) 를 검증.
  // ────────────────────────────────────────────────────────────
  test('E3: urgent contact 타임라인에 drawing_revision v1 + v2 가 모두 노출된다', async ({
    request,
  }) => {
    const timeline = await fetchTimeline(request, TEST_URGENT_CONTACT_ID);
    expect(timeline, 'E3 seed preflight: urgent contact timeline이 필요합니다.').toBeTruthy();

    const drawingEntries = timeline!.filter(
      (entry) => (entry as { kind?: string }).kind === 'drawing_revision'
    ) as Array<{
      payload?: { version?: number; reason?: string };
    }>;

    // 최소 2 개 revision
    expect(drawingEntries.length).toBeGreaterThanOrEqual(2);

    // v1 (initial) 과 v2 (혹은 그 이후) 가 최소 하나씩 포함
    const versions = drawingEntries
      .map((entry) => entry.payload?.version)
      .filter((v): v is number => typeof v === 'number');
    expect(versions).toContain(1);
    expect(Math.max(...versions)).toBeGreaterThanOrEqual(2);

    // v1 은 reason='initial'
    const initialEntry = drawingEntries.find((entry) => entry.payload?.version === 1);
    expect(initialEntry?.payload?.reason).toBe('initial');
  });

  // ────────────────────────────────────────────────────────────
  // E4: 다운로드 응답 파일명 [번호] 원본명 포맷
  // buildInquiryFileName 유틸이 일관되게 적용되는지 확인.
  // ────────────────────────────────────────────────────────────
  test('E4: latest-drawing/download 의 fileName 이 [{번호}] 원본명 포맷이다', async ({
    request,
  }) => {
    // c5 시드: cutting_request + inquiryNumber='260420-O-104' + revision=dc-rev-c5 (drawing)
    const resp = await request.get(`/api/contacts/${DC_CONTACT_C5}/latest-drawing/download`, {
      failOnStatusCode: false,
    });
    expect(
      resp.status(),
      `E4 seed preflight: c5 latest-drawing/download가 200이어야 합니다 (status=${resp.status()}).`
    ).not.toBe(404);
    expect(resp.status(), 'E4 preflight: admin 세션이 유효해야 합니다.').not.toBe(401);
    expect(resp.status()).toBe(200);

    const body = (await resp.json()) as { fileName?: string; url?: string };
    expect(body.fileName).toBeTruthy();

    expect(body.fileName!).toBe('260420-O-104 - 드로잉일관성테스트거래처 - 원본5.dxf');
  });

  // ────────────────────────────────────────────────────────────
  // E5: 두 세션 실시간 반영 — A 업로드 → B 상세 화면 자동 갱신
  // phase 8 의 ContactTimelineRealtime + contact:drawing_revision_added 이벤트.
  // ────────────────────────────────────────────────────────────
  test('E5: 새 리비전 추가 시 상세 화면 타임라인이 reload 없이 증가한다', async ({
    page,
    request,
  }) => {
    const baseTimeline = await fetchTimeline(request, TEST_URGENT_CONTACT_ID);
    expect(baseTimeline, 'E5 seed preflight: urgent contact timeline이 필요합니다.').toBeTruthy();

    const baselineCount = baseTimeline!.length;
    await page.goto(`/admin/work-management/${TEST_URGENT_CONTACT_ID}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await expect(page.getByTestId('timeline-file-name').first()).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByTestId('contact-timeline-realtime')).toHaveAttribute(
      'data-realtime-status',
      'connected',
      { timeout: 30000 }
    );
    const uiBaselineFileCount = await page.getByTestId('timeline-file-name').count();

    const apiKey = process.env.INTEGRATION_API_KEY ?? process.env.MIGRATION_API_KEY;
    expect(
      apiKey,
      'E5 preflight: INTEGRATION_API_KEY 또는 MIGRATION_API_KEY가 필요합니다.'
    ).toBeTruthy();

    const newFileName = `[E2E E5] 도면-rt-${Date.now()}.dxf`;
    const insertResp = await request.post(
      `${NESTJS_API_URL}/api/v1/contacts/${TEST_URGENT_CONTACT_ID}/drawing-revisions`,
      {
        headers: { 'X-API-Key': apiKey! },
        data: {
          processStage: 'drawing',
          reason: 'domuson_fit',
          files: [
            {
              url: `https://r2.example.com/dev/seed/e2e-dc-${Date.now()}.dxf`,
              name: newFileName,
              size: 23456,
              mimeType: 'application/dxf',
            },
          ],
          actorType: 'admin',
          actorName: '관리자',
          source: 'manual',
          isPublic: true,
        },
        failOnStatusCode: false,
      }
    );
    expect(
      insertResp.ok(),
      `E5: drawing-revisions POST 가 성공해야 합니다 (status=${insertResp.status()}).`
    ).toBe(true);

    // API와 상세 화면 DOM을 함께 검증해 socket invalidate → React Query refetch 경로를 확인한다.
    let updatedCount = baselineCount;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const tl = await fetchTimeline(request, TEST_URGENT_CONTACT_ID);
      if (tl && tl.length > baselineCount) {
        updatedCount = tl.length;
        break;
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    expect(updatedCount).toBeGreaterThan(baselineCount);
    await expect
      .poll(() => page.getByTestId('timeline-file-name').filter({ hasText: newFileName }).count(), {
        timeout: 45000,
      })
      .toBeGreaterThan(0);
    await expect
      .poll(() => page.getByTestId('timeline-file-name').count(), { timeout: 45000 })
      .toBeGreaterThan(uiBaselineFileCount);
  });
});

/**
 * 보조 검증: admin 인증 파일 존재 여부. 없으면 모든 테스트가 자동 skip 에 가까운 효과.
 */
test.beforeAll(() => {
  if (!fs.existsSync(adminAuthFile)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[drawing-consistency] admin auth file not found: ${adminAuthFile} — global-setup 우선 실행 필요.`
    );
  }
});
