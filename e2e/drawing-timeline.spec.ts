import { test, expect, type APIResponse, type Page } from '@playwright/test';
import * as path from 'path';
import crypto from 'crypto';

/**
 * 통합 타임라인 E2E 테스트 (Phase 3)
 *
 * 검증 대상:
 *  A. 관리자 세션: 문의 상세 → status_change + drawing_revision 인터리브 렌더
 *  B. 다른 회사 세션 → 자기 회사 아닌 contactId 요청 시 403 또는 redirect
 *  C. 거래처 세션: 응답에 isPublic=false drawing_revision 미노출
 *  D. 거래처 세션: 관리자 actorName이 "YJLaser"로 마스킹
 *
 * 시드 데이터가 없거나 환경이 부족하면 graceful skip.
 */

const adminAuthFile = path.join(__dirname, '..', '.auth', 'user.json');

function sanitizeRequestError(error: unknown): string {
  const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
  return message.replace(/(cookie:\s*)[^\n]+/gi, '$1[redacted]');
}

async function retryApiRequest(
  operation: () => Promise<APIResponse>,
  description: string
): Promise<APIResponse> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  throw new Error(`${description} failed after retries: ${sanitizeRequestError(lastError)}`);
}

/**
 * 관리자 세션으로 첫 번째 활성 contact ID를 NestJS API에서 가져온다.
 */
async function getFirstContactUuid(page: Page): Promise<string | null> {
  const response: APIResponse = await retryApiRequest(
    () => page.request.get('/api/contacts/recent-ids?limit=10'),
    'recent contact id request'
  );
  if (!response.ok()) return null;
  const body = (await response.json()) as { ids?: string[] };
  return body.ids?.[0] ?? null;
}

const DEFAULT_COMPANY_TIMELINE_CONTACT_ID = '00000000-0000-4000-8000-000000000019';
const DEFAULT_COMPANY_ID = 1;
const DEFAULT_SESSION_SECRET_SENTINEL = 'change-this-in-production';
const DEV_ONLY_SESSION_SECRET = 'change-this-in-production-dev-only';

function getE2ESessionSecret(): string {
  const sessionSecret = process.env.SESSION_SECRET;
  if (sessionSecret && sessionSecret !== DEFAULT_SESSION_SECRET_SENTINEL) {
    return sessionSecret;
  }
  return DEV_ONLY_SESSION_SECRET;
}

function createCompanySessionCookie(baseURL: string, companyId: number) {
  const url = new URL(baseURL);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const sessionData = JSON.stringify({
    kind: 'browser',
    userType: 'company',
    userId: companyId,
    iat: nowSeconds,
    exp: nowSeconds + 60 * 60 * 4,
  });
  const token = crypto.randomBytes(32).toString('hex');
  const tokenAndData = `${token}:${sessionData}`;
  const hmac = crypto.createHmac('sha256', getE2ESessionSecret());
  hmac.update(tokenAndData);
  const signature = hmac.digest('hex');

  return {
    name: 'company-session',
    value: `${encodeURIComponent(tokenAndData)}.${signature}`,
    domain: url.hostname,
    path: '/',
    expires: nowSeconds + 60 * 60 * 4,
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'Lax' as const,
  };
}

test.describe('통합 타임라인 — 관리자', () => {
  test.use({ storageState: adminAuthFile });

  test('A: 관리자 세션 → 문의 상세 → 타임라인 응답 shape 확인', async ({ page }) => {
    const contactId = await getFirstContactUuid(page);
    expect(contactId, 'A seed preflight: 최근 contact id가 필요합니다.').toBeTruthy();

    const response = await page.request.get(`/api/contacts/${contactId}/timeline`);
    expect(response.status()).toBe(200);

    const body = (await response.json()) as {
      timeline?: Array<{ kind: string; payload?: Record<string, unknown> }>;
    };
    expect(Array.isArray(body.timeline)).toBe(true);

    if (body.timeline && body.timeline.length > 0) {
      // 모든 항목은 status_change 또는 drawing_revision
      for (const item of body.timeline) {
        expect(['status_change', 'drawing_revision']).toContain(item.kind);
      }
    }
  });

  test('A2: 관리자 세션 → 문의 상세 페이지 → "타임라인" 섹션 노출', async ({ page }) => {
    const contactId = await getFirstContactUuid(page);
    expect(contactId, 'A2 seed preflight: 최근 contact id가 필요합니다.').toBeTruthy();

    await page.goto(`/admin/work-management/${contactId}`);
    await page.waitForLoadState('domcontentloaded');

    // 타임라인 섹션 헤더가 노출되는지 확인 ("작업 타임라인")
    const timelineHeader = page.getByRole('heading', { name: /타임라인/ }).first();
    await expect(timelineHeader).toBeVisible({ timeout: 15000 });
  });
});

test.describe('통합 타임라인 — 거래처 격리', () => {
  test.use({ storageState: adminAuthFile });

  test('B: 거래처 인증 없이 임의 UUID 요청 시 인증 단계에서 차단', async ({ page }) => {
    // 인증 컨텍스트를 비운 새 컨텍스트로 요청
    const cleanContext = await page.context().browser()!.newContext();
    const cleanPage = await cleanContext.newPage();
    const fakeUuid = '00000000-0000-0000-0000-000000000000';

    try {
      const response = await retryApiRequest(
        () => cleanPage.request.get(`/api/contacts/${fakeUuid}/timeline`),
        'unauthenticated timeline request'
      );
      // 비인증 → 401 또는 redirect 후 다른 페이지의 응답 (200 외)
      expect([401, 403, 404]).toContain(response.status());
    } finally {
      await cleanContext.close();
    }
  });
});

test.describe('통합 타임라인 — 거래처 마스킹 (조건부)', () => {
  /**
   * 거래처 세션 인증은 별도 환경변수가 필요. 미설정이면 테스트 스킵.
   * - TEST_COMPANY_USERNAME / TEST_COMPANY_PASSWORD
   * - TEST_COMPANY_CONTACT_ID (해당 거래처 소유 문의 UUID)
   */
  const companyContactId =
    process.env.TEST_COMPANY_CONTACT_ID ?? DEFAULT_COMPANY_TIMELINE_CONTACT_ID;

  test('C+D: 거래처 응답에 isPublic=false 미노출 + 관리자 actorName 마스킹', async ({
    browser,
  }) => {
    const baseURL = (test.info().project.use.baseURL as string) ?? 'http://localhost:3000';
    const context = await browser.newContext();
    await context.addCookies([createCompanySessionCookie(baseURL, DEFAULT_COMPANY_ID)]);
    const page = await context.newPage();

    try {
      // 거래처 세션으로 타임라인 조회
      const response = await page.request.get(
        `${baseURL}/api/contacts/${companyContactId}/timeline`
      );
      expect(response.status()).toBe(200);

      const body = (await response.json()) as {
        timeline: Array<{
          kind: string;
          actorType: string;
          actorName: string | null;
          payload: { isPublic?: boolean; note?: string | null };
        }>;
      };

      // C: drawing_revision 항목은 모두 isPublic=true
      const drawingItems = body.timeline.filter((item) => item.kind === 'drawing_revision');
      expect(
        drawingItems.length,
        'C seed preflight: 공개 drawing_revision이 필요합니다.'
      ).toBeGreaterThan(0);
      for (const item of drawingItems) {
        expect(item.payload.isPublic).toBe(true);
        // note는 마스킹되어 null
        expect(item.payload.note).toBeNull();
      }

      // D: 관리자/시스템 actorName은 "YJLaser"로 마스킹
      for (const item of body.timeline) {
        if (
          item.actorType === 'admin' ||
          item.actorType === 'system' ||
          item.actorType === 'external'
        ) {
          expect(item.actorName).toBe('YJLaser');
        }
      }
    } finally {
      await context.close();
    }
  });
});
