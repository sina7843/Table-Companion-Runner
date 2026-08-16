/**
 * Accessibility smoke, on the two compositions the design specifies: the DM at desktop and
 * tablet, the player on a phone.
 *
 * A smoke test, and it says so. No axe, no rule engine — this project takes on a dependency
 * when it buys something the platform does not, and what is checked here is the small set of
 * things that break silently and that a browser can answer definitively: does every page have
 * one first heading, is there a skip link, does every control have an accessible name, does
 * every input have a label, does the keyboard reach the first control, and are the player's
 * touch targets the size the design's 44px floor promises.
 *
 * What it does not check: colour contrast (the palette is verbatim from the approved design
 * and is that design's contract), focus order beyond the first stop, and screen-reader
 * announcement of live regions. Those are named in `IMPLEMENTATION_STATUS.md` as the manual
 * pass this leaves, rather than quietly implied to be covered.
 */
import { expect, test, type Page } from '@playwright/test';
import { open, signUp, type Client } from './helpers.ts';

test.describe.configure({ mode: 'serial' });

const DESKTOP = { width: 1440, height: 900 };
const TABLET = { width: 1024, height: 768 };
const PHONE = { width: 390, height: 844 };

let dm: Client;
let player: Client;

/** Every problem this page has, as sentences rather than a count. */
async function audit(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const visible = (element: Element): boolean => {
      const box = (element as HTMLElement).getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    };

    /** What a screen reader would announce for a control. */
    const accessibleName = (element: Element): string => {
      const aria = element.getAttribute('aria-label');
      if (aria?.trim()) return aria.trim();

      const labelledBy = element.getAttribute('aria-labelledby');
      if (labelledBy) {
        const text = labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ')
          .trim();
        if (text) return text;
      }

      if (element.id) {
        const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        if (label?.textContent?.trim()) return label.textContent.trim();
      }
      if (element.closest('label')?.textContent?.trim()) return 'labelled by wrapping label';

      const title = element.getAttribute('title');
      if (title?.trim()) return title.trim();

      return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
    };

    // One first heading, so the page announces what it is.
    const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter(visible);
    if (headings.length === 0) problems.push('the page has no heading at all');
    const h1s = [...document.querySelectorAll('h1')].filter(visible);
    if (h1s.length > 1) problems.push(`the page has ${h1s.length} level-one headings`);

    // Every control says what it does.
    for (const control of [
      ...document.querySelectorAll(
        'button, [role="button"], [role="radio"], [role="tab"], a[href]',
      ),
    ]) {
      if (!visible(control)) continue;
      if (control.getAttribute('aria-hidden') === 'true') continue;
      if (!accessibleName(control)) {
        problems.push(`a ${control.tagName.toLowerCase()} has no accessible name`);
      }
    }

    // Every input is labelled. A placeholder is not a label.
    for (const field of [...document.querySelectorAll('input, textarea, select')]) {
      if (!visible(field)) continue;
      if ((field as HTMLInputElement).type === 'hidden') continue;
      if (!accessibleName(field)) {
        problems.push(`an ${field.tagName.toLowerCase()} has no label`);
      }
    }

    // Every image says something or is explicitly decorative.
    for (const image of [...document.querySelectorAll('img')]) {
      if (!visible(image)) continue;
      if (image.getAttribute('alt') === null) problems.push('an img has no alt attribute');
    }

    return problems;
  });
}

/** Controls smaller than the design's touch floor, by name. */
async function smallTargets(page: Page, floor = 44): Promise<string[]> {
  return page.evaluate((minimum) => {
    const undersized: string[] = [];
    for (const control of [
      ...document.querySelectorAll('button, [role="button"], a[href], input, select'),
    ]) {
      const box = control.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      // The skip link is off-screen until focused, and a link inside a paragraph is text.
      if (control.classList.contains('tc-skiplink')) continue;
      if (control.tagName === 'A' && control.closest('p')) continue;

      if (box.height < minimum || box.width < minimum) {
        const name =
          control.getAttribute('aria-label') ??
          (control.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40) ??
          control.tagName;
        undersized.push(
          `${name || control.tagName} is ${Math.round(box.width)}×${Math.round(box.height)}`,
        );
      }
    }
    return undersized;
  }, floor);
}

test.beforeAll(async ({ browser }) => {
  dm = await signUp(browser, 'Access DM', { viewport: DESKTOP });
  player = await signUp(browser, 'Access Player', { viewport: PHONE });

  await open(dm.page, '/campaigns/new');
  await dm.page
    .getByRole('button', { name: /Dungeons & Dragons/ })
    .first()
    .click();
  await dm.page.getByRole('button', { name: 'Name the campaign' }).click();
  await dm.page.getByLabel('Campaign name').fill('Accessible Deeps');
  await dm.page.getByRole('button', { name: 'Create campaign' }).click();
  await expect(dm.page).toHaveURL(/\/dm\/campaigns\/[^/]+$/);
});

test.afterAll(async () => {
  await dm?.close();
  await player?.close();
});

/* ── Entry ──────────────────────────────────────────────────────────────────── */

for (const [name, path] of [
  ['sign in', '/'],
  ['sign up', '/signup'],
  ['join', '/join'],
] as const) {
  test(`the ${name} screen is navigable`, async ({ page }) => {
    await open(page, path);
    await expect(page.locator('main')).toBeVisible();
    expect(await audit(page)).toEqual([]);

    // The keyboard reaches a real control without a mouse. An entry screen has no shell, so
    // the first stop is its first field rather than a skip link — what matters is that
    // something focusable is reached at all.
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const element = document.activeElement;
      return element && element !== document.body ? element.tagName : 'BODY';
    });
    expect(['INPUT', 'BUTTON', 'A', 'TEXTAREA', 'SELECT']).toContain(focused);
  });
}

/* ── The DM, at desktop and at tablet ───────────────────────────────────────── */

for (const [name, viewport] of [
  ['desktop', DESKTOP],
  ['tablet', TABLET],
] as const) {
  test(`the DM surfaces are navigable at ${name}`, async () => {
    await dm.page.setViewportSize(viewport);

    for (const path of ['/dm', '/dm/encounters', '/dm/monsters', '/dm/characters', '/dm/account']) {
      await open(dm.page, path);
      await expect(dm.page.locator('main'), path).toBeVisible();

      const problems = await audit(dm.page);
      expect(problems, `${path} at ${name}`).toEqual([]);
    }
  });
}

test('the DM shell keeps its skip link and its landmarks', async () => {
  await dm.page.setViewportSize(DESKTOP);
  await open(dm.page, '/dm');

  await expect(dm.page.getByRole('link', { name: 'Skip to content' })).toBeAttached();
  await expect(dm.page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(dm.page.locator('main#main')).toBeVisible();

  // The skip link is the first thing a keyboard reaches, which is the only thing that makes
  // it useful — one behind the sidebar would be a link nobody can get to before the nav.
  await dm.page.keyboard.press('Tab');
  const first = await dm.page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
  expect(first).toBe('Skip to content');
});

/* ── The player, on a phone ─────────────────────────────────────────────────── */

test('the player surfaces are navigable on a phone', async () => {
  for (const path of ['/play', '/play/dice', '/play/party', '/play/characters', '/play/combat']) {
    await open(player.page, path);
    await expect(player.page.locator('main'), path).toBeVisible();

    const problems = await audit(player.page);
    expect(problems, path).toEqual([]);
  }
});

test('the player’s controls meet the 44px touch floor', async () => {
  await open(player.page, '/play');
  await expect(player.page.locator('main')).toBeVisible();

  // The floor is armed by `data-density="touch"` on the shell rather than by each control
  // asking for it, so this is a check on the shell as much as on the buttons.
  await expect(player.page.locator('[data-density="touch"]').first()).toBeAttached();

  const undersized = await smallTargets(player.page);
  expect(undersized, 'every touch target is at least 44px').toEqual([]);
});

test('the bottom navigation is reachable and says where it goes', async () => {
  await open(player.page, '/play');

  const nav = player.page.getByRole('navigation').last();
  await expect(nav).toBeVisible();

  for (const label of ['Home', 'Sheet', 'Combat', 'Dice', 'Party']) {
    await expect(nav.getByRole('link', { name: label })).toBeVisible();
  }
});
