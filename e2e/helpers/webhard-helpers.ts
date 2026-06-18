import type { Page, Route, Request, Locator, Response } from '@playwright/test';
import { expect } from '@playwright/test';

function isWebhardUploadInitResponse(resp: Response): boolean {
  const url = resp.url();

  return (
    resp.request().method() === 'POST' &&
    (url.includes('/api/webhard/files/presigned-url') ||
      url.includes('/api/webhard/files/batch/upload') ||
      url.includes('/api/webhard/upload/batch'))
  );
}

function isWebhardUploadConfirmResponse(resp: Response): boolean {
  const url = resp.url();

  return (
    resp.request().method() === 'POST' &&
    (url.includes('/api/webhard/files/confirm') ||
      url.includes('/api/webhard/upload/batch-complete'))
  );
}

function isWebhardFileListRefreshResponse(resp: Response): boolean {
  return resp.request().method() === 'GET' && resp.url().includes('/api/webhard/files');
}

function isWebhardFolderListRefreshResponse(resp: Response): boolean {
  return resp.request().method() === 'GET' && resp.url().includes('/api/webhard/folders');
}

function isWebhardFileDeleteResponse(resp: Response): boolean {
  const url = resp.url();
  const method = resp.request().method();

  return (
    (method === 'DELETE' && url.includes('/api/webhard/files/') && url.includes('/delete')) ||
    (method === 'POST' && url.includes('/api/webhard/files/batch/delete'))
  );
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function getNumberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is Record<string, unknown> => typeof item === 'object' && item !== null
  );
}

function getFileRecordName(file: Record<string, unknown>): string | null {
  const value = file.original_name ?? file.originalName ?? file.name;
  return typeof value === 'string' ? value : null;
}

function getBooleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function getRecordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function isWaitForResponseTimeout(error: unknown): boolean {
  return error instanceof Error && /waitForResponse: Timeout/i.test(error.message);
}

function getMessageFromDeleteResponse(body: Record<string, unknown>): string {
  const errors = getStringArray(body.errors);
  if (errors.length > 0) {
    return errors.join(', ');
  }

  if (typeof body.error === 'string') {
    return body.error;
  }

  if (typeof body.message === 'string') {
    return body.message;
  }

  return 'Delete API reported an unsuccessful result';
}

function isExpectedFileDeleteResponse(resp: Response, expectedFileIds: string[]): boolean {
  if (!isWebhardFileDeleteResponse(resp)) {
    return false;
  }

  const request = resp.request();
  const url = resp.url();
  const method = request.method();

  if (method === 'DELETE') {
    return (
      expectedFileIds.length === 1 && url.includes(`/api/webhard/files/${expectedFileIds[0]}/`)
    );
  }

  const rawPostData = request.postData();
  if (!rawPostData) {
    return false;
  }

  try {
    const parsed = JSON.parse(rawPostData) as { fileIds?: unknown };
    const requestFileIds = getStringArray(parsed.fileIds);
    return (
      expectedFileIds.length > 0 &&
      expectedFileIds.every((fileId) => requestFileIds.includes(fileId))
    );
  } catch {
    return false;
  }
}

async function assertSuccessfulDeleteResponse(
  response: Response,
  expectedDeletedCount: number
): Promise<void> {
  if (response.status() < 200 || response.status() >= 300) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new Error(`Delete failed with status ${response.status()}: ${errorBody}`);
  }

  if (response.request().method() !== 'POST') {
    return;
  }

  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    throw new Error('Delete API response body was not valid JSON');
  }

  const processed =
    getNumberValue(body.processed) ??
    getNumberValue(body.filesDeleted) ??
    getNumberValue(body.deleted);
  const failed = getNumberValue(body.failed) ?? 0;

  if (body.success === false || failed > 0) {
    throw new Error(getMessageFromDeleteResponse(body));
  }

  if (processed === null) {
    throw new Error('Batch delete response did not include a processed/deleted count');
  }

  if (processed < expectedDeletedCount) {
    throw new Error(
      `Delete API processed ${processed} items, expected at least ${expectedDeletedCount}`
    );
  }
}

function isWebhardFileRenameResponse(resp: Response): boolean {
  return (
    resp.request().method() === 'PATCH' &&
    resp.url().includes('/api/webhard/files/') &&
    resp.url().includes('/rename')
  );
}

const WEBHARD_RENAME_RESPONSE_TIMEOUT_MS = 30000;

async function fetchCurrentFolderFiles(page: Page): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({
    sortBy: 'date',
    sortOrder: 'desc',
    page: '1',
    limit: '500',
  });
  const folderId = getCurrentFolderId(page);
  if (folderId) {
    params.set('folderId', folderId);
  }

  const response = await page.request.get(`/api/webhard/files?${params.toString()}`, {
    timeout: 60000,
  });
  if (!response.ok()) {
    throw new Error(`Failed to fetch current folder files: ${response.status()}`);
  }

  const body = (await response.json()) as Record<string, unknown>;
  return getRecordArray(body.files);
}

async function waitForFileIdsAbsentFromCurrentFolderApi(
  page: Page,
  fileIds: string[],
  timeout = 60000
): Promise<void> {
  await expect
    .poll(
      async () => {
        const files = await fetchCurrentFolderFiles(page).catch(() => null);
        if (!files) {
          return false;
        }

        return fileIds.every(
          (fileId) => !files.some((file) => typeof file.id === 'string' && file.id === fileId)
        );
      },
      { timeout }
    )
    .toBe(true);
}

async function waitForFileRenamePersistedInCurrentFolderApi(
  page: Page,
  fileId: string,
  newName: string,
  timeout = 60000
): Promise<void> {
  await expect
    .poll(
      async () => {
        const files = await fetchCurrentFolderFiles(page).catch(() => null);
        if (!files) {
          return false;
        }

        const renamedFile = files.find((file) => file.id === fileId);
        return getFileRecordName(renamedFile ?? {}) === newName;
      },
      { timeout }
    )
    .toBe(true);
}

async function waitForUploadedFileIdsInCurrentFolderApi(
  page: Page,
  fileNames: string[],
  timeout = 60000
): Promise<Map<string, string>> {
  let matchingIds = new Map<string, string>();

  await expect
    .poll(
      async () => {
        const files = await fetchCurrentFolderFiles(page).catch(() => null);
        if (!files) {
          return false;
        }

        const nextMatchingIds = new Map<string, string>();
        for (const fileName of fileNames) {
          const file = files.find((candidate) => getFileRecordName(candidate) === fileName);
          const fileId = typeof file?.id === 'string' ? file.id : null;
          if (!fileId) {
            return false;
          }
          nextMatchingIds.set(fileName, fileId);
        }

        matchingIds = nextMatchingIds;
        return true;
      },
      { timeout }
    )
    .toBe(true);

  return matchingIds;
}

async function waitForDeletedFileIdsGoneFromCurrentView(
  page: Page,
  deletedFileIds: string[],
  timeout = 30000
): Promise<void> {
  await expect
    .poll(
      async () => {
        const remainingCounts = await Promise.all(
          deletedFileIds.map((fileId) => page.locator(`[data-file-id="${fileId}"]`).count())
        );
        return remainingCounts.every((count) => count === 0);
      },
      { timeout }
    )
    .toBe(true);
}

async function waitForUploadedFileIdsVisibleInCurrentView(
  page: Page,
  uploadedFileIds: Map<string, string>,
  timeout = 60000
): Promise<void> {
  for (const [fileName, fileId] of uploadedFileIds) {
    const fileRow = page.locator(`[data-file-id="${fileId}"]`);
    await expect(fileRow).toBeVisible({ timeout });
    await expect(fileRow).toContainText(fileName, { timeout });
  }
}

async function waitForLiveFileRenameInCurrentView(
  page: Page,
  fileId: string,
  previousName: string,
  newName: string,
  timeout = 30000
): Promise<void> {
  const fileRow = page.locator(`[data-file-id="${fileId}"]`);

  await expect(fileRow).toBeVisible({ timeout });
  await expect(fileRow).toContainText(newName, { timeout });
  await expect(fileRow.locator('input[type="text"]')).toHaveCount(0, { timeout: 5000 });

  if (previousName !== newName) {
    await expect(fileRow).not.toContainText(previousName, { timeout });
  }
}

export async function waitForVisibleTextToDisappear(
  page: Page,
  text: string,
  timeout = 60000
): Promise<void> {
  await expect
    .poll(
      async () =>
        page.getByText(text, { exact: true }).evaluateAll((elements) =>
          elements.every((element) => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return (
              style.display === 'none' ||
              style.visibility === 'hidden' ||
              rect.width === 0 ||
              rect.height === 0
            );
          })
        ),
      { timeout }
    )
    .toBe(true);
}

function getInlineRenameInputValue(originalName: string, desiredName: string): string {
  const lastDotIndex = originalName.lastIndexOf('.');
  if (lastDotIndex <= 0) {
    return desiredName;
  }

  const extension = originalName.slice(lastDotIndex);
  return desiredName.toLowerCase().endsWith(extension.toLowerCase())
    ? desiredName.slice(0, -extension.length)
    : desiredName;
}

async function waitForWebhardShell(page: Page, timeout = 60000): Promise<void> {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page
    .getByText('전체 파일', { exact: true })
    .filter({ visible: true })
    .first()
    .waitFor({ state: 'visible', timeout });
  await waitForVisibleTextToDisappear(page, '폴더 로딩 중...', timeout);
  await waitForVisibleTextToDisappear(page, '파일 목록을 불러오는 중...', timeout);
}

async function refreshCurrentWebhardView(page: Page): Promise<void> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const folderListResponsePromise = page
      .waitForResponse(isWebhardFolderListRefreshResponse, { timeout: 30000 })
      .catch(() => null);
    const fileListResponsePromise = page
      .waitForResponse(isWebhardFileListRefreshResponse, { timeout: 30000 })
      .catch(() => null);

    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      await Promise.all([folderListResponsePromise, fileListResponsePromise]);
      await waitForWebhardShell(page, 30000);
      await page.waitForTimeout(500);
      return;
    } catch (error) {
      lastError = error;
      if (attempt === 1) {
        throw error;
      }
      await page.waitForTimeout(750);
    }
  }

  throw lastError;
}

async function assertSuccessfulUploadConfirmResponse(
  response: Response,
  expectedFileCount: number
): Promise<void> {
  if (response.status() < 200 || response.status() >= 300) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new Error(`Upload confirm failed with status ${response.status()}: ${errorBody}`);
  }

  const body = getRecordValue(await response.json().catch(() => null));
  if (!body) {
    throw new Error('Upload confirm response body was not valid JSON');
  }

  const success = getBooleanValue(body.success);
  const data = getRecordValue(body.data);
  const failed = getNumberValue(data?.failed) ?? 0;
  const confirmed = getNumberValue(data?.success) ?? getNumberValue(data?.total);

  if (success === false || failed > 0) {
    const errorMessage =
      typeof body.error === 'string'
        ? body.error
        : `Upload confirm reported ${failed} failed file(s)`;
    throw new Error(errorMessage);
  }

  if (confirmed !== null && confirmed < expectedFileCount) {
    throw new Error(
      `Upload confirm saved ${confirmed} file(s), expected at least ${expectedFileCount}`
    );
  }
}

async function goToWebhardRoot(page: Page): Promise<void> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const folderListResponsePromise = page
      .waitForResponse(isWebhardFolderListRefreshResponse, { timeout: 30000 })
      .catch(() => null);
    const fileListResponsePromise = page
      .waitForResponse(isWebhardFileListRefreshResponse, { timeout: 30000 })
      .catch(() => null);

    try {
      await page.goto('/webhard', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await Promise.all([folderListResponsePromise, fileListResponsePromise]);
      await waitForWebhardShell(page, 30000);
      await page.waitForTimeout(500);
      return;
    } catch (error) {
      lastError = error;
      if (attempt === 1) {
        throw error;
      }
      await page.waitForTimeout(750);
    }
  }

  throw lastError;
}

function getCurrentFolderId(page: Page): string | null {
  try {
    return new URL(page.url()).searchParams.get('folderId');
  } catch {
    return null;
  }
}

async function hasVisibleFolderText(page: Page, folderName: string): Promise<boolean> {
  const candidates = page.locator(
    [
      'main [data-folder-id]',
      'main [data-folder-item]',
      'aside [data-folder-id]',
      'aside [data-folder-item]',
      'nav [data-folder-id]',
      '[role="complementary"] [data-folder-id]',
      '[role="complementary"] [data-folder-item]',
    ].join(', ')
  );

  return candidates.evaluateAll(
    (elements, name) =>
      elements.some((element) => {
        const htmlElement = element as HTMLElement;
        const style = window.getComputedStyle(htmlElement);
        const rect = htmlElement.getBoundingClientRect();
        const textContent = (htmlElement.textContent ?? '').replace(/\s+/g, ' ').trim();

        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0 &&
          textContent.includes(name)
        );
      }),
    folderName
  );
}

async function waitForFolderRenderAfterCreate(
  page: Page,
  folderName: string,
  timeout = 60000
): Promise<boolean> {
  try {
    await expect
      .poll(async () => hasVisibleFolderText(page, folderName), {
        intervals: [500, 1000, 2000],
        timeout,
      })
      .toBe(true);

    return true;
  } catch {
    return false;
  }
}

export async function waitForFolderVisible(
  page: Page,
  folderName: string,
  timeout = 60000
): Promise<boolean> {
  return waitForFolderRenderAfterCreate(page, folderName, timeout);
}

function getDeleteConfirmDialog(page: Page): Locator {
  return page
    .getByRole('dialog')
    .filter({ hasText: /삭제하시겠습니까\?/ })
    .first();
}

export async function confirmDeleteDialog(page: Page): Promise<void> {
  const confirmModal = getDeleteConfirmDialog(page);

  await expect(confirmModal).toBeVisible({ timeout: 5000 });
  await confirmModal.getByRole('button', { name: '삭제' }).click();
}

async function clickVisibleText(page: Page, text: string): Promise<void> {
  await page.getByText(text, { exact: true }).filter({ visible: true }).first().click();
}

async function clickVisibleContextMenuItem(page: Page, text: string | RegExp): Promise<void> {
  const menuItem = page
    .locator('[role="menuitem"], [data-context-menu] button, .fixed button')
    .filter({ hasText: text })
    .filter({ visible: true })
    .first();

  if (await menuItem.isVisible({ timeout: 3000 }).catch(() => false)) {
    await menuItem.click();
    return;
  }

  if (typeof text === 'string') {
    await clickVisibleText(page, text);
    return;
  }

  await page.getByText(text).filter({ visible: true }).first().click();
}

/**
 * R2 업로드 요청 모킹 (CORS 우회)
 * 테스트 환경에서 R2 presigned URL 업로드를 모킹하여 CORS 문제 우회
 * @param page Playwright Page 객체
 */
export async function mockR2Uploads(page: Page): Promise<void> {
  await page.route('**/api/webhard/files/multipart/initiate', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ uploadId: `e2e-multipart-${Date.now()}` }),
    });
  });

  await page.route(
    '**/api/webhard/files/multipart/presign',
    async (route: Route, request: Request) => {
      const body = request.postDataJSON() as { partNumber?: number } | null;
      const partNumber = typeof body?.partNumber === 'number' ? body.partNumber : 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: `https://e2e-upload.r2.cloudflarestorage.com/multipart/part-${partNumber}`,
        }),
      });
    }
  );

  await page.route('**/api/webhard/files/multipart/complete', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  await page.route('**/api/webhard/files/multipart/abort', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  await page.route('**/*.r2.cloudflarestorage.com/**', async (route: Route, request: Request) => {
    // PUT 요청만 모킹 (업로드)
    if (request.method() === 'PUT') {
      // 성공 응답 반환
      await route.fulfill({
        status: 200,
        body: '',
        headers: {
          'Content-Type': 'application/xml',
          ETag: '"e2e-r2-etag"',
        },
      });
    } else {
      // 다른 요청은 그대로 진행
      await route.continue();
    }
  });
}

/**
 * 열려있는 모든 모달 닫기
 * @param page Playwright Page 객체
 */
export async function dismissAllModals(page: Page): Promise<void> {
  // 최대 3회 시도 (모달이 여러 개 겹쳐있을 수 있음)
  for (let attempt = 0; attempt < 3; attempt++) {
    let modalDismissed = false;

    // 1. 취소 버튼이 보이면 클릭
    const cancelBtn = page.locator('button:has-text("취소")').first();
    if (await cancelBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await cancelBtn.click();
      await page.waitForTimeout(500);
      modalDismissed = true;
      continue;
    }

    // 2. 모달 관련 텍스트가 보이면 ESC로 닫기
    const modalTexts = [
      '정말로 모든 데이터를 삭제하시겠습니까?',
      '전체 삭제 확인',
      '삭제하시겠습니까?',
      '업로드할 폴더 선택',
      '폴더 선택',
    ];

    for (const text of modalTexts) {
      const modal = page.locator(`text=${text}`);
      if (await modal.isVisible({ timeout: 200 }).catch(() => false)) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        modalDismissed = true;
        break;
      }
    }

    // 3. z-index가 높은 요소(모달 오버레이) 확인 후 ESC
    const highZIndexOverlay = page
      .locator('[class*="fixed"][class*="z-50"], [class*="fixed"][class*="z-40"]')
      .first();
    if (await highZIndexOverlay.isVisible({ timeout: 200 }).catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      modalDismissed = true;
      continue;
    }

    if (!modalDismissed) break;
  }

  // 마지막으로 ESC 한 번 더 눌러서 확실히 닫기 (컨텍스트 메뉴 등)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

/**
 * 관리자 계정으로 로그인
 * @param page Playwright Page 객체
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/login');

  // 로그인 폼 작성 (username과 password 필드 사용)
  await page.fill('input[name="username"]', process.env.TEST_ADMIN_USERNAME || 'test_admin');
  await page.fill('input[name="password"]', process.env.TEST_ADMIN_PASSWORD || 'test_admin123');

  // 로그인 버튼 클릭
  await page.click('button[type="submit"]');

  // 로그인 완료 대기 (URL 변경 확인)
  await page.waitForURL(/\/(admin|dashboard|webhard)/, { timeout: 15000 });
}

/**
 * 파일 input을 통해 파일 업로드
 * @param page Playwright Page 객체
 * @param files 업로드할 File 배열
 */
export async function uploadFiles(page: Page, files: File[]): Promise<void> {
  // 1. FolderSelectModal이 열려있으면 먼저 닫기
  const folderModal = page.locator('text=업로드할 폴더 선택');
  if (await folderModal.isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.locator('button').filter({ hasText: '취소' }).click();
    await page.waitForTimeout(500);
  }

  // 2. 파일 input 찾기 (data-testid 우선)
  const fileInput = page
    .locator('[data-testid="file-upload-input"]')
    .or(page.locator('input[type="file"]').first());

  // 3. File 객체를 Buffer로 변환
  const fileBuffers = await Promise.all(
    files.map(async (file) => {
      const arrayBuffer = await file.arrayBuffer();
      return {
        name: file.name,
        mimeType: file.type,
        buffer: Buffer.from(arrayBuffer),
      };
    })
  );

  const uploadResponsePromise = page
    .waitForResponse(isWebhardUploadInitResponse, { timeout: 90000 })
    .catch(() => null);
  const confirmResponsePromise = page
    .waitForResponse(isWebhardUploadConfirmResponse, { timeout: 90000 })
    .catch(() => null);
  const fileListRefreshPromise = page
    .waitForResponse(isWebhardFileListRefreshResponse, { timeout: 60000 })
    .catch(() => {
      console.warn('File list refetch timeout - proceeding anyway');
    });

  // 4. 파일 설정
  await fileInput.setInputFiles(fileBuffers);

  // 5. FolderSelectModal이 나타나면 현재 폴더 그대로 사용
  // (모달은 currentFolderId로 초기화되므로 별도 선택 불필요)
  const modalAppeared = await folderModal.isVisible({ timeout: 5000 }).catch(() => false);

  if (modalAppeared) {
    // 모달이 열리면 현재 폴더가 이미 선택된 상태
    // 바로 "선택 완료" 클릭
    await page.waitForTimeout(500); // 모달 애니메이션 대기
    const confirmButton = page.locator('button').filter({ hasText: '선택 완료' });
    const buttonVisible = await confirmButton.isVisible({ timeout: 2000 }).catch(() => false);
    if (buttonVisible) {
      await confirmButton.click();
    }
  } else {
    console.warn('Folder select modal did not appear - upload may not start');
  }

  // 6. 업로드 완료 대기 (API 응답 대기 및 상태 체크)
  // 업로드 플로우:
  // 1. /api/webhard/files/presigned-url 또는 /api/webhard/files/batch/upload → presigned URL 반환
  // 2. 클라이언트가 R2에 직접 업로드
  // 3. /api/webhard/files/confirm → DB에 메타데이터 저장

  // presigned URL 응답 대기 (타임아웃 증가: 60초 → 90초)
  const uploadResponse = await uploadResponsePromise;

  if (uploadResponse) {
    const status = uploadResponse.status();
    if (status < 200 || status >= 300) {
      await dismissAllModals(page);
      throw new Error(`Upload failed with status ${status}`);
    }
  } else {
    await dismissAllModals(page);
    throw new Error('Upload init API response was not detected');
  }

  // R2 업로드 완료 대기 (모킹 환경에서는 빠르게 완료)
  await page.waitForTimeout(1000);

  // confirm API 호출 대기 (실제 DB 저장)
  // 프론트엔드는 /api/webhard/upload/batch-complete 호출
  // 타임아웃 증가: 60초 → 90초
  const confirmResponse = await confirmResponsePromise;

  if (confirmResponse) {
    await assertSuccessfulUploadConfirmResponse(confirmResponse, Math.min(files.length, 50));
  } else {
    await dismissAllModals(page);
    throw new Error('Upload confirm API response was not detected');
  }

  // 7. UI 업데이트 대기
  await page.waitForTimeout(500); // 서버 저장 완료 대기

  // React Query refetch 대기
  await fileListRefreshPromise;

  // 모달이 열려있으면 닫기
  await dismissAllModals(page);

  const uploadedFileIds = await waitForUploadedFileIdsInCurrentFolderApi(
    page,
    files.map((file) => file.name)
  );
  if (uploadedFileIds.size <= 50) {
    await waitForUploadedFileIdsVisibleInCurrentView(page, uploadedFileIds);
  }
}

/**
 * 파일 선택 (클릭 + modifier)
 * @param page Playwright Page 객체
 * @param fileNames 선택할 파일명 배열
 * @param modifier 'ctrl' | 'shift' (다중 선택)
 */
export async function selectFiles(
  page: Page,
  fileNames: string[],
  modifier?: 'ctrl' | 'shift'
): Promise<void> {
  for (let i = 0; i < fileNames.length; i++) {
    const fileName = fileNames[i];
    const fileLocator = page.locator(`[data-file-id]`).filter({
      hasText: fileName,
    });

    const targetFile = fileLocator.first();
    const checkbox = targetFile.locator('input[type="checkbox"]').first();

    if (await checkbox.isVisible({ timeout: 1000 }).catch(() => false)) {
      await checkbox.check({ force: true });
    } else if (modifier === 'ctrl') {
      await targetFile.click({ modifiers: ['Control'] });
    } else if (modifier === 'shift' && i > 0) {
      await targetFile.click({ modifiers: ['Shift'] });
    } else {
      await targetFile.click();
    }

    await page.waitForTimeout(100);
  }
}

/**
 * 파일 ID로 선택
 * @param page Playwright Page 객체
 * @param fileIds 선택할 파일 ID 배열
 * @param modifier 'ctrl' | 'shift'
 */
export async function selectFilesByIds(
  page: Page,
  fileIds: string[],
  modifier?: 'ctrl' | 'shift'
): Promise<void> {
  for (let i = 0; i < fileIds.length; i++) {
    const fileId = fileIds[i];
    const fileLocator = page.locator(`[data-file-id="${fileId}"]`);

    const checkbox = fileLocator.locator('input[type="checkbox"]').first();

    if (await checkbox.isVisible({ timeout: 1000 }).catch(() => false)) {
      await checkbox.check({ force: true });
    } else if (modifier === 'ctrl') {
      await fileLocator.click({ modifiers: ['Control'] });
    } else if (modifier === 'shift' && i > 0) {
      await fileLocator.click({ modifiers: ['Shift'] });
    } else {
      await fileLocator.click();
    }

    await page.waitForTimeout(100);
  }
}

/**
 * 현재 폴더에 표시된 모든 항목 선택 (헤더 전체선택 체크박스 사용)
 * @param page Playwright Page 객체
 */
export async function selectAllItemsInCurrentView(page: Page): Promise<void> {
  const selectAllCheckbox = page.getByLabel('전체 파일 및 폴더 선택').first();

  await expect(selectAllCheckbox).toBeVisible({ timeout: 5000 });

  if (!(await selectAllCheckbox.isChecked())) {
    await selectAllCheckbox.check();
  }

  await expect(page.locator('main')).toContainText(/선택: [1-9]\d*개/, {
    timeout: 5000,
  });
  await expect(page.getByRole('button', { name: '선택한 파일 삭제' }).first()).toBeEnabled({
    timeout: 5000,
  });
}

async function getSelectedFileIdsInCurrentView(page: Page): Promise<string[]> {
  const ids = await page.locator('[data-file-id]').evaluateAll((elements) =>
    elements
      .filter((element) => {
        const checkbox = element.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
        return checkbox?.checked === true;
      })
      .map((element) => element.getAttribute('data-file-id'))
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  );

  return ids;
}

/**
 * 선택된 파일 삭제 (툴바 버튼 사용)
 * @param page Playwright Page 객체
 */
export async function deleteSelectedFiles(page: Page): Promise<void> {
  // 1. 선택 항목 삭제 툴바 버튼 클릭
  const deleteButton = page.getByRole('button', { name: '선택한 파일 삭제' }).first();
  const selectedFileIds = await getSelectedFileIdsInCurrentView(page);

  if (selectedFileIds.length === 0) {
    throw new Error('No selected file ids were found before delete');
  }

  const deleteResponsePromise = page
    .waitForResponse((resp) => isExpectedFileDeleteResponse(resp, selectedFileIds), {
      timeout: 30000,
    })
    .catch(() => null);

  await expect(deleteButton).toBeEnabled({ timeout: 5000 });
  await deleteButton.click();
  await confirmDeleteDialog(page);

  const deleteResponse = await deleteResponsePromise;
  if (deleteResponse) {
    await assertSuccessfulDeleteResponse(deleteResponse, selectedFileIds.length);
  }

  await waitForDeletedFileIdsToDisappear(page, selectedFileIds);
}

async function waitForDeletedFileIdsToDisappear(
  page: Page,
  deletedFileIds: string[]
): Promise<void> {
  await waitForProgressCompletion(page, deletedFileIds.length);
  await waitForFileIdsAbsentFromCurrentFolderApi(page, deletedFileIds);
  await waitForDeletedFileIdsGoneFromCurrentView(page, deletedFileIds);
}

/**
 * 단일 파일 삭제 (파일 행 휴지통 버튼 사용)
 * @param page Playwright Page 객체
 * @param fileName 삭제할 파일명
 */
export async function deleteFileViaTrashButton(page: Page, fileName: string): Promise<void> {
  const fileLocator = page.locator('[data-file-id]').filter({
    hasText: fileName,
  });
  const targetFile = fileLocator.first();

  await expect(targetFile).toBeVisible({ timeout: 15000 });

  const fileId = await targetFile.getAttribute('data-file-id');
  if (!fileId) {
    throw new Error(`File id was not found for "${fileName}" before delete`);
  }

  const deleteResponsePromise = page.waitForResponse(
    (resp) => isExpectedFileDeleteResponse(resp, [fileId]),
    {
      timeout: 60000,
    }
  );

  await targetFile.locator('button[title="삭제"]').click();
  await confirmDeleteDialog(page);

  const deleteResponse = await deleteResponsePromise;
  await assertSuccessfulDeleteResponse(deleteResponse, 1);
  await waitForDeletedFileIdsToDisappear(page, [fileId]);
}

/**
 * 단일 파일 삭제 (컨텍스트 메뉴 사용)
 * @param page Playwright Page 객체
 * @param fileName 삭제할 파일명
 */
export async function deleteFileViaContextMenu(page: Page, fileName: string): Promise<void> {
  const fileLocator = page.locator(`[data-file-id]`).filter({
    hasText: fileName,
  });
  const targetFile = fileLocator.first();

  await expect(targetFile).toBeVisible({ timeout: 15000 });

  const fileId = await targetFile.getAttribute('data-file-id');
  if (!fileId) {
    throw new Error(`File id was not found for "${fileName}" before delete`);
  }

  const deleteResponsePromise = page
    .waitForResponse((resp) => isExpectedFileDeleteResponse(resp, [fileId]), { timeout: 60000 })
    .catch(() => null);

  // 우클릭하여 컨텍스트 메뉴 열기
  await targetFile.click({ button: 'right' });

  // "삭제" 메뉴 항목 클릭
  await clickVisibleContextMenuItem(page, '삭제');

  await confirmDeleteDialog(page);

  // 삭제 완료 대기
  const deleteResponse = await deleteResponsePromise;
  if (deleteResponse) {
    await assertSuccessfulDeleteResponse(deleteResponse, 1);
  }

  await waitForDeletedFileIdsToDisappear(page, [fileId]);
}

/**
 * 파일 이름 변경 (컨텍스트 메뉴 사용)
 * @param page Playwright Page 객체
 * @param fileName 변경할 파일명
 * @param newName 새 파일명
 */
export async function renameFile(page: Page, fileName: string, newName: string): Promise<void> {
  const fileId = await getFileId(page, fileName);
  if (!fileId) {
    throw new Error(`Could not resolve file id for ${fileName}`);
  }

  const renameResponse = await attemptRenameFile(page, fileName, newName).catch(async (error) => {
    if (!isWaitForResponseTimeout(error)) {
      throw error;
    }

    await waitForFileRenamePersistedInCurrentFolderApi(page, fileId, newName);
    return null;
  });

  if (renameResponse && (renameResponse.status() < 200 || renameResponse.status() >= 300)) {
    throw new Error(`Rename failed with status ${renameResponse.status()}`);
  }

  await waitForFileRenamePersistedInCurrentFolderApi(page, fileId, newName);
  await waitForLiveFileRenameInCurrentView(page, fileId, fileName, newName);
}

/**
 * 파일 이름 변경 시도 (성공/실패 응답을 호출자가 검증)
 * @param page Playwright Page 객체
 * @param fileName 변경할 파일명
 * @param newName 새 파일명
 */
export async function attemptRenameFile(
  page: Page,
  fileName: string,
  newName: string
): Promise<Response> {
  const fileLocator = page.locator(`[data-file-id]`).filter({
    hasText: fileName,
  });
  const targetFile = fileLocator.first();
  const fileId = await targetFile.getAttribute('data-file-id');
  if (!fileId) {
    throw new Error(`Could not resolve file id for ${fileName}`);
  }

  // 우클릭하여 컨텍스트 메뉴 열기
  await targetFile.click({ button: 'right' });

  // "이름 수정" 메뉴 항목 클릭
  await clickVisibleContextMenuItem(page, '이름 수정');

  // 인라인 편집 input이 포커스되기 대기
  const editInput = page.locator(`[data-file-id="${fileId}"] input[type="text"]`);
  await editInput.waitFor({ state: 'visible', timeout: 3000 });
  await editInput.focus();

  // 기존 텍스트 전체 선택 후 새 이름 입력
  await page.keyboard.press('Control+A');
  await page.keyboard.type(getInlineRenameInputValue(fileName, newName));

  const renameResponsePromise = page.waitForResponse(isWebhardFileRenameResponse, {
    timeout: WEBHARD_RENAME_RESPONSE_TIMEOUT_MS,
  });

  // Enter 키로 저장
  await page.keyboard.press('Enter');
  return renameResponsePromise;
}

/**
 * 파일 이름 변경 (blur 저장)
 * @param page Playwright Page 객체
 * @param fileName 변경할 파일명
 * @param newName 새 파일명
 */
export async function renameFileOnBlur(
  page: Page,
  fileName: string,
  newName: string
): Promise<void> {
  const fileLocator = page.locator('[data-file-id]').filter({
    hasText: fileName,
  });
  const targetFile = fileLocator.first();
  const fileId = await targetFile.getAttribute('data-file-id');
  if (!fileId) {
    throw new Error(`Could not resolve file id for ${fileName}`);
  }

  await targetFile.click({ button: 'right' });
  await clickVisibleContextMenuItem(page, '이름 수정');
  const editInput = page.locator(`[data-file-id="${fileId}"] input[type="text"]`);
  await editInput.waitFor({ state: 'visible', timeout: 3000 });
  await editInput.focus();

  await page.keyboard.press('Control+A');
  await page.keyboard.type(getInlineRenameInputValue(fileName, newName));

  const renameResponsePromise = page.waitForResponse(isWebhardFileRenameResponse, {
    timeout: WEBHARD_RENAME_RESPONSE_TIMEOUT_MS,
  });

  await page.keyboard.press('Tab');
  const renameResponse = await renameResponsePromise.catch(async (error) => {
    if (!isWaitForResponseTimeout(error)) {
      throw error;
    }

    await waitForFileRenamePersistedInCurrentFolderApi(page, fileId, newName);
    return null;
  });

  if (renameResponse && (renameResponse.status() < 200 || renameResponse.status() >= 300)) {
    throw new Error(`Rename failed with status ${renameResponse.status()}`);
  }

  await waitForFileRenamePersistedInCurrentFolderApi(page, fileId, newName);
  await waitForLiveFileRenameInCurrentView(page, fileId, fileName, newName);
}

/**
 * 파일 이름 변경 취소 (ESC 키)
 * @param page Playwright Page 객체
 * @param fileName 취소할 파일명
 */
export async function cancelRename(page: Page, fileName: string): Promise<void> {
  const fileLocator = page.locator(`[data-file-id]`).filter({
    hasText: fileName,
  });
  const targetFile = fileLocator.first();
  const fileId = await targetFile.getAttribute('data-file-id');
  if (!fileId) {
    throw new Error(`Could not resolve file id for ${fileName}`);
  }

  // 우클릭하여 컨텍스트 메뉴 열기
  await targetFile.click({ button: 'right' });

  // "이름 수정" 메뉴 항목 클릭
  await clickVisibleContextMenuItem(page, '이름 수정');

  // 인라인 편집 input이 포커스되기 대기
  const editInput = page.locator(`[data-file-id="${fileId}"] input[type="text"]`);
  await editInput.waitFor({ state: 'visible', timeout: 3000 });
  await editInput.focus();

  // ESC 키로 취소
  await page.keyboard.press('Escape');

  await page.waitForTimeout(300);
}

/**
 * 테스트 파일 정리 (패턴으로 찾아서 삭제)
 * @param page Playwright Page 객체
 * @param pattern 파일명 패턴 (기본: 'test-')
 */
export async function cleanupTestFiles(page: Page, pattern: string = 'test-'): Promise<void> {
  // 1. 모든 열린 모달 닫기 (여러 종류의 모달 처리)
  const modalSelectors = [
    'text=정말로 모든 데이터를 삭제하시겠습니까?', // 전체 삭제 확인
    'text=전체 삭제 확인', // 전체 삭제 제목
    'text=삭제하시겠습니까?', // 일반 삭제 확인
  ];

  for (const selector of modalSelectors) {
    const modal = page.locator(selector);
    if (await modal.isVisible({ timeout: 500 }).catch(() => false)) {
      // 취소 버튼 클릭 (모달 내에서 찾기)
      const modalContainer = modal.locator(
        'xpath=ancestor::*[contains(@class, "modal") or contains(@class, "dialog") or position()<=3]'
      );
      const cancelButton = modalContainer.locator('button:has-text("취소")').first();

      if (await cancelButton.isVisible({ timeout: 500 }).catch(() => false)) {
        await cancelButton.click();
      } else {
        // ESC 키로 닫기 시도
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(500);
    }
  }

  // ESC 키로 한 번 더 닫기 시도 (잔여 모달 처리)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 2. 패턴과 일치하는 파일 찾기
  const testFiles = page.locator(`[data-file-id]`).filter({
    hasText: pattern,
  });

  const count = await testFiles.count();

  if (count === 0) {
    return; // 정리할 파일 없음
  }

  // 모든 테스트 파일 선택 (Ctrl + 클릭)
  for (let i = 0; i < count; i++) {
    await testFiles.nth(i).click({ modifiers: ['Control'] });
    await page.waitForTimeout(50);
  }

  // 선택된 파일 삭제
  await deleteSelectedFiles(page);
}

/**
 * 파일이 UI에 존재하는지 확인
 * @param page Playwright Page 객체
 * @param fileName 확인할 파일명
 * @returns boolean
 */
export async function fileExists(page: Page, fileName: string): Promise<boolean> {
  const fileLocator = page.locator(`[data-file-id]`).filter({
    hasText: fileName,
  });

  return await fileLocator
    .first()
    .isVisible({ timeout: 2000 })
    .catch(() => false);
}

/**
 * 특정 파일의 ID 가져오기
 * @param page Playwright Page 객체
 * @param fileName 파일명
 * @returns 파일 ID (찾지 못하면 null)
 */
export async function getFileId(page: Page, fileName: string): Promise<string | null> {
  const fileLocator = page.locator(`[data-file-id]`).filter({
    hasText: fileName,
  });

  if (
    await fileLocator
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false)
  ) {
    return await fileLocator.first().getAttribute('data-file-id');
  }

  return null;
}

/**
 * 모든 파일 ID 가져오기
 * @param page Playwright Page 객체
 * @returns 파일 ID 배열
 */
export async function getAllFileIds(page: Page): Promise<string[]> {
  const fileItems = page.locator('[data-file-id]');
  const count = await fileItems.count();

  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = await fileItems.nth(i).getAttribute('data-file-id');
    if (id) {
      ids.push(id);
    }
  }

  return ids;
}

/**
 * ProgressModal이 표시되고 완료될 때까지 대기
 * @param page Playwright Page 객체
 * @param expectedCount 예상 파일 수 (선택사항)
 */
export async function waitForProgressCompletion(page: Page, expectedCount?: number): Promise<void> {
  const progressModal = page.locator('[data-progress-modal]');

  // 1. ProgressModal 표시 대기
  const modalVisible = await progressModal.isVisible({ timeout: 5000 }).catch(() => false);
  if (!modalVisible) {
    return; // 모달 없으면 즉시 완료
  }

  // 2. 완료 표시 대기 (진행률 100%)
  if (expectedCount) {
    await page
      .waitForSelector(`text=${expectedCount} / ${expectedCount}`, {
        timeout: 15000,
      })
      .catch(() => {
        // 정확한 카운트를 찾지 못해도 계속 진행
      });
  }

  // 3. "닫기" 버튼이 활성화될 때까지 대기
  const closeButton = progressModal
    .locator('button')
    .filter({
      hasText: /닫기|확인|Close/i,
    })
    .filter({ hasNot: page.locator('[disabled]') });

  await closeButton.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

  // 4. 자동 닫힘 또는 수동 클릭
  const stillVisible = await progressModal.isVisible({ timeout: 1000 }).catch(() => false);
  if (stillVisible && (await closeButton.isVisible({ timeout: 1000 }).catch(() => false))) {
    await closeButton.click();
  }

  // 5. 모달 완전히 사라질 때까지 대기
  await expect(progressModal).toBeHidden({ timeout: 15000 });
}

/**
 * Empty State 메시지 확인
 * @param page Playwright Page 객체
 * @returns boolean
 */
export async function isEmptyState(page: Page): Promise<boolean> {
  return await expect
    .poll(
      async () => {
        const emptyTexts = ['업로드된 파일이 없습니다', '파일이 없습니다'];

        for (const text of emptyTexts) {
          const isVisible = await page
            .getByText(text, { exact: true })
            .filter({ visible: true })
            .first()
            .isVisible()
            .catch(() => false);

          if (isVisible) {
            return true;
          }
        }

        return false;
      },
      { timeout: 10000 }
    )
    .toBe(true)
    .then(() => true)
    .catch(() => false);
}

// ==================== 폴더 헬퍼 함수 ====================

/**
 * 사이드바와 메인 영역 모두에서 폴더를 찾는 통합 함수
 * @param page Playwright Page 객체
 * @param folderName 찾을 폴더명
 * @param location 'any' | 'main' | 'sidebar' - 검색 위치 지정
 * @returns Locator
 */
export async function findFolderLocator(
  page: Page,
  folderName: string,
  location: 'any' | 'main' | 'sidebar' = 'any'
): Promise<Locator> {
  if (location === 'main') {
    // 메인 영역에서만 검색
    return page
      .locator('main [data-folder-id], main [data-folder-item]')
      .filter({ hasText: folderName });
  }
  if (location === 'sidebar') {
    // 사이드바에서만 검색
    return page
      .locator(
        'aside [data-folder-id], nav [data-folder-id], [role="complementary"] [data-folder-id]'
      )
      .filter({ hasText: folderName });
  }

  // any: 메인 먼저 확인, 없으면 사이드바
  const mainLocator = page
    .locator('main [data-folder-id], main [data-folder-item]')
    .filter({ hasText: folderName });
  const isMainVisible = await mainLocator
    .first()
    .isVisible({ timeout: 2000 })
    .catch(() => false);

  if (isMainVisible) {
    return mainLocator;
  }

  // 사이드바에서 검색
  const sidebarLocator = page
    .locator(
      'aside [data-folder-id], nav [data-folder-id], [role="complementary"] [data-folder-id]'
    )
    .filter({ hasText: folderName });
  let isSidebarVisible = await sidebarLocator
    .first()
    .isVisible({ timeout: 2000 })
    .catch(() => false);

  if (isSidebarVisible) {
    return sidebarLocator;
  }

  // 사이드바에서 안 보이면 스크롤하여 찾기 시도
  const folderTreeArea = page.locator('[data-folder-tree]').first();
  if (await folderTreeArea.isVisible({ timeout: 1000 }).catch(() => false)) {
    console.log(`Scrolling sidebar to find folder "${folderName}"...`);

    // 먼저 맨 아래로 스크롤 (새 폴더는 보통 아래에 있음)
    await folderTreeArea.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await page.waitForTimeout(300);

    // 텍스트로 직접 찾기 시도
    const textLocator = page.locator('aside').locator(`text=${folderName}`).first();
    if (await textLocator.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log(`Found folder by text after scroll down`);
      return page
        .locator('aside [data-folder-id], aside [data-folder-item]')
        .filter({ hasText: folderName });
    }

    // 스크롤 업하면서 찾기
    for (let i = 0; i < 10; i++) {
      await folderTreeArea.evaluate((el) => (el.scrollTop -= 80));
      await page.waitForTimeout(150);

      const textVisible = await textLocator.isVisible({ timeout: 300 }).catch(() => false);
      if (textVisible) {
        console.log(`Found folder by text after scroll up ${i + 1}`);
        return page
          .locator('aside [data-folder-id], aside [data-folder-item]')
          .filter({ hasText: folderName });
      }
    }

    // 맨 위로 스크롤
    await folderTreeArea.evaluate((el) => (el.scrollTop = 0));
    await page.waitForTimeout(200);
  }

  // 텍스트로 전체 검색 (마지막 시도)
  const anyTextLocator = page.locator(`text=${folderName}`).first();
  if (await anyTextLocator.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log(`Found folder by text anywhere on page`);
    return page.locator('[data-folder-id], [data-folder-item]').filter({ hasText: folderName });
  }

  // 마지막으로 전체에서 검색
  return page.locator('[data-folder-id]').filter({ hasText: folderName });
}

/**
 * 새 폴더 생성 (사이드바 컨텍스트 메뉴 사용)
 * 관리자 권한 필요: 사이드바 우클릭 → "새 폴더 생성"
 * @param page Playwright Page 객체
 * @param folderName 생성할 폴더명
 * @param parentFolderId 부모 폴더 ID (null이면 현재 폴더에 생성)
 * @returns 생성된 폴더 ID (API 응답에서 추출, 실패 시 null)
 */
/**
 * 직접 API 호출로 폴더를 생성합니다.
 * UI 상호작용 없이 안정적으로 폴더를 생성합니다.
 */
export async function createFolderViaAPI(
  page: Page,
  folderName: string,
  parentFolderId?: string | null,
  companyId?: number | null
): Promise<string | null> {
  console.log(`Creating folder via API: "${folderName}" (parent: ${parentFolderId || 'root'})`);

  const maxRetries = 5;
  let lastResponse: { status: number; ok: boolean; data: Record<string, unknown> } | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      // 재시도 전 대기 (지수 백오프: 5초, 10초, 20초, 40초...)
      const waitTime = Math.pow(2, attempt) * 2500;
      console.log(
        `Rate limited, waiting ${waitTime / 1000}s before retry (attempt ${attempt + 1}/${maxRetries})...`
      );
      await page.waitForTimeout(waitTime);
    }

    const response = await page.evaluate(
      async ({ name, parentId, companyId }) => {
        const res = await fetch('/api/webhard/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            parentId: parentId || null,
            companyId: companyId ?? null,
          }),
        });
        const data = await res.json();
        return {
          status: res.status,
          ok: res.ok,
          data,
        };
      },
      { name: folderName, parentId: parentFolderId, companyId }
    );

    lastResponse = response;

    // 429 에러가 아니면 바로 결과 반환
    if (response.status !== 429) {
      if (!response.ok) {
        console.error('Folder creation failed:', response);
        return null;
      }

      const folderId = response.data?.id as string;
      console.log(`Folder created via API with ID: ${folderId}`);

      const currentFolderId = getCurrentFolderId(page);
      const shouldVerifyInCurrentView = !parentFolderId || currentFolderId === parentFolderId;

      if (shouldVerifyInCurrentView) {
        await refreshCurrentWebhardView(page);
        const rendered = await waitForFolderRenderAfterCreate(page, folderName);

        if (rendered) {
          console.log(`Folder "${folderName}" is now visible after API creation`);
        } else {
          console.warn(
            `Folder "${folderName}" was created by API but was not confirmed in the refreshed UI; caller assertion will verify visibility`
          );
        }
      } else {
        console.log(
          `Folder "${folderName}" created outside the current view; skipping UI visibility check`
        );
      }

      return folderId;
    }
  }

  // 모든 재시도 실패
  console.error('Folder creation failed after all retries:', lastResponse);
  return null;
}

/**
 * 폴더를 생성합니다.
 * 기본적으로 API 직접 호출 방식을 사용합니다.
 */
export async function createFolder(
  page: Page,
  folderName: string,
  parentFolderId?: string
): Promise<string | null> {
  // API 직접 호출 방식 사용 (더 안정적)
  return createFolderViaAPI(page, folderName, parentFolderId);
}

/**
 * API를 통해 폴더를 삭제합니다.
 * UI 상호작용 없이 안정적으로 폴더를 삭제합니다.
 */
interface DeleteFolderViaAPIOptions {
  refreshAfterDelete?: boolean;
}

export async function deleteFolderViaAPI(
  page: Page,
  folderId: string,
  options: DeleteFolderViaAPIOptions = {}
): Promise<boolean> {
  console.log(`Deleting folder ${folderId} via API...`);

  const maxRetries = 5;
  let lastResponse: { status: number; ok: boolean; data: Record<string, unknown> } | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const waitTime = Math.pow(2, attempt) * 2500;
      console.log(
        `Rate limited, waiting ${waitTime / 1000}s before retry (attempt ${attempt + 1}/${maxRetries})...`
      );
      await page.waitForTimeout(waitTime);
    }

    const response = await page.evaluate(
      async ({ folderId }) => {
        // DELETE /api/webhard/folders/{id}/delete
        const res = await fetch(`/api/webhard/folders/${folderId}/delete`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        });
        let data = {};
        const text = await res.text();
        if (text) {
          try {
            data = JSON.parse(text);
          } catch {
            data = { message: text };
          }
        }
        return {
          status: res.status,
          ok: res.ok,
          data,
        };
      },
      { folderId }
    );

    lastResponse = response;

    if (response.status !== 429) {
      if (!response.ok) {
        console.error('Folder delete failed:', response);
        return false;
      }

      console.log(`Folder ${folderId} deleted via API`);

      if (options.refreshAfterDelete) {
        await goToWebhardRoot(page);
      }

      return true;
    }
  }

  console.error('Folder delete failed after all retries:', lastResponse);
  return false;
}

/**
 * API를 통해 폴더 이름을 변경합니다.
 * UI 상호작용 없이 안정적으로 폴더 이름을 변경합니다.
 */
export async function renameFolderViaAPI(
  page: Page,
  folderId: string,
  newName: string
): Promise<boolean> {
  console.log(`Renaming folder ${folderId} to "${newName}" via API...`);

  const maxRetries = 5;
  let lastResponse: { status: number; ok: boolean; data: Record<string, unknown> } | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const waitTime = Math.pow(2, attempt) * 2500;
      console.log(
        `Rate limited, waiting ${waitTime / 1000}s before retry (attempt ${attempt + 1}/${maxRetries})...`
      );
      await page.waitForTimeout(waitTime);
    }

    const response = await page.evaluate(
      async ({ folderId, newName }) => {
        // 올바른 엔드포인트: /api/webhard/folders/{id}/rename
        const res = await fetch(`/api/webhard/folders/${folderId}/rename`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName }),
        });
        // 응답이 비어있을 수 있음 (204 No Content)
        let data = {};
        const text = await res.text();
        if (text) {
          try {
            data = JSON.parse(text);
          } catch {
            data = { message: text };
          }
        }
        return {
          status: res.status,
          ok: res.ok,
          data,
        };
      },
      { folderId, newName }
    );

    lastResponse = response;

    if (response.status !== 429) {
      if (!response.ok) {
        console.error('Folder rename failed:', response);
        return false;
      }

      console.log(`Folder renamed to "${newName}" via API`);

      await refreshCurrentWebhardView(page);

      return true;
    }
  }

  console.error('Folder rename failed after all retries:', lastResponse);
  return false;
}

/**
 * UI를 통해 폴더를 생성합니다 (레거시 방식).
 * 참고: 이 방식은 불안정할 수 있으므로 createFolderViaAPI 권장
 */
export async function createFolderViaUI(
  page: Page,
  folderName: string,
  parentFolderId?: string
): Promise<string | null> {
  // 부모 폴더가 있으면 먼저 해당 폴더의 컨텍스트 메뉴에서 생성
  if (parentFolderId) {
    const parentFolder = page.locator(`[data-folder-id="${parentFolderId}"]`);
    if (
      await parentFolder
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      await parentFolder.first().click({ button: 'right' });
      await page.waitForTimeout(300);

      // 컨텍스트 메뉴에서 "새 폴더 생성" 클릭
      const createBtn = page.locator('text=새 폴더 생성');
      if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await createBtn.click();
      }
    }
  } else {
    // 사이드바에서 우클릭하여 컨텍스트 메뉴 열기
    // FolderTree의 폴더 항목 우클릭이 가장 안정적 (자체 컨텍스트 메뉴 사용)
    let contextMenuShown = false;

    // 루트 레벨 폴더 생성을 위해 사이드바 컨텍스트 메뉴 우선 사용

    // 방법 1: aside 전체 영역에서 우클릭 (WebhardSidebar의 컨텍스트 메뉴 - 루트 레벨 폴더 생성)
    const aside = page.locator('aside').first();
    if (await aside.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('Trying sidebar area right-click for root folder...');
      // 폴더 항목이 아닌 빈 공간에서 우클릭 (상단 버튼 영역 아래)
      await aside.click({ button: 'right', position: { x: 100, y: 280 } });
      await page.waitForTimeout(500);

      const contextMenuBtn = page
        .locator('.fixed button')
        .filter({ hasText: '새 폴더 생성' })
        .first();
      if (await contextMenuBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('Sidebar context menu "새 폴더 생성" found, clicking...');
        await contextMenuBtn.click();
        await page.waitForTimeout(300);
        contextMenuShown = true;
      }
    }

    // 방법 2: 폴더 옵션 버튼 (⋮) 클릭 (서브폴더 생성됨 - 폴백)
    if (!contextMenuShown) {
      const folderMenuBtn = page
        .locator('aside [data-folder-item] button[title="폴더 옵션"]')
        .first();
      if (await folderMenuBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('Trying folder options button (⋮) for subfolder...');
        await folderMenuBtn.click();
        await page.waitForTimeout(500);

        const contextMenuBtn = page
          .locator('.fixed button')
          .filter({ hasText: '새 폴더 생성' })
          .first();
        if (await contextMenuBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('Context menu "새 폴더 생성" found, clicking...');
          await contextMenuBtn.click();
          await page.waitForTimeout(300);
          contextMenuShown = true;
        }
      }
    }

    // 방법 3: 폴더 항목에서 직접 우클릭 (서브폴더 생성됨 - 폴백)
    if (!contextMenuShown) {
      const sidebarFolderItem = page.locator('aside [data-folder-item]').first();
      if (await sidebarFolderItem.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('Trying folder item right-click...');
        await sidebarFolderItem.click({ button: 'right' });
        await page.waitForTimeout(500);

        const contextMenuBtn = page
          .locator('.fixed button')
          .filter({ hasText: '새 폴더 생성' })
          .first();
        if (await contextMenuBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('Context menu "새 폴더 생성" found, clicking...');
          await contextMenuBtn.click();
          await page.waitForTimeout(300);
          contextMenuShown = true;
        }
      }
    }

    if (!contextMenuShown) {
      console.warn(
        'Context menu "새 폴더 생성" not found - user may not be admin or sidebar not visible'
      );
      // 스크린샷 저장 (디버깅용)
      await page.screenshot({ path: 'test-results/createFolder-failed.png' });
      return null;
    }
  }

  // 폴더 이름 입력 필드가 나타날 때까지 대기 (애니메이션 고려)
  await page.waitForTimeout(500);

  // 여러 방법으로 입력 필드 찾기
  let folderInput = page.locator('input[placeholder="폴더 이름"]');

  // 첫 번째 시도: 기본 플레이스홀더로 찾기
  if (!(await folderInput.isVisible({ timeout: 3000 }).catch(() => false))) {
    console.log('Trying to find input with text type in sidebar...');
    // 두 번째 시도: aside 내의 모든 text input 중 빈 것 찾기
    folderInput = page.locator('aside input[type="text"]').first();
  }

  if (!(await folderInput.isVisible({ timeout: 3000 }).catch(() => false))) {
    console.log('Trying to find any new input in folder tree...');
    // 세 번째 시도: data-folder-tree 영역 내의 input
    folderInput = page.locator('[data-folder-tree] input').first();
  }

  // 디버깅: 현재 상태 스크린샷
  if (!(await folderInput.isVisible({ timeout: 2000 }).catch(() => false))) {
    console.warn('Folder input still not visible, taking debug screenshot...');
    await page.screenshot({ path: 'test-results/createFolder-input-not-found.png' });
    throw new Error('Folder name input field not found');
  }

  console.log('Found folder input, filling name...');

  // 폴더 이름 입력 - fill 대신 type 사용하여 더 확실한 입력
  await folderInput.focus();
  await folderInput.fill(''); // 기존 값 클리어
  await page.waitForTimeout(100);

  // 한 글자씩 타이핑하는 대신 type 사용
  await folderInput.type(folderName, { delay: 10 });
  await page.waitForTimeout(200); // React 상태 업데이트 대기

  // 입력값 확인
  const inputValue = await folderInput.inputValue();
  console.log(`Input value after typing: "${inputValue}"`);

  // API 응답 대기 시작 (Enter 누르기 전에 리스너 설정)
  const responsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/webhard/folders') && resp.request().method() === 'POST',
    { timeout: 15000 }
  );

  // Enter 키로 생성 확인
  await page.keyboard.press('Enter');
  console.log('Enter key pressed, waiting for API response...');

  // API 응답 대기 및 폴더 ID 추출
  let folderId: string | null = null;
  const response = await responsePromise.catch((err) => {
    console.warn('Folder creation API response timeout:', err.message);
    return null;
  });

  if (response) {
    try {
      const data = await response.json();
      // API 응답 형식에 따라 ID 추출 (data.id 또는 data.data.id)
      folderId = data?.id || data?.data?.id || null;
      console.log('Created folder with ID:', folderId);
    } catch {
      console.warn('Failed to parse folder creation response');
    }
  }

  // 폴더 목록 새로고침 대기 (React Query invalidation)
  await page
    .waitForResponse(
      (resp) => resp.url().includes('/api/webhard/folders') && resp.request().method() === 'GET',
      { timeout: 5000 }
    )
    .catch(() => {
      console.warn('Folder list refresh timeout - proceeding anyway');
    });

  // 생성된 폴더가 UI에 표시될 때까지 대기 (더 robust한 대기)
  await page.waitForTimeout(500);

  // 생성된 폴더가 보이는지 확인 (사이드바 또는 메인)
  let folderVisible = await page
    .locator(`text=${folderName}`)
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false);

  if (!folderVisible) {
    console.log(`Folder "${folderName}" not immediately visible, trying scroll...`);

    // 사이드바에서 스크롤하여 찾기 시도
    const folderTreeArea = page.locator('[data-folder-tree]').first();
    if (await folderTreeArea.isVisible({ timeout: 1000 }).catch(() => false)) {
      // 맨 아래로 스크롤 (새 폴더는 보통 아래에 추가됨)
      await folderTreeArea.evaluate((el) => (el.scrollTop = el.scrollHeight));
      await page.waitForTimeout(500);
      folderVisible = await page
        .locator(`text=${folderName}`)
        .first()
        .isVisible({ timeout: 2000 })
        .catch(() => false);
    }
  }

  if (!folderVisible) {
    console.log(`Folder still not visible, navigating away and back...`);
    // 페이지를 완전히 벗어났다가 다시 돌아오기 (캐시 강제 새로고침)
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(500);
    await page.goto('/webhard', { waitUntil: 'domcontentloaded' });
    await waitForWebhardShell(page);
    await page.waitForTimeout(1500);

    // 네비게이션 후 다시 확인
    folderVisible = await page
      .locator(`text=${folderName}`)
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (!folderVisible) {
      // 마지막 시도: hard reload
      console.log(`Still not visible, trying hard reload...`);
      await refreshCurrentWebhardView(page);
      folderVisible = await page
        .locator(`text=${folderName}`)
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);
    }

    if (!folderVisible) {
      console.warn(`Warning: Folder "${folderName}" may not be visible even after navigation`);
    } else {
      console.log(`Folder "${folderName}" is now visible after navigation`);
    }
  }

  return folderId;
}

/**
 * 메인 콘텐츠 영역에서 폴더 존재 여부 확인
 * (서브폴더로 생성된 경우에도 메인 영역에서 확인 가능)
 * @param page Playwright Page 객체
 * @param folderName 확인할 폴더명
 * @returns boolean
 */
export async function folderExistsInMain(page: Page, folderName: string): Promise<boolean> {
  // 메인 콘텐츠 영역에서 폴더 찾기
  const folderInMain = page
    .locator('main')
    .locator('[data-folder-item]')
    .filter({ hasText: folderName });
  if (
    await folderInMain
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false)
  ) {
    return true;
  }

  // data-folder-item이 없으면 텍스트로 확인
  const folderByText = page.locator('main').locator(`text=${folderName}`);
  return await folderByText
    .first()
    .isVisible({ timeout: 1000 })
    .catch(() => false);
}

/**
 * 메인 콘텐츠 영역에서 폴더 ID 가져오기
 * @param page Playwright Page 객체
 * @param folderName 폴더명
 * @returns 폴더 ID (찾지 못하면 null)
 */
export async function getFolderIdFromMain(page: Page, folderName: string): Promise<string | null> {
  // 메인 영역에서 폴더 찾기
  const folderInMain = page
    .locator('main')
    .locator('[data-folder-id]')
    .filter({ hasText: folderName });
  if (
    await folderInMain
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false)
  ) {
    return await folderInMain.first().getAttribute('data-folder-id');
  }
  return null;
}

/**
 * 메인 콘텐츠 영역에서 폴더 삭제 (컨텍스트 메뉴 사용)
 * @param page Playwright Page 객체
 * @param folderName 삭제할 폴더명
 */
export async function deleteFolderInMain(page: Page, folderName: string): Promise<void> {
  // 메인 영역에서 폴더 찾기 (data-folder-item 속성 사용)
  const folderInMain = page
    .locator('main [data-folder-item]')
    .filter({ hasText: folderName })
    .first();

  if (!(await folderInMain.isVisible({ timeout: 3000 }).catch(() => false))) {
    // 폴더가 메인에 없으면 텍스트로 다시 시도
    const folderByText = page.locator('main').locator(`text=${folderName}`).first();
    if (!(await folderByText.isVisible({ timeout: 2000 }).catch(() => false))) {
      console.warn(`Folder ${folderName} not found in main area`);
      return;
    }
    await folderByText.click({ button: 'right' });
  } else {
    // 우클릭하여 컨텍스트 메뉴 열기
    await folderInMain.click({ button: 'right' });
  }

  await page.waitForTimeout(500);

  // 컨텍스트 메뉴에서 "삭제" 항목 찾기 (fixed position 요소 내에서)
  const deleteMenuInContext = page
    .locator('.fixed')
    .getByText('삭제', { exact: true })
    .filter({ visible: true })
    .first();
  if (await deleteMenuInContext.isVisible({ timeout: 2000 }).catch(() => false)) {
    await deleteMenuInContext.click();
  } else {
    // 대안: WebhardContextMenu의 삭제 버튼 (data-action 속성 사용)
    const deleteBtn = page
      .locator('[data-context-menu] button')
      .filter({ hasText: '삭제' })
      .filter({ visible: true })
      .first();
    if (await deleteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await deleteBtn.click();
    } else {
      console.warn('Delete menu not found in context menu');
      return;
    }
  }

  await page.waitForTimeout(300);

  // 확인 모달이 있으면 확인 버튼 클릭 (모달 내의 삭제/확인 버튼)
  const confirmModal = page
    .locator('[role="dialog"], .fixed')
    .filter({ hasText: /삭제하시겠습니까|확인/ });
  if (await confirmModal.isVisible({ timeout: 2000 }).catch(() => false)) {
    const confirmBtn = confirmModal
      .locator('button')
      .filter({ hasText: /삭제|확인/ })
      .first();
    if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmBtn.click();
    }
  }

  // API 응답 대기
  await page
    .waitForResponse(
      (resp) => resp.url().includes('/api/webhard/folders') && resp.request().method() === 'DELETE',
      { timeout: 15000 }
    )
    .catch(() => {
      console.warn('Folder delete API response timeout - proceeding anyway');
    });

  await page.waitForTimeout(1000);
}

/**
 * 폴더 삭제 (컨텍스트 메뉴 사용)
 * 사이드바와 메인 콘텐츠 영역 모두에서 폴더를 검색합니다.
 * @param page Playwright Page 객체
 * @param folderName 삭제할 폴더명
 */
export async function deleteFolderViaContextMenu(page: Page, folderName: string): Promise<void> {
  // 사이드바와 메인 영역 모두에서 폴더 찾기
  const folderLocator = await findFolderLocator(page, folderName);

  // 폴더가 보이는지 확인
  const isVisible = await folderLocator
    .first()
    .isVisible({ timeout: 5000 })
    .catch(() => false);
  if (!isVisible) {
    console.warn(`Folder "${folderName}" not found in main or sidebar`);
    return;
  }

  // 우클릭하여 컨텍스트 메뉴 열기
  await folderLocator.first().click({ button: 'right' });

  // 잠시 대기 (컨텍스트 메뉴 표시)
  await page.waitForTimeout(300);

  // "폴더 삭제" 또는 "삭제" 메뉴 항목 클릭
  const deleteMenu = page
    .locator('[role="menuitem"], [data-context-menu] button, .fixed button')
    .filter({ hasText: /폴더 삭제|삭제/ })
    .filter({ visible: true })
    .first();

  if (await deleteMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
    await deleteMenu.click();
  } else {
    console.warn('Delete menu not found - trying direct text click');
    await clickVisibleContextMenuItem(page, /폴더 삭제|삭제/);
  }

  // 확인 모달이 있으면 확인 버튼 클릭
  const confirmBtn = page.locator('button').filter({ hasText: /확인|삭제/ });
  if (
    await confirmBtn
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false)
  ) {
    await confirmBtn.first().click();
  }

  // API 응답 대기
  await page
    .waitForResponse(
      (resp) => resp.url().includes('/api/webhard/folders') && resp.request().method() === 'DELETE',
      { timeout: 15000 }
    )
    .catch(() => {
      console.warn('Folder delete API response timeout - proceeding anyway');
    });

  await page.waitForTimeout(1000);
}

/**
 * 폴더 이름 변경 (컨텍스트 메뉴 사용)
 * 사이드바와 메인 콘텐츠 영역 모두에서 폴더를 검색합니다.
 * @param page Playwright Page 객체
 * @param folderName 변경할 폴더명
 * @param newName 새 폴더명
 */
export async function renameFolder(page: Page, folderName: string, newName: string): Promise<void> {
  // 사이드바와 메인 영역 모두에서 폴더 찾기
  const folderLocator = await findFolderLocator(page, folderName);

  // 폴더가 보이는지 확인
  const isVisible = await folderLocator
    .first()
    .isVisible({ timeout: 5000 })
    .catch(() => false);
  if (!isVisible) {
    throw new Error(`Folder "${folderName}" not found in main or sidebar`);
  }

  const folderItem = folderLocator.first();

  // 컨텍스트 메뉴를 여는 함수
  const openContextMenu = async (): Promise<boolean> => {
    // 방법 1: 폴더 옵션 버튼(⋮) 직접 클릭 (가장 안정적)
    console.log(`Looking for folder options button for "${folderName}"...`);

    // 폴더 아이템 내의 버튼 또는 페이지 전체에서 폴더명 옆의 버튼 찾기
    const optionsBtnSelectors = [
      // 사이드바에서 폴더명이 있는 요소 옆의 버튼
      `[data-folder-id] button[title="폴더 옵션"]`,
      `aside button[title="폴더 옵션"]`,
      `[role="complementary"] button[title="폴더 옵션"]`,
    ];

    // 폴더명으로 정확히 매칭되는 폴더 아이템 찾기
    for (const selector of optionsBtnSelectors) {
      const btns = page.locator(selector);
      const count = await btns.count();

      for (let i = 0; i < count; i++) {
        const btn = btns.nth(i);
        const parentText = await btn
          .locator('..')
          .textContent()
          .catch(() => '');

        if (parentText && parentText.includes(folderName)) {
          console.log(`Found options button for "${folderName}", using mouse.click()...`);

          // 스크롤하여 요소를 뷰포트에 가져오기
          const box = await btn.boundingBox();
          if (!box) {
            console.log('Could not get button bounding box');
            continue;
          }

          // 스크롤하여 버튼이 보이게
          await btn.evaluate((el: HTMLElement) => {
            el.scrollIntoView({ behavior: 'instant', block: 'center' });
            // opacity 변경
            el.style.opacity = '1';
          });
          await page.waitForTimeout(300);

          // boundingBox 다시 가져오기 (스크롤 후)
          const newBox = await btn.boundingBox();
          if (newBox) {
            // page.mouse.click()으로 실제 마우스 클릭
            const x = newBox.x + newBox.width / 2;
            const y = newBox.y + newBox.height / 2;
            console.log(`Clicking at coordinates (${x}, ${y})...`);
            await page.mouse.click(x, y);
            await page.waitForTimeout(1000);

            // 컨텍스트 메뉴가 열렸는지 확인
            const menuVisible = await page
              .locator('.fixed.z-50, .fixed.bg-white')
              .isVisible({ timeout: 3000 })
              .catch(() => false);
            if (menuVisible) {
              console.log('Context menu opened via mouse.click()');
              return true;
            }
          }
          // 이미 찾아서 클릭했으니 루프 종료
          break;
        }
      }
    }

    // 방법 2: 폴더 아이템에서 버튼 직접 찾기
    console.log('Trying to find button within folder item...');
    await folderItem.hover();
    await page.waitForTimeout(500);

    const btnInItem = folderItem.locator('button').first();
    const btnCount = await btnInItem.count();
    if (btnCount > 0) {
      // JavaScript로 직접 클릭
      await btnInItem.evaluate((el: HTMLElement) => {
        el.click();
      });
      await page.waitForTimeout(800);

      const menuVisible = await page
        .locator('.fixed.z-50, .fixed.bg-white')
        .isVisible({ timeout: 2000 })
        .catch(() => false);
      if (menuVisible) {
        console.log('Context menu opened via folder item button');
        return true;
      }
    }

    // 방법 3: 폴더 아이템에 contextmenu 이벤트 직접 발생
    console.log(`Trying contextmenu event on folder "${folderName}"...`);
    await folderItem.evaluate((el: HTMLElement) => {
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      const rect = el.getBoundingClientRect();
      const event = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        button: 2,
      });
      el.dispatchEvent(event);
    });
    await page.waitForTimeout(1000);

    // 컨텍스트 메뉴가 열렸는지 확인
    const contextMenuVisible = await page
      .locator('.fixed.z-50, .fixed.bg-white')
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    if (contextMenuVisible) {
      console.log('Context menu opened via contextmenu event');
      return true;
    }

    // 방법 4: Playwright의 우클릭
    console.log(`Trying Playwright right-click on "${folderName}"...`);
    try {
      await folderItem.click({ button: 'right', force: true, timeout: 3000 });
      await page.waitForTimeout(800);

      const menuAfterRightClick = await page
        .locator('.fixed.z-50, .fixed.bg-white')
        .isVisible({ timeout: 2000 })
        .catch(() => false);
      if (menuAfterRightClick) {
        console.log('Context menu opened via Playwright right-click');
        return true;
      }
    } catch {
      console.log('Playwright right-click failed');
    }

    return false;
  };

  // 컨텍스트 메뉴 열기 (최대 3회 시도)
  let menuOpened = false;
  for (let i = 0; i < 3; i++) {
    menuOpened = await openContextMenu();
    if (menuOpened) break;
    console.log(`Context menu not opened, retrying (${i + 1}/3)...`);
    await page.waitForTimeout(500);
  }

  if (!menuOpened) {
    throw new Error(`Failed to open context menu for folder "${folderName}"`);
  }

  // 컨텍스트 메뉴에서 "이름 변경" 찾기
  // 여러 방법으로 시도
  const menuSelectors = [
    '.fixed.z-50 button:has-text("이름 변경")',
    '.fixed button:has-text("이름 변경")',
    'button:has-text("이름 변경")',
    'text=이름 변경',
  ];

  let renameClicked = false;
  for (const selector of menuSelectors) {
    const renameMenu = page.locator(selector).first();
    if (await renameMenu.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log(`Found "이름 변경" with selector: ${selector}`);
      await renameMenu.click();
      renameClicked = true;
      break;
    }
  }

  if (!renameClicked) {
    // 현재 페이지 상태 로그
    const pageContent = await page.content();
    console.error('Page contains "이름 변경":', pageContent.includes('이름 변경'));
    throw new Error('Rename menu not found in context menu');
  }

  // 인라인 편집 input 찾기 (여러 방법 시도)
  await page.waitForTimeout(500);

  // 방법 1: 포커스된 input 찾기
  let renameInput = page.locator('input[type="text"]:focus');
  let inputVisible = await renameInput.isVisible({ timeout: 2000 }).catch(() => false);

  // 방법 2: 현재 폴더명을 값으로 가진 input 찾기
  if (!inputVisible) {
    const inputs = page.locator('input[type="text"]');
    const inputCount = await inputs.count();
    for (let i = 0; i < inputCount; i++) {
      const input = inputs.nth(i);
      if (await input.isVisible().catch(() => false)) {
        const value = await input.inputValue().catch(() => '');
        if (value.includes(folderName) || value === folderName) {
          renameInput = input;
          inputVisible = true;
          break;
        }
      }
    }
  }

  if (!inputVisible) {
    throw new Error('Rename input not found');
  }

  // 기존 텍스트 전체 선택 후 새 이름 입력
  await renameInput.focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(newName);

  // Enter 키로 저장
  await page.keyboard.press('Enter');

  // API 응답 대기
  await page
    .waitForResponse(
      (resp) => resp.url().includes('/api/webhard/folders') && resp.request().method() === 'PATCH',
      { timeout: 10000 }
    )
    .catch(() => {
      console.warn('Folder rename API response timeout - proceeding anyway');
    });

  await page.waitForTimeout(500);
}

/**
 * 폴더가 존재하는지 확인 (사이드바 + 메인 영역 모두 검색)
 * @param page Playwright Page 객체
 * @param folderName 확인할 폴더명
 * @param location 'any' | 'main' | 'sidebar' - 검색 위치 지정
 * @returns boolean
 */
export async function folderExists(
  page: Page,
  folderName: string,
  location: 'any' | 'main' | 'sidebar' = 'any'
): Promise<boolean> {
  const folderLocator = await findFolderLocator(page, folderName, location);
  return await folderLocator
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false);
}

/**
 * 특정 폴더 클릭하여 이동
 * 사이드바와 메인 콘텐츠 영역 모두에서 폴더를 검색합니다.
 * @param page Playwright Page 객체
 * @param folderName 클릭할 폴더명
 */
export async function navigateToFolder(page: Page, folderName: string): Promise<void> {
  // 사이드바와 메인 영역 모두에서 폴더 찾기
  const folderLocator = await findFolderLocator(page, folderName);

  // 폴더가 보이는지 확인
  const isVisible = await folderLocator
    .first()
    .isVisible({ timeout: 5000 })
    .catch(() => false);
  if (!isVisible) {
    console.warn(`Folder "${folderName}" not found for navigation`);
    return;
  }

  // 메인 영역의 폴더는 더블클릭, 사이드바는 싱글클릭
  const mainLocator = page
    .locator('main [data-folder-id], main [data-folder-item]')
    .filter({ hasText: folderName });
  const isInMain = await mainLocator
    .first()
    .isVisible({ timeout: 1000 })
    .catch(() => false);

  if (isInMain) {
    // 메인 영역: 더블클릭으로 폴더 진입
    await mainLocator.first().dblclick();
  } else {
    // 사이드바: 싱글클릭
    await folderLocator.first().click();
  }

  // 폴더 이동 완료 대기
  await page.waitForURL(/folderId=/, { timeout: 5000 }).catch(() => {
    console.warn('Folder navigation URL change timeout');
  });

  await page.waitForTimeout(500);
}

/**
 * 폴더 ID 가져오기 (사이드바 + 메인 영역 모두 검색)
 * @param page Playwright Page 객체
 * @param folderName 폴더명
 * @returns 폴더 ID (찾지 못하면 null)
 */
export async function getFolderId(page: Page, folderName: string): Promise<string | null> {
  const folderLocator = await findFolderLocator(page, folderName);

  if (
    await folderLocator
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false)
  ) {
    return await folderLocator.first().getAttribute('data-folder-id');
  }

  return null;
}
