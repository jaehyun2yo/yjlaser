import { test, expect } from './fixtures/auth'; // ✅ Fixture로 세션 재사용
import { type APIResponse, type Page } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  uploadFiles,
  selectFiles,
  selectAllItemsInCurrentView,
  deleteSelectedFiles,
  deleteFileViaContextMenu,
  deleteFileViaTrashButton,
  confirmDeleteDialog,
  renameFile,
  attemptRenameFile,
  renameFileOnBlur,
  cancelRename,
  cleanupTestFiles,
  createFolder,
  deleteFolderViaAPI,
  fileExists,
  getFileId,
  getAllFileIds,
  isEmptyState,
  dismissAllModals,
  waitForVisibleTextToDisappear,
} from './helpers/webhard-helpers';
import {
  TEST_FILES,
  createBatchTestFiles,
  createTestFileByExtension,
} from './helpers/file-helpers';

interface BrowserFileDescriptor {
  name: string;
  mimeType: string;
  buffer: number[];
}

interface WebhardFileRecord {
  id?: string;
  name?: string;
  folderId?: string | null;
  folder_id?: string | null;
}

function isRetriableTransportError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /ECONNRESET|ECONNABORTED|ETIMEDOUT/.test(error.message);
}

function isWebhardFileRecord(value: unknown): value is WebhardFileRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.name === 'string' || typeof record.id === 'string';
}

function getFileRecords(body: unknown): WebhardFileRecord[] {
  if (!body || typeof body !== 'object') return [];
  const record = body as Record<string, unknown>;
  const candidates = [record.files, (record.data as Record<string, unknown> | undefined)?.files];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isWebhardFileRecord);
    }
  }
  return [];
}

async function deleteMissingFile(page: Page): Promise<APIResponse> {
  const url = '/api/webhard/files/00000000-0000-4000-8000-000000000404/delete';
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await page.request.delete(url, { timeout: 30000 });
    } catch (error) {
      if (!isRetriableTransportError(error) || attempt === 3) {
        throw error;
      }

      lastError = error;
      await page.waitForTimeout(attempt * 500);
    }
  }

  throw lastError;
}

async function expectFileInFolderApi(
  page: Page,
  folderId: string,
  fileName: string
): Promise<void> {
  await expect
    .poll(
      async () => {
        const params = new URLSearchParams({
          folderId,
          page: '1',
          limit: '500',
          sortBy: 'date',
          sortOrder: 'desc',
        });
        const response = await page.request.get(`/api/webhard/files?${params.toString()}`, {
          failOnStatusCode: false,
          timeout: 60000,
        });
        if (!response.ok()) return false;
        const files = getFileRecords(await response.json());
        return files.some((file) => {
          const fileFolderId = file.folderId ?? file.folder_id ?? null;
          return file.name === fileName && fileFolderId === folderId;
        });
      },
      { timeout: 60000 }
    )
    .toBe(true);
}

async function createSparsePdfFile(name: string, sizeInBytes: number): Promise<string> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'yjlaser-e2e-upload-'));
  const filePath = path.join(dir, name);
  const handle = await fs.promises.open(filePath, 'w');

  try {
    const footer = '\n%%EOF';
    await handle.write('%PDF-1.4\n', 0, 'ascii');
    await handle.truncate(sizeInBytes);
    await handle.write(footer, sizeInBytes - footer.length, 'ascii');
  } finally {
    await handle.close();
  }

  return filePath;
}

async function uploadFilesFromDisk(
  page: Page,
  filePaths: string[],
  fileNames: string[]
): Promise<void> {
  const fileInput = page
    .locator('[data-testid="file-upload-input"]')
    .or(page.locator('input[type="file"]').first());
  const confirmResponsePromise = page
    .waitForResponse(
      (response) =>
        response.url().includes('/api/webhard/upload/batch-complete') &&
        response.request().method() === 'POST',
      { timeout: 180000 }
    )
    .catch(() => null);

  await fileInput.setInputFiles(filePaths);

  const folderModal = page.locator('text=업로드할 폴더 선택');
  if (await folderModal.isVisible({ timeout: 5000 }).catch(() => false)) {
    await page.locator('button').filter({ hasText: '선택 완료' }).click();
  }

  const confirmResponse = await confirmResponsePromise;
  expect(confirmResponse, 'batch-complete response should be observed').not.toBeNull();
  expect(confirmResponse?.ok()).toBe(true);
  await dismissAllModals(page);

  for (const fileName of fileNames) {
    await expect(page.locator(`text=${fileName}`).first()).toBeVisible({ timeout: 120000 });
  }
}

async function dispatchSyntheticFileInputChange(
  page: Page,
  files: Array<{ name: string; size: number; mimeType: string }>
): Promise<void> {
  const input = page.locator('[data-testid="file-upload-input"]').first();
  await input.evaluate((element, descriptors) => {
    const syntheticFiles = descriptors.map((descriptor) => {
      const file = new File(['x'], descriptor.name, { type: descriptor.mimeType });
      Object.defineProperty(file, 'size', {
        configurable: true,
        value: descriptor.size,
      });
      return file;
    });

    Object.defineProperty(element, 'files', {
      configurable: true,
      value: syntheticFiles,
    });
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, files);
}

async function dropFilesOnWebhard(page: Page, files: File[]): Promise<void> {
  const descriptors: BrowserFileDescriptor[] = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      mimeType: file.type,
      buffer: Array.from(new Uint8Array(await file.arrayBuffer())),
    }))
  );
  const confirmResponsePromise = page
    .waitForResponse(
      (response) =>
        response.url().includes('/api/webhard/upload/batch-complete') &&
        response.request().method() === 'POST',
      { timeout: 90000 }
    )
    .catch(() => null);

  await page.locator('[data-testid="webhard-file-dropzone"]').evaluate((element, droppedFiles) => {
    const dataTransfer = new DataTransfer();
    for (const droppedFile of droppedFiles) {
      const bytes = new Uint8Array(droppedFile.buffer);
      dataTransfer.items.add(new File([bytes], droppedFile.name, { type: droppedFile.mimeType }));
    }

    element.dispatchEvent(
      new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer })
    );
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  }, descriptors);

  const confirmResponse = await confirmResponsePromise;
  expect(confirmResponse, 'drag/drop upload should call batch-complete').not.toBeNull();
  expect(confirmResponse?.ok()).toBe(true);
  await dismissAllModals(page);

  for (const file of files) {
    await expect(page.locator(`text=${file.name}`).first()).toBeVisible({ timeout: 30000 });
  }
}

/**
 * 웹하드 파일 작업 E2E 테스트
 * - 업로드 (15개 테스트)
 * - 삭제 (12개 테스트)
 * - 수정 (10개 테스트)
 * 총 37개 테스트 케이스
 */

// 전체 파일을 직렬 실행 - 모든 테스트가 같은 폴더를 사용하므로 병렬 실행 시 충돌 발생
test.describe('웹하드 파일 작업', () => {
  // ✅ 전체 테스트를 직렬로 실행 (다른 describe 블록들도 순차 실행)
  test.describe.configure({ mode: 'serial', timeout: 180000 });

  // ✅ 각 테스트 전에 모달 닫기 (이전 테스트에서 남은 모달 처리)
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await dismissAllModals(page);
  });

  test.describe('웹하드 파일 업로드', () => {
    // 같은 폴더를 사용하므로 직렬 실행 (병렬 실행 시 파일 충돌)
    test.describe.configure({ mode: 'serial' });

    // NOTE: Cleanup 비활성화 - 테스트 중 DB에 테스트 파일이 쌓일 수 있음
    // 실제 환경에서는 테스트 후 수동 정리 필요
    // test.afterEach(async ({ authenticatedPage: page }) => {
    //   try {
    //     await dismissAllModals(page);
    //     await cleanupTestFiles(page, 'upload-');
    //     await cleanupTestFiles(page, 'batch-');
    //     await cleanupTestFiles(page, 'test-');
    //   } catch {
    //     console.warn('Cleanup failed, continuing...');
    //   }
    // });

    // ========== 단일 파일 업로드 (5개 테스트) ==========

    test('should upload single small file via file input', async ({ authenticatedPage: page }) => {
      // 타임아웃을 3분으로 설정 (presigned URL + R2 업로드 + confirm 대기)
      test.setTimeout(180000);

      const testFile = TEST_FILES.small('upload-small-1.pdf');

      await uploadFiles(page, [testFile]);

      // 파일이 UI에 표시되는지 확인 (타임아웃 증가)
      await expect(page.locator('text=upload-small-1.pdf').first()).toBeVisible({ timeout: 30000 });

      // 성공 Toast 확인 (선택사항)
      const successToast = page.locator('.toast').filter({ hasText: /성공|업로드/ });
      if (await successToast.isVisible({ timeout: 2000 }).catch(() => false)) {
        await expect(successToast).toBeVisible();
      }
    });

    test('should upload single medium file (5-10MB)', async ({ authenticatedPage: page }) => {
      test.setTimeout(180000); // 3분 타임아웃 (presigned URL + R2 업로드 대기)

      const testFile = TEST_FILES.medium('upload-medium-1.pdf');

      await uploadFiles(page, [testFile]);

      // 파일이 UI에 표시되는지 확인
      await expect(page.locator('text=upload-medium-1.pdf').first()).toBeVisible({
        timeout: 60000,
      });
    });

    test('should upload allowed file type (DXF)', async ({ authenticatedPage: page }) => {
      const testFile = TEST_FILES.dxf('test-drawing.dxf');

      await uploadFiles(page, [testFile]);

      await expect(page.locator('text=test-drawing.dxf').first()).toBeVisible({ timeout: 10000 });
    });

    test('should upload allowed file type (JPG)', async ({ authenticatedPage: page }) => {
      const testFile = TEST_FILES.jpg('test-image.jpg');

      await uploadFiles(page, [testFile]);

      await expect(page.locator('text=test-image.jpg').first()).toBeVisible({ timeout: 10000 });
    });

    test('should reject disallowed file type (EXE)', async ({ authenticatedPage: page }) => {
      const testFile = TEST_FILES.exe('malicious.exe');

      // 업로드 시도
      await uploadFiles(page, [testFile]).catch(() => {
        // 에러 발생 예상
      });

      // 파일이 거부되었는지 확인 (에러 메시지 또는 파일 미표시)
      const fileNotUploaded = await page
        .locator('text=malicious.exe')
        .isVisible({ timeout: 3000 })
        .catch(() => false);
      const errorMessage = await page
        .locator('text=/허용되지 않는|지원하지 않는|업로드.*실패|not allowed/i')
        .isVisible({ timeout: 2000 })
        .catch(() => false);

      // EXE 파일이 목록에 없거나 에러 메시지가 표시되어야 함
      expect(fileNotUploaded === false || errorMessage === true).toBe(true);
    });

    // ========== 대용량 파일 업로드 (3개 테스트) ==========

    test('should upload large file (15MB+)', async ({ authenticatedPage: page }) => {
      test.setTimeout(300000); // 5분 타임아웃 (대용량 파일)

      const testFile = TEST_FILES.large('upload-large-1.pdf');

      await uploadFiles(page, [testFile]);

      await expect(page.locator('text=upload-large-1.pdf').first()).toBeVisible({
        timeout: 120000,
      });
    });

    test('should upload very large file (100MB+)', async ({ authenticatedPage: page }) => {
      test.setTimeout(300000);

      const fileName = `upload-xl-${Date.now()}.pdf`;
      const filePath = await createSparsePdfFile(fileName, 101 * 1024 * 1024);

      await uploadFilesFromDisk(page, [filePath], [fileName]);
    });

    test('should reject file exceeding 2GB limit', async ({ authenticatedPage: page }) => {
      const fileName = `too-large-${Date.now()}.pdf`;

      await dispatchSyntheticFileInputChange(page, [
        { name: fileName, mimeType: 'application/pdf', size: 2 * 1024 * 1024 * 1024 + 1 },
      ]);

      await expect(page.getByText('파일 크기 초과')).toBeVisible({ timeout: 5000 });
      await expect(page.getByText(/2GB를 초과합니다/)).toBeVisible({ timeout: 5000 });
      await expect(page.locator('[data-file-id]').filter({ hasText: fileName })).toHaveCount(0);
    });

    // ========== 배치 업로드 (5개 테스트) ==========
    // 참고: 5개 이상 파일은 Presigned URL 방식의 배치 업로드를 사용합니다.
    // 이 방식은 브라우저에서 R2로 직접 업로드하므로 테스트 환경에서는
    // 실제 R2 연결이 필요합니다. 4개 이하는 직접 FormData 업로드를 사용합니다.

    test('should upload 4 files simultaneously (direct upload)', async ({
      authenticatedPage: page,
    }) => {
      // 4개 파일은 직접 FormData 업로드 사용 (5개 미만이므로)
      const files = createBatchTestFiles(4, 'batch-4');

      // 순차적으로 업로드 (각 파일별로)
      for (const file of files) {
        await uploadFiles(page, [file]);
      }

      // 모달이 열려있으면 먼저 닫기
      await dismissAllModals(page);

      // 모든 파일이 UI에 표시되는지 확인
      for (const file of files) {
        await expect(page.locator(`text=${file.name}`).first()).toBeVisible({ timeout: 15000 });
      }
    });

    test('should upload 5 files simultaneously (batch/presigned URL)', async ({
      authenticatedPage: page,
    }) => {
      const files = createBatchTestFiles(5, `batch-5-${Date.now()}`, 8 * 1024);

      await uploadFiles(page, files);

      for (const file of files) {
        await expect(page.locator(`text=${file.name}`).first()).toBeVisible({ timeout: 30000 });
      }
    });

    test('should upload 15 files simultaneously', async ({ authenticatedPage: page }) => {
      test.setTimeout(240000);

      const files = createBatchTestFiles(15, `batch-15-${Date.now()}`, 4 * 1024);

      await uploadFiles(page, files);

      for (const file of files) {
        await expect(page.locator(`text=${file.name}`).first()).toBeVisible({ timeout: 30000 });
      }
    });

    test('should upload 100 files (max limit)', async ({ authenticatedPage: page }) => {
      test.setTimeout(420000);

      const files = createBatchTestFiles(100, `batch-100-${Date.now()}`, 1024);

      await uploadFiles(page, files);
    });

    test('should reject upload exceeding 100 files', async ({ authenticatedPage: page }) => {
      const files = Array.from({ length: 101 }, (_, index) => ({
        name: `too-many-${index + 1}.pdf`,
        mimeType: 'application/pdf',
        size: 1024,
      }));

      await dispatchSyntheticFileInputChange(page, files);

      await expect(page.getByText('최대 100개까지 업로드할 수 있습니다.')).toBeVisible({
        timeout: 5000,
      });
      await expect(page.getByText('업로드할 폴더 선택')).not.toBeVisible();
    });

    test('should upload mixed file types (4 files)', async ({ authenticatedPage: page }) => {
      // 4개 파일로 변경하여 직접 업로드 방식 사용
      const files = [
        createTestFileByExtension('pdf', 'mixed-1.pdf'),
        createTestFileByExtension('dxf', 'mixed-2.dxf'),
        createTestFileByExtension('jpg', 'mixed-3.jpg'),
        createTestFileByExtension('png', 'mixed-4.png'),
      ];

      // 순차적으로 업로드
      for (const file of files) {
        await uploadFiles(page, [file]);
      }

      // 모달이 열려있으면 먼저 닫기
      await dismissAllModals(page);

      // 모든 파일 표시 확인
      for (const file of files) {
        await expect(page.locator(`text=${file.name}`).first()).toBeVisible({ timeout: 15000 });
      }
    });

    // ========== 드래그 앤 드롭 업로드 (2개 테스트) ==========

    test('should upload via drag and drop', async ({ authenticatedPage: page }) => {
      const file = TEST_FILES.small(`drop-upload-${Date.now()}.pdf`);

      await dropFilesOnWebhard(page, [file]);
    });

    test('should upload via drag and drop into specific folder', async ({
      authenticatedPage: page,
    }) => {
      const file = TEST_FILES.small(`drop-folder-upload-${Date.now()}.pdf`);
      const folderName = `drop-target-${Date.now()}`;
      const folderId = await createFolder(page, folderName);
      expect(folderId).not.toBeNull();

      try {
        await page.goto(`/webhard?folderId=${encodeURIComponent(folderId!)}`, {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });
        expect(page.url()).toContain(`folderId=${folderId}`);
        await expect(page.getByTestId(`breadcrumb-folder-${folderId}`).first()).toBeVisible({
          timeout: 30000,
        });
        await waitForVisibleTextToDisappear(page, '파일 목록을 불러오는 중...');

        await dropFilesOnWebhard(page, [file]);
        await expectFileInFolderApi(page, folderId!, file.name);
      } finally {
        if (folderId) {
          await deleteFolderViaAPI(page, folderId);
        }
      }
    });
  });

  test.describe('웹하드 파일 삭제', () => {
    // 같은 폴더를 사용하므로 직렬 실행
    test.describe.configure({ mode: 'serial' });

    // NOTE: Cleanup 비활성화 - 삭제 테스트에서는 파일이 이미 삭제되므로 불필요
    // test.afterEach(async ({ authenticatedPage: page }) => {
    //   try {
    //     await dismissAllModals(page);
    //     await cleanupTestFiles(page);
    //   } catch {
    //     console.warn('Cleanup failed, continuing...');
    //   }
    // });

    // ========== 단일 파일 삭제 (4개 테스트) ==========

    test('should delete single file via context menu', async ({ authenticatedPage: page }) => {
      // 고유한 파일 이름 생성
      const uniqueFileName = `delete-context-${Date.now()}.pdf`;
      const testFile = TEST_FILES.small(uniqueFileName);
      await uploadFiles(page, [testFile]);

      await expect(page.locator(`text=${uniqueFileName}`).first()).toBeVisible({ timeout: 15000 });

      // 컨텍스트 메뉴로 삭제
      await deleteFileViaContextMenu(page, uniqueFileName);

      // 파일이 UI에서 사라졌는지 확인
      await expect(page.locator(`text=${uniqueFileName}`)).not.toBeVisible({
        timeout: 10000,
      });
    });

    test('should delete single file via file item trash icon', async ({
      authenticatedPage: page,
    }) => {
      // 고유한 파일 이름 생성 (timestamp 포함)
      const uniqueFileName = `delete-icon-${Date.now()}.pdf`;
      const testFile = TEST_FILES.small(uniqueFileName);
      await uploadFiles(page, [testFile]);

      // 업로드된 파일 확인
      const fileLocator = page
        .locator('[data-file-id]')
        .filter({
          hasText: uniqueFileName,
        })
        .first();

      await expect(fileLocator).toBeVisible({ timeout: 15000 });

      // 파일 아이템의 휴지통 아이콘 클릭
      await deleteFileViaTrashButton(page, uniqueFileName);

      // 삭제 확인 - 파일이 사라졌는지 확인
      await expect(
        page.locator('[data-file-id]').filter({
          hasText: uniqueFileName,
        })
      ).not.toBeVisible({ timeout: 10000 });
    });

    test('should delete single file via toolbar delete button', async ({
      authenticatedPage: page,
    }) => {
      // 고유한 파일 이름 생성
      const uniqueFileName = `delete-toolbar-${Date.now()}.pdf`;
      const testFile = TEST_FILES.small(uniqueFileName);
      await uploadFiles(page, [testFile]);

      // 파일 선택
      await selectFiles(page, [uniqueFileName]);

      // 툴바 삭제 버튼 클릭
      await deleteSelectedFiles(page);

      // 삭제 확인
      await expect(page.locator(`text=${uniqueFileName}`)).not.toBeVisible({
        timeout: 10000,
      });
    });

    test('should delete just uploaded file', async ({ authenticatedPage: page }) => {
      // 고유한 파일 이름 생성
      const uniqueFileName = `delete-instant-${Date.now()}.pdf`;
      const testFile = TEST_FILES.small(uniqueFileName);
      await uploadFiles(page, [testFile]);

      await expect(page.locator(`text=${uniqueFileName}`)).toBeVisible({ timeout: 15000 });

      // 즉시 삭제
      await deleteFileViaContextMenu(page, uniqueFileName);

      await expect(page.locator(`text=${uniqueFileName}`)).not.toBeVisible();
    });

    // ========== 배치 삭제 (5개 테스트) ==========

    test('should batch delete 5 files via toolbar', async ({ authenticatedPage: page }) => {
      // 5개 파일 업로드
      const files = createBatchTestFiles(5, 'delete-batch-5');
      await uploadFiles(page, files);

      // 모든 파일 선택
      const fileNames = files.map((f) => f.name);
      await selectFiles(page, fileNames, 'ctrl');

      // 삭제
      await deleteSelectedFiles(page);

      // 모든 파일이 사라졌는지 확인
      for (const file of files) {
        await expect(page.locator(`text=${file.name}`)).not.toBeVisible();
      }
    });

    test('should batch delete 10 files via toolbar', async ({ authenticatedPage: page }) => {
      test.setTimeout(60000); // 60초 타임아웃

      // 10개 파일 업로드
      const files = createBatchTestFiles(10, 'delete-batch-10');
      await uploadFiles(page, files);

      // 모든 파일 선택
      const fileNames = files.map((f) => f.name);
      await selectFiles(page, fileNames, 'ctrl');

      // 삭제 (ProgressModal 확인)
      await deleteSelectedFiles(page);

      // 모든 파일 삭제 확인
      for (const file of files) {
        await expect(page.locator(`text=${file.name}`)).not.toBeVisible();
      }
    });

    test('should batch delete 20 files via toolbar', async ({ authenticatedPage: page }) => {
      test.setTimeout(90000); // 90초 타임아웃

      // 20개 파일 업로드
      const files = createBatchTestFiles(20, 'delete-batch-20', 50 * 1024);
      await uploadFiles(page, files);

      // 모든 파일 선택 및 삭제
      await selectAllItemsInCurrentView(page);
      await deleteSelectedFiles(page);

      // 삭제 확인
      const remainingFiles = await page
        .locator('[data-file-id]')
        .filter({
          hasText: 'delete-batch-20',
        })
        .count();

      expect(remainingFiles).toBe(0);
    });

    test('should delete all files in current folder and show empty state', async ({
      authenticatedPage: page,
    }) => {
      // 몇 개 파일 업로드
      const files = createBatchTestFiles(3, 'delete-all');
      await uploadFiles(page, files);

      // 모든 파일 ID 가져오기
      const allFileIds = await getAllFileIds(page);

      if (allFileIds.length > 0) {
        // 모든 파일 선택
        await selectAllItemsInCurrentView(page);

        // 삭제
        await deleteSelectedFiles(page);

        await expect(page.locator('[data-file-id]')).toHaveCount(0, { timeout: 10000 });

        // Empty State 메시지 확인
        const isEmpty = await isEmptyState(page);
        expect(isEmpty).toBe(true);
      }
    });

    test('should show delete processing state during batch delete', async ({
      authenticatedPage: page,
    }) => {
      // 여러 파일 업로드
      const files = createBatchTestFiles(8, 'delete-progress');
      await uploadFiles(page, files);

      // 파일 선택
      const fileNames = files.map((f) => f.name);
      await selectFiles(page, fileNames, 'ctrl');

      const deleteResponsePromise = page.waitForResponse(
        (resp) =>
          resp.request().method() === 'POST' &&
          resp.url().includes('/api/webhard/files/batch/delete'),
        { timeout: 30000 }
      );

      const deleteButton = page.getByRole('button', { name: '선택한 파일 삭제' }).first();
      await expect(deleteButton).toBeEnabled({ timeout: 5000 });
      await deleteButton.click();
      await confirmDeleteDialog(page);

      const activeDeleteDialog = page.getByRole('dialog').filter({
        hasText: /삭제 중|삭제 완료/,
      });
      await expect(activeDeleteDialog.first()).toBeVisible({ timeout: 5000 });

      const deleteResponse = await deleteResponsePromise;
      expect(deleteResponse.status()).toBeGreaterThanOrEqual(200);
      expect(deleteResponse.status()).toBeLessThan(300);

      const completedDialog = page
        .getByRole('dialog')
        .filter({ hasText: /삭제 완료/ })
        .first();
      if (await completedDialog.isVisible({ timeout: 10000 }).catch(() => false)) {
        await expect(completedDialog).toBeVisible();
      } else {
        await expect(page.getByRole('dialog').filter({ hasText: /삭제 중|삭제 완료/ })).toBeHidden({
          timeout: 5000,
        });
      }

      for (const fileName of fileNames) {
        await expect(page.locator('[data-file-id]').filter({ hasText: fileName })).toHaveCount(0, {
          timeout: 10000,
        });
      }
    });

    // ========== 삭제 에러 케이스 (3개 테스트) ==========

    test('should show error when deleting non-existent file', async ({
      authenticatedPage: page,
    }) => {
      const response = await deleteMissingFile(page);

      expect([404, 410]).toContain(response.status());
    });

    test('should handle network failure during delete', async ({ authenticatedPage: page }) => {
      // 1. 테스트용 파일 업로드
      const fileName = `network-delete-test-${Date.now()}.pdf`;
      const testFile = TEST_FILES.small(fileName);
      await uploadFiles(page, [testFile]);

      // 파일이 UI에 표시되는지 확인
      await expect(page.locator(`text=${fileName}`).first()).toBeVisible({ timeout: 15000 });

      // 2. 파일 선택
      await selectFiles(page, [fileName]);

      const failedDeleteRequestPromise = page
        .waitForEvent('requestfailed', {
          predicate: (request) =>
            request.method() === 'DELETE' &&
            request.url().includes('/api/webhard/files/') &&
            request.url().includes('/delete'),
          timeout: 15000,
        })
        .catch(() => null);

      try {
        // 3. 네트워크 차단
        await page.context().setOffline(true);

        // 4. 삭제 시도
        const deleteButton = page.getByRole('button', { name: '선택한 파일 삭제' }).first();
        await expect(deleteButton).toBeEnabled({ timeout: 5000 });
        await deleteButton.click();
        await confirmDeleteDialog(page);

        const failedDeleteRequest = await failedDeleteRequestPromise;
        expect(failedDeleteRequest).not.toBeNull();

        await expect(
          page
            .getByRole('dialog')
            .filter({ hasText: /삭제 실패/ })
            .first()
        ).toBeVisible({
          timeout: 10000,
        });
      } finally {
        // 5. 네트워크 복구
        await page.context().setOffline(false);
      }

      const closeButton = page
        .getByRole('dialog')
        .filter({ hasText: /삭제 실패/ })
        .first()
        .getByRole('button', { name: '닫기' });
      if (await closeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await closeButton.click();
      }

      // 6. 파일이 여전히 존재하는지 확인 (삭제 실패했으므로)
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForVisibleTextToDisappear(page, '파일 목록을 불러오는 중...');

      // 네트워크 에러 시 파일이 삭제되지 않아야 함
      const fileStillExists = await expect
        .poll(() => fileExists(page, fileName), { timeout: 60000 })
        .toBe(true)
        .then(() => true)
        .catch(() => false);
      expect(fileStillExists).toBe(true);

      // 정리: 파일이 존재하면 삭제
      if (fileStillExists) {
        await deleteFileViaContextMenu(page, fileName);
      }
    });

    test('should rollback on delete failure', async ({ authenticatedPage: page }) => {
      const fileName = `rollback-delete-${Date.now()}.pdf`;
      const testFile = TEST_FILES.small(fileName);
      await uploadFiles(page, [testFile]);

      const fileId = await getFileId(page, fileName);
      expect(fileId).not.toBeNull();

      await selectFiles(page, [fileName]);
      await page.route(`**/api/webhard/files/${fileId}/delete`, async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'forced delete failure' }),
        });
      });

      const deleteButton = page.getByRole('button', { name: '선택한 파일 삭제' }).first();
      await expect(deleteButton).toBeEnabled({ timeout: 5000 });
      await deleteButton.click();
      await confirmDeleteDialog(page);

      const failureDialog = page
        .getByRole('dialog')
        .filter({ hasText: /삭제 실패/ })
        .first();
      await expect(failureDialog).toBeVisible({
        timeout: 10000,
      });
      await page.unroute(`**/api/webhard/files/${fileId}/delete`);
      await failureDialog.getByRole('button', { name: '닫기' }).click();
      await expect(failureDialog).toBeHidden({ timeout: 5000 });

      await expect(page.getByText(fileName, { exact: true })).toBeVisible({ timeout: 10000 });
      await deleteFileViaContextMenu(page, fileName);
    });
  });

  test.describe('웹하드 파일 수정 (이름 변경)', () => {
    // 각 테스트가 고유한 파일명을 사용하지만, 상위가 serial이므로 serial 유지
    test.describe.configure({ mode: 'serial' });

    // NOTE: Cleanup 비활성화 - 테스트 중 DB에 테스트 파일이 쌓일 수 있음
    // test.afterEach(async ({ authenticatedPage: page }) => {
    //   try {
    //     await dismissAllModals(page);
    //     await cleanupTestFiles(page, 'rename-');
    //   } catch {
    //     console.warn('Cleanup failed, continuing...');
    //   }
    // });

    // ========== 기본 수정 (4개 테스트) ==========

    test('should rename file via context menu and Enter key', async ({
      authenticatedPage: page,
    }) => {
      // 테스트 파일 업로드
      const testFile = TEST_FILES.small('rename-enter-1.pdf');
      await uploadFiles(page, [testFile]);

      await expect(page.locator('text=rename-enter-1.pdf')).toBeVisible({ timeout: 15000 });

      // 이름 변경
      await renameFile(page, 'rename-enter-1.pdf', 'rename-enter-1-updated.pdf');

      // 새 이름 확인
      await expect(page.locator('text=rename-enter-1-updated.pdf')).toBeVisible({
        timeout: 10000,
      });
      await expect(page.locator('text=rename-enter-1.pdf')).not.toBeVisible();
    });

    test('should rename file and save on blur', async ({ authenticatedPage: page }) => {
      // 테스트 파일 업로드
      const testFile = TEST_FILES.small('rename-blur-1.pdf');
      await uploadFiles(page, [testFile]);

      await renameFileOnBlur(page, 'rename-blur-1.pdf', 'rename-blur-1-updated.pdf');

      // 새 이름 확인
      await expect(page.getByText('rename-blur-1-updated.pdf', { exact: true })).toBeVisible();
    });

    test('should cancel rename on Escape key', async ({ authenticatedPage: page }) => {
      // 테스트 파일 업로드
      const testFile = TEST_FILES.small('rename-escape-1.pdf');
      await uploadFiles(page, [testFile]);

      await expect(page.locator('text=rename-escape-1.pdf')).toBeVisible({ timeout: 15000 });

      // 이름 변경 시도 후 ESC로 취소
      await cancelRename(page, 'rename-escape-1.pdf');

      // 원래 이름 유지 확인
      await expect(page.locator('text=rename-escape-1.pdf')).toBeVisible();
    });

    test('should activate inline edit mode with input focused', async ({
      authenticatedPage: page,
    }) => {
      // 테스트 파일 업로드
      const testFile = TEST_FILES.small('rename-focus-1.pdf');
      await uploadFiles(page, [testFile]);

      const fileLocator = page.locator('[data-file-id]').filter({
        hasText: 'rename-focus-1.pdf',
      });

      // 우클릭하여 이름 수정
      await fileLocator.click({ button: 'right' });
      await page.click('text=이름 수정');

      // 입력 필드가 포커스되었는지 확인
      const input = page.locator('input[type="text"]:focus');
      await expect(input).toBeVisible();

      // 입력 필드의 값이 원래 파일명인지 확인
      const value = await input.inputValue();
      expect(value).toContain('rename-focus-1');

      // ESC로 취소
      await page.keyboard.press('Escape');
    });

    // ========== 수정 검증 (4개 테스트) ==========

    test('should reject empty filename', async ({ authenticatedPage: page }) => {
      // 테스트 파일 업로드
      const testFile = TEST_FILES.small('rename-empty-1.pdf');
      await uploadFiles(page, [testFile]);

      const fileLocator = page.locator('[data-file-id]').filter({
        hasText: 'rename-empty-1.pdf',
      });

      // 이름 수정 모드
      await fileLocator.click({ button: 'right' });
      await page.click('text=이름 수정');
      await page.waitForSelector('input[type="text"]:focus');

      // 빈 문자열 입력 시도
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');
      await page.keyboard.press('Enter');

      // 에러 메시지 확인 또는 원래 이름 유지
      await page.waitForTimeout(1000);
      await expect(page.locator('text=rename-empty-1.pdf')).toBeVisible();
    });

    test('should reject whitespace-only filename', async ({ authenticatedPage: page }) => {
      // 테스트 파일 업로드
      const testFile = TEST_FILES.small('rename-whitespace-1.pdf');
      await uploadFiles(page, [testFile]);

      const fileLocator = page.locator('[data-file-id]').filter({
        hasText: 'rename-whitespace-1.pdf',
      });

      // 이름 수정 모드
      await fileLocator.click({ button: 'right' });
      await page.click('text=이름 수정');
      await page.waitForSelector('input[type="text"]:focus');

      // 공백만 입력
      await page.keyboard.press('Control+A');
      await page.keyboard.type('   ');
      await page.keyboard.press('Enter');

      // 원래 이름 유지 확인
      await page.waitForTimeout(1000);
      await expect(page.locator('text=rename-whitespace-1.pdf')).toBeVisible();
    });

    test('should sanitize special characters in filename', async ({ authenticatedPage: page }) => {
      // 테스트 파일 업로드
      const testFile = TEST_FILES.small('rename-special-1.pdf');
      await uploadFiles(page, [testFile]);

      // 특수 문자 포함 이름으로 변경 시도
      const renameResponse = await attemptRenameFile(
        page,
        'rename-special-1.pdf',
        'file<>:"|?*.pdf'
      );
      expect(renameResponse.status()).toBeGreaterThanOrEqual(200);
      expect(renameResponse.status()).toBeLessThan(300);

      // 특수 문자가 제거된 이름으로 저장되는지 확인
      await expect(page.getByText('file.pdf', { exact: true })).toBeVisible({ timeout: 30000 });
      await expect(page.getByText('file<>:"|?*.pdf', { exact: true })).not.toBeVisible();
    });

    test('should handle duplicate filename in same folder', async ({ authenticatedPage: page }) => {
      // 2개의 파일 업로드
      const file1 = TEST_FILES.small('rename-dup-1.pdf');
      const file2 = TEST_FILES.small('rename-dup-2.pdf');
      await uploadFiles(page, [file1, file2]);

      await expect(page.locator('text=rename-dup-1.pdf')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('text=rename-dup-2.pdf')).toBeVisible({ timeout: 15000 });

      // 두 번째 파일을 첫 번째 파일 이름으로 변경 시도
      const renameResponse = await attemptRenameFile(page, 'rename-dup-2.pdf', 'rename-dup-1.pdf');
      expect(renameResponse.status()).toBe(400);

      // 원래 이름 유지
      await page.waitForTimeout(1000);

      await expect(page.getByText('rename-dup-2.pdf', { exact: true })).toBeVisible();
      await expect(page.getByText('rename-dup-1.pdf', { exact: true })).toHaveCount(1);
    });

    // ========== 수정 에러 케이스 (2개 테스트) ==========

    test('should show error when renaming without permission', async ({
      authenticatedPage: page,
      browser,
    }) => {
      const fileName = `rename-authz-${Date.now()}.pdf`;
      const testFile = TEST_FILES.small(fileName);
      await uploadFiles(page, [testFile]);

      const fileId = await getFileId(page, fileName);
      expect(fileId).not.toBeNull();

      const cleanContext = await browser.newContext();
      const cleanPage = await cleanContext.newPage();

      try {
        const response = await cleanPage.request.patch(`/api/webhard/files/${fileId}/rename`, {
          data: { name: `unauthorized-${fileName}` },
        });
        expect([401, 403]).toContain(response.status());
      } finally {
        await cleanContext.close();
      }

      await expect(page.getByText(fileName, { exact: true })).toBeVisible({ timeout: 10000 });
      await deleteFileViaContextMenu(page, fileName);
    });

    test('should rollback on network failure during rename', async ({
      authenticatedPage: page,
    }) => {
      // 1. 테스트용 파일 업로드
      const originalName = `rename-network-test-${Date.now()}.pdf`;
      const newName = `renamed-network-${Date.now()}.pdf`;
      const testFile = TEST_FILES.small(originalName);
      await uploadFiles(page, [testFile]);

      // 파일이 UI에 표시되는지 확인
      await expect(page.locator(`text=${originalName}`).first()).toBeVisible({ timeout: 15000 });

      // 2. 파일 선택 및 컨텍스트 메뉴 열기
      const fileLocator = page.locator('[data-file-id]').filter({
        hasText: originalName,
      });
      await fileLocator.first().click({ button: 'right' });
      await page.click('text=이름 수정');

      // 3. 입력 필드가 나타날 때까지 대기
      await page.waitForSelector('input[type="text"]:focus', { timeout: 3000 });

      // 4. 새 이름 입력
      await page.keyboard.press('Control+A');
      await page.keyboard.type(newName);

      // 5. 이름 변경 요청만 네트워크 실패로 처리
      await page.route('**/api/webhard/files/*/rename', async (route) => {
        await route.abort('failed');
      });
      const failedRenameRequest = page.waitForEvent('requestfailed', {
        predicate: (request) =>
          request.method() === 'PATCH' &&
          request.url().includes('/api/webhard/files/') &&
          request.url().includes('/rename'),
        timeout: 10000,
      });

      // 6. Enter 키로 저장 시도
      await page.keyboard.press('Enter');
      await failedRenameRequest;

      // 7. 네트워크 모킹 해제
      await page.unroute('**/api/webhard/files/*/rename');

      // 8. 서버 상태 기준으로 페이지 새로고침
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForVisibleTextToDisappear(page, '폴더 로딩 중...');
      await waitForVisibleTextToDisappear(page, '파일 목록을 불러오는 중...');

      // 9. 원래 이름으로 파일이 존재하는지 확인 (롤백 확인)
      await expect(page.getByText(originalName, { exact: true })).toBeVisible({ timeout: 30000 });
      await expect(page.getByText(newName, { exact: true })).not.toBeVisible();

      // 정리
      await deleteFileViaContextMenu(page, originalName);
    });
  });
}); // 웹하드 파일 작업 describe 블록 닫기
