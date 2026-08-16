# Table Companion, as one image.
#
# The deployment topology is same-origin — that is what lets the session cookie be
# SameSite=Strict and why there is no CORS configuration to get wrong — so one process serves
# both the built bundle and the API under `/api`. No proxy to configure, no second container,
# one thing to roll back.
#
# Provider-neutral on purpose: this is a plain OCI image that reads its configuration from the
# environment and listens on $PORT. Nothing here names a cloud, and no credential is baked in.
#
#   docker build -t table-companion .
#   docker run --rm -p 8787:8787 -e DATABASE_URL=... -e TC_ENV=staging table-companion
#
# See DEPLOYMENT.md for the startup order, the migration step and the rollback procedure.

# ── Build ───────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS build
WORKDIR /app

# The lockfile alone first, so a dependency install is cached across every source change.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# `npm run build` typechecks and then builds. A type error is a failed image rather than a
# runtime surprise, which is the point of having the compiler at all.
ARG VITE_API_BASE_URL=/api
ARG VITE_REALTIME_URL=/api/events
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_REALTIME_URL=$VITE_REALTIME_URL
RUN npm run build

# Production dependencies only, resolved from the same lockfile as the build.
RUN npm ci --omit=dev

# ── Runtime ─────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV TC_ENV=production
ENV PORT=8787
ENV HOST=0.0.0.0
ENV TC_STATIC_DIR=/app/dist
# Migrations are a deployment step, not a boot race between instances. DEPLOYMENT.md says why.
ENV TC_MIGRATE_ON_BOOT=false

# The server runs TypeScript directly under Node's type stripping — the same thing `npm run
# server` does on a laptop, so there is no build output whose behaviour differs from what a
# developer tested. `src/` comes along because the server imports the domain types and the
# contract schemas from it; that shared boundary is deliberate and documented in README.md.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server ./server
COPY --from=build /app/src ./src
COPY --from=build /app/content ./content

# Never root. `node` exists in the base image and owns nothing it does not need.
USER node

EXPOSE 8787

# Liveness from inside the container, so an orchestrator that has no probe of its own still
# restarts a process that cannot reach its database. Readiness is `/ready` and belongs to
# whatever routes traffic — see DEPLOYMENT.md.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# PID 1 is the server itself, so SIGTERM reaches it directly and the drain in `main.ts` runs.
# A shell wrapper here would swallow the signal and turn every deploy into a hard kill.
CMD ["node", "server/main.ts"]
