import { test, expect, type Dialog, type Page } from '@playwright/test';
import {
  adminStorageStatePath,
  clickFirstVisible,
  expectOneOfTexts,
  fillStableInput,
  gotoAuthed,
} from './helpers/ui-user-actions';

async function waitForAdminContactsSettled(page: Page): Promise<void> {
  await page
    .getByText(/검색 중|더 불러오는 중/)
    .first()
    .waitFor({
      state: 'hidden',
      timeout: 30000,
    })
    .catch(() => undefined);
}

function adminContactHeader(page: Page) {
  return page
    .locator('.cursor-pointer')
    .filter({ hasText: /테스트 업체|테스트 문의사항|테스트거래처A/ })
    .first();
}

async function ensureAdminContact(page: Page): Promise<void> {
  await waitForAdminContactsSettled(page);
  if (
    await adminContactHeader(page)
      .isVisible({ timeout: 3000 })
      .catch(() => false)
  ) {
    return;
  }

  const createButton = page.getByRole('button', { name: /신규 문의 50개 생성/ }).first();
  await expect(createButton).toBeVisible({ timeout: 15000 });

  const acceptDialog = async (dialog: Dialog) => {
    await dialog.accept();
  };
  page.on('dialog', acceptDialog);
  try {
    await createButton.click();
    await expect(createButton).toBeEnabled({ timeout: 60000 });
  } finally {
    page.off('dialog', acceptDialog);
  }

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAdminContactsSettled(page);
  await expect(adminContactHeader(page)).toBeVisible({ timeout: 30000 });
}

test.describe.serial('UI 사용자 흐름 — 관리자', () => {
  test.use({ storageState: adminStorageStatePath });

  test.beforeEach(async ({ page }) => {
    await gotoAuthed(page, '/admin');
  });

  test('관리자 주요 페이지를 실제 화면으로 순회한다', async ({ page }) => {
    test.setTimeout(240000);

    const pages: Array<{ path: string; expected: Array<string | RegExp> }> = [
      { path: '/admin', expected: [/관리자|대시보드|알림/] },
      { path: '/admin/contacts', expected: [/문의|고객|연락처/] },
      { path: '/admin/companies', expected: [/업체|거래처/] },
      { path: '/admin/bookings', expected: [/예약|방문/] },
      { path: '/admin/work-management', expected: [/작업|관리/] },
      { path: '/admin/work-management/board', expected: [/작업|보드|공정/] },
      { path: '/admin/work-management/delivered', expected: [/납품|완료/] },
      { path: '/admin/integration', expected: [/통합|업체|관리/] },
      { path: '/admin/integration/companies', expected: [/업체|매핑|목록/] },
      { path: '/admin/integration/webhard', expected: [/웹하드|설정|관리/] },
      { path: '/admin/integration/workers', expected: [/작업자|근무자|PIN/] },
      { path: '/admin/webhard/activity', expected: [/활동|로그|웹하드/] },
    ];

    for (const item of pages) {
      await test.step(item.path, async () => {
        await gotoAuthed(page, item.path);
        await expectOneOfTexts(page, item.expected);
      });
    }
  });

  test('문의 목록에서 필터/상세/공정 변경 UI를 조작한다', async ({ page }) => {
    await gotoAuthed(page, '/admin/contacts');
    await expectOneOfTexts(page, [/문의|고객/]);
    await ensureAdminContact(page);

    const search = page
      .locator('input[placeholder*="검색"], input[placeholder*="문의"], input[placeholder*="업체"]')
      .first();
    if (await search.isVisible({ timeout: 3000 }).catch(() => false)) {
      await search.fill('테스트 업체');
      await waitForAdminContactsSettled(page);
      await expect(page.locator('body')).toContainText(/테스트 업체|검색 결과|문의/);
    }

    await adminContactHeader(page).click();
    await expectOneOfTexts(page, [/타임라인|상세|문의/]);

    const stageButton = page.getByRole('button', { name: /공정|상태|변경|접수|도면|확정/ }).first();
    if (await stageButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await stageButton.click();
      await expectOneOfTexts(page, [/상태|공정|변경|저장|취소/]);
    }
  });

  test('업체 목록에서 검색/상세/승인 관련 UI를 조작한다', async ({ page }) => {
    await gotoAuthed(page, '/admin/companies');
    await expectOneOfTexts(page, [/업체|거래처/]);

    const search = page.locator('input[placeholder*="검색"], input[placeholder*="업체"]').first();
    if (await search.isVisible({ timeout: 3000 }).catch(() => false)) {
      await search.fill('테스트거래처A');
      await expect(page.locator('body')).toContainText('테스트거래처A');
    }

    await clickFirstVisible(page, [/상세|보기|테스트거래처A/]);
    await expectOneOfTexts(page, [/업체 상세|거래처|웹하드|승인|수정/]);
  });

  test('예약 캘린더 월/주/일과 날짜 이동 UI를 조작한다', async ({ page }) => {
    await gotoAuthed(page, '/admin/bookings');
    await expectOneOfTexts(page, [/예약|방문/]);
    await clickFirstVisible(page, [/월|주|일/]);
    await expectOneOfTexts(page, [/예약|방문|오늘/]);
    await clickFirstVisible(page, [/이전|다음|오늘/]);
    await expectOneOfTexts(page, [/예약|방문|오늘/]);
  });

  test('통합관리 작업자 생성 모달 입력 UI를 조작한다', async ({ page }) => {
    await gotoAuthed(page, '/admin/integration/workers');
    await expectOneOfTexts(page, [/작업자|PIN|권한/]);
    await page.waitForTimeout(3000);
    const createButton = page.getByTestId('worker-add-button');
    await expect(createButton).toBeVisible({ timeout: 15000 });
    await expect(createButton).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
    await expect(createButton).toBeEnabled({ timeout: 15000 });

    const nameInput = page.locator('input[placeholder="작업자 이름"]').first();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await createButton.click();
      if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        break;
      }
      await page.waitForTimeout(500);
    }
    await expect(nameInput).toBeVisible({ timeout: 15000 });
    await fillStableInput(page, nameInput, `UI작업자${Date.now()}`);
    await clickFirstVisible(page, [/취소|닫기/]);
    await expect(nameInput).toBeHidden({ timeout: 5000 });
  });

  test('관리자 전용 화면은 업체 로그인 없이 관리자 세션에서 접근된다', async ({ page }) => {
    await gotoAuthed(page, '/admin/webhard/performance');
    await expect(page.url()).toContain('/admin/webhard/performance');
    await expectOneOfTexts(page, [/성능|웹하드|Performance|관리/]);
  });
});
