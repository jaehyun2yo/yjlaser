import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

export default defineConfig({
  ...baseConfig,
  testMatch: '**/google-drive-webhard-user-qa.spec.ts',
  workers: 1,
  reporter: [['list']],
});
