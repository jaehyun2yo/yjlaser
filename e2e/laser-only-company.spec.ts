import {
  test,
  expect,
  type APIRequestContext,
  type APIResponse,
  type Page,
  type Response,
} from '@playwright/test';
import * as path from 'path';

/**
 * 레이저가공 전용 업체 기능 E2E 테스트
 *
 * 검증 대상:
 * 1. 관리자 업체 상세 페이지 — 레이저 전용 토글 표시
 * 2. 레이저 전용 토글 동작 (설정/해제)
 * 3. 상태 라벨에 "작업완료" 존재 확인
 * 4. 업체 목록에서 레이저 전용 배지 표시
 *
 * 라우팅 참고:
 * - /admin/companies -> /admin/integration/companies (next.config.ts redirect)
 * - /admin/companies/:id -> /admin/integration/companies/:id (next.config.ts redirect)
 * - /admin/contacts -> /admin/work-management (next.config.ts redirect)
 * - LaserOnlyToggle은 /admin/companies/[id]/page.tsx에만 존재 (비리다이렉트 경로)
 *   integration/companies/[id]/page.tsx에는 LaserOnlyToggle 미포함 (정합성 이슈)
 *
 * Global Setup에서 저장한 관리자 인증 상태(.auth/user.json)를 재사용합니다.
 */

const authFile = path.join(__dirname, '..', '.auth', 'user.json');

type LaserCompanyApiResponse = {
  laser_only?: boolean;
  laserOnly?: boolean;
};

type LaserOnlyMappingApiResponse = {
  id: number;
  folder_name: string;
  company_id: number | null;
  company_name: string | null;
};

type CompanyOption = {
  id: number;
  company_name: string;
};

const PROJECT_COMPANY_OFFSETS: Record<string, number> = {
  chromium: 0,
  firefox: 1,
  webkit: 2,
  'Mobile Chrome': 3,
  'Mobile Safari': 4,
  Tablet: 5,
};
const PLAYWRIGHT_PROJECT_COUNT = Object.keys(PROJECT_COMPANY_OFFSETS).length;

function laserOnlyMappingRow(page: Page, folderName: string) {
  return page
    .getByTestId('laser-only-mapping-row')
    .filter({ has: page.getByText(folderName, { exact: true }) });
}

function pickCompanyForProject(
  companies: CompanyOption[],
  projectName: string,
  description: string
): CompanyOption {
  requireArrayLength(companies, PLAYWRIGHT_PROJECT_COUNT, description);
  const offset = PROJECT_COMPANY_OFFSETS[projectName] ?? 0;
  return companies[offset];
}

function requireApiKey(apiKey: string): string {
  expect(apiKey, 'MIGRATION_API_KEY is required for laser-only company E2E API checks').not.toBe(
    ''
  );
  return apiKey;
}

function requireValue<T>(value: T | null | undefined, description: string): T {
  expect(value, description).toBeTruthy();
  if (value === null || value === undefined) {
    throw new Error(description);
  }
  return value;
}

function requireArrayLength<T>(values: T[], minimum: number, description: string): T[] {
  expect(values.length, description).toBeGreaterThanOrEqual(minimum);
  return values;
}

async function expectApiOk(response: APIResponse, description: string): Promise<void> {
  expect(response.ok(), `${description} failed with status ${response.status()}`).toBe(true);
}

async function fetchLaserOnlyMappings(
  request: APIRequestContext,
  apiBaseUrl: string,
  apiKey: string
): Promise<LaserOnlyMappingApiResponse[]> {
  const response = await request.get(`${apiBaseUrl}/api/v1/companies/laser-only-mappings`, {
    headers: { 'X-API-Key': apiKey },
  });
  await expectApiOk(response, 'laser-only mappings lookup');
  return (await response.json()) as LaserOnlyMappingApiResponse[];
}

function isContactsListResponse(response: Response, status: string, search: string): boolean {
  try {
    const url = new URL(response.url());
    return (
      response.request().method() === 'GET' &&
      url.pathname.endsWith('/api/admin/contacts') &&
      url.searchParams.get('status') === status &&
      url.searchParams.get('search') === search
    );
  } catch {
    return false;
  }
}

function sanitizeRequestError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message.split('\n')[0] : String(error);

  return rawMessage
    .replace(/(X-API-Key:\s*)\S+/gi, '$1[redacted]')
    .replace(/(cookie:\s*)[^\n]+/gi, '$1[redacted]');
}

async function retryApiRequest(
  operation: () => Promise<APIResponse>,
  description: string
): Promise<APIResponse> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  throw new Error(`${description} failed after retries: ${sanitizeRequestError(lastError)}`);
}

async function gotoWithRetry(page: Page, url: string): Promise<void> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (
        !/NS_BINDING_ABORTED|interrupted by another navigation|frame was detached/i.test(message)
      ) {
        throw error;
      }
      await page.waitForTimeout(500 * (attempt + 1));
    }
  }

  throw lastError;
}

/**
 * NestJS API를 통해 첫 번째 활성 업체 ID를 가져온다.
 */
async function getFirstCompanyId(page: Page): Promise<number> {
  // 업체 목록 페이지 (리다이렉트 후 integration/companies로 감)
  await gotoWithRetry(page, '/admin/integration/companies');

  // 업체 목록 로드 대기
  await expect(page.getByRole('heading', { name: '업체 목록' }).first()).toBeVisible({
    timeout: 15000,
  });

  // 테이블에서 첫 번째 활성 업체의 상세보기 링크 찾기
  const rows = page.locator('tbody tr');
  const rowCount = await rows.count();
  for (let i = 0; i < rowCount; i++) {
    const row = rows.nth(i);
    const statusText = await row
      .locator('td')
      .nth(5)
      .innerText()
      .catch(() => '');
    if (!statusText.includes('활성') || statusText.includes('비활성')) continue;

    const href = await row.locator('a[href*="/admin/companies/"]').first().getAttribute('href');
    const match = href?.match(/\/admin\/companies\/(\d+)$/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  // fallback: 테이블에서 상세보기 링크 찾기
  const detailLinks = page.locator('a[href*="/admin/companies/"]');
  const count = await detailLinks.count();

  for (let i = 0; i < count; i++) {
    const href = await detailLinks.nth(i).getAttribute('href');
    // /admin/companies/{숫자} 형태만 매칭 (integration 경로 제외)
    const match = href?.match(/\/admin\/companies\/(\d+)$/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  throw new Error('업체 상세 링크를 찾을 수 없습니다.');
}

// ============================================================
// 1. 관리자 업체 상세 페이지 — 레이저 전용 토글 표시
//    Note: integration 경로에는 LaserOnlyToggle 미포함.
//    직접 /admin/companies/{id} 경로를 리다이렉트 없이 테스트하려면
//    비리다이렉트 경로가 필요하나, next.config.ts에서 차단됨.
//    따라서 API 직접 호출로 토글 기능을 검증하되,
//    프론트엔드 통합 테스트는 integration 페이지에서 수행.
// ============================================================
test.describe('관리자 업체 상세 페이지 — 레이저 전용 토글', () => {
  test.use({ storageState: authFile });

  test('업체 상세 페이지(integration)에 업체 정보가 정상 표시된다', async ({ page }) => {
    const companyId = await getFirstCompanyId(page);

    // integration 경로로 상세 페이지 접속
    await gotoWithRetry(page, `/admin/integration/companies/${companyId}`);

    // 페이지 제목 확인
    await expect(
      page.locator('h1:visible').filter({ hasText: '업체 상세정보' }).first()
    ).toBeVisible({
      timeout: 10000,
    });

    // 기본 버튼들이 존재하는지 확인
    await expect(page.locator('button').filter({ hasText: /비활성화|활성화/ })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('button').filter({ hasText: /웹하드 차단|웹하드 허용/ })).toBeVisible(
      {
        timeout: 10000,
      }
    );
  });

  test('[정합성 이슈] integration 업체 상세에 LaserOnlyToggle이 누락되어 있다', async ({
    page,
  }) => {
    const companyId = await getFirstCompanyId(page);

    // next.config.ts 리다이렉트로 인해 /admin/companies/{id}가
    // /admin/integration/companies/{id}로 이동됨
    await gotoWithRetry(page, `/admin/integration/companies/${companyId}`);
    await expect(
      page.locator('h1:visible').filter({ hasText: '업체 상세정보' }).first()
    ).toBeVisible({
      timeout: 10000,
    });

    // LaserOnlyToggle 버튼이 없음을 확인 (정합성 이슈 기록용)
    const laserToggleButton = page.locator('button').filter({
      hasText: /레이저 전용 설정|레이저 전용 해제/,
    });
    const buttonCount = await laserToggleButton.count();

    // 현재 상태: integration 페이지에는 버튼이 없음
    // 이 테스트가 실패하면 = 버튼이 추가된 것 = 이슈 해결됨
    expect(buttonCount).toBe(0);
  });
});

// ============================================================
// 2. 레이저 전용 토글 동작 — API 레벨 검증
//    프론트엔드 토글이 integration 경로에 없으므로,
//    API를 직접 호출하여 기능 동작을 검증한다.
// ============================================================
test.describe('레이저 전용 API 토글 동작', () => {
  test.use({ storageState: authFile });

  test('PATCH /api/v1/companies/:id/laser-only API가 정상 동작한다', async ({ page, request }) => {
    const companyId = await getFirstCompanyId(page);
    const apiBaseUrl = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';
    const apiKey = requireApiKey(process.env.MIGRATION_API_KEY || '');

    // 현재 상태 확인
    const getResponse = await request.get(`${apiBaseUrl}/api/v1/companies/${companyId}`, {
      headers: { 'X-API-Key': apiKey },
    });
    await expectApiOk(getResponse, 'company lookup before laser-only toggle');

    const data = (await getResponse.json()) as LaserCompanyApiResponse;
    const currentLaserOnly = Boolean(data.laser_only ?? data.laserOnly ?? false);

    // 토글 설정 (반대로)
    const patchResponse = await request.patch(
      `${apiBaseUrl}/api/v1/companies/${companyId}/laser-only`,
      {
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        data: { laserOnly: !currentLaserOnly },
      }
    );
    await expectApiOk(patchResponse, 'laser-only toggle patch');

    const result = (await patchResponse.json()) as { company?: LaserCompanyApiResponse };
    // 응답에서 상태 변경 확인
    expect(result.company).toBeDefined();
    expect(result.company?.laser_only).toBe(!currentLaserOnly);

    // 원래 상태로 복원
    const restoreResponse = await request.patch(
      `${apiBaseUrl}/api/v1/companies/${companyId}/laser-only`,
      {
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        data: { laserOnly: currentLaserOnly },
      }
    );
    await expectApiOk(restoreResponse, 'laser-only toggle restore');
  });
});

// ============================================================
// 3. 상태 필터에 "작업완료" 존재 확인
//    /admin/contacts -> /admin/work-management으로 리다이렉트됨
// ============================================================
test.describe('작업관리 — 상태 필터에 "작업완료" 존재', () => {
  test.use({ storageState: authFile });

  test('작업관리 페이지의 상태 필터에 "작업완료" 옵션이 존재한다', async ({ page }) => {
    // /admin/contacts가 /admin/work-management로 리다이렉트되므로 직접 이동
    await page.goto('/admin/work-management');
    await page.waitForLoadState('domcontentloaded');

    // 상태 필터에서 "작업완료" 버튼을 찾음
    const completedFilter = page.locator('button').filter({ hasText: '작업완료' });
    await expect(completedFilter).toBeVisible({ timeout: 15000 });
  });

  test('"작업완료" 필터를 클릭할 수 있다', async ({ page }) => {
    await page.goto('/admin/work-management');
    await page.waitForLoadState('domcontentloaded');

    const completedFilter = page.locator('button').filter({ hasText: '작업완료' });
    await expect(completedFilter).toBeVisible({ timeout: 15000 });

    // 클릭하여 필터 적용
    await completedFilter.click();
    await page.waitForTimeout(1000);

    // 클릭 후 에러 없이 동작하면 성공
    await expect(completedFilter).toBeVisible();
  });
});

// ============================================================
// 4. 업체 목록에서 레이저 전용 배지 표시
// ============================================================
test.describe.serial('업체 목록 — 레이저 전용 배지', () => {
  test.use({ storageState: authFile });

  test('업체 목록 페이지가 정상 로드된다', async ({ page }) => {
    await gotoWithRetry(page, '/admin/integration/companies');

    const heading = page.getByRole('heading', { name: '업체 목록' }).first();
    await expect(heading).toBeVisible({ timeout: 15000 });
  });

  test('레이저 전용 설정 시 업체 목록에 배지가 표시된다', async ({ page, request }) => {
    const companyId = await getFirstCompanyId(page);
    const apiBaseUrl = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';
    const apiKey = requireApiKey(process.env.MIGRATION_API_KEY || '');

    // API로 현재 상태 확인
    const getResponse = await request.get(`${apiBaseUrl}/api/v1/companies/${companyId}`, {
      headers: { 'X-API-Key': apiKey },
    });
    await expectApiOk(getResponse, 'company lookup before laser-only badge setup');

    const companyData = (await getResponse.json()) as LaserCompanyApiResponse;
    const wasLaserOnly = Boolean(companyData.laser_only);

    // 레이저 전용이 아니면 설정
    if (!wasLaserOnly) {
      const patchResp = await request.patch(
        `${apiBaseUrl}/api/v1/companies/${companyId}/laser-only`,
        {
          headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
          data: { laserOnly: true },
        }
      );
      await expectApiOk(patchResp, 'laser-only badge setup patch');
    }

    // 업체 목록 페이지로 이동 (캐시 우회를 위해 timestamp 쿼리 추가)
    await gotoWithRetry(page, `/admin/integration/companies?_t=${Date.now()}`);
    await expect(page.getByRole('heading', { name: '업체 목록' }).first()).toBeVisible({
      timeout: 15000,
    });

    // 레이저 전용 배지 (title="레이저가공 전용") 확인
    const laserBadge = page.locator('[title="레이저가공 전용"]');
    await expect(laserBadge.first()).toBeVisible({ timeout: 10000 });

    // --- 원래 상태로 복원 ---
    if (!wasLaserOnly) {
      const restoreResponse = await request.patch(
        `${apiBaseUrl}/api/v1/companies/${companyId}/laser-only`,
        {
          headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
          data: { laserOnly: false },
        }
      );
      await expectApiOk(restoreResponse, 'laser-only badge setup restore');
    }
  });

  test('레이저 전용 해제 시 API에서 상태가 false로 변경된다', async ({ page, request }) => {
    const companyId = await getFirstCompanyId(page);
    const apiBaseUrl = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';
    const apiKey = requireApiKey(process.env.MIGRATION_API_KEY || '');

    // API 접근 가능 여부 확인
    const getResponse = await retryApiRequest(
      () =>
        request.get(`${apiBaseUrl}/api/v1/companies/${companyId}`, {
          headers: { 'X-API-Key': apiKey },
        }),
      'company lookup'
    );
    await expectApiOk(getResponse, 'company lookup before laser-only disable');

    const companyData = (await getResponse.json()) as LaserCompanyApiResponse;
    const wasLaserOnly = companyData.laser_only || false;

    // 먼저 레이저 전용으로 설정 (해제 테스트를 위해 true 상태 보장)
    const enableResp = await retryApiRequest(
      () =>
        request.patch(`${apiBaseUrl}/api/v1/companies/${companyId}/laser-only`, {
          headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
          data: { laserOnly: true },
        }),
      'laser-only enable'
    );
    await expectApiOk(enableResp, 'laser-only enable before disable test');

    // 해제
    const patchResp = await retryApiRequest(
      () =>
        request.patch(`${apiBaseUrl}/api/v1/companies/${companyId}/laser-only`, {
          headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
          data: { laserOnly: false },
        }),
      'laser-only disable'
    );
    await expectApiOk(patchResp, 'laser-only disable patch');

    // API에서 해제 상태 확인
    const getResp2 = await retryApiRequest(
      () =>
        request.get(`${apiBaseUrl}/api/v1/companies/${companyId}`, {
          headers: { 'X-API-Key': apiKey },
        }),
      'company lookup after disable'
    );
    await expectApiOk(getResp2, 'company lookup after laser-only disable');
    const updatedData = (await getResp2.json()) as LaserCompanyApiResponse;
    expect(updatedData.laser_only).toBe(false);

    // --- 원래 상태로 복원 ---
    if (wasLaserOnly) {
      const restoreResp = await retryApiRequest(
        () =>
          request.patch(`${apiBaseUrl}/api/v1/companies/${companyId}/laser-only`, {
            headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
            data: { laserOnly: true },
          }),
        'laser-only restore'
      );
      await expectApiOk(restoreResp, 'laser-only restore after disable test');
    }
  });
});

// ============================================================
// 5. 웹하드 관리 — 레이저가공 업체 관리 UI
// ============================================================
test.describe('웹하드 관리 — 레이저가공 업체 관리', () => {
  test.use({ storageState: authFile });

  const apiBaseUrl = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';
  const apiKey = process.env.MIGRATION_API_KEY || '';

  test('웹하드 관리 페이지에 "레이저가공 업체 관리" 섹션이 표시된다', async ({ page }) => {
    await page.goto('/admin/integration/webhard');
    await page.waitForLoadState('domcontentloaded');

    const heading = page.locator('h2').filter({ hasText: '레이저가공 업체 관리' });
    await expect(heading).toBeVisible({ timeout: 15000 });
  });

  test('폴더명 직접 입력으로 매핑 추가 및 삭제', async ({ page, request }) => {
    const authorizedApiKey = requireApiKey(apiKey);
    // API 접근 가능 여부 확인
    const checkResponse = await request.get(`${apiBaseUrl}/api/v1/companies/laser-only-mappings`, {
      headers: { 'X-API-Key': authorizedApiKey },
    });
    await expectApiOk(checkResponse, 'laser-only mappings lookup before direct folder mapping');

    const testFolderName = `테스트업체_${Date.now()}`;

    // cleanup: 혹시 남아있을 수 있는 동일 이름 매핑 제거
    const existingMappings = (await checkResponse.json()) as Array<{
      id: number;
      folder_name: string;
    }>;
    for (const m of existingMappings) {
      if (m.folder_name === testFolderName) {
        await request.delete(`${apiBaseUrl}/api/v1/companies/laser-only-mappings/${m.id}`, {
          headers: { 'X-API-Key': authorizedApiKey },
        });
      }
    }

    // 1. 페이지 이동
    await page.goto('/admin/integration/webhard');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('h2').filter({ hasText: '레이저가공 업체 관리' })).toBeVisible({
      timeout: 15000,
    });

    // 2. 폴더명 입력 → 추가 버튼 클릭
    const folderInput = page.locator('input[placeholder="폴더명 직접입력"]');
    await folderInput.fill(testFolderName);

    const addButton = page
      .locator('h2')
      .filter({ hasText: '레이저가공 업체 관리' })
      .locator('..')
      .locator('..')
      .locator('..')
      .locator('button')
      .filter({ hasText: '추가' });
    await addButton.click();

    // 3. 목록에 추가된 항목 확인
    await expect(page.locator('text=' + testFolderName)).toBeVisible({ timeout: 10000 });

    // 4. 삭제 버튼 클릭
    const mappingRow = page.locator('text=' + testFolderName).locator('..');
    const deleteButton = mappingRow.locator('button[title="삭제"]');
    await deleteButton.click();

    // 5. 목록에서 제거 확인
    await expect(page.locator('text=' + testFolderName)).not.toBeVisible({ timeout: 10000 });
  });

  test('등록 업체 드롭다운으로 매핑 추가', async ({ page, request }, testInfo) => {
    const authorizedApiKey = requireApiKey(apiKey);
    // API 접근 가능 여부 확인
    const checkResponse = await request.get(`${apiBaseUrl}/api/v1/companies/laser-only-mappings`, {
      headers: { 'X-API-Key': authorizedApiKey },
    });
    await expectApiOk(checkResponse, 'laser-only mappings lookup before company dropdown mapping');

    // 업체 목록 조회
    const companiesResponse = await request.get(`${apiBaseUrl}/api/v1/companies/names`, {
      headers: { 'X-API-Key': authorizedApiKey },
    });
    await expectApiOk(companiesResponse, 'company names lookup for dropdown mapping');
    const companies = (await companiesResponse.json()) as CompanyOption[];
    const targetCompany = pickCompanyForProject(
      companies,
      testInfo.project.name,
      'At least one active company is required for dropdown mapping'
    );

    // cleanup: 동일 폴더명 매핑이 있으면 제거
    const existingMappings = (await checkResponse.json()) as Array<{
      id: number;
      folder_name: string;
    }>;
    for (const m of existingMappings) {
      if (m.folder_name === targetCompany.company_name) {
        const deleteResponse = await request.delete(
          `${apiBaseUrl}/api/v1/companies/laser-only-mappings/${m.id}`,
          {
            headers: { 'X-API-Key': authorizedApiKey },
          }
        );
        await expectApiOk(deleteResponse, 'stale dropdown laser-only mapping cleanup');
      }
    }

    // 1. 페이지 이동
    await page.goto('/admin/integration/webhard');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('h2').filter({ hasText: '레이저가공 업체 관리' })).toBeVisible({
      timeout: 15000,
    });

    // 2. 드롭다운에서 업체 선택
    const dropdown = page
      .locator('select')
      .filter({ has: page.locator('option', { hasText: '등록업체에서 선택' }) });
    await dropdown.selectOption({ value: String(targetCompany.id) });

    // 3. 추가 버튼 클릭
    const addButton = page
      .locator('h2')
      .filter({ hasText: '레이저가공 업체 관리' })
      .locator('..')
      .locator('..')
      .locator('..')
      .locator('button')
      .filter({ hasText: '추가' });
    await addButton.click();

    // 4. 목록에 업체 연결 상태로 표시 확인
    const addedMappingRow = laserOnlyMappingRow(page, targetCompany.company_name);
    await expect(addedMappingRow).toBeVisible({ timeout: 10000 });
    await expect(addedMappingRow.getByText(`연결: ${targetCompany.company_name}`)).toBeVisible({
      timeout: 10000,
    });
    await expect
      .poll(async () => {
        const mappings = await fetchLaserOnlyMappings(request, apiBaseUrl, authorizedApiKey);
        const createdMapping = mappings.find(
          (mapping) => mapping.folder_name === targetCompany.company_name
        );
        return createdMapping
          ? `${createdMapping.company_id}:${createdMapping.company_name}`
          : 'missing';
      })
      .toBe(`${targetCompany.id}:${targetCompany.company_name}`);

    // cleanup: 삭제
    const mappings = await fetchLaserOnlyMappings(request, apiBaseUrl, authorizedApiKey);
    for (const m of mappings) {
      if (m.folder_name === targetCompany.company_name) {
        const deleteResponse = await request.delete(
          `${apiBaseUrl}/api/v1/companies/laser-only-mappings/${m.id}`,
          {
            headers: { 'X-API-Key': authorizedApiKey },
          }
        );
        await expectApiOk(deleteResponse, 'dropdown laser-only mapping cleanup');
      }
    }
  });

  test('미연결 매핑에 업체 연결', async ({ page, request }) => {
    const authorizedApiKey = requireApiKey(apiKey);
    // API 접근 가능 여부 확인
    const checkResponse = await request.get(`${apiBaseUrl}/api/v1/companies/laser-only-mappings`, {
      headers: { 'X-API-Key': authorizedApiKey },
    });
    await expectApiOk(checkResponse, 'laser-only mappings lookup before unlinked mapping test');

    // 업체 목록 조회
    const companiesResponse = await request.get(`${apiBaseUrl}/api/v1/companies/names`, {
      headers: { 'X-API-Key': authorizedApiKey },
    });
    await expectApiOk(companiesResponse, 'company names lookup for mapping link test');
    const companies = (await companiesResponse.json()) as Array<{
      id: number;
      company_name: string;
    }>;
    requireArrayLength(
      companies,
      1,
      'At least one active company is required for mapping link test'
    );

    const testFolderName = `미연결테스트_${Date.now()}`;
    const targetCompany = companies[0];

    // 1. API로 미연결 매핑 생성
    const createResponse = await request.post(
      `${apiBaseUrl}/api/v1/companies/laser-only-mappings`,
      {
        headers: { 'X-API-Key': authorizedApiKey, 'Content-Type': 'application/json' },
        data: { folderName: testFolderName },
      }
    );
    await expectApiOk(createResponse, 'unlinked laser-only mapping create');
    const createdMapping = (await createResponse.json()) as { id: number };

    // 2. 페이지 이동
    await page.goto('/admin/integration/webhard');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('h2').filter({ hasText: '레이저가공 업체 관리' })).toBeVisible({
      timeout: 15000,
    });

    // 3. 미연결 항목 확인 및 "업체연결" 버튼 클릭
    const mappingRow = laserOnlyMappingRow(page, testFolderName);
    await expect(mappingRow).toBeVisible({ timeout: 10000 });
    const linkButton = mappingRow.locator('button').filter({ hasText: '업체연결' });
    await linkButton.click();

    // 4. 업체 선택 드롭다운에서 업체 선택
    const linkDropdown = mappingRow.locator('select');
    await linkDropdown.selectOption({ value: String(targetCompany.id) });

    // 5. 연결 버튼 클릭
    const confirmButton = mappingRow.locator('button').filter({ hasText: /^연결$/ });
    await confirmButton.click();

    // 6. 연결 완료 확인
    const linkedMappingRow = laserOnlyMappingRow(page, testFolderName);
    await expect(linkedMappingRow.getByText(`연결: ${targetCompany.company_name}`)).toBeVisible({
      timeout: 10000,
    });
    await expect
      .poll(async () => {
        const mappings = await fetchLaserOnlyMappings(request, apiBaseUrl, authorizedApiKey);
        const linkedMapping = mappings.find((mapping) => mapping.id === createdMapping.id);
        return linkedMapping
          ? `${linkedMapping.folder_name}:${linkedMapping.company_id}:${linkedMapping.company_name}`
          : 'missing';
      })
      .toBe(`${testFolderName}:${targetCompany.id}:${targetCompany.company_name}`);

    // cleanup: 삭제
    const deleteResponse = await request.delete(
      `${apiBaseUrl}/api/v1/companies/laser-only-mappings/${createdMapping.id}`,
      { headers: { 'X-API-Key': authorizedApiKey } }
    );
    await expectApiOk(deleteResponse, 'unlinked laser-only mapping cleanup');
  });
});

// ============================================================
// 6. 관리자 문의 목록 — 레이저가공 뱃지 및 필터
// ============================================================
test.describe('관리자 문의 목록 — 레이저가공', () => {
  test.use({ storageState: authFile });

  test('문의유형 필터에 "레이저가공" 옵션이 존재한다', async ({ page }) => {
    await page.goto('/admin/work-management');
    await page.waitForLoadState('domcontentloaded');

    // StatusFilterBar의 INQUIRY_TYPE_FILTERS에 레이저가공이 포함되어 있으므로
    // "문의유형" 필터 영역에서 "레이저가공" 버튼이 표시되어야 함
    const laserFilter = page.locator('button').filter({ hasText: '레이저가공' });
    await expect(laserFilter.first()).toBeVisible({ timeout: 15000 });
  });

  test('"레이저가공" 필터를 클릭할 수 있다', async ({ page }) => {
    await page.goto('/admin/work-management');
    await page.waitForLoadState('domcontentloaded');

    const laserFilter = page.locator('button').filter({ hasText: '레이저가공' });
    await expect(laserFilter.first()).toBeVisible({ timeout: 15000 });

    // 클릭하여 필터 적용
    await laserFilter.first().click();
    await page.waitForTimeout(1000);

    // 클릭 후 에러 없이 동작하면 성공
    await expect(laserFilter.first()).toBeVisible();
  });
});

// ============================================================
// 7. 전체 흐름 — 매핑 등록 → 문의 생성 → 상태 변경 → 확인
// ============================================================
test.describe.serial('레이저가공 전체 흐름', () => {
  test.use({ storageState: authFile });

  const apiBaseUrl = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';
  const apiKey = process.env.MIGRATION_API_KEY || '';
  const testFolderName = `E2E테스트업체_${Date.now()}`;
  let mappingId: number | undefined;
  let contactId: string | undefined;

  test('매핑 등록 → contacts API로 문의 생성', async ({ request }) => {
    const authorizedApiKey = requireApiKey(apiKey);

    // 1. 매핑 등록
    const addResp = await request.post(`${apiBaseUrl}/api/v1/companies/laser-only-mappings`, {
      headers: { 'X-API-Key': authorizedApiKey, 'Content-Type': 'application/json' },
      data: { folderName: testFolderName },
    });
    await expectApiOk(addResp, 'laser-only flow mapping create');
    const mapping = (await addResp.json()) as { id: number };
    mappingId = mapping.id;

    // 2. laser_cutting 문의 생성 (camelCase DTO)
    const contactResp = await request.post(`${apiBaseUrl}/api/v1/contacts`, {
      headers: { 'X-API-Key': authorizedApiKey, 'Content-Type': 'application/json' },
      data: {
        companyName: testFolderName,
        inquiryType: 'laser_cutting',
        status: 'cutting',
        processStage: 'laser',
        name: 'E2E테스트',
        phone: '010-0000-0000',
        email: 'e2e-test@test.com',
        source: 'webhard',
      },
    });
    await expectApiOk(contactResp, 'laser-only flow contact create');
    const contact = (await contactResp.json()) as { id: string };
    contactId = contact.id;
  });

  test('관리자 목록에서 레이저가공 뱃지 확인', async ({ page }) => {
    requireValue(
      contactId,
      'Previous laser-only flow step must create a contact before badge check'
    );

    const contactsResponsePromise = page
      .waitForResponse((response) => isContactsListResponse(response, 'cutting', testFolderName), {
        timeout: 90000,
      })
      .catch(() => null);

    await page.goto(
      `/admin/work-management?status=cutting&search=${encodeURIComponent(testFolderName)}`
    );
    await page.waitForLoadState('domcontentloaded');

    // 상태 필터가 렌더링되고 목록 검색이 끝날 때까지 대기
    const laserStatusFilter = page.locator('button').filter({ hasText: '레이저가공' });
    await expect(laserStatusFilter.first()).toBeVisible({ timeout: 30000 });

    const contactsResponse = await contactsResponsePromise;
    if (contactsResponse && !contactsResponse.ok()) {
      throw new Error(`Contacts list request failed with status ${contactsResponse.status()}`);
    }

    // 테스트 업체명으로 문의가 표시되는지 확인
    const companyText = page.getByText(testFolderName, { exact: false });
    await expect(companyText.first()).toBeVisible({ timeout: 60000 });
  });

  test('문의 상태 cutting → completed 전환', async ({ request }) => {
    const createdContactId = requireValue(
      contactId,
      'Previous laser-only flow step must create a contact before status transition'
    );
    const authorizedApiKey = requireApiKey(apiKey);

    const resp = await request.patch(`${apiBaseUrl}/api/v1/contacts/${createdContactId}/status`, {
      headers: { 'X-API-Key': authorizedApiKey, 'Content-Type': 'application/json' },
      data: { status: 'completed' },
    });
    await expectApiOk(resp, 'laser-only flow contact status update');

    const updated = (await resp.json()) as { status: string };
    expect(updated.status).toBe('completed');
  });

  test('상태 변경 후 작업완료 필터에 표시', async ({ page }) => {
    requireValue(
      contactId,
      'Previous laser-only flow step must create a contact before completed filter check'
    );

    const contactsResponsePromise = page
      .waitForResponse(
        (response) => isContactsListResponse(response, 'completed', testFolderName),
        {
          timeout: 90000,
        }
      )
      .catch(() => null);

    await page.goto(
      `/admin/work-management?status=completed&search=${encodeURIComponent(testFolderName)}`
    );
    await page.waitForLoadState('domcontentloaded');

    // "작업완료" 상태 필터가 렌더링되고 목록 검색이 끝날 때까지 대기
    const completedFilter = page.locator('button').filter({ hasText: '작업완료' });
    await expect(completedFilter.first()).toBeVisible({ timeout: 30000 });

    const contactsResponse = await contactsResponsePromise;
    if (contactsResponse && !contactsResponse.ok()) {
      throw new Error(`Contacts list request failed with status ${contactsResponse.status()}`);
    }

    // 테스트 업체명으로 문의가 표시되는지 확인
    const companyText = page.getByText(testFolderName, { exact: false });
    await expect(companyText.first()).toBeVisible({ timeout: 60000 });
  });

  test('cleanup — 테스트 데이터 삭제', async ({ request }) => {
    if (!apiKey) return;

    // 문의 삭제 (permanent)
    if (contactId) {
      await request.delete(`${apiBaseUrl}/api/v1/contacts/${contactId}`, {
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        data: { permanent: true },
      });
    }

    // 매핑 삭제
    if (mappingId) {
      await request.delete(`${apiBaseUrl}/api/v1/companies/laser-only-mappings/${mappingId}`, {
        headers: { 'X-API-Key': apiKey },
      });
    }
  });
});

// ============================================================
// 8. 업체 연결 시 기존 문의 companyName 동기화 검증
// ============================================================
test.describe.serial('업체 연결 — 기존 문의 동기화', () => {
  test.use({ storageState: authFile });

  const apiBaseUrl = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';
  const apiKey = process.env.MIGRATION_API_KEY || '';
  const testFolderName = 'SyncTest_' + Date.now();
  let mappingId: number | undefined;
  let contactIds: string[] = [];
  let targetCompany: { id: number; company_name: string } | undefined;

  test('Setup — 테스트 데이터 생성 (미연결 매핑 + 문의 2건)', async ({ request }) => {
    const authorizedApiKey = requireApiKey(apiKey);

    // 미연결 매핑 생성
    const mappingResp = await request.post(`${apiBaseUrl}/api/v1/companies/laser-only-mappings`, {
      headers: { 'X-API-Key': authorizedApiKey, 'Content-Type': 'application/json' },
      data: { folderName: testFolderName },
    });
    await expectApiOk(mappingResp, 'sync flow unlinked mapping create');
    const mapping = (await mappingResp.json()) as { id: number };
    mappingId = mapping.id;

    // 문의 2건 생성
    for (let i = 0; i < 2; i++) {
      const contactResp = await request.post(`${apiBaseUrl}/api/v1/contacts`, {
        headers: { 'X-API-Key': authorizedApiKey, 'Content-Type': 'application/json' },
        data: {
          companyName: testFolderName,
          inquiryType: 'laser_cutting',
          status: 'cutting',
          processStage: 'laser',
          name: `동기화테스트_${i}`,
          phone: '010-0000-0000',
          email: `sync-test-${i}@test.com`,
          source: 'webhard',
        },
      });
      await expectApiOk(contactResp, `sync flow contact ${i} create`);
      const contact = (await contactResp.json()) as { id: string };
      contactIds.push(contact.id);
    }
  });

  test('업체 연결 — linkCompany 호출 및 updated_contact_count 확인', async ({ request }) => {
    const createdMappingId = requireValue(
      mappingId,
      'Previous sync flow step must create a mapping before linking company'
    );
    requireArrayLength(
      contactIds,
      2,
      'Previous sync flow step must create two contacts before linking company'
    );
    const authorizedApiKey = requireApiKey(apiKey);

    // 첫 번째 업체 조회
    const companiesResp = await request.get(`${apiBaseUrl}/api/v1/companies/names`, {
      headers: { 'X-API-Key': authorizedApiKey },
    });
    await expectApiOk(companiesResp, 'company names lookup for sync flow link');
    const companies = (await companiesResp.json()) as Array<{
      id: number;
      company_name: string;
    }>;
    const activeCompanies = requireArrayLength(
      companies,
      1,
      'At least one active company is required for sync flow link'
    );
    targetCompany =
      activeCompanies.find((company) => company.company_name !== testFolderName) ??
      activeCompanies[0];
    expect(targetCompany.company_name).not.toBe(testFolderName);

    // 업체 연결
    const linkResp = await request.patch(
      `${apiBaseUrl}/api/v1/companies/laser-only-mappings/${createdMappingId}/link`,
      {
        headers: { 'X-API-Key': authorizedApiKey, 'Content-Type': 'application/json' },
        data: { companyId: targetCompany.id },
      }
    );
    await expectApiOk(linkResp, 'sync flow mapping link');
    const linkResult = (await linkResp.json()) as {
      company_id: number;
      updated_contact_count?: number;
    };

    expect(linkResult.company_id).toBe(targetCompany.id);

    expect(linkResult.updated_contact_count).toBe(2);
  });

  test('문의 companyName이 연결된 업체명으로 변경되었는지 확인', async ({ request }) => {
    const linkedCompany = requireValue(
      targetCompany,
      'Previous sync flow step must link a target company before companyName verification'
    );
    requireArrayLength(
      contactIds,
      2,
      'Previous sync flow step must create two contacts before companyName verification'
    );
    const authorizedApiKey = requireApiKey(apiKey);

    for (const cId of contactIds) {
      const resp = await request.get(`${apiBaseUrl}/api/v1/contacts/${cId}`, {
        headers: { 'X-API-Key': authorizedApiKey },
      });
      await expectApiOk(resp, `sync flow contact ${cId} lookup after link`);
      const contact = (await resp.json()) as { company_name: string };
      expect(contact.company_name).toBe(linkedCompany.company_name);
    }
  });

  test('업체 대시보드에서 동기화된 문의 조회', async ({ request }) => {
    const linkedCompany = requireValue(
      targetCompany,
      'Previous sync flow step must link a target company before dashboard lookup'
    );
    requireArrayLength(
      contactIds,
      2,
      'Previous sync flow step must create two contacts before dashboard lookup'
    );
    const authorizedApiKey = requireApiKey(apiKey);

    const resp = await request.get(
      `${apiBaseUrl}/api/v1/contacts/by-company?companyName=${encodeURIComponent(linkedCompany.company_name)}`,
      { headers: { 'X-API-Key': authorizedApiKey } }
    );
    await expectApiOk(resp, 'sync flow company dashboard contact lookup');
    const contacts = (await resp.json()) as Array<{ id: string }>;

    // 변경된 문의 2건이 포함되어 있는지 확인
    const returnedIds = contacts.map((c) => c.id);
    for (const cId of contactIds) {
      expect(returnedIds).toContain(cId);
    }
  });

  test('cleanup — 테스트 데이터 삭제', async ({ request }) => {
    if (!apiKey) return;

    // 문의 삭제 (permanent)
    for (const cId of contactIds) {
      await request.delete(`${apiBaseUrl}/api/v1/contacts/${cId}`, {
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        data: { permanent: true },
      });
    }

    // 매핑 삭제
    if (mappingId) {
      await request.delete(`${apiBaseUrl}/api/v1/companies/laser-only-mappings/${mappingId}`, {
        headers: { 'X-API-Key': apiKey },
      });
    }
  });
});

// ============================================================
// 9. 백업 설정 — 프록시 API를 통한 데이터 로드
// ============================================================
test.describe('백업 설정 — 데이터 로드', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: authFile });

  test('웹하드 관리 페이지에서 백업 설정 섹션이 표시된다', async ({ page }) => {
    await page.goto('/admin/integration/webhard');
    await page.waitForLoadState('domcontentloaded');

    // "백업 설정" 섹션 존재 확인
    const heading = page.locator('h2').filter({ hasText: '백업 설정' });
    await expect(heading).toBeVisible({ timeout: 60000 });

    // 로딩 상태가 사라지고 실제 UI(토글 또는 폼)가 표시되는지 확인
    const loading = page.locator('text=설정을 불러오는 중...');
    await expect(loading).not.toBeVisible({ timeout: 60000 });

    // 설정 폼 UI 요소 확인 (토글 또는 저장 버튼)
    const settingsForm = page.locator('button[role="switch"], button:has-text("설정 저장")');
    await expect(settingsForm.first()).toBeVisible({ timeout: 60000 });
  });

  test('백업 현황 섹션에 데이터가 표시된다', async ({ page }) => {
    await page.goto('/admin/integration/webhard');
    await page.waitForLoadState('domcontentloaded');

    // "백업 현황" 섹션 존재 확인
    const heading = page.locator('h2').filter({ hasText: '백업 현황' });
    await expect(heading).toBeVisible({ timeout: 60000 });

    // 로딩 완료 대기: "현황을 불러오는 중..." 텍스트가 사라져야 함
    const loading = page.locator('text=현황을 불러오는 중...');
    await expect(loading).not.toBeVisible({ timeout: 60000 });

    // 에러 없음 확인: "현황 조회에 실패했습니다." 표시되지 않아야 함
    const errorMsg = page.locator('text=현황 조회에 실패했습니다.');
    await expect(errorMsg).not.toBeVisible();
  });
});
