import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: `${process.env.EVIDENCE_DIR || 'artifacts/quality'}/playwright-results.json`,
      },
    ],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4322',
    browserName: 'chromium',
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm preview --port 4322',
    url: 'http://127.0.0.1:4322',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
