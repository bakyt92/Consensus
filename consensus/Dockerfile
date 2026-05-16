# syntax=docker/dockerfile:1.7
#
# Production image for the Consensus custom server.
#
# Build stage: installs full dev deps, generates the Prisma client, runs
# `next build`. Runner stage: prunes to prod deps, copies the built artifacts,
# runs `pnpm start` (which boots server.ts under `--experimental-transform-types`).
#
# Notes:
#  - Node 22+ is required for `--experimental-transform-types` (TS-strip).
#  - `better-sqlite3` is a native module; the builder needs gcc/python3.
#  - `curl` is installed in the runner image so the compose healthcheck works.
#  - The runner runs `prisma migrate deploy` at start so the volume-mounted
#    SQLite file picks up new migrations before `next` starts.

ARG NODE_VERSION=22-bookworm-slim
ARG PNPM_VERSION=10.17.1

# -----------------------------------------------------------------------------
# 1. builder
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

# Toolchain for better-sqlite3 native build.
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ARG PNPM_VERSION
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# Install deps with frozen lockfile. Copy the workspace allowlist + lock first
# so this layer caches when only product code changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# Copy the rest of the source and build.
COPY . .
RUN pnpm exec prisma generate \
 && pnpm build \
 && pnpm prune --prod

# -----------------------------------------------------------------------------
# 2. runner
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# `curl` is the simplest healthcheck client; tini gives PID 1 signal handling.
# We deliberately do NOT install pnpm/corepack in the runner — pnpm 10+
# performs an auto deps-status check on every `pnpm exec` and tries to
# re-install at runtime (which fails inside the read-only image layer). We
# invoke prisma + node directly instead.
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy everything the runtime needs — including the in-place pruned node_modules
# from the builder so we don't re-resolve at runtime.
COPY --from=builder /app /app

# DB lives on a mounted volume; default location is /data. The runtime user
# (uid 1000 already exists in the node image) must own this directory so
# better-sqlite3 can write the WAL alongside dev.db.
RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
# `prisma migrate deploy` is idempotent — runs any pending migrations then exits.
# Then boot the custom server. We invoke node directly so pnpm doesn't try to
# re-resolve the lockfile at runtime.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && exec node --disable-warning=ExperimentalWarning --experimental-transform-types server.ts"]
