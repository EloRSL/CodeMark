import { defineConfig, devices } from '@playwright/test';

// The harness (servers, seed, fake clock) comes with e2e/gate1.spec.ts in M2 task 11.
export default defineConfig({
  testDir: '.',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
