import { chromium, firefox, webkit, defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  outputDir: 'reports/browser-results',
  reporter: [
    ['list'],
    ['json', { outputFile: 'reports/browser.json' }],
    ['junit', { outputFile: 'reports/browser.junit.xml' }],
    ['html', { outputFolder: 'reports/browser-html', open: 'never' }],
  ],
  use: {
    baseURL: process.env.FO_BROWSER_BASE_URL,
    viewport: { width: 1440, height: 1000 },
    locale: 'vi-VN',
    reducedMotion: 'reduce',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Launch the same pinned executable whose SHA is recorded by the test harness.
  projects: Object.entries({ chromium, firefox, webkit }).map(([name, driver]) => ({ name, use: { browserName: name as 'chromium' | 'firefox' | 'webkit', launchOptions: { executablePath: driver.executablePath() } } })),
});
