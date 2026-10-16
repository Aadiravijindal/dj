import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
  },
  // Chromium always; Firefox and WebKit too when their browsers are installed
  // (`npx playwright install firefox webkit`, then `PW_ALL_BROWSERS=1 npm run test:e2e`).
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1000 }, launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } } },
    ...(process.env.PW_ALL_BROWSERS
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1600, height: 1000 }, launchOptions: { firefoxUserPrefs: { 'media.autoplay.default': 0, 'media.autoplay.block-webaudio': false } } } },
          { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1600, height: 1000 } } },
        ]
      : []),
  ],
  webServer: {
    command: 'npx vite --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
    timeout: 60_000,
    // the assistant must work without credentials
    env: { ANTHROPIC_API_KEY: '' },
  },
});
