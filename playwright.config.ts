import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // 90s covers auth + event creation + bill flow on a slow emulator
  timeout: 90000,
  // Retries in CI only. Locally they DOUBLE the cost of every failure (90s ->
  // 3min each, serially at workers:1) and hide flakiness behind a green run,
  // which is exactly what made this suite feel hung rather than broken.
  // Use `npm run test:e2e:fast` for the local loop — no retries, fails fast.
  retries: process.env.CI ? 2 : 0,
  // Single worker on purpose: every test signs in against the SAME Auth
  // emulator and writes to the same Firestore, so parallel workers would
  // interfere. Raising this needs per-worker project isolation first.
  workers: 1,
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:8080',
    headless: true,
    viewport: { width: 1280, height: 720 },
    // `on` for every run is heavy and mostly captures passing tests nobody
    // watches. Keep video locally (useful when iterating), but in CI capture
    // the artefacts only for runs we will actually investigate.
    video: process.env.CI ? 'retain-on-failure' : 'on',
    trace: process.env.CI ? 'on-first-retry' : 'off',
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
    // VITE_USE_EMULATORS is supplied via the `env` block below — do NOT prefix it
    // onto the command (the `VAR=val cmd` shell form fails on Windows cmd.exe).
    command: 'npm run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: true,
    env: {
      VITE_USE_EMULATORS: 'true',
    },
  },
});
