import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_BROWSER
      ? { executablePath: process.env.PLAYWRIGHT_BROWSER }
      : {},
  },
  projects: [
    {
      name: 'mobile',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    { name: 'desktop', use: { viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' } },
  ],
  webServer: {
    command: 'pnpm --filter @mimi/server exec tsx ../../tools/e2e-server.ts',
    url: 'http://localhost:5173',
    reuseExistingServer: false,
    timeout: 90_000,
  },
});
