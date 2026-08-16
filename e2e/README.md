# End-to-end tests

Two independent browsers, the real backend, real PostgreSQL, and the bundle `npm run build`
produces. Nothing here is stubbed at any layer — a mock anywhere would turn "the product works"
into "the mock agrees with the test".

```bash
npm run e2e            # everything
npm run e2e -- e2e/golden-path.spec.ts
npm run e2e:ui         # the Playwright UI, for writing them
```

It needs `DATABASE_URL` (or `TC_E2E_DATABASE_URL`) and a browser: `npx playwright install chromium`.

## What runs

| Spec | What it proves |
| --- | --- |
| `smoke.spec.ts` | The harness itself: the page is the built bundle, it reaches the API same-origin, the API reaches the database, and two contexts are two different people |
| `golden-path.spec.ts` | Sign-up → campaign → invite → join → character → encounter → combat → initiative → turns → damage → heal → conditions → override → undo → end, as a DM at desktop and a player on a phone, with privacy checked in the DOM, the API responses and the logs |
| `resilience.spec.ts` | Refresh, backend restart, dropped and reconnected event stream, missed events, and two clients on one version |
| `a11y.spec.ts` | Headings, accessible names, labels, landmarks, keyboard reach and the 44px touch floor, at desktop, tablet and phone |

`server/adversarial.test.ts` is the other half of TC-P08 and runs in `npm run test`: id tampering,
privilege escalation, malformed payloads, replay, stale commands, unauthorized subscription and
concurrent writes — all over HTTP, none of it needing a browser.

## How the stack is built

`global-setup.ts` drops and recreates **its own database** — `DATABASE_URL`'s name with `_e2e`
appended, or `TC_E2E_DATABASE_URL` — migrates it, seeds it, and spawns the API on port 8788.
Playwright's `webServer` builds the bundle and serves it with `vite preview` on 4174, proxying
`/api` to the API so the whole thing is same-origin, which is the deployment topology and the
reason the session cookie can be `SameSite=Strict`.

The API is spawned by the setup rather than by Playwright because one test kills and restarts
it. Its pid is written to `.stack.json` so a worker process can.

**It never touches the developer's database.** That is the whole reason for the separate one.

## Three deliberate choices

**`retries: 0`, in CI too.** A retry count is how a suite stops being able to tell you it is
flaky. Everything intermittent this suite hit while it was written had a root cause, and each
one is fixed rather than absorbed — see below.

**`workers: 1`.** One backend, one database, one seeded world, and a test that restarts the
server underneath everything. Parallel workers would make every failure a question about
ordering.

**Driven by role and accessible name, never by a test-only attribute.** It keeps the tests
honest about what is reachable, and a control that loses its label breaks a test instead of
quietly becoming unusable for anybody navigating by one.

## Flakiness, and what caused it

Every intermittent failure this suite produced was diagnosed. None is suppressed.

| Symptom | Cause | Fix |
| --- | --- | --- |
| A spec silently tested the *previous* run's server | An interrupted run left the API on 8788; the new one failed to bind and `waitForApi` saw the old one | `clearPort()` in `stack.ts` kills it, or fails with the port number |
| `Failed to fetch dynamically imported module` | A preview server reused from an earlier run served an `index.html` whose content-hashed chunks no longer existed | `reuseExistingServer: false` — rebuild per run |
| Sign-ups refused with 429 | Every browser, request and account in the suite comes from 127.0.0.1, and the auth limit is ten per address | `TC_RATE_LIMIT_SCALE`, a real deployment knob for a real deployment shape (a NAT is many people on one address) |
| `ERR_ADDRESS_IN_USE`, `ECONNREFUSED`, chunks failing to load | The proxy opened a fresh upstream socket per request; two browsers exhausted the machine's ephemeral port range, and every one sat in TIME_WAIT afterwards | A keep-alive agent on the proxy, in `vite.config.ts`. Also better for development |
| The same, right after the restart test | The proxy's pooled sockets pointed at a process that no longer existed | The restart test waits for the whole path — proxy included — to answer, which is what a browser would experience |
| A tight `toPass()` loop making an HTTP request ten times a second | Playwright's default polling interval | Explicit backoff on the polls that make requests |

If it still happens, look at the machine before the suite:

```powershell
netstat -ano | Select-String TIME_WAIT | Measure-Object -Line
netsh int ipv4 show dynamicport tcp
```

A box whose dynamic range is smaller than its TIME_WAIT backlog will refuse connections
regardless of what is running. Raise the range, or lower `TcpTimedWaitDelay`.

## What the suite found

Four real defects, none of which any test below a browser could have caught:

1. **`combatSchema` had no `version`.** Response schemas drop what they do not declare, so the
   browser parsed every fight without one, `expectedVersion: version ?? 0` sent 0 every time,
   and the *second* command of any session was refused as stale — forever. Every server-side
   concurrency test passed throughout; none of them went through that schema.
2. **A signed-out browser asked `/me` forever.** TC-P07's expiry signal re-read the identity on
   a 401; the re-read is itself a 401. Six hundred requests in fifteen seconds.
3. **`POST /monsters` with an existing id answered 500** with a PostgreSQL constraint name in
   the log. It is a `conflict`.
4. **The entry screens had no heading at all**, so nobody navigating by headings could orient
   in them.

A fifth is a product improvement rather than a defect: a route module that fails to load used
to fall through to react-router's developer error page. It now shows the product's own.
