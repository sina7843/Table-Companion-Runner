import { defineConfig, devices } from '@playwright/test';
import { API_PORT, APP_PORT, APP_URL, REMOTE_BASE_URL } from './e2e/stack.ts';

/**
 * End-to-end configuration.
 *
 * Three choices worth stating, because each of them is a decision rather than a default:
 *
 * **`retries: 0`, everywhere, CI included.** TC-P08 says to fix the root cause of a flaky test
 * rather than hide it behind retries, and a retry count is exactly how a suite stops being able
 * to tell you it is flaky. If something here fails intermittently it is a bug in the product or
 * in the test, and both are worth the interruption.
 *
 * **`workers: 1`.** The suite shares one backend, one database and one seeded world, and one
 * test deliberately restarts the server underneath everything. Parallel workers would make
 * every failure a question about ordering. This costs wall-clock and buys a suite whose
 * failures mean something.
 *
 * **`vite preview`, not `vite`.** The bundle under test is the one `npm run build` produces.
 * Testing the dev server would be testing the toolchain.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  use: {
    baseURL: APP_URL,
    trace: 'retain-on-failure',
    video: 'off',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Against a deployment there is nothing to build and nothing to serve: `TC_E2E_BASE_URL`
  // points at something already running, which is how staging gets validated rather than
  // described. See DEPLOYMENT.md.
  webServer: REMOTE_BASE_URL
    ? undefined
    : {
        // Built fresh, then served. `TC_API_TARGET` is what makes the API same-origin behind
        // `/api`, which is the deployment topology TC-P02 chose and the reason the session cookie
        // can be SameSite=Strict.
        command: `npm run build && npx vite preview --host 127.0.0.1 --port ${APP_PORT} --strictPort`,
        url: APP_URL,
        // Never reused. The bundle is content-hashed, so a preview server left over from an
        // earlier run serves an index.html whose lazy route chunks no longer exist — which fails
        // as 'Failed to fetch dynamically imported module' in whichever test happens to be the
        // first to navigate. Rebuilding per run costs a couple of seconds and removes the whole
        // class of failure rather than papering over it with a retry.
        reuseExistingServer: false,
        timeout: 180_000,
        env: {
          TC_API_TARGET: `http://127.0.0.1:${API_PORT}`,
          VITE_API_BASE_URL: '/api',
          VITE_REALTIME_URL: '/api/events',
        },
      },
});
