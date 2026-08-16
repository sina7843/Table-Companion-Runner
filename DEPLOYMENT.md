# Deploying Table Companion

One process serves the built bundle and the API, and talks to one PostgreSQL database. That is
the whole topology, and it is same-origin on purpose: it is what lets the session cookie be
`SameSite=Strict`, and it means there is no proxy configuration and no CORS to get wrong.

```
        ┌──────────────┐
 HTTPS  │ load         │   /health  liveness    → restart me
 ──────▶│ balancer     │   /ready   readiness   → send me traffic, or don't
        └──────┬───────┘   /metrics counts      → scrape me
               │
        ┌──────▼───────────────────────┐     ┌──────────────┐
        │ table-companion              │────▶│ PostgreSQL   │
        │  /            the bundle     │     │              │
        │  /api/*       the API        │     └──────────────┘
        │  /api/events  the SSE stream │
        └──────────────────────────────┘
```

Nothing here names a cloud. The image is a plain OCI image that reads its configuration from
the environment and listens on `$PORT`.

---

## The four environments

| | `TC_ENV` | Cookies | Migrations | Database |
| --- | --- | --- | --- | --- |
| **Development** | `development` (default) | `SameSite=Strict`, not `Secure` | On boot | `docker compose up -d`, seeded |
| **Test** | `test` | as development | On boot | Created and destroyed per run |
| **Staging** | `staging` | `Secure` | A deploy step | Its own, reset freely |
| **Production** | `production` | `Secure` | A deploy step | Its own, backed up |

`TC_ENV` is separate from `NODE_ENV` because the toolchain owns that one and it only really has
two values. Unset, this is **development** — nothing gains a permission by being unlabelled, and
a deployment that forgets the variable gets the strictest cookie policy it can have over http
rather than the loosest. `NODE_ENV=production` still means production, so nothing that predates
`TC_ENV` breaks.

---

## Secrets

**There is one secret: `DATABASE_URL`.** No API keys, no signing keys, no vendor credentials —
sessions are random tokens stored as SHA-256 digests in the database, and passwords are scrypt
hashes. There is nothing else to rotate.

- **Never in the repository.** `.env` and `.env.*` are gitignored; only `.env.example` is
  tracked, and `node scripts/check-secrets.mjs` fails the build if that changes.
- **Never in a `VITE_` variable.** Vite inlines every `VITE_*` value into the browser bundle.
  `.env.example` says so at the top, and nothing secret is named that way.
- **Supplied by the platform.** A container environment variable, a Kubernetes `Secret`, a
  systemd `EnvironmentFile` with mode 600 — whichever the deployment already has. The
  application reads `process.env` and does not care which.
- **Never logged.** `redact()` in `server/log.ts` runs on every line and refuses a field whose
  name looks like a credential and a value that looks like one whatever it is called.
  `server/operations.test.ts` proves it, and CI greps the running container's log.

To rotate the database password: change it in PostgreSQL, update the secret, restart the
application. The drain below means no request is lost.

---

## Environment variables

Every one of them, with the ones a deployment must set marked. `.env.example` is the same list
with the reasoning.

| Variable | Required | Default | |
| --- | --- | --- | --- |
| `DATABASE_URL` | **yes** | — | The only secret |
| `TC_ENV` | staging/prod | `development` | `development` · `test` · `staging` · `production` |
| `PORT` | | `8787` | |
| `HOST` | | `0.0.0.0` in staging/production | Loopback on a laptop |
| `TC_STATIC_DIR` | | unset | Set it to serve the bundle from this process. `/app/dist` in the image |
| `TC_MIGRATE_ON_BOOT` | | `true` | `false` in a deployment; see below |
| `TC_SHUTDOWN_GRACE_MS` | | `15000` | How long a drain waits |
| `TC_TRUST_PROXY` | behind one | `false` | Believe `X-Forwarded-For`. Only where a proxy you trust rewrites it |
| `TC_RATE_LIMIT_SCALE` | | `1` | Multiply every limit where one address is many people |
| `TC_ALLOWED_ORIGINS` | | empty | Only for the cross-origin topology |
| `TC_CROSS_ORIGIN` | | `false` | Deliberate topology change; refused outside staging/production |

Build-time, and therefore public: `VITE_API_BASE_URL` (`/api`) and `VITE_REALTIME_URL`
(`/api/events`). The image sets both.

---

## Startup order

It matters, and `docker-compose.staging.yml` enforces it rather than describing it.

1. **The database is up and accepting connections.** `pg_isready`.
2. **Migrations run, once, to completion.** One container, not every instance.
3. **The rules catalogue is imported.** `node server/content/import.ts`. A fresh database has
   an empty creature library until this runs, and the encounter builder finds no monsters. It
   is idempotent — the same bundles produce the same rows — so it is safe on every deploy.
4. **The application starts.** It does *not* migrate — `TC_MIGRATE_ON_BOOT=false`.
5. **`/ready` answers 200.** Only then does the load balancer send it traffic.

Steps 2 and 3 are separate because a schema change is a step an operator watches, not a race
between however many instances happened to boot at the same moment. On a laptop the default is
the opposite — start the process and have a working database — which is what TC-P01 asked for.

```bash
# Staging, or the production shape on your own machine
cp .env.example .env.staging          # then fill it in; it is gitignored
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d --build
```

```bash
# By hand, against any host
docker build -t table-companion .
docker run --rm -e DATABASE_URL=… -e TC_ENV=staging table-companion node server/migrate.ts
docker run --rm -e DATABASE_URL=… -e TC_ENV=staging table-companion node server/content/import.ts
docker run -d --name tc -p 8787:8787 -e DATABASE_URL=… -e TC_ENV=staging table-companion
```

---

## Validating a deployment

The end-to-end suite runs against something already deployed, which is how a staging release is
checked rather than described:

```bash
TC_E2E_BASE_URL=https://staging.example.test npm run e2e
```

It builds no world and resets nothing — its own database is never touched, and against a
deployment it never reaches the code that would drop one. It creates its own accounts, its own
campaign and its own fight, and leaves them behind; staging is expected to be resettable, and
that is the one reason not to point this at production.

Two things it needs:

- **`TC_RATE_LIMIT_SCALE`** raised on the target. The suite signs up nine accounts from one
  address in about a minute, which is precisely what the auth limit exists to stop. Without it
  the run fails on a `429` that is the product working.
- **The content import to have run.** Two of the steps need a creature to add to an encounter.

Two tests skip themselves by name against a deployment: the backend restart, and the recovery
that follows it. This suite does not restart a server it did not start.

---

## Migrations

A directory of `.sql` files applied in filename order, each in its own transaction, each
recorded by name in `schema_migrations`.

```bash
npm run db:migrate              # apply everything pending
npm run db:migrate -- --check   # apply nothing; exit 1 if anything is pending
npm run content:import          # the rules catalogue; idempotent, safe on every deploy
```

**They are additive by policy.** Nothing in `server/migrations/` drops, truncates or renames.
That is what makes them safe to apply *before* the new code is running and what makes a
rollback possible at all — the old code keeps working against the new schema.

A change that genuinely removes something is **two deploys**:

1. Stop writing the column, ship, confirm.
2. Drop it in the next release.

`/ready` returns 503 while any migration is pending, so an instance whose schema is behind is
never sent traffic, and `--check` is the gate a release runs before it starts anything.

---

## Backup and restore

The database is the only durable state. Sessions, the realtime replay window and the rate-limit
windows are all in memory and are all expected to be lost — a restart is a reconnect, and
TC-P08 proves the clients handle it.

```bash
# Back up. Custom format, so a restore can be selective and parallel.
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" > tc-$(date +%F-%H%M).dump

# Restore, into an empty database
createdb table_companion
pg_restore --no-owner --no-privileges --dbname "$DATABASE_URL" tc-2026-08-17-1200.dump
```

**Expectations to set before there is an incident:**

- **Frequency.** Nightly full dumps, retained thirty days. A campaign is a season of somebody's
  evenings; a day is the most that should ever be at risk.
- **Point-in-time.** Not configured here. A managed PostgreSQL with continuous archiving is the
  answer if the tolerance is minutes rather than a day, and it is a platform choice rather than
  an application one.
- **A restore is only real once it has been done.** Restore last night's dump into a scratch
  database and run `npm run db:migrate -- --check` against it, on a schedule. A backup nobody
  has restored is a hypothesis.
- **Before any release that migrates**, take a dump first. It is the only thing that makes the
  irreversible half of a rollback survivable.

---

## Rollback

**The application rolls back by tag.** It is one stateless process; deploy the previous image
and it is done.

```bash
docker run -d --name tc -p 8787:8787 -e DATABASE_URL=… table-companion:<previous>
```

**The schema does not roll back.** There are no `down` migrations, and that is deliberate: a
generated `down` is a script nobody has run against real data, and running one during an
incident is how a bad deploy becomes a lost database. Because migrations are additive, the
previous release still works against the newer schema, which is what makes rolling the
application back sufficient in every ordinary case.

When a migration itself is the failure:

1. It failed inside its transaction, so the schema is on the last complete version and
   `schema_migrations` does not name it. Nothing is half-applied.
2. Fix the file, or revert the commit that added it, and deploy again.
3. If it committed and is wrong, write a **new, additive** migration that corrects it. Never
   edit a file that has been applied anywhere — the runner skips by name, so an edited file is
   a database whose shape depends on when it was deployed.
4. Restore from the dump only when a migration destroyed data. That is the case the pre-release
   dump exists for.

---

## What to look at when something is wrong

**Endpoints.**

| | |
| --- | --- |
| `GET /health` | 200 while the process can reach its database. A 503 means *restart me* |
| `GET /ready` | 200 while it can also serve — schema current, not draining. A 503 means *stop sending traffic*; restarting will not help |
| `GET /metrics` | Prometheus text. Counts only: requests by route pattern and status class, durations, refusals by error code, open streams |

They answer at the root whatever else the process serves, so nothing has to be told a different
path when the bundle is served from the same place.

**Logs** are one JSON object per line on stdout, which is what every pipeline already reads.

```json
{"ts":"…","level":"warn","kind":"request","requestId":"…","method":"POST",
 "route":"/combats/:combatId/commands","status":409,"durationMs":12,
 "actorId":"u-…","code":"conflict","message":"This fight has moved on…"}
```

The **route is the pattern, never the resolved path** — `/campaigns/:campaignId` says everything
an operator needs and writes down no id, invite code or search term.

**Correlation.** Every response carries `X-Request-Id`, every log line carries the same value,
and every error body includes it. A user reporting "it said something went wrong" is one grep.
An inbound `X-Request-Id` is honoured when it is short and boring, so a trace spans a proxy.

**Diagnosing the four things that go wrong:**

| Symptom | Where to look |
| --- | --- |
| Sign-in failing | `route:"/auth/sign-in"` with `code:"unauthenticated"` (a credential) or `"rate_limited"` (an address, possibly a NAT — see `TC_RATE_LIMIT_SCALE`) |
| An API call failing | The `code` is the contract's, not a transport detail. `table_companion_refusals_total` shows whether it is one caller or everybody |
| Realtime not arriving | `table_companion_realtime_streams` — a gauge near zero when people are online means streams are being dropped, usually by an idle timeout shorter than the 25s heartbeat |
| Combat conflicts | `code:"conflict"` on `/combats/:combatId/commands` is *normal* — it is two people acting at once, and the client re-reads. A sustained rise is a client not recovering |

---

## Scaling, and the one thing that stops it

**One instance is supported. Two are not, yet.** Both the rate limiter and the realtime hub are
per-process:

- A second instance means each limiter sees half the traffic, so the effective limit doubles.
  Tolerable.
- A second instance means a DM connected to A and a player connected to B **never see each
  other's events**. Not tolerable, and not a subtle failure once you know to look for it.

The fix is a shared bus, and PostgreSQL `LISTEN`/`NOTIFY` is already in the box — the hub
publishes to a channel and every instance relays to its own subscribers. It is not built,
because building it before there is a second instance would be speculative infrastructure with
no way to know it works.

Until then: **one instance, scaled vertically**, and a load balancer with sticky sessions is not
a substitute — a DM and a player are different browsers and will land on different instances
however sticky it is.
