import { expect, type Locator, type Page } from '@playwright/test';
import path from 'path';

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface WorkerCredentials {
  name: string;
  pin: string;
}

function envOrDefault(value: string | undefined, fallback: string): string {
  return value && value.trim().length > 0 ? value : fallback;
}

export const adminStorageStatePath = path.join(__dirname, '..', '..', '.auth', 'user.json');

export const adminCredentials: LoginCredentials = {
  username: envOrDefault(process.env.TEST_ADMIN_USERNAME, 'test_admin'),
  password: envOrDefault(process.env.TEST_ADMIN_PASSWORD, 'test_admin123'),
};

export const companyACredentials: LoginCredentials = {
  username: envOrDefault(process.env.TEST_COMPANY_A_USERNAME, 'test_company_a'),
  password: envOrDefault(process.env.TEST_COMPANY_A_PASSWORD, 'test1234'),
};

export const companyBCredentials: LoginCredentials = {
  username: envOrDefault(process.env.TEST_COMPANY_B_USERNAME, 'test_company_b'),
  password: envOrDefault(process.env.TEST_COMPANY_B_PASSWORD, 'test1234'),
};

export const fieldWorkerCredentials: WorkerCredentials = {
  name: envOrDefault(process.env.TEST_FIELD_WORKER_NAME, '이테스트'),
  pin: envOrDefault(process.env.TEST_FIELD_WORKER_PIN, '5678'),
};

export const officeWorkerCredentials: WorkerCredentials = {
  name: envOrDefault(process.env.TEST_OFFICE_WORKER_NAME, '김테스트'),
  pin: envOrDefault(process.env.TEST_OFFICE_WORKER_PIN, '1234'),
};

export const fixtureFile = {
  businessRegistration: path.join(
    __dirname,
    '..',
    'fixtures',
    'files',
    'business-registration.pdf'
  ),
  drawing: path.join(__dirname, '..', 'fixtures', 'files', 'sample-drawing.dxf'),
  proofPhoto: path.join(process.cwd(), 'public', 'images', 'box-shapes', 'y-box.png'),
  referencePhoto: path.join(process.cwd(), 'public', 'images', 'box-shapes', 'tuck.png'),
  textFile: path.join(__dirname, '..', 'fixtures', 'files', 'webhard-sample.txt'),
};

export async function clearBrowserState(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

export async function fillStableInput(page: Page, input: Locator, value: string): Promise<void> {
  await expect(input).toBeVisible({ timeout: 15000 });
  await expect(input).toBeEnabled({ timeout: 15000 });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await input.fill(value);
    await expect(input).toHaveValue(value, { timeout: 5000 });
    await page.waitForTimeout(400);

    if ((await input.inputValue().catch(() => '')) === value) {
      return;
    }
  }

  await expect(input).toHaveValue(value, { timeout: 5000 });
}

export async function loginAs(
  page: Page,
  credentials: LoginCredentials,
  nextPath: string
): Promise<void> {
  const targetPath = nextPath.split('?')[0] ?? nextPath;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(`/login?next=${encodeURIComponent(nextPath)}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('form[data-login-preferences-ready="true"]')).toBeVisible({
      timeout: 15000,
    });
    const usernameInput = page.locator('#login-username');
    const passwordInput = page.locator('#login-password');
    await fillStableInput(page, usernameInput, credentials.username);
    await fillStableInput(page, passwordInput, credentials.password);

    const loginButton = page.getByRole('button', { name: '로그인' });
    await expect(loginButton).toBeEnabled({ timeout: 15000 });
    await loginButton.click();

    const navigated = await page
      .waitForURL((url) => !url.pathname.startsWith('/login'), {
        timeout: 45000,
      })
      .then(() => true)
      .catch(() => false);

    if (navigated) {
      if (!new URL(page.url()).pathname.startsWith(targetPath)) {
        await page.goto(nextPath, { waitUntil: 'domcontentloaded' });
      }
      return;
    }
  }

  throw new Error(`Login did not leave /login after retrying as ${credentials.username}`);
}

export async function loginAsAdmin(page: Page, nextPath = '/admin'): Promise<void> {
  await loginAs(page, adminCredentials, nextPath);
}

export async function loginAsCompanyA(page: Page, nextPath = '/company/dashboard'): Promise<void> {
  await loginAs(page, companyACredentials, nextPath);
}

export async function loginAsCompanyB(page: Page, nextPath = '/company/dashboard'): Promise<void> {
  await loginAs(page, companyBCredentials, nextPath);
}

export async function loginAsWorker(page: Page, credentials: WorkerCredentials): Promise<void> {
  await page.goto('/worker/login', { waitUntil: 'domcontentloaded' });
  const nameInput = page.locator('#worker-name');
  const firstDigitButton = page.getByRole('button', { name: credentials.pin[0] }).first();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await fillStableInput(page, nameInput, credentials.name);
    const keypadReady = await expect(firstDigitButton)
      .toBeEnabled({ timeout: 1500 })
      .then(() => true)
      .catch(() => false);
    if (keypadReady) {
      break;
    }
  }

  await expect(firstDigitButton).toBeEnabled({ timeout: 10000 });
  for (const digit of credentials.pin) {
    const digitButton = page.getByRole('button', { name: digit }).first();
    await expect(digitButton).toBeEnabled({ timeout: 5000 });
    await digitButton.click();
  }
  await page.waitForURL(/\/worker\/dashboard/, { timeout: 45000 });
}

export async function expectPageReady(
  page: Page,
  pathPattern: RegExp,
  visibleText: string | RegExp
): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  expect(page.url()).toMatch(pathPattern);
  await expect(page.getByText(visibleText).first()).toBeVisible({ timeout: 45000 });
}

export async function fillInputByName(page: Page, name: string, value: string): Promise<void> {
  const input = page.locator(`[name="${name}"]`).first();
  await fillStableInput(page, input, value);
}

export async function selectByName(page: Page, name: string, value: string): Promise<void> {
  const select = page.locator(`select[name="${name}"]`).first();
  await expect(select, `select[name="${name}"]`).toBeVisible({ timeout: 15000 });
  await select.selectOption(value);
  await expect(select).toHaveValue(value, { timeout: 5000 });
}

export async function setFileByName(page: Page, name: string, filePath: string): Promise<void> {
  const input = page.locator(`input[name="${name}"]`).first();
  await expect(input, `input[name="${name}"]`).toBeAttached({ timeout: 15000 });
  await input.setInputFiles(filePath);
}

async function findFirstVisible(
  page: Page,
  locator: Locator,
  timeout = 1000
): Promise<Locator | null> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      if (await candidate.isVisible().catch(() => false)) {
        return candidate;
      }
    }
    await page.waitForTimeout(100);
  }

  return null;
}

export async function clickFirstVisible(
  page: Page,
  names: Array<string | RegExp>
): Promise<Locator> {
  for (const name of names) {
    const button = await findFirstVisible(page, page.getByRole('button', { name }));
    if (button) {
      await button.click();
      return button;
    }

    const link = await findFirstVisible(page, page.getByRole('link', { name }));
    if (link) {
      await link.click();
      return link;
    }

    const tab = await findFirstVisible(page, page.getByRole('tab', { name }));
    if (tab) {
      await tab.click();
      return tab;
    }

    const text = await findFirstVisible(page, page.getByText(name));
    if (text) {
      await text.click();
      return text;
    }
  }

  throw new Error(`No visible UI target matched: ${names.map(String).join(', ')}`);
}

export async function expectOneOfTexts(page: Page, texts: Array<string | RegExp>): Promise<void> {
  await expect
    .poll(
      async () => {
        const bodyText = await page
          .locator('body')
          .innerText({ timeout: 1000 })
          .catch(() => '');
        return texts.some((text) =>
          typeof text === 'string' ? bodyText.includes(text) : text.test(bodyText)
        );
      },
      {
        message: `No expected visible text matched: ${texts.map(String).join(', ')}`,
        timeout: 60000,
      }
    )
    .toBe(true);
}

export async function expectNoVisibleText(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.getByText(text)).toHaveCount(0);
}

export async function gotoAuthed(page: Page, pathName: string): Promise<void> {
  try {
    await page.goto(pathName, { waitUntil: 'domcontentloaded' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/ERR_ABORTED|NS_BINDING_ABORTED|interrupted by another navigation/i.test(message)) {
      throw error;
    }
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  }
  await page.waitForLoadState('domcontentloaded');
  expect(page.url()).not.toContain('/login');
}

export async function waitForAppLoadingToSettle(page: Page, timeout = 30000): Promise<void> {
  await page
    .getByAltText('Loading...')
    .first()
    .waitFor({ state: 'hidden', timeout })
    .catch(() => undefined);
  await page
    .getByText(/로딩 중|불러오는 중/)
    .first()
    .waitFor({ state: 'hidden', timeout })
    .catch(() => undefined);
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const documentWidth = document.documentElement.scrollWidth;
    const viewportWidth = window.innerWidth;
    const offenders = Array.from(document.body.querySelectorAll<HTMLElement>('*'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          text: (element.textContent ?? '').trim().slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          className: String(element.className ?? '').slice(0, 120),
        };
      })
      .filter((item) => item.right > viewportWidth + 1 || item.left < -1)
      .slice(0, 5);

    return {
      hasOverflow: documentWidth > viewportWidth + 1,
      documentWidth,
      viewportWidth,
      offenders,
    };
  });
  expect(overflow.hasOverflow, JSON.stringify(overflow, null, 2)).toBe(false);
}

export async function closeVisibleMobileMenu(page: Page): Promise<void> {
  const closeButton = page.getByRole('button', { name: /메뉴 닫기/ }).first();
  if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.keyboard.press('Escape').catch(() => undefined);
  }
  if (await closeButton.isVisible({ timeout: 500 }).catch(() => false)) {
    await closeButton.evaluate((button: HTMLButtonElement) => {
      button.click();
    });
    await expect(closeButton)
      .toBeHidden({ timeout: 3000 })
      .catch(async () => {
        await page.keyboard.press('Escape').catch(() => undefined);
        await expect(closeButton).toBeHidden({ timeout: 3000 });
      });
  }
}
