/**
 * What the specs do repeatedly, in one place.
 *
 * Everything here drives the product the way a person does — by role and accessible name,
 * never by a test-only attribute. That is deliberate twice over: it keeps the tests honest
 * about what is reachable, and it means a control that loses its label breaks a test instead
 * of quietly becoming unusable for anybody navigating by one.
 */
import { expect, type Browser, type Page } from '@playwright/test';
import { API_URL } from './stack.ts';

/** A person, in their own browser, with their own cookie jar. */
export interface Client {
  page: Page;
  email: string;
  displayName: string;
  close(): Promise<void>;
}

let accounts = 0;

/**
 * A token that is different every run.
 *
 * A counter alone is enough against the local stack, whose database is rebuilt each time. It
 * is not enough against a deployment, where last run's accounts are still there and the second
 * run collides on every email — the server refuses a duplicate, correctly, and the form simply
 * stays put. Unique per run means the same suite validates staging without needing it reset.
 */
const RUN = Math.random().toString(36).slice(2, 8);

/**
 * Navigates, and does what the product tells a person to do if the route did not load.
 *
 * Route modules are fetched on demand, so a dropped connection at the wrong moment leaves the
 * screen the router shows for that — "This screen could not be loaded", with a Try again. That
 * is a real state with a real recovery, and following it here is not a retry hiding a flake:
 * it happens **once**, only when that specific screen is on display, and a second failure is
 * a failure. Anything else — a slow page, a wrong selector, a broken build — still fails.
 *
 * It is needed because this suite hammers one origin from one address. On a machine whose
 * ephemeral ports are already scarce, some fraction of requests are refused outright; see the
 * flakiness note in `e2e/README.md`.
 */
export async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await recover(page, path);
}

/** The same, for a reload — which is a navigation and can fail the same way. */
export async function reopen(page: Page): Promise<void> {
  await page.reload();
  await recover(page, page.url());
}

async function recover(page: Page, what: string): Promise<void> {
  const failed = page.getByText('This screen could not be loaded');
  if (await failed.isVisible().catch(() => false)) {
    await page.reload();
    await expect(failed, `${what} could not be loaded twice`).toBeHidden();
  }
}

/**
 * Opens an independent browser context and signs a brand-new account into it.
 *
 * A context per person, never a tab per person: two tabs share a cookie jar, and a suite that
 * shares one session cannot tell "the player sees it" from "the DM sees it". TC-P08 names this
 * explicitly, and it is the difference between testing multiplayer and testing one browser.
 */
export async function signUp(
  browser: Browser,
  displayName: string,
  options: { viewport?: { width: number; height: number } } = {},
): Promise<Client> {
  const context = await browser.newContext(options.viewport ? { viewport: options.viewport } : {});
  const page = await context.newPage();
  const email = `e2e-${RUN}-${(accounts += 1)}-${displayName.toLowerCase().replace(/\W+/g, '')}@example.test`;

  await open(page, '/signup');
  await page.getByLabel('Display name').fill(displayName);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('table-companion-e2e-password');
  await page.getByRole('button', { name: 'Create account' }).click();

  // Landing anywhere inside the product means the cookie is real and the identity resolved.
  await expect(page).not.toHaveURL(/\/signup$/);

  return {
    page,
    email,
    displayName,
    close: () => context.close(),
  };
}

/** Signs an existing account in, in a fresh context — for the reconnect and restart specs. */
export async function signIn(browser: Browser, email: string, password: string): Promise<Client> {
  const context = await browser.newContext();
  const page = await context.newPage();

  await open(page, '/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/$/);

  return { page, email, displayName: '', close: () => context.close() };
}

/**
 * The API as one of the browsers sees it.
 *
 * `page.request` shares the context cookie jar, so these calls are made *as that person* —
 * which is what lets a test assert on what a response contains rather than on what a screen
 * draws. TC-P08 is explicit that client-side hiding is not a security pass, so every privacy
 * claim below is checked on the wire as well as in the DOM.
 */
export async function apiGet(page: Page, path: string): Promise<{ status: number; body: unknown }> {
  const response = await page.request.get(`${API_URL}${path}`, {
    headers: { 'sec-fetch-site': 'same-origin' },
  });
  const text = await response.text();
  return { status: response.status(), body: text ? (JSON.parse(text) as unknown) : undefined };
}

export async function apiPost(
  page: Page,
  path: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const response = await page.request.post(`${API_URL}${path}`, {
    headers: { 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
    data: body,
  });
  const text = await response.text();
  return { status: response.status(), body: text ? (JSON.parse(text) as unknown) : undefined };
}

/** Everything the page is currently showing, for a leak check that reads the whole DOM. */
export async function visibleText(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

/** The whole rendered markup, including what CSS is hiding. */
export async function markup(page: Page): Promise<string> {
  return page.content();
}
