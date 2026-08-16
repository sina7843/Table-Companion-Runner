/**
 * The harness itself, checked before anything is built on it.
 *
 * If this fails, nothing else in the suite is telling the truth: it means the browser is not
 * talking to the built bundle, or the bundle is not talking to the API, or the API is not
 * talking to a real database.
 */
import { expect, test } from '@playwright/test';
import { apiGet, signUp } from './helpers.ts';

test('the page is served, and it is the real product', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('the browser reaches the API same-origin, and the API reaches the database', async ({
  browser,
  page,
}) => {
  // Same-origin through the `/api` proxy, which is the deployment topology TC-P02 chose.
  // `/health` is the one route that answers without a session, on purpose.
  const health = await page.request.get('/api/health');
  expect(health.status()).toBe(200);

  const anonymous = await page.request.get('/api/game-systems');
  expect(anonymous.status(), 'everything else needs a session').toBe(401);

  // And with one, the answer comes from the database this run created and migrated.
  const dm = await signUp(browser, 'Harness Reader');
  const seeded = await dm.page.request.get('/api/game-systems');
  expect(seeded.status()).toBe(200);
  expect(((await seeded.json()) as unknown[]).length).toBeGreaterThan(0);
  await dm.close();
});

test('an account can be created, and the session is a real cookie', async ({ browser }) => {
  const dm = await signUp(browser, 'Harness DM');

  const cookies = await dm.page.context().cookies();
  const session = cookies.find((cookie) => cookie.name.startsWith('tc_'));
  expect(session, 'a session cookie was set').toBeTruthy();
  expect(session?.httpOnly, 'and JavaScript cannot read it').toBe(true);

  const me = await apiGet(dm.page, '/me');
  expect(me.status).toBe(200);
  expect((me.body as { displayName: string }).displayName).toBe('Harness DM');

  await dm.close();
});

test('two contexts are two different people', async ({ browser }) => {
  const one = await signUp(browser, 'Harness One');
  const two = await signUp(browser, 'Harness Two');

  const first = (await apiGet(one.page, '/me')).body as { id: string };
  const second = (await apiGet(two.page, '/me')).body as { id: string };

  expect(first.id).not.toBe(second.id);

  await one.close();
  await two.close();
});
