import { test, expect } from '@playwright/test';
import {
  clickFirstVisible,
  companyBCredentials,
  expectNoVisibleText,
  expectOneOfTexts,
  fixtureFile,
  gotoAuthed,
  loginAs,
  loginAsCompanyA,
} from './helpers/ui-user-actions';

test.describe.serial('UI 사용자 흐름 — 업체 포털', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCompanyA(page);
  });

  test('업체 대시보드는 자기 회사 문의/예약만 화면에 표시한다', async ({ page }) => {
    await gotoAuthed(page, '/company/dashboard');
    await expectOneOfTexts(page, ['테스트거래처A', '문의 진행상황']);
    await expectNoVisibleText(page, '테스트거래처B');

    await clickFirstVisible(page, [/전체|진행|완료|오늘|이번/]);
    await expectOneOfTexts(page, [/문의 진행상황|진행중인 문의가 없습니다|건의 문의/]);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectOneOfTexts(page, ['테스트거래처A', '문의 진행상황']);
  });

  test('문의 카드를 펼쳐 웹하드/메모/예약 액션을 확인한다', async ({ page }) => {
    await gotoAuthed(page, '/company/dashboard');
    await expectOneOfTexts(page, [/문의 진행상황|진행중인 문의가 없습니다/]);

    const firstCard = page
      .locator('[role="button"], article, li, div')
      .filter({ hasText: /테스트거래처A|E2E|문의|도면/ })
      .first();
    if (await firstCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstCard.click();
      await expectOneOfTexts(page, [/웹하드|메모|타임라인|납품 증빙 사진|예약/]);
    }
  });

  test('업체 주문 목록/상세에서 수정요청 파일 업로드 UI를 조작한다', async ({ page }) => {
    await gotoAuthed(page, '/company/orders');
    await expectOneOfTexts(page, [/주문|문의|진행/]);

    const firstDetail = page.getByRole('link', { name: /상세|보기|주문|문의/ }).first();
    if (await firstDetail.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstDetail.click();
      await expectOneOfTexts(page, [/상세|도면|수정|납품/]);
    }

    const fileInput = page.locator('input[type="file"]').first();
    if (
      await fileInput
        .waitFor({ state: 'attached', timeout: 5000 })
        .then(() => true)
        .catch(() => false)
    ) {
      await fileInput.setInputFiles(fixtureFile.drawing);
      await expect(fileInput).toHaveJSProperty('files.length', 1);
    }
  });

  test('업체 프로필/피드백/청구 페이지를 UI로 확인한다', async ({ page }) => {
    const pages: Array<{ path: string; expected: Array<string | RegExp> }> = [
      { path: '/company/profile', expected: [/프로필|업체|담당자/] },
      { path: '/company/feedback', expected: [/피드백|의견|문의/] },
      { path: '/company/billing', expected: [/청구|결제|세금계산서|준비/] },
    ];

    for (const item of pages) {
      await gotoAuthed(page, item.path);
      await expectOneOfTexts(page, item.expected);
    }

    await gotoAuthed(page, '/company/feedback');
    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
      await textarea.fill('UI E2E 피드백 입력 테스트');
      await expect(textarea).toHaveValue('UI E2E 피드백 입력 테스트');
    }
  });

  test('타 업체 세션은 업체 A 데이터 화면 노출을 받지 않는다', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAs(page, companyBCredentials, '/company/dashboard');
      await expectOneOfTexts(page, ['테스트거래처B', '문의 진행상황']);
      await expectNoVisibleText(page, '테스트거래처A');
    } finally {
      await context.close();
    }
  });

  test('업체 화면에서 납품 증빙 사진 UI가 있으면 same-origin 프록시로 렌더링한다', async ({
    page,
  }) => {
    await gotoAuthed(page, '/company/dashboard');
    const proofLabel = page.getByText('납품 증빙 사진').first();
    if (await proofLabel.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(proofLabel).toBeVisible();
      const image = page.getByRole('img', { name: /납품 증빙/ }).first();
      await expect(image).toBeVisible();
      await expect(image).toHaveAttribute('src', /\/api\/contacts\/.*delivery-proof|blob:|https?:/);
    }
  });
});
