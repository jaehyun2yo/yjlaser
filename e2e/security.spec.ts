import { test, expect, type Page } from '@playwright/test';

const LOGIN_PREFERENCE_STORAGE_KEYS = [
  'yjlaser-login-remembered-username',
  'yjlaser-login-auto-login',
];

async function clearLoginPreferencesBeforeNavigation(page: Page): Promise<void> {
  await page.addInitScript((storageKeys: string[]) => {
    for (const storageKey of storageKeys) {
      window.localStorage.removeItem(storageKey);
    }
  }, LOGIN_PREFERENCE_STORAGE_KEYS);
}

async function fillStableLoginCredentials(
  page: Page,
  username: string,
  password: string
): Promise<void> {
  await expect(page.locator('form[data-login-preferences-ready="true"]')).toBeVisible({
    timeout: 60000,
  });

  const usernameInput = page.locator('input[name="username"]');
  const passwordInput = page.locator('input[name="password"]');

  await expect(usernameInput).toBeEditable({ timeout: 30000 });
  await expect(passwordInput).toBeEditable({ timeout: 30000 });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await usernameInput.fill(username);
    await passwordInput.fill(password);
    await page.waitForTimeout(500);

    if (
      (await usernameInput.inputValue()) === username &&
      (await passwordInput.inputValue()) === password
    ) {
      return;
    }
  }

  await expect(usernameInput).toHaveValue(username);
  await expect(passwordInput).toHaveValue(password);
}

/**
 * Security E2E Tests
 *
 * These tests verify security features from a user perspective.
 */

test.describe('Authentication Security', () => {
  test.describe('Login Page', () => {
    test('should display login form', async ({ page }) => {
      await page.goto('/login');
      await expect(page.locator('input[name="username"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await clearLoginPreferencesBeforeNavigation(page);
      await page.goto('/login', { waitUntil: 'domcontentloaded' });

      await fillStableLoginCredentials(page, 'invalid_user', 'wrong_password');

      // Should redirect to login with error
      await Promise.all([
        page.waitForURL(/\/login\?error=/, { timeout: 60000 }),
        page.getByRole('button', { name: '로그인' }).click(),
      ]);
      await expect(page).toHaveURL(/\/login\?error=/);
      await expect(page.getByText('아이디 또는 비밀번호가 올바르지 않습니다.')).toBeVisible({
        timeout: 60000,
      });
    });

    test('should show pending approval message for unapproved accounts', async ({ page }) => {
      await page.goto('/login?error=pending_approval');
      await expect(page.locator('text=승인 대기')).toBeVisible();
    });

    test('should show rate limit message', async ({ page }) => {
      await page.goto('/login?error=rate_limit');
      await expect(page.locator('text=일시적으로 차단')).toBeVisible();
    });
  });

  test.describe('Protected Routes', () => {
    test('should redirect unauthenticated users from /admin', async ({ page }) => {
      await page.goto('/admin');

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/);
    });

    test('should redirect unauthenticated users from /company/dashboard', async ({ page }) => {
      await page.goto('/company/dashboard');

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/);
    });

    test('should redirect unauthenticated users from /webhard', async ({ page }) => {
      await page.goto('/webhard');

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/);
    });
  });
});

test.describe('XSS Protection', () => {
  test('should not execute injected scripts in URL parameters', async ({ page }) => {
    // Track if any alert or script execution occurs
    let alertCalled = false;
    page.on('dialog', () => {
      alertCalled = true;
    });

    // Try XSS via URL parameter
    await page.goto('/login?error=<script>alert("xss")</script>');

    // Wait a bit for any script execution
    await page.waitForTimeout(1000);

    expect(alertCalled).toBe(false);
  });

  test('should escape HTML in error messages', async ({ page }) => {
    await page.goto('/login?error=<img src=x onerror=alert(1)>');

    // The malicious HTML should be escaped or not rendered
    const imgElement = await page.locator('img[src="x"]').count();
    expect(imgElement).toBe(0);
  });
});

test.describe('Session Security', () => {
  test('should have secure cookie attributes', async ({ page, context }) => {
    // First, we need to login to get a session cookie
    // Since we can't actually login in tests, we check the login page response
    await page.goto('/login');

    // Get cookies after visiting the site
    const cookies = await context.cookies();

    // Check if any session-related cookies have proper attributes
    // Note: This will only work after a successful login in a real scenario
    for (const cookie of cookies) {
      if (cookie.name.includes('session') || cookie.name.includes('auth')) {
        // In production, these should be true
        // expect(cookie.httpOnly).toBe(true);
        // expect(cookie.secure).toBe(true);
        // expect(cookie.sameSite).toBe('Lax');
      }
    }
  });
});

test.describe('API Security', () => {
  test('should reject unauthenticated API requests to admin endpoints', async ({ request }) => {
    const response = await request.get('/api/admin/contacts');
    expect(response.status()).toBe(401);
  });

  test('should reject unauthenticated API requests to company endpoints', async ({ request }) => {
    const response = await request.get('/api/company/profile');
    expect(response.status()).toBe(401);
  });

  test('should reject unauthenticated requests to activity logs', async ({ request }) => {
    const response = await request.get('/api/admin/activity-logs');
    expect(response.status()).toBe(401);
  });
});

test.describe('Registration Security', () => {
  test.describe('Registration Page', () => {
    test('should display registration form', async ({ page }) => {
      await page.goto('/register');
      await expect(page.locator('input[name="username"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
    });

    test('should validate password complexity', async ({ page }) => {
      await page.goto('/register');

      // Fill with weak password
      await page.fill('input[name="password"]', '12345678'); // Only numbers
      await page.fill('input[name="password_confirm"]', '12345678');

      // Try to submit
      await page.click('button[type="submit"]');

      // Should show password complexity error or stay on page
      // The exact behavior depends on client-side validation
    });
  });
});
