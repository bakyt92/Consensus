/**
 * Regression: the Prisma CLI (used by `pnpm db:migrate`) and our runtime
 * PrismaClient adapter MUST resolve a relative `file:` URL to the same
 * on-disk path. Otherwise migrations land in one file and queries hit
 * another — every query returns "TableDoesNotExist" and the user sees
 * the form silently refresh.
 *
 * The bug this guards against was:
 *   `src/lib/prisma.ts` had a homegrown `resolveSqliteUrl` that rewrote
 *   `file:./dev.db` → `file:<projectRoot>/prisma/dev.db`. The Prisma CLI
 *   (via prisma.config.ts) did NOT do that rewrite, so migrations landed
 *   in `<projectRoot>/dev.db`. Every runtime query then opened the wrong
 *   file. The original test suite passed an *absolute* DATABASE_URL,
 *   which bypassed the rewriter entirely and never caught this.
 *
 * Two layers of coverage here:
 *   1. Unit: `databaseUrl()` must return the env value byte-for-byte.
 *   2. Integration: after CLI db push with a relative URL, a runtime
 *      Prisma client constructed by our module must be able to read it.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const dbName = `path-test-${Date.now()}.db`;
const relativeUrl = `file:./${dbName}`;

afterAll(() => {
  for (const p of [
    path.join(projectRoot, dbName),
    path.join(projectRoot, "prisma", dbName),
  ]) {
    if (existsSync(p)) rmSync(p, { force: true });
  }
});

describe("DATABASE_URL relative-path: CLI and runtime open the same file", () => {
  beforeAll(() => {
    execSync(`pnpm exec prisma db push --accept-data-loss`, {
      cwd: projectRoot,
      env: { ...process.env, DATABASE_URL: relativeUrl },
      stdio: "pipe",
    });
  });

  it("unit: databaseUrl() returns process.env.DATABASE_URL verbatim — no rewriting", async () => {
    process.env.DATABASE_URL = "file:./dev.db";
    const { databaseUrl } = await import("@/src/lib/prisma");
    const resolved = databaseUrl();
    expect(resolved).toBe("file:./dev.db");
    // The historical bug rewrote ./X to prisma/X. Catch any future regression
    // of that exact shape.
    expect(resolved).not.toMatch(/[\\/]prisma[\\/]/);
    expect(resolved).not.toMatch(/^file:\//); // not converted to absolute
  });

  it("integration: CLI push + runtime client open the same DB (catches the prisma/ rewrite bug)", async () => {
    // Reset the runtime singleton so our test URL is honoured.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__consensusPrisma = undefined;
    process.env.DATABASE_URL = relativeUrl;

    // Bust ESM module cache so makeClient() runs again with the new URL.
    const mod = await import(`@/src/lib/prisma?bust=${Date.now()}`);
    const prisma = mod.prisma as import("@prisma/client").PrismaClient;

    try {
      // If CLI wrote to consensus/<dbName> but our prisma.ts opened
      // consensus/prisma/<dbName>, this throws TableDoesNotExist.
      const count = await prisma.user.count();
      expect(count).toBe(0);

      // Round-trip a write so we KNOW we're hitting the same file.
      const created = await prisma.user.create({
        data: { email: "path@example.com", username: "PathUser" },
      });
      const reread = await prisma.user.findUnique({
        where: { id: created.id },
      });
      expect(reread?.email).toBe("path@example.com");
    } finally {
      await prisma.$disconnect();
    }
  });

  it("sanity: only one DB file exists — runtime did not silently create a second empty one", () => {
    const cwdRelative = path.join(projectRoot, dbName);
    const underPrismaDir = path.join(projectRoot, "prisma", dbName);
    expect(existsSync(cwdRelative), `expected ${cwdRelative} to exist (CLI cwd-relative)`).toBe(true);
    // If runtime resolves the URL differently, the adapter would create an
    // empty SQLite file at the wrong path. Catch that.
    expect(
      existsSync(underPrismaDir),
      `did NOT expect ${underPrismaDir} to exist — the runtime must not open a different path than the CLI`,
    ).toBe(false);
  });
});
