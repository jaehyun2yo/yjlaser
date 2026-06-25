import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config({ path: process.env.OPERATIONAL_E2E_ENV_FILE || '.env.local' });

const usesGoogleDriveStorage = Boolean(process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID);

/**
 * Playwright E2E 테스트 설정
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/ui-*.spec.ts',

  /* Global Setup: 모든 테스트 실행 전 1번만 로그인하고 auth state 저장 */
  globalSetup: require.resolve('./e2e/global-setup.ts'),
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI and real Google Drive storage runs. */
  workers: process.env.CI || usesGoogleDriveStorage ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['html', { outputFolder: 'playwright-report' }], ['list']],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure */
    video: 'on-first-retry',

    /* Default timeout for actions (file uploads may take longer) */
    actionTimeout: 30 * 1000, // 30 seconds
  },

  /* Global timeout for each test (default: 30s, increased for file operations) */
  timeout: 120 * 1000, // 120 seconds

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },

    /* Test against tablet viewports. */
    {
      name: 'Tablet',
      use: { ...devices['iPad Pro 11'] },
    },
  ],

  /* Run your local API and frontend dev servers before starting the tests */
  webServer: [
    {
      command: 'pnpm --dir webhard-api start',
      url: 'http://localhost:4000/api/v1/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
    {
      command: 'npx next dev', // Turbopack 없이 실행 (Turbopack 패닉 방지)
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  ],
});
