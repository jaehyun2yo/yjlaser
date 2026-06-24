import { test, expect } from '@playwright/test';
import {
  adminStorageStatePath,
  closeVisibleMobileMenu,
  clearBrowserState,
  expectNoHorizontalOverflow,
  expectOneOfTexts,
  gotoAuthed,
  loginAsCompanyA,
  waitForAppLoadingToSettle,
} from './helpers/ui-user-actions';

test.describe('UI 사용자 흐름 — 반응형/레이아웃', () => {
  test.use({ storageState: adminStorageStatePath });

  test('관리자 주요 화면은 모바일 폭에서 가로 overflow 없이 보인다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoAuthed(page, '/admin');

    for (const pathName of [
      '/admin',
      '/admin/contacts',
      '/admin/companies',
      '/admin/work-management/board',
    ]) {
      await gotoAuthed(page, pathName);
      await waitForAppLoadingToSettle(page);
      await closeVisibleMobileMenu(page);
      await expect(page.locator('body')).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });

  test('업체 대시보드는 모바일 폭에서 카드/버튼이 화면 밖으로 넘치지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await clearBrowserState(page);
    await loginAsCompanyA(page);
    await waitForAppLoadingToSettle(page);
    await expectOneOfTexts(page, [/테스트거래처A|진행상황|문의/]);
    await expectNoHorizontalOverflow(page);
  });

  test('웹하드는 태블릿 폭에서 검색/목록/사이드바가 표시된다', async ({ page }) => {
    await page.setViewportSize({ width: 834, height: 1194 });
    await gotoAuthed(page, '/webhard');
    await expectOneOfTexts(page, [/웹하드|파일명|파일 업로드/]);
    await expectNoHorizontalOverflow(page);
  });
});
