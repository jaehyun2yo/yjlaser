import { test, expect, type APIRequestContext, type BrowserContext } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import crypto from 'crypto';

/**
 * task 17 — contact-feedback-pack E2E (Phase 6)
 *
 * 7 시나리오 (피드백 1, 3, 4, 5, 6, 7, 8 매핑):
 *   S1: 분류 CTA 에서 ring/pulse 제거 + gap-2 확대 (피드백 1)
 *   S2: 분류 이벤트 actorName 노출 (피드백 3)
 *   S3: 도면 추가 시 타임라인 실시간 갱신 (피드백 4)
 *   S4: 통합 타임라인 ASC 정렬 (피드백 5)
 *   S5: Worker 카드 다운로드 = 최신 리비전 v2 (피드백 6)
 *   S6: Worker 세션에서 타임라인 파일 다운로드 200 (피드백 7)
 *   S7: 긴급 사이렌 overlay (피드백 8)
 *
 * 시드(`webhard-api/prisma/seed.ts` `seedUrgentContactDrawingRevisions`) 의 긴급 contact
 * (`TEST_URGENT_CONTACT_ID`) + v2 DrawingRevision 이 전제. 시드 누락 시 graceful skip.
 */

const adminAuthFile = path.join(__dirname, '..', '.auth', 'user.json');

// seed.ts 의 CONTACT_IDS.urgent 와 동일해야 함
const TEST_URGENT_CONTACT_ID = '00000000-0000-4000-8000-000000000017';
const TEST_URGENT_INQUIRY_NUMBER = 'E2E-URGENT-17';
const TEST_UNCLASSIFIED_INQUIRY_NUMBER = 'E2E-UNCLASSIFIED-18';
const TEST_WORKER_DOWNLOAD_CONTACT_ID = '00000000-0000-4000-8000-000000000020';

// seed.ts 의 WORKER_IDS.field + 등록된 PIN
const TEST_WORKER_ID = 'e0000000-0000-4000-a000-000000000002';
const TEST_WORKER_NAME = process.env.TEST_WORKER_NAME ?? '이테스트';
const TEST_WORKER_PIN = process.env.TEST_WORKER_PIN ?? '5678';

const NESTJS_API_URL = process.env.NEXT_PUBLIC_WEBHARD_API_URL ?? 'http://localhost:4000';

const UNCLASSIFIED_INQUIRY_BY_PROJECT: Record<string, string> = {
  chromium: TEST_UNCLASSIFIED_INQUIRY_NUMBER,
  firefox: 'E2E-UNCLASSIFIED-18-FIREFOX',
  webkit: 'E2E-UNCLASSIFIED-18-WEBKIT',
  'Mobile Chrome': 'E2E-UNCLASSIFIED-18-MOBILE-CHROME',
  'Mobile Safari': 'E2E-UNCLASSIFIED-18-MOBILE-SAFARI',
  Tablet: 'E2E-UNCLASSIFIED-18-TABLET',
};

interface AdminContactsResponse {
  contacts?: Array<{
    id?: string;
    inquiry_number?: string | null;
    is_urgent?: boolean | null;
    isUrgent?: boolean | null;
  }>;
}

interface AdminContactsListResponse {
  contacts?: Array<{
    id?: string;
    subject?: string | null;
    inquiry_number?: string | null;
    inquiry_type?: string | null;
    source?: string | null;
  }>;
}

/** worker PIN 으로 erp-session 쿠키를 설정한 새 BrowserContext 를 반환. 실패 시 null. */
async function loginWorker(
  context: BrowserContext,
  baseURL: string
): Promise<{ workerId: string; workerName: string } | null> {
  const sessionResp = await context.request.post(`${baseURL}/api/erp/session`, {
    data: { name: TEST_WORKER_NAME, pin: TEST_WORKER_PIN },
    failOnStatusCode: false,
  });
  if (!sessionResp.ok()) return null;

  const sessionBody = (await sessionResp.json()) as {
    worker?: { id: string; name: string };
    success?: boolean;
  };
  const workerId = sessionBody.worker?.id;
  const workerName = sessionBody.worker?.name;
  if (!workerId || !workerName) return null;

  return { workerId, workerName };
}

/** 타임라인 entry 가 시드되어 있는지 가벼운 사전 점검 (없으면 graceful skip 으로 활용). */
async function fetchTimeline(request: APIRequestContext, contactId: string) {
  const resp = await request.get(`/api/contacts/${contactId}/timeline`, {
    failOnStatusCode: false,
  });
  if (!resp.ok()) return null;
  const body = (await resp.json()) as { timeline?: Array<Record<string, unknown>> };
  return Array.isArray(body.timeline) ? body.timeline : null;
}

function getUnclassifiedInquiryNumber(projectName: string): string {
  return UNCLASSIFIED_INQUIRY_BY_PROJECT[projectName] ?? TEST_UNCLASSIFIED_INQUIRY_NUMBER;
}

async function expectUnclassifiedSeed(page: { request: APIRequestContext }, inquiryNumber: string) {
  const resp = await page.request.get(
    `/api/admin/contacts?status=all&search=${encodeURIComponent(inquiryNumber)}`,
    { failOnStatusCode: false }
  );
  expect(resp.status(), '미분류 seed 조회 API가 성공해야 합니다.').toBe(200);
  const body = (await resp.json()) as AdminContactsListResponse;
  const contact = (body.contacts ?? []).find((item) => item.inquiry_number === inquiryNumber);
  expect(contact, `${inquiryNumber} contact가 관리자 목록 API에 있어야 합니다.`).toBeTruthy();
  expect(contact!.source).toBe('webhard');
  expect(contact!.inquiry_type ?? null).toBeNull();
}

function isUnclassifiedListResponse(inquiryNumber: string) {
  return (resp: { url: () => string; request: () => { method: () => string } }) => {
    if (!resp.url().includes('/api/admin/contacts') || resp.request().method() !== 'GET') {
      return false;
    }
    const url = new URL(resp.url());
    return url.searchParams.get('search') === inquiryNumber;
  };
}

function createWorkerErpSessionCookie(workerId: string, workerName: string): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const sessionData = JSON.stringify({
    workerId,
    workerName,
    kind: 'worker',
    iat: nowSeconds,
    exp: nowSeconds + 60 * 60,
  });
  const tokenAndData = `e2e-${crypto.randomUUID()}:${sessionData}`;
  const sessionSecret = process.env.SESSION_SECRET ?? 'change-this-in-production-dev-only';
  const signature = crypto.createHmac('sha256', sessionSecret).update(tokenAndData).digest('hex');
  return `${tokenAndData}.${signature}`;
}

async function expectUnclassifiedListBody(
  resp: { json: () => Promise<unknown> },
  inquiryNumber: string
) {
  const body = (await resp.json()) as AdminContactsListResponse & { totalCount?: number };
  const contact = (body.contacts ?? []).find((item) => item.inquiry_number === inquiryNumber);
  expect(
    contact,
    `${inquiryNumber} contact가 work-management 검색 응답에 있어야 합니다.`
  ).toBeTruthy();
  expect(body.totalCount ?? 0).toBeGreaterThan(0);
}

// S3 가 urgent contact 에 revision v3 를 삽입하므로 urgent 기반 검증끼리 순서를 고정한다.
// S5 는 전용 download seed contact 를 사용해 파일 간 병렬 실행 경합을 피한다.
test.describe.configure({ mode: 'serial', timeout: 180000 });

test.describe('contact-feedback-pack', () => {
  test.use({ storageState: adminAuthFile });

  // ────────────────────────────────────────────────────────────
  // S1 (피드백 1): classify CTA 에 ring/pulse 없음 + gap-2 적용
  // ────────────────────────────────────────────────────────────
  test('S1: 미분류 카드 분류 CTA 에 ring/pulse 가 없고 gap-2 가 적용된다', async ({ page }) => {
    const inquiryNumber = getUnclassifiedInquiryNumber(test.info().project.name);
    await expectUnclassifiedSeed(page, inquiryNumber);
    const listResponse = page.waitForResponse(isUnclassifiedListResponse(inquiryNumber), {
      timeout: 90000,
    });
    await page.goto(`/admin/work-management?search=${encodeURIComponent(inquiryNumber)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    const resp = await listResponse;
    expect(resp.status(), 'S1: work-management contact list API가 성공해야 합니다.').toBe(200);
    await expectUnclassifiedListBody(resp, inquiryNumber);
    await expect(page.getByText(inquiryNumber).first()).toBeVisible({
      timeout: 90000,
    });

    const classifyGroup = page.locator('[role="group"][aria-label="문의 유형 분류"]').first();
    const visible = await classifyGroup.isVisible({ timeout: 15000 }).catch(() => false);
    expect(visible, 'S1 seed preflight: 미분류 contact 분류 CTA가 보여야 합니다.').toBe(true);

    const groupClass = (await classifyGroup.getAttribute('class')) ?? '';
    expect(groupClass).toContain('gap-2');
    expect(groupClass).not.toContain('animate-pulse');
    expect(groupClass).not.toContain('ring-orange-300');

    // 미분류 라벨 (label-only) 도 정적이어야 한다
    const unclassifiedBadge = page.locator('[aria-label="미분류 문의"]').first();
    if (await unclassifiedBadge.isVisible({ timeout: 1000 }).catch(() => false)) {
      const badgeClass = (await unclassifiedBadge.getAttribute('class')) ?? '';
      expect(badgeClass).not.toContain('animate-pulse');
      expect(badgeClass).not.toContain('ring-orange-300');
    }
  });

  // ────────────────────────────────────────────────────────────
  // S2 (피드백 3): 분류 이벤트 timeline 에 actorName 노출
  // ────────────────────────────────────────────────────────────
  test('S2: 미분류 → 칼선의뢰 분류 후 timeline 에 actorName(관리자) 이 노출된다', async ({
    page,
    request,
  }) => {
    const inquiryNumber = getUnclassifiedInquiryNumber(test.info().project.name);
    await expectUnclassifiedSeed(page, inquiryNumber);
    const listResponse = page.waitForResponse(isUnclassifiedListResponse(inquiryNumber), {
      timeout: 90000,
    });
    await page.goto(`/admin/work-management?search=${encodeURIComponent(inquiryNumber)}`);
    const listResp = await listResponse;
    expect(listResp.status(), 'S2: work-management contact list API가 성공해야 합니다.').toBe(200);
    await expectUnclassifiedListBody(listResp, inquiryNumber);
    await expect(page.getByText(inquiryNumber).first()).toBeVisible({
      timeout: 90000,
    });

    // 긴 리스트 하단(y>3000px)의 미분류 카드가 첫 매칭이라 scrollIntoView 후 visibility 체크.
    const classifyButton = page.locator('button[aria-label="칼선의뢰로 분류"]').first();
    await classifyButton.waitFor({ state: 'attached', timeout: 15000 }).catch(() => undefined);
    await classifyButton.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => undefined);
    const visible = await classifyButton.isVisible().catch(() => false);
    expect(visible, 'S2 seed preflight: 미분류 contact 분류 버튼이 보여야 합니다.').toBe(true);

    // 분류 PATCH 응답 대기 — PATCH URL 에 contact id 가 포함된다.
    const patchResp = page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/contacts/') &&
        resp.url().includes('/inquiry-type') &&
        resp.request().method() === 'PATCH'
    );
    await classifyButton.click();
    const resp = await patchResp;
    expect(resp.status()).toBeLessThan(400);

    // contact id 추출: PATCH URL > response body > dataset 우선순위.
    const urlMatch = resp.url().match(/\/api\/contacts\/([^/?#]+)\/inquiry-type/);
    let targetId: string | null = urlMatch?.[1] ?? null;
    if (!targetId) {
      const body = (await resp.json().catch(() => null)) as { id?: string } | null;
      targetId = body?.id ?? null;
    }
    expect(targetId, 'S2: 분류 PATCH URL 또는 응답에서 contact id를 식별해야 합니다.').toBeTruthy();

    // 약간의 지연 후 timeline 조회 (서버 INSERT 완료 보장)
    await page.waitForTimeout(500);
    const timeline = await fetchTimeline(request, targetId!);
    expect(
      timeline?.length ?? 0,
      'S2: 분류 후 timeline entry가 생성되어야 합니다.'
    ).toBeGreaterThan(0);

    const typeChange = timeline!.find((entry) => {
      const payload = entry['payload'] as { changeType?: string } | undefined;
      return payload?.changeType === 'type';
    });
    expect(typeChange).toBeDefined();
    const actorName = (typeChange as { actorName?: string | null }).actorName;
    expect(actorName).not.toBeNull();
    expect(typeof actorName).toBe('string');
    expect((actorName as string).length).toBeGreaterThan(0);
  });

  // ────────────────────────────────────────────────────────────
  // S4 (피드백 5): timeline ASC 정렬 (오래된 → 최신)
  // ────────────────────────────────────────────────────────────
  test('S4: 통합 타임라인이 createdAt ASC 로 정렬된다', async ({ request }) => {
    const timeline = await fetchTimeline(request, TEST_URGENT_CONTACT_ID);
    expect(
      timeline?.length ?? 0,
      'S4 seed preflight: urgent contact timeline v1/v2가 필요합니다.'
    ).toBeGreaterThanOrEqual(2);

    const timestamps = timeline!.map((entry) => {
      const ts = (entry as { createdAt?: string }).createdAt ?? '';
      return new Date(ts).getTime();
    });

    // 단조 증가 (혹은 동일) — DESC 였다면 첫 timestamp >= 마지막 timestamp 이어야 함
    for (let i = 1; i < timestamps.length; i += 1) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
    }

    // 첫 entry 가 가장 오래된 시간을 가짐
    expect(timestamps[0]).toBeLessThanOrEqual(timestamps[timestamps.length - 1]);
  });

  // ────────────────────────────────────────────────────────────
  // S5 (피드백 6): Worker 카드 다운로드 = 최신 리비전 (v2)
  // ────────────────────────────────────────────────────────────
  test('S5: worker 카드 다운로드 → 최신 v2 리비전 파일이 응답된다', async ({ browser }) => {
    const context = await browser.newContext();
    const baseURL = (test.info().project.use.baseURL as string) ?? 'http://localhost:3000';

    const session = await loginWorker(context, baseURL);
    expect(
      session,
      'S5 preflight: worker PIN 로그인과 erp-session 쿠키 발급이 성공해야 합니다.'
    ).toBeTruthy();

    const page = await context.newPage();
    const resp = await page.request.get(
      `${baseURL}/api/contacts/${TEST_WORKER_DOWNLOAD_CONTACT_ID}/latest-drawing/download`,
      { failOnStatusCode: false }
    );

    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as { fileName?: string; url?: string };
    expect(body.fileName).toBeTruthy();
    // v2 키워드 포함 / v1 키워드 부재
    expect(body.fileName!).toContain('v2');
    expect(body.fileName!).not.toContain('v1');

    await context.close();
  });

  // ────────────────────────────────────────────────────────────
  // S6 (피드백 7): Worker 세션에서 타임라인 파일 다운로드 = 200
  // ────────────────────────────────────────────────────────────
  test('S6: worker 세션으로 /api/drawing-revisions/:id/download 가 200 을 반환한다', async ({
    browser,
    request,
  }) => {
    const timeline = await fetchTimeline(request, TEST_URGENT_CONTACT_ID);
    expect(timeline, 'S6 seed preflight: urgent contact timeline이 필요합니다.').toBeTruthy();

    const drawingEntry = timeline!.find(
      (entry) => (entry as { kind?: string }).kind === 'drawing_revision'
    ) as { payload?: { revisionId?: string } } | undefined;
    expect(
      drawingEntry?.payload?.revisionId,
      'S6 seed preflight: drawing_revision entry와 revisionId가 필요합니다.'
    ).toBeTruthy();

    const revisionId = drawingEntry!.payload!.revisionId!;

    const context = await browser.newContext();
    const baseURL = (test.info().project.use.baseURL as string) ?? 'http://localhost:3000';
    const session = await loginWorker(context, baseURL);
    expect(
      session,
      'S6 preflight: worker PIN 로그인과 erp-session 쿠키 발급이 성공해야 합니다.'
    ).toBeTruthy();

    const page = await context.newPage();
    const resp = await page.request.get(
      `${baseURL}/api/drawing-revisions/${revisionId}/download?fileIndex=0`,
      { failOnStatusCode: false }
    );
    expect(resp.status()).toBe(200);

    await context.close();
  });

  // ────────────────────────────────────────────────────────────
  // S7 (피드백 8): 긴급 overlay — Siren + "긴급" 배지, bg-red-500 부재
  // ────────────────────────────────────────────────────────────
  test('S7: 긴급 contact 카드에 사이렌 + "긴급" 배지가 노출되고 카드 배경은 붉지 않다', async ({
    page,
  }) => {
    const params = new URLSearchParams({
      status: 'all',
      page: '1',
      search: TEST_URGENT_INQUIRY_NUMBER,
    });
    const listResp = await page.request.get(`/api/admin/contacts?${params.toString()}`, {
      failOnStatusCode: false,
    });
    expect(listResp.status(), 'S7 seed preflight should reach admin contacts API').toBeLessThan(
      400
    );

    const listBody = (await listResp.json()) as AdminContactsResponse;
    const seededUrgentContact = (listBody.contacts ?? []).find(
      (contact) => contact.inquiry_number === TEST_URGENT_INQUIRY_NUMBER
    );
    expect(
      seededUrgentContact,
      'S7 seed preflight: urgent contact가 admin contacts API에 있어야 합니다.'
    ).toBeTruthy();
    expect(
      seededUrgentContact!.is_urgent !== true && seededUrgentContact!.isUrgent !== true,
      'S7 seed preflight: urgent contact가 긴급 상태여야 합니다.'
    ).toBe(false);

    await page.goto(
      `/admin/work-management?search=${encodeURIComponent(TEST_URGENT_INQUIRY_NUMBER)}`,
      { waitUntil: 'domcontentloaded' }
    );
    await expect(page.locator('input[placeholder*="문의번호"]').first()).toHaveValue(
      TEST_URGENT_INQUIRY_NUMBER,
      { timeout: 10000 }
    );

    const urgentBadge = page.locator('[data-testid="urgent-badge"]').first();
    await expect(urgentBadge).toBeVisible({ timeout: 30000 });

    // 배지 자체에 "긴급" 텍스트 + Siren SVG
    await expect(urgentBadge).toContainText('긴급');
    const svgCount = await urgentBadge.locator('svg').count();
    expect(svgCount).toBeGreaterThanOrEqual(1);

    const badgeClass = (await urgentBadge.getAttribute('class')) ?? '';
    expect(badgeClass).toContain('bg-red-600');
    expect(badgeClass).toContain('text-white');

    // 카드 컨테이너 (가장 가까운 article/li/div) 의 background 가 bg-red-500 이 아님
    const cardRootClass = await urgentBadge
      .evaluate((el) => {
        let cur: HTMLElement | null = el.parentElement as HTMLElement | null;
        while (
          cur &&
          cur.tagName.toLowerCase() !== 'article' &&
          cur.tagName.toLowerCase() !== 'li'
        ) {
          if (cur.className && /(?:^|\s)(?:bg-white|bg-red-500|bg-gray-)/.test(cur.className)) {
            break;
          }
          cur = cur.parentElement;
        }
        return cur?.className ?? '';
      })
      .catch(() => '');

    expect(cardRootClass).not.toContain('bg-red-500');
  });

  // ────────────────────────────────────────────────────────────
  // S3 (피드백 4): admin 탭의 timeline 이 worker 도면 업로드로 실시간 갱신
  // serial 모드 마지막에 배치 — 신규 revision 삽입이 S5(최신=v2) 불변식을 깨기 때문.
  // ────────────────────────────────────────────────────────────
  test('S3: worker 가 도면을 추가하면 admin 펼친 타임라인이 reload 없이 갱신된다', async ({
    page,
    playwright,
    request,
  }) => {
    // 본 시나리오는 두 세션이 동시에 같은 contact 를 보는 복합 플로우 + R2 업로드 모킹이
    // 필요해 환경에 강한 의존이 있다. CI/로컬 신뢰성을 위해 socket gateway 로
    // contact:drawing_revision_added 이벤트가 emit 되는 경로(POST drawing-revisions)를
    // 직접 호출해서 timeline 캐시 invalidation 이 동작하는지를 검증한다.
    const baseTimeline = await fetchTimeline(request, TEST_URGENT_CONTACT_ID);
    expect(baseTimeline, 'S3 seed preflight: urgent contact timeline이 필요합니다.').toBeTruthy();

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

    // 타임라인에 추가될 새 리비전 생성 (NestJS 직접 — drawing-revisions controller 가
    // contactsGateway.emitDrawingRevisionAdded 를 호출한다)
    const newFileName = `[E2E S3] 도면-rt-${Date.now()}.dxf`;
    const csrfToken = crypto.randomBytes(32).toString('hex');

    const workerRequest = await playwright.request.newContext({
      baseURL: NESTJS_API_URL,
      extraHTTPHeaders: {
        Cookie: `erp-session=${encodeURIComponent(
          createWorkerErpSessionCookie(TEST_WORKER_ID, TEST_WORKER_NAME)
        )}; csrf-token=${csrfToken}`,
        'X-CSRF-Token': csrfToken,
      },
    });
    const insertResp = await workerRequest.post(
      `/api/v1/contacts/${TEST_URGENT_CONTACT_ID}/drawing-revisions`,
      {
        data: {
          processStage: 'drawing',
          reason: 'domuson_fit',
          files: [
            {
              url: `https://r2.example.com/dev/seed/e2e-realtime-${Date.now()}.dxf`,
              name: newFileName,
              size: 12345,
              mimeType: 'application/dxf',
            },
          ],
          actorType: 'worker',
          actorName: '이테스트',
          source: 'manual',
          isPublic: true,
        },
        failOnStatusCode: false,
      }
    );
    await workerRequest.dispose();
    expect(
      insertResp.ok(),
      `S3: worker erp-session drawing-revisions POST 가 성공해야 합니다 (status=${insertResp.status()}).`
    ).toBe(true);

    // 5초 polling — timeline entry +1
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
 * 보조 검증: admin 인증 파일 존재 여부. 없으면 모든 테스트가 자동 skip 가까운 효과.
 */
test.beforeAll(() => {
  if (!fs.existsSync(adminAuthFile)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[contact-feedback-pack] admin auth file not found: ${adminAuthFile} — global-setup 우선 실행 필요.`
    );
  }
});
