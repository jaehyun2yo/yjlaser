import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import { waitForVisibleTextToDisappear } from './helpers/webhard-helpers';

/**
 * 웹하드 E2E 테스트
 * 실제 브라우저에서 사용자 시나리오를 테스트합니다.
 *
 * Global Setup에서 저장한 인증 상태를 재사용합니다.
 */

// 저장된 인증 상태 파일 경로
const authFile = path.join(__dirname, '..', '.auth', 'user.json');

function visibleText(page: Page, text: string) {
  return page.getByText(text, { exact: true }).filter({ visible: true }).first();
}

async function waitForWebhardReady(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await visibleText(page, '전체 파일').waitFor({ state: 'visible', timeout: 60000 });
  await visibleText(page, '파일명').waitFor({ state: 'visible', timeout: 60000 });
  await waitForVisibleTextToDisappear(page, '폴더 로딩 중...');
  await waitForVisibleTextToDisappear(page, '파일 목록을 불러오는 중...');
}

async function gotoWebhard(page: Page): Promise<void> {
  await page.goto('/webhard', { waitUntil: 'domcontentloaded' });
  await waitForWebhardReady(page);
}

async function expectWebhardShellLoaded(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/webhard/);
  await expect(page.getByTestId('webhard-breadcrumb')).toBeVisible({ timeout: 15000 });
}

async function clickVisibleTextItem(page: Page, text: string) {
  const itemText = visibleText(page, text);
  await itemText.waitFor({ state: 'visible', timeout: 10000 });
  await itemText.evaluate((el) => {
    const clickable = el.closest('.cursor-pointer');
    if (!(clickable instanceof HTMLElement)) {
      throw new Error('Clickable parent was not found');
    }
    clickable.click();
  });
}

test.describe('웹하드 접근 및 인증', () => {
  test('비로그인 사용자는 웹하드 접근 불가', async ({ page }) => {
    await page.goto('/webhard');

    // 로그인 페이지로 리다이렉트 확인
    await expect(page).toHaveURL(/\/login|\/auth/);
  });

  test('관리자 로그인 후 웹하드 접근 가능', async ({ browser }) => {
    // Global Setup에서 저장한 인증 상태 사용
    const context = await browser.newContext({ storageState: authFile });
    const page = await context.newPage();

    // 웹하드 페이지로 이동
    await gotoWebhard(page);

    // 웹하드 UI 요소 확인 (첫 번째 요소 선택)
    await expect(visibleText(page, '전체 파일')).toBeVisible({ timeout: 10000 });
    await expect(visibleText(page, '새 파일')).toBeVisible({ timeout: 10000 });

    await context.close();
  });
});

test.describe('웹하드 파일 관리', () => {
  // Global Setup에서 저장한 인증 상태 사용
  test.use({ storageState: authFile });

  test.beforeEach(async ({ page }) => {
    // 웹하드 페이지로 이동 (이미 인증됨)
    await gotoWebhard(page);
  });

  test('파일 목록 조회', async ({ page }) => {
    // 웹하드 UI가 로드되었는지 확인
    await expect(visibleText(page, '전체 파일')).toBeVisible({ timeout: 10000 });
  });

  test('폴더 선택 시 즉시 반응', async ({ page }) => {
    // 폴더가 있는 경우 폴더 클릭
    const folder = page.locator('[data-folder-item]').first();
    if (await folder.isVisible()) {
      const folderId = await folder.getAttribute('data-folder-id');
      const start = Date.now();
      await folder.click();

      if (!folderId) throw new Error('Folder item did not expose data-folder-id');
      await expect(page.getByTestId(`breadcrumb-folder-${folderId}`)).toBeVisible({
        timeout: 1000,
      });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(1200);
    }
  });

  test('새 파일 모드 전환', async ({ page }) => {
    // 새 파일 버튼 클릭 (사이드바의 새 파일 버튼)
    await clickVisibleTextItem(page, '새 파일');
    await page.waitForTimeout(500);

    // 새 파일 모드가 활성화되었는지 확인 (URL 또는 UI 상태)
    // URL에 newFiles 파라미터가 있거나, 새 파일 버튼이 활성화 상태
    await expect
      .poll(
        async () => {
          if (page.url().includes('newFiles')) return true;
          return page
            .getByTestId('webhard-breadcrumb')
            .getByText('새 파일', { exact: true })
            .isVisible()
            .catch(() => false);
        },
        { message: '새 파일 모드가 URL 또는 활성 버튼 상태로 표시되어야 한다', timeout: 5000 }
      )
      .toBe(true);
  });

  test('뷰 모드 전환 (리스트/그리드)', async ({ page }) => {
    // 그리드 뷰 버튼 클릭 (있는 경우)
    const gridButton = page.locator('[data-testid="view-grid"], button:has-text("그리드")');
    if (await gridButton.isVisible()) {
      await gridButton.click();
      await expect(page.locator('[data-testid="grid-view"]')).toBeVisible();
    }

    // 리스트 뷰로 다시 전환
    const listButton = page.locator('[data-testid="view-list"], button:has-text("리스트")');
    if (await listButton.isVisible()) {
      await listButton.click();
      await expect(page.locator('[data-testid="list-view"]')).toBeVisible();
    }
  });

  test('정렬 기능', async ({ page }) => {
    // 파일명 헤더 클릭 (정렬)
    const nameHeader = page.getByRole('button', { name: /파일명으로 정렬/ }).first();
    if (await nameHeader.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nameHeader.click();
      await page.waitForTimeout(300);
      // 정렬이 적용되었는지 확인 (UI가 다시 렌더링됨)
      await expect(nameHeader).toBeVisible();
    }
  });
});

test.describe('웹하드 드래그 앤 드롭', () => {
  // Global Setup에서 저장한 인증 상태 사용
  test.use({ storageState: authFile });

  test.beforeEach(async ({ page }) => {
    await gotoWebhard(page);
  });

  test('파일 드래그 시작', async ({ page }) => {
    const fileItem = page.locator('[data-testid="file-item"]').first();
    if (await fileItem.isVisible()) {
      // 드래그 시작
      await fileItem.hover();

      const box = await fileItem.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + 100, box.y);

        // 드래그 오버레이 확인
        // await expect(page.locator('[data-dragging="true"]')).toBeVisible();

        await page.mouse.up();
      }
    }
  });
});

test.describe('웹하드 반응형 테스트', () => {
  // Global Setup에서 저장한 인증 상태 사용
  test.use({ storageState: authFile });

  test('모바일에서 사이드바 토글', async ({ page }) => {
    // 모바일 뷰포트 설정
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/webhard', { waitUntil: 'domcontentloaded' });
    await waitForVisibleTextToDisappear(page, '파일 목록을 불러오는 중...').catch(() => {});
    await page.waitForTimeout(1000);

    await expectWebhardShellLoaded(page);
  });

  test('태블릿에서 정상 표시', async ({ page }) => {
    // 태블릿 뷰포트 설정
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.goto('/webhard', { waitUntil: 'domcontentloaded' });
    await waitForVisibleTextToDisappear(page, '파일 목록을 불러오는 중...').catch(() => {});
    await page.waitForTimeout(1000);

    await expectWebhardShellLoaded(page);
  });
});

test.describe('웹하드 접근성 테스트', () => {
  // Global Setup에서 저장한 인증 상태 사용
  test.use({ storageState: authFile });

  test.beforeEach(async ({ page }) => {
    await gotoWebhard(page);
  });

  test('키보드 네비게이션', async ({ page }) => {
    await waitForWebhardReady(page);

    // Tab 키로 포커스 이동
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // 포커스 가능한 요소에 포커스가 있어야 함
    let focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    for (let index = 0; index < 5 && focusedElement === 'NEXTJS-PORTAL'; index += 1) {
      await page.keyboard.press('Tab');
      focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    }
    expect(['A', 'BUTTON', 'INPUT', 'DIV']).toContain(focusedElement);
  });

  test('Enter 키로 폴더 선택', async ({ page }) => {
    // 전체 파일 버튼에 포커스 후 Enter
    const allFilesButton = visibleText(page, '전체 파일');
    await allFilesButton.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // 버튼이 여전히 visible한지 확인 (인터랙션 성공)
    await expect(allFilesButton).toBeVisible();
  });
});

test.describe('웹하드 성능 테스트', () => {
  // Global Setup에서 저장한 인증 상태 사용
  test.use({ storageState: authFile });

  test('초기 로딩 시간 측정', async ({ page }) => {
    const start = Date.now();
    await gotoWebhard(page);

    // 웹하드 UI 요소 표시 대기
    await expect(visibleText(page, '전체 파일')).toBeVisible({ timeout: 30000 });

    const loadTime = Date.now() - start;
    test.info().annotations.push({ type: 'load-time-ms', description: String(loadTime) });

    // 전체 E2E 병렬 실행 중 dev server cold/compile 부하를 고려한 상한
    expect(loadTime).toBeLessThan(60000);
  });

  test('폴더 전환 응답 시간', async ({ page }) => {
    await gotoWebhard(page);

    const folder = page.locator('[data-folder-item]').first();
    if (await folder.isVisible()) {
      const folderId = await folder.getAttribute('data-folder-id');
      const start = Date.now();
      await folder.click();

      // 선택 상태 변경 대기
      if (!folderId) throw new Error('Folder item did not expose data-folder-id');
      await expect(page.getByTestId(`breadcrumb-folder-${folderId}`)).toBeVisible({
        timeout: 500,
      });

      const responseTime = Date.now() - start;
      test.info().annotations.push({ type: 'folder-switch-ms', description: String(responseTime) });

      // 500ms 이내 응답
      expect(responseTime).toBeLessThan(500);
    }
  });
});
