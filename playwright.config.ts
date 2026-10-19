import { defineConfig, devices } from '@playwright/test';

// End-to-end checks against the built site (npm run build first). No backend needed.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4322' },
  webServer: { command: 'npx astro preview --port 4322', port: 4322, reuseExistingServer: true, timeout: 60_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
