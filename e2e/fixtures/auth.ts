import { test as base, type Page } from '@playwright/test';
import * as path from 'path';
import { mockR2Uploads, waitForVisibleTextToDisappear } from '../helpers/webhard-helpers';

/**
 * Playwright Fixture: 저장된 인증 상태 재사용
 *
 * global-setup.ts에서 저장한 인증 상태(.auth/user.json)를 로드하여
 * 모든 테스트에서 동일한 로그인 세션을 재사용합니다.
 *
 * ✅ 37개 테스트 → 단 1번만 로그인 (global-setup.ts에서)
 * ✅ Rate Limit 문제 완전 해결
 * ✅ 업계 표준 패턴
 *
 * 두 가지 fixture 제공:
 * - authenticatedPage: 폴더 내부에서 시작 (파일 업로드 테스트용)
 * - authenticatedPageAtRoot: 루트에서 시작 (폴더 작업 테스트용)
 */

type AuthFixtures = {
  authenticatedPage: Page;
  authenticatedPageAtRoot: Page;
};

// 저장된 인증 상태 파일 경로
const authFile = path.join(__dirname, '..', '..', '.auth', 'user.json');
const shouldMockR2Uploads = !process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID;

interface CreatedFolder {
  id: string;
  name: string;
}

async function waitForVisibleText(page: Page, text: string, timeout = 30000): Promise<void> {
  await page
    .getByText(text, { exact: true })
    .filter({ visible: true })
    .first()
    .waitFor({ state: 'visible', timeout });
}

async function waitForWebhardContents(page: Page): Promise<void> {
  await waitForVisibleText(page, '파일명', 60000);
  await waitForVisibleTextToDisappear(page, '폴더 로딩 중...');
  await waitForVisibleTextToDisappear(page, '파일 목록을 불러오는 중...');
}

async function gotoWebhardAndWait(page: Page, url: string): Promise<void> {
  const retryableNavigationErrors =
    /NS_BINDING_ABORTED|interrupted by another navigation|frame was detached/i;
  const retryableWebhardBootErrors =
    /폴더 로딩 중|파일 목록을 불러오는 중|Timeout .*waiting on the predicate/i;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await waitForWebhardContents(page);
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const canRetry =
        retryableNavigationErrors.test(message) || retryableWebhardBootErrors.test(message);

      if (!canRetry || attempt === 2) {
        throw error;
      }

      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForTimeout(250 * (attempt + 1));
    }
  }

  throw lastError;
}

async function createIsolatedUploadFolder(page: Page): Promise<CreatedFolder | null> {
  const folderName = `e2e-files-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const response = await page.request.post('/api/webhard/folders', {
    data: {
      name: folderName,
      parentId: null,
      companyId: null,
    },
  });

  if (!response.ok()) {
    console.warn(`Failed to create isolated upload folder: ${response.status()}`);
    return null;
  }

  const body = (await response.json()) as { id?: unknown };
  if (typeof body.id !== 'string') {
    console.warn('Create folder response did not include an id');
    return null;
  }

  return { id: body.id, name: folderName };
}

async function deleteIsolatedUploadFolder(page: Page, folderId: string): Promise<void> {
  const response = await page.request.delete(`/api/webhard/folders/${folderId}/delete`);

  if (!response.ok() && response.status() !== 404) {
    throw new Error(`Failed to cleanup isolated upload folder ${folderId}: ${response.status()}`);
  }
}

/**
 * 확장된 테스트 객체 (인증된 페이지 제공)
 *
 * ⭐ Global Setup에서 저장한 auth state를 로드
 * ⭐ 모든 테스트가 동일한 인증 상태 공유
 * ⭐ 추가 로그인 없음!
 */
export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ browser }, use) => {
    // 저장된 인증 상태로 새 컨텍스트 생성
    const context = await browser.newContext({
      storageState: authFile,
    });

    const page = await context.newPage();

    // Google Drive 전환 환경에서는 실제 Drive 프록시 업로드 경로를 검증한다.
    if (shouldMockR2Uploads) {
      await mockR2Uploads(page);
    }

    const testFolder = await createIsolatedUploadFolder(page);
    const testFolderId = testFolder?.id ?? null;
    if (!testFolderId && !shouldMockR2Uploads) {
      await context.close();
      throw new Error('Google Drive E2E requires isolated upload folder creation');
    }
    const hasFolders = testFolderId !== null;

    if (testFolderId) {
      await gotoWebhardAndWait(page, `/webhard?folderId=${encodeURIComponent(testFolderId)}`);
    } else {
      await gotoWebhardAndWait(page, '/webhard');
    }

    // 모달이 열렸으면 닫기
    const cancelBtn = page.locator('button:has-text("취소")').first();
    if (await cancelBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await cancelBtn.click();
      await page.waitForTimeout(300);
    }

    if (!hasFolders) {
      console.warn('No folders found, tests may fail for upload operations');
    }

    try {
      // 테스트에서 사용
      await use(page);
    } finally {
      try {
        if (testFolderId) {
          await deleteIsolatedUploadFolder(page, testFolderId);
        }
      } finally {
        // 정리
        await context.close();
      }
    }
  },

  /**
   * 루트에서 시작하는 인증된 페이지 (폴더 작업 테스트용)
   *
   * ⭐ 폴더 내부로 이동하지 않음 - 루트에서 시작
   * ⭐ 새 폴더 생성 시 루트 레벨에 생성됨
   * ⭐ 사이드바에서 폴더가 바로 보임
   */
  authenticatedPageAtRoot: async ({ browser }, use) => {
    // 저장된 인증 상태로 새 컨텍스트 생성
    const context = await browser.newContext({
      storageState: authFile,
    });

    const page = await context.newPage();

    // Google Drive 전환 환경에서는 실제 Drive 프록시 업로드 경로를 검증한다.
    if (shouldMockR2Uploads) {
      await mockR2Uploads(page);
    }

    await gotoWebhardAndWait(page, '/webhard');

    // 폴더로 이동하지 않고 루트에서 대기
    await page.waitForTimeout(1000);

    // 모달이 열렸으면 닫기
    const cancelBtn = page.locator('button:has-text("취소")').first();
    if (await cancelBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await cancelBtn.click();
      await page.waitForTimeout(300);
    }

    // 테스트에서 사용
    await use(page);

    // 정리
    await context.close();
  },
});

export { expect } from '@playwright/test';
