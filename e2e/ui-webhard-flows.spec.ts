import { test, expect, type Page } from '@playwright/test';
import {
  adminStorageStatePath,
  clickFirstVisible,
  clearBrowserState,
  expectNoVisibleText,
  expectOneOfTexts,
  fixtureFile,
  gotoAuthed,
  loginAsCompanyA,
  waitForAppLoadingToSettle,
} from './helpers/ui-user-actions';

async function waitForWebhardUi(page: Page): Promise<void> {
  await expectOneOfTexts(page, [/파일명|웹하드|업로드된 파일이 없습니다|파일 목록/]);
  await waitForAppLoadingToSettle(page, 45000);
}

test.describe.serial('UI 사용자 흐름 — 웹하드', () => {
  test.use({ storageState: adminStorageStatePath });

  test('관리자는 웹하드에서 폴더/검색/업로드/휴지통 UI를 조작한다', async ({ page }) => {
    await gotoAuthed(page, '/webhard');
    await waitForWebhardUi(page);

    await expectOneOfTexts(page, [/테스트거래처A|파일명|웹하드/]);
    const createFolderButton = page.getByRole('button', { name: /새 폴더 생성/ }).first();
    await expect(createFolderButton).toBeVisible({ timeout: 15000 });
    await createFolderButton.click();
    const folderInput = page
      .locator('input[placeholder*="새 폴더"], input[placeholder*="폴더 이름"]')
      .first();
    await expect(folderInput).toBeVisible({ timeout: 15000 });
    const folderName = `UI-E2E-${Date.now()}`;
    await folderInput.fill(folderName);
    await folderInput.press('Enter');
    await waitForAppLoadingToSettle(page, 45000);
    await expectOneOfTexts(page, [folderName, /성공|생성/]);

    const search = page
      .locator('input[placeholder*="파일 검색"], input[placeholder*="검색"]')
      .first();
    if (await search.isVisible({ timeout: 3000 }).catch(() => false)) {
      await search.fill('도면');
      await expectOneOfTexts(page, [/검색|도면|결과/]);
      await search.fill('');
    }

    const uploadButton = page.getByRole('button', { name: /^파일 업로드$/ }).first();
    if (await uploadButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await uploadButton.click();
      const fileInput = page.getByTestId('file-upload-input');
      await expect(fileInput).toBeAttached({ timeout: 15000 });
      await fileInput.setInputFiles(fixtureFile.textFile);
      await expectOneOfTexts(page, [/업로드|업로드할 폴더 선택|webhard-sample.txt|파일 업로드/]);
      const cancelButton = page.getByRole('button', { name: /취소|닫기/ }).first();
      if (await cancelButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await cancelButton.click();
      }
    }

    await clickFirstVisible(page, [/휴지통|삭제된 파일/]);
    await expectOneOfTexts(page, [/휴지통|삭제된 파일|비어 있습니다/]);
  });

  test('관리자는 파일 선택 후 툴바 액션을 UI로 확인한다', async ({ page }) => {
    await gotoAuthed(page, '/webhard');
    await waitForWebhardUi(page);

    const fileRow = page.getByText(/도면_A_001|설계도_A|견적서|완성도면/).first();
    if (await fileRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await fileRow.click();
      await expectOneOfTexts(page, [/개 선택|확인처리|다운로드|이동|삭제/]);
      await expect(
        page.getByRole('button', { name: /선택한 파일 다운로드/ }).first()
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /선택한 파일 이동/ }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /선택한 파일 삭제/ }).first()).toBeVisible();
    }
  });

  test('업체 사용자는 자기 웹하드만 보고 관리자 폴더 조작 UI를 보지 않는다', async ({ page }) => {
    await clearBrowserState(page);
    await loginAsCompanyA(page, '/webhard');
    await waitForWebhardUi(page);

    await expectOneOfTexts(page, ['테스트거래처A', /파일명|웹하드/]);
    await expectNoVisibleText(page, '테스트거래처B');
    await expect(page.getByRole('button', { name: /새 폴더 생성|폴더 업로드/ })).toHaveCount(0);

    const search = page
      .locator('input[placeholder*="파일 검색"], input[placeholder*="검색"]')
      .first();
    if (await search.isVisible({ timeout: 3000 }).catch(() => false)) {
      await search.fill('도면_A');
      await expectOneOfTexts(page, [/도면_A|검색|결과/]);
    }
  });
});
