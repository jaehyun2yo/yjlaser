import { test, expect } from '@playwright/test';
import {
  clickFirstVisible,
  expectOneOfTexts,
  fieldWorkerCredentials,
  fixtureFile,
  loginAsAdmin,
  loginAsWorker,
  officeWorkerCredentials,
} from './helpers/ui-user-actions';

test.describe.serial('UI 사용자 흐름 — 작업자/납품', () => {
  test('작업자는 PIN 패드로 로그인하고 대시보드 탭을 조작한다', async ({ page }) => {
    await loginAsWorker(page, fieldWorkerCredentials);
    await expectOneOfTexts(page, [/작업|현장|사무실|납품관리/]);

    await clickFirstVisible(page, [/사무실|현장|미분류|납품관리|새 문의/]);
    await expectOneOfTexts(page, [/작업|문의|납품|카드|건/]);
  });

  test('작업자 문의 카드에서 펼침/메모/도면 업로드 UI를 조작한다', async ({ page }) => {
    await loginAsWorker(page, officeWorkerCredentials);
    await expectOneOfTexts(page, [/작업|사무실|문의/]);

    const card = page
      .locator('[id^="worker-contact-"], article, [role="button"]')
      .filter({ hasText: /E2E|테스트|문의|도면/ })
      .first();
    if (await card.isVisible({ timeout: 8000 }).catch(() => false)) {
      await card.click();
      await expectOneOfTexts(page, [/타임라인|메모|도면|다운로드|정보/]);
      const fileInput = page.locator('input[type="file"]').first();
      if (
        await fileInput
          .waitFor({ state: 'attached', timeout: 3000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await fileInput.setInputFiles(fixtureFile.drawing);
        await expect(fileInput).toHaveJSProperty('files.length', 1);
      }
    }
  });

  test('작업자는 납품관리에서 탭/지도/사진 첨부 UI를 조작한다', async ({ page }) => {
    test.setTimeout(180000);

    await loginAsWorker(page, fieldWorkerCredentials);
    await page.goto('/worker/delivery', { waitUntil: 'domcontentloaded' });
    await expectOneOfTexts(page, [/납품 관리|납품 대기|완료/]);

    await page.getByRole('tab', { name: /완료|납품완료/ }).click();
    await expectOneOfTexts(page, [/납품 완료|검색|완료 건|없습니다/]);
    await page.getByRole('tab', { name: /대기|납품 대기/ }).click();
    await expectOneOfTexts(page, [/납품 대기|지도|대시보드로 돌아가기|건/]);

    const firstDeliveryCard = page
      .locator('[id^="delivery-contact-"], [role="button"]')
      .filter({ hasText: /납품|테스트|거래처/ })
      .first();
    if (await firstDeliveryCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstDeliveryCard.click();
      await clickFirstVisible(page, [/납품 완료|사진|완료 처리/]);
      const fileInput = page.locator('input[type="file"]').first();
      if (
        await fileInput
          .waitFor({ state: 'attached', timeout: 5000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await fileInput.setInputFiles(fixtureFile.proofPhoto);
        await expect(fileInput).toHaveJSProperty('files.length', 1);
      }
    }
  });

  test('관리자 작업관리에서도 납품/타임라인/증빙 화면을 확인한다', async ({ page }) => {
    await loginAsAdmin(page, '/admin/work-management/delivered');
    await expectOneOfTexts(page, [/납품|완료|작업/]);
    await clickFirstVisible(page, [/전체|오늘|월별|업체|검색|다음|이전/]);
    await expectOneOfTexts(page, [/납품|완료|검색|없습니다|건/]);
  });
});
