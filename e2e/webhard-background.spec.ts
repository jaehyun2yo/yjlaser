import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';

/**
 * 웹하드 배경 투명 회귀 방지 E2E 테스트
 *
 * Tailwind v4 @theme 블록 충돌로 bg-card/bg-muted/bg-background 유틸이
 * 생성되지 않는 회귀를 방지 (커밋 5a324f9 참조).
 *
 * 검증 대상:
 * - 사이드바 배경
 * - 검색 드롭다운 배경
 * - 검색 모달 배경
 */

const authFile = path.join(__dirname, '..', '.auth', 'user.json');

const TRANSPARENT_VALUES = ['rgba(0, 0, 0, 0)', 'transparent', ''];

function visibleSidebar(page: Page) {
  return page.locator('[data-testid="webhard-sidebar"]').filter({ visible: true }).first();
}

async function openSearchModal(page: Page) {
  const modal = page.locator('[data-testid="webhard-search-modal"]').first();

  await page.locator('input[placeholder*="검색"]').first().waitFor({
    state: 'visible',
    timeout: 10000,
  });
  await page
    .locator('body')
    .click({ position: { x: 1, y: 1 } })
    .catch(() => {});
  await page.keyboard.press('Control+Shift+F');

  const openedByKeyboard = await modal.isVisible({ timeout: 3000 }).catch(() => false);
  if (!openedByKeyboard) {
    await page.evaluate(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'f',
          code: 'KeyF',
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        })
      );
    });
  }

  await modal.waitFor({ state: 'visible', timeout: 10000 });
  return modal;
}

test.describe('웹하드 배경 불투명 검증', () => {
  test.use({ storageState: authFile });

  test('webhard sidebar background is opaque', async ({ page }) => {
    await page.goto('/webhard');
    await page.waitForLoadState('domcontentloaded');
    await visibleSidebar(page).waitFor({ state: 'visible', timeout: 15000 });

    const sidebar = visibleSidebar(page);
    const bg = await sidebar.evaluate((el) => getComputedStyle(el).backgroundColor);
    console.log(`Sidebar background: ${bg}`);

    expect(TRANSPARENT_VALUES).not.toContain(bg);
  });

  test('webhard search dropdown background is opaque', async ({ page }) => {
    await page.goto('/webhard');
    await page.waitForLoadState('domcontentloaded');
    await visibleSidebar(page).waitFor({ state: 'visible', timeout: 15000 });

    // 검색 input에 2글자 이상 타이핑하면 드롭다운 오픈
    const searchInput = page.locator('input[placeholder*="검색"]').first();
    await searchInput.waitFor({ state: 'visible', timeout: 10000 });
    await searchInput.click();
    await searchInput.fill('te');

    const dropdown = page.locator('[data-testid="webhard-search-dropdown"]').first();
    await dropdown.waitFor({ state: 'visible', timeout: 10000 });

    // framer-motion 애니메이션 완료 대기
    await page.waitForTimeout(400);

    const bg = await dropdown.evaluate((el) => getComputedStyle(el).backgroundColor);
    console.log(`Search dropdown background: ${bg}`);

    expect(TRANSPARENT_VALUES).not.toContain(bg);
  });

  test('webhard search modal background is opaque', async ({ page }) => {
    await page.goto('/webhard');
    await page.waitForLoadState('domcontentloaded');
    await visibleSidebar(page).waitFor({ state: 'visible', timeout: 15000 });

    const modal = await openSearchModal(page);

    // framer-motion 애니메이션 완료 대기
    await page.waitForTimeout(400);

    const bg = await modal.evaluate((el) => getComputedStyle(el).backgroundColor);
    console.log(`Search modal background: ${bg}`);

    expect(TRANSPARENT_VALUES).not.toContain(bg);
  });
});
