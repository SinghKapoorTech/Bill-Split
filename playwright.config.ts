import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // 90s covers auth + event creation + bill flow on a slow emulator
  timeout: 90000,
  retries: 1,
  workers: 1,
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:8080',
    headless: true,
    viewport: { width: 1280, height: 720 },
    video: 'on',
    launchOptions: {
      slowMo: parseInt(process.env.SLOW_MO || '0'),
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'VITE_USE_EMULATORS=true npm run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: true,
    env: {
      VITE_USE_EMULATORS: 'true',
    },
  },
});
