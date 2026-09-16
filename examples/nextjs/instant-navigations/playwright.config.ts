import { defineConfig, devices } from '@playwright/test';

const PORT = 3130;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Set PW_CHANNEL=chrome to use an installed Chrome instead of
        // downloading Playwright's Chromium (`npx playwright install chromium`).
        channel: process.env.PW_CHANNEL || undefined,
      },
    },
  ],
  webServer: {
    // Automatic prefetching only runs in production, so test a production build.
    // INSTANT_TESTING=1 turns on experimental.exposeTestingApiInProductionBuild
    // (see next.config.ts), which instant() needs under `next start`.
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: `${baseURL}/store`,
    env: { INSTANT_TESTING: '1' },
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
