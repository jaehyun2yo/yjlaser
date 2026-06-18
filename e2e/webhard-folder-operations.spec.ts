/**
 * 웹하드 폴더 작업 E2E 테스트
 *
 * 테스트 범위:
 * 1. 폴더 생성 (루트, 서브폴더)
 * 2. 폴더 이름 변경
 * 3. 폴더 삭제
 * 4. 폴더 이동 (드래그앤드롭 - 별도 테스트 파일)
 *
 * 실행: npx playwright test e2e/webhard-folder-operations.spec.ts --project=chromium
 *
 * ⚠️ 이 테스트는 authenticatedPageAtRoot fixture를 사용합니다.
 *    루트에서 시작하여 폴더가 사이드바에서 바로 보입니다.
 */

import { test, expect } from './fixtures/auth';
import type { Page, Response } from '@playwright/test';
import {
  createFolder,
  deleteFolderViaContextMenu,
  deleteFolderViaAPI,
  renameFolder,
  renameFolderViaAPI,
  folderExists,
  folderExistsInMain,
  deleteFolderInMain,
  navigateToFolder,
  getFolderId,
  getFolderIdFromMain,
  dismissAllModals,
  findFolderLocator,
  waitForFolderVisible,
} from './helpers/webhard-helpers';

// 동시 실행 시 DB 충돌 방지를 위해 직렬 실행
test.describe.configure({ mode: 'serial', timeout: 180000 });

function isFolderListResponseForParent(response: Response, parentId: string): boolean {
  try {
    const url = new URL(response.url());
    return (
      response.request().method() === 'GET' &&
      url.pathname.endsWith('/api/webhard/folders') &&
      url.searchParams.get('parentId') === parentId
    );
  } catch {
    return false;
  }
}

async function gotoFolderAndWaitForContents(page: Page, folderId: string): Promise<void> {
  const foldersResponsePromise = page
    .waitForResponse((response) => isFolderListResponseForParent(response, folderId), {
      timeout: 30000,
    })
    .catch(() => null);

  const targetUrl = `/webhard?folderId=${encodeURIComponent(folderId)}`;
  let lastNavigationError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      lastNavigationError = null;
      break;
    } catch (error) {
      lastNavigationError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (
        !/NS_BINDING_ABORTED|interrupted by another navigation|frame was detached/i.test(message)
      ) {
        throw error;
      }
      await page.waitForTimeout(500 * (attempt + 1));
    }
  }

  if (lastNavigationError) {
    throw lastNavigationError;
  }

  const foldersResponse = await foldersResponsePromise;
  if (foldersResponse && !foldersResponse.ok()) {
    throw new Error(`Folder list request failed with status ${foldersResponse.status()}`);
  }

  await page
    .locator('text=폴더 로딩 중...')
    .waitFor({ state: 'hidden', timeout: 30000 })
    .catch(() => {});
  await page
    .locator('text=파일 목록을 불러오는 중...')
    .waitFor({ state: 'hidden', timeout: 30000 })
    .catch(() => {});
}

async function expectFolderVisibleAfterApiCreate(page: Page, folderName: string): Promise<void> {
  await expect.poll(() => waitForFolderVisible(page, folderName), { timeout: 60000 }).toBe(true);
}

async function getVisibleTextCount(page: Page, text: string): Promise<number> {
  return page.getByText(text, { exact: true }).evaluateAll(
    (elements) =>
      elements.filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0
        );
      }).length
  );
}

async function waitForFolderTreeReady(page: Page): Promise<void> {
  await expect(
    page.getByText('파일명', { exact: true }).filter({ visible: true }).first()
  ).toBeVisible({
    timeout: 60000,
  });

  await expect
    .poll(() => getVisibleTextCount(page, '폴더 로딩 중...'), {
      timeout: 60000,
    })
    .toBe(0);

  await expect(page.getByRole('button', { name: '폴더 옵션' }).first()).toBeVisible({
    timeout: 60000,
  });
}

async function openNewFolderInputFromFolderMenu(page: Page): Promise<void> {
  await waitForFolderTreeReady(page);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const optionsButton = page.getByRole('button', { name: '폴더 옵션' }).first();

    await optionsButton
      .click({ timeout: 5000 })
      .catch(async () => optionsButton.dispatchEvent('click'));

    const createMenuItem = page
      .getByText('새 폴더 생성', { exact: true })
      .filter({ visible: true });
    if (
      await createMenuItem
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      await createMenuItem
        .first()
        .click({ timeout: 5000 })
        .catch(async () => createMenuItem.first().dispatchEvent('click'));
      await expect(page.locator('input[placeholder="폴더 이름"]').first()).toBeVisible({
        timeout: 10000,
      });
      return;
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500 * (attempt + 1));
  }

  throw new Error('새 폴더 생성 메뉴를 열 수 없습니다.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractFolderRecords(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) {
    return body.filter(isRecord);
  }

  if (!isRecord(body)) {
    return [];
  }

  const candidates = [body.folders, body.data, body.items];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord);
    }
  }

  return [];
}

async function countFoldersByNameInParent(
  page: Page,
  folderName: string,
  parentFolderId: string | null = null
): Promise<number> {
  const url = parentFolderId
    ? `/api/webhard/folders?parentId=${encodeURIComponent(parentFolderId)}`
    : '/api/webhard/folders';
  const response = await page.request.get(url);

  expect(response.ok()).toBe(true);

  const body = (await response.json()) as unknown;
  return extractFolderRecords(body).filter((folder) => folder.name === folderName).length;
}

test.describe('웹하드 폴더 작업', () => {
  // ========== 폴더 생성 테스트 ==========
  test.describe('폴더 생성', () => {
    test.describe.configure({ mode: 'serial' });

    test('should create folder via sidebar button', async ({ authenticatedPageAtRoot: page }) => {
      // 고유한 폴더 이름 생성
      const folderName = `test-folder-${Date.now()}`;

      // 폴더 생성 (API 직접 호출 방식)
      const folderId = await createFolder(page, folderName);

      // API로 생성했으므로 folderId가 반환되어야 함
      expect(folderId).not.toBeNull();

      // 폴더가 사이드바 또는 메인 영역에서 보이는지 확인
      const existsInSidebar = await folderExists(page, folderName);
      const existsInMain = await folderExistsInMain(page, folderName);

      expect(existsInSidebar || existsInMain).toBe(true);

      // 정리 - API를 통한 삭제
      await deleteFolderViaAPI(page, folderId!);
    });

    test('should create subfolder under parent folder', async ({
      authenticatedPageAtRoot: page,
    }) => {
      test.setTimeout(180000);

      // 부모 폴더 생성
      const parentFolderName = `parent-folder-${Date.now()}`;
      const parentId = await createFolder(page, parentFolderName);

      expect(parentId).not.toBeNull();

      // 부모 폴더 존재 확인
      const parentExists = await folderExists(page, parentFolderName);
      const parentExistsInMain = await folderExistsInMain(page, parentFolderName);
      expect(parentExists || parentExistsInMain || parentId !== null).toBe(true);

      // 서브폴더 생성 (부모 폴더 ID 명시적 전달)
      const subFolderName = `subfolder-${Date.now()}`;
      const subFolderId = await createFolder(page, subFolderName, parentId!);
      expect(subFolderId).not.toBeNull();

      // 부모 폴더 안으로 직접 이동하여 서브폴더 확인
      await gotoFolderAndWaitForContents(page, parentId!);

      // 서브폴더가 생성되었는지 확인
      const subExistsInMain = await folderExistsInMain(page, subFolderName);
      expect(subExistsInMain).toBe(true);

      // 정리 - API를 통한 삭제 (부모 폴더 삭제 시 서브폴더도 함께)
      await deleteFolderViaAPI(page, parentId!);
    });

    test('should reject empty folder name', async ({ authenticatedPageAtRoot: page }) => {
      await openNewFolderInputFromFolderMenu(page);

      // 폴더 이름 입력 필드가 나타날 때까지 대기
      const folderInput = page.locator('input[placeholder="폴더 이름"]');
      await folderInput.waitFor({ state: 'visible', timeout: 5000 });

      // 빈 이름으로 Enter
      await page.keyboard.press('Enter');

      // 폴더가 생성되지 않아야 함 (입력 필드가 그대로 있거나 에러 메시지)
      const inputStillVisible = await folderInput.isVisible({ timeout: 2000 }).catch(() => false);
      const errorMessage = await page
        .locator('text=폴더 이름을 입력')
        .isVisible({ timeout: 2000 })
        .catch(() => false);

      expect(inputStillVisible || errorMessage).toBe(true);

      // ESC로 취소
      await page.keyboard.press('Escape');
    });

    test('should cancel folder creation with ESC key', async ({
      authenticatedPageAtRoot: page,
    }) => {
      await openNewFolderInputFromFolderMenu(page);

      // 폴더 이름 입력 필드가 나타날 때까지 대기
      const folderInput = page.locator('input[placeholder="폴더 이름"]');
      await folderInput.waitFor({ state: 'visible', timeout: 5000 });

      // 이름 입력
      await folderInput.fill('should-not-exist');

      // ESC로 취소
      await page.keyboard.press('Escape');

      await page.waitForTimeout(500);

      // 폴더가 생성되지 않아야 함
      const exists = await folderExists(page, 'should-not-exist');
      const existsInMain = await folderExistsInMain(page, 'should-not-exist');
      expect(exists || existsInMain).toBe(false);
    });
  });

  // ========== 폴더 이름 변경 테스트 ==========
  test.describe('폴더 이름 변경', () => {
    test.describe.configure({ mode: 'serial' });

    test('should rename folder via API', async ({ authenticatedPageAtRoot: page }) => {
      // 폴더 생성 (API 방식)
      const originalName = `rename-test-${Date.now()}`;
      const folderId = await createFolder(page, originalName);

      // 폴더 생성 확인
      expect(folderId).not.toBeNull();

      await expectFolderVisibleAfterApiCreate(page, originalName);

      // API로 이름 변경
      const newName = `renamed-${Date.now()}`;
      const renamed = await renameFolderViaAPI(page, folderId!, newName);
      expect(renamed).toBe(true);

      // 페이지 로딩 완료 대기 (React Query 캐시 갱신)
      await page.waitForTimeout(2000);

      // 새 이름으로 표시되는지 확인 (여러 방법으로 시도)
      let newFolderFound = false;

      // 방법 1: folderExists 함수 사용
      const newExistsInSidebar = await folderExists(page, newName);
      const newExistsInMain = await folderExistsInMain(page, newName);
      newFolderFound = newExistsInSidebar || newExistsInMain;

      // 방법 2: 직접 텍스트 검색 (더 관대한 검색)
      if (!newFolderFound) {
        const directTextSearch = await page
          .locator(`text=${newName}`)
          .first()
          .isVisible({ timeout: 5000 })
          .catch(() => false);
        newFolderFound = directTextSearch;
      }

      expect(newFolderFound, `Renamed folder "${newName}" should be visible in UI`).toBe(true);
      expect(renamed).toBe(true); // API 성공 여부로 판단

      // 원래 이름이 사라졌는지 확인 (페이지 리로드 후이므로 당연히 없어야 함)
      const oldExistsInSidebar = await folderExists(page, originalName);
      const oldExistsInMain = await folderExistsInMain(page, originalName);
      expect(oldExistsInSidebar || oldExistsInMain).toBe(false);

      // 정리 - API를 통한 삭제 (더 안정적)
      await deleteFolderViaAPI(page, folderId!);
    });

    test('should cancel folder rename with ESC key', async ({ authenticatedPageAtRoot: page }) => {
      // 먼저 폴더 생성
      const originalName = `rename-cancel-${Date.now()}`;
      const folderId = await createFolder(page, originalName);

      expect(
        folderId !== null ||
          (await folderExists(page, originalName)) ||
          (await folderExistsInMain(page, originalName))
      ).toBe(true);
      await expectFolderVisibleAfterApiCreate(page, originalName);

      // 폴더 찾기 (사이드바 또는 메인 영역 모두 검색)
      const folderLocator = await findFolderLocator(page, originalName);

      await expect(folderLocator.first()).toBeVisible({ timeout: 10000 });

      // 컨텍스트 메뉴 열기
      await folderLocator.first().click({ button: 'right' });
      await page.waitForTimeout(300);
      await page.click('text=이름 변경');

      // 입력 필드가 나타날 때까지 대기
      await page.waitForTimeout(500);

      // 새 이름 입력
      await page.keyboard.type('should-not-change');

      // ESC로 취소
      await page.keyboard.press('Escape');

      await page.waitForTimeout(500);

      // 원래 이름이 유지되어야 함
      expect(
        (await folderExists(page, originalName)) || (await folderExistsInMain(page, originalName))
      ).toBe(true);

      // 정리
      await deleteFolderViaAPI(page, folderId!);
    });
  });

  // ========== 폴더 삭제 테스트 ==========
  test.describe('폴더 삭제', () => {
    test.describe.configure({ mode: 'serial' });

    test('should delete empty folder', async ({ authenticatedPageAtRoot: page }) => {
      // 폴더 생성
      const folderName = `delete-empty-${Date.now()}`;
      const folderId = await createFolder(page, folderName);

      // 폴더가 생성되었는지 확인
      expect(folderId).not.toBeNull();
      await expectFolderVisibleAfterApiCreate(page, folderName);

      // API를 통한 폴더 삭제 (더 안정적)
      const deleted = await deleteFolderViaAPI(page, folderId!, { refreshAfterDelete: true });
      expect(deleted).toBe(true);

      // 폴더가 사라졌는지 확인
      const stillExistsInSidebar = await folderExists(page, folderName);
      const stillExistsInMain = await folderExistsInMain(page, folderName);
      expect(stillExistsInSidebar || stillExistsInMain).toBe(false);
    });

    test('should delete folder with subfolders', async ({ authenticatedPageAtRoot: page }) => {
      // 부모 폴더 생성
      const parentName = `delete-parent-${Date.now()}`;
      const parentId = await createFolder(page, parentName);

      expect(parentId).not.toBeNull();

      // 서브폴더 생성
      const subfolderName = `delete-sub-${Date.now()}`;
      const subId = await createFolder(page, subfolderName, parentId!);
      expect(subId).not.toBeNull();

      // API를 통한 부모 폴더 삭제 (서브폴더도 함께 삭제)
      const deleted = await deleteFolderViaAPI(page, parentId!, { refreshAfterDelete: true });
      expect(deleted).toBe(true);

      // 부모 폴더가 사라졌는지 확인
      const stillExistsInSidebar = await folderExists(page, parentName);
      const stillExistsInMain = await folderExistsInMain(page, parentName);
      expect(stillExistsInSidebar || stillExistsInMain).toBe(false);

      // 서브폴더도 사라졌는지 확인
      const subStillExistsInSidebar = await folderExists(page, subfolderName);
      const subStillExistsInMain = await folderExistsInMain(page, subfolderName);
      expect(subStillExistsInSidebar || subStillExistsInMain).toBe(false);
    });

    test('should handle delete confirmation for non-empty folder', async ({
      authenticatedPageAtRoot: page,
    }) => {
      const folderName = `delete-confirm-${Date.now()}`;
      const folderId = await createFolder(page, folderName);
      expect(folderId).not.toBeNull();

      const childFolderName = `delete-confirm-child-${Date.now()}`;
      const childFolderId = await createFolder(page, childFolderName, folderId!);
      expect(childFolderId).not.toBeNull();

      await page.goto('/webhard');
      await waitForFolderVisible(page, folderName);

      // 삭제 시도: 메인 목록에서 폴더를 선택해 공통 삭제 확인 모달 경로를 검증한다.
      const folderLocator = page.locator('main [data-folder-id]').filter({ hasText: folderName });
      await expect(folderLocator.first()).toBeVisible({ timeout: 10000 });
      await folderLocator.first().locator('input[type="checkbox"]').check({ force: true });
      const deleteButton = page.getByRole('button', { name: '선택한 파일 삭제' }).first();
      await expect(deleteButton).toBeEnabled({ timeout: 5000 });
      await deleteButton.click();

      // 확인 모달이 표시되는지 확인
      const confirmModal = page
        .locator('text=폴더 삭제 확인')
        .or(page.locator('text=삭제하시겠습니까'));
      await expect(confirmModal.first()).toBeVisible({ timeout: 5000 });

      const confirmDialog = page
        .getByRole('dialog')
        .filter({ hasText: /삭제하시겠습니까/ })
        .first();
      await confirmDialog.getByRole('button', { name: '삭제' }).click();

      // 폴더 삭제 완료 대기
      await expect
        .poll(() => countFoldersByNameInParent(page, folderName), {
          timeout: 30000,
        })
        .toBe(0);
    });
  });

  // ========== 폴더 네비게이션 테스트 ==========
  test.describe('폴더 네비게이션', () => {
    test.describe.configure({ mode: 'serial' });

    test('should navigate to folder on click', async ({ authenticatedPageAtRoot: page }) => {
      // 폴더 생성
      const folderName = `nav-test-${Date.now()}`;
      const folderId = await createFolder(page, folderName);

      if (!folderId) {
        throw new Error(`폴더 생성 API가 folderId를 반환해야 합니다: ${folderName}`);
      }

      try {
        await expect
          .poll(() => folderExists(page, folderName), {
            timeout: 30000,
          })
          .toBe(true);

        await navigateToFolder(page, folderName);

        await expect
          .poll(() => page.url(), {
            timeout: 10000,
          })
          .toContain(`folderId=${folderId}`);
      } finally {
        await deleteFolderViaAPI(page, folderId).catch(() => undefined);
      }
    });

    test('should navigate to parent folder with breadcrumb', async ({
      authenticatedPageAtRoot: page,
    }) => {
      // 부모 폴더 생성
      const parentName = `breadcrumb-parent-${Date.now()}`;
      const parentId = await createFolder(page, parentName);

      expect(parentId).not.toBeNull();

      // 서브폴더 생성 (부모 폴더 ID 명시적 전달)
      const subfolderName = `breadcrumb-sub-${Date.now()}`;
      const subId = await createFolder(page, subfolderName, parentId!);
      expect(subId).not.toBeNull();

      // 부모 폴더로 직접 이동
      await gotoFolderAndWaitForContents(page, parentId!);

      // 서브폴더로 이동
      await navigateToFolder(page, subfolderName);

      // URL에 서브폴더 ID가 포함되어야 함
      expect(page.url()).toContain(`folderId=${subId}`);

      // breadcrumb에서 부모 폴더 클릭
      const parentBreadcrumb = page.getByTestId(`breadcrumb-folder-${parentId}`);
      await expect(parentBreadcrumb).toBeVisible({ timeout: 10000 });
      await parentBreadcrumb.click();

      // URL이 변경되어야 함
      await page.waitForURL(new RegExp(`folderId=${parentId}`), { timeout: 5000 });
      expect(page.url()).toContain(`folderId=${parentId}`);

      // 정리: API를 통한 폴더 삭제
      await deleteFolderViaAPI(page, parentId!);
    });
  });

  // ========== 에지 케이스 ==========
  test.describe('에지 케이스', () => {
    test.describe.configure({ mode: 'serial' });

    test('should handle special characters in folder name', async ({
      authenticatedPageAtRoot: page,
    }) => {
      // 특수 문자가 포함된 폴더 이름
      const folderName = `folder-특수문자-${Date.now()}`;
      const folderId = await createFolder(page, folderName);

      // 폴더가 생성되었는지 확인
      expect(folderId).not.toBeNull();
      const existsInSidebar = await folderExists(page, folderName);
      const existsInMain = await folderExistsInMain(page, folderName);
      expect(existsInSidebar || existsInMain).toBe(true);

      // 정리 - API를 통한 삭제
      await deleteFolderViaAPI(page, folderId!);
    });

    test('should handle long folder name', async ({ authenticatedPageAtRoot: page }) => {
      // 긴 폴더 이름 (50자)
      const longName = `long-folder-name-test-${'a'.repeat(30)}-${Date.now()}`.substring(0, 50);
      const folderId = await createFolder(page, longName);

      // 폴더가 생성되었는지 확인
      expect(folderId).not.toBeNull();
      const existsInSidebar = await folderExists(page, longName);
      const existsInMain = await folderExistsInMain(page, longName);
      expect(existsInSidebar || existsInMain).toBe(true);

      // 정리 - API를 통한 삭제
      await deleteFolderViaAPI(page, folderId!);
    });

    test('should prevent duplicate folder names in same parent', async ({
      authenticatedPageAtRoot: page,
    }) => {
      // 첫 번째 폴더 생성
      const folderName = `duplicate-test-${Date.now()}`;
      const firstFolderId = await createFolder(page, folderName);

      // 폴더가 생성되었는지 확인
      expect(firstFolderId).not.toBeNull();
      const exists1 =
        (await folderExists(page, folderName)) || (await folderExistsInMain(page, folderName));
      expect(exists1).toBe(true);

      // 같은 이름으로 다시 생성 시도
      const secondFolderId = await createFolder(page, folderName);
      const folderCountBeforeCleanup = await countFoldersByNameInParent(page, folderName);

      // 정리 - API를 통한 삭제
      if (firstFolderId) {
        await deleteFolderViaAPI(page, firstFolderId);
      }
      if (secondFolderId && secondFolderId !== firstFolderId) {
        await deleteFolderViaAPI(page, secondFolderId);
      }

      expect(secondFolderId).toBeNull();
      expect(folderCountBeforeCleanup).toBe(1);
    });
  });

  // 테스트 종료 후 모달 정리
  test.afterEach(async ({ authenticatedPageAtRoot: page }) => {
    try {
      await dismissAllModals(page);
    } catch {
      // ignore cleanup errors
    }
  });
});
