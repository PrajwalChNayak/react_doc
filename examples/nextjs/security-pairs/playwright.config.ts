import { defineConfig } from '@playwright/test';

import { LEAKED_MARKER, SERVER_ONLY_MARKER } from './e2e/markers';

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // The pairs share one in-memory server process. Run tests one at a time.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  // Every test uses the `request` fixture only, so no browser is launched and
  // `npx playwright install` is not needed.
  use: { baseURL },
  webServer: {
    // Test a production build: that is what gets deployed, and NEXT_PUBLIC_
    // inlining happens at build time.
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: baseURL,
    env: {
      NEXT_PUBLIC_PAYMENTS_SECRET_KEY: LEAKED_MARKER,
      PAYMENTS_SECRET_KEY: SERVER_ONLY_MARKER,
    },
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
