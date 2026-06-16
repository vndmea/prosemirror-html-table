import { defineConfig, devices } from '@playwright/test';

const E2E_PORT = Number(process.env.E2E_PORT || 4174);
const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 's1000d-*.spec.ts',
  timeout: 30_000,
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'on-first-retry',
    viewport: {
      width: 1280,
      height: 900,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  webServer: {
    command: `npm run dev -w s1000d-react-demo -- --port ${E2E_PORT} --strictPort`,
    url: E2E_BASE_URL,
    // Reuse an already-running dedicated S1000D demo locally to avoid port collisions,
    // but keep CI isolated by forcing Playwright to boot its own server there.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
