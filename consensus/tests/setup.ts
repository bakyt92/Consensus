/**
 * Test setup: point Prisma at a dedicated SQLite DB file in /tmp, apply the
 * schema before any tests run, and wipe tables between tests. Avoids
 * touching the dev DB.
 */

import { execSync } from "node:child_process";
import path from "node:path";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterEach, beforeAll, afterAll } from "vitest";

const testDir = mkdtempSync(path.join(tmpdir(), "consensus-test-"));
const dbFile = path.join(testDir, "test.db");

process.env.DATABASE_URL = `file:${dbFile}`;
process.env.AUTH_SECRET =
  process.env.AUTH_SECRET ?? "test-secret-please-change-x-x-x-x-x-x";
process.env.APP_ORIGIN = "http://localhost:3000";
process.env.NODE_ENV = "test";
// Skip real email delivery — the dev mail driver just logs.
delete process.env.RESEND_API_KEY;

beforeAll(() => {
  // Apply schema using Prisma. We use db push so tests don't depend on the
  // migration history being valid.
  execSync(`pnpm exec prisma db push --accept-data-loss`, {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: { ...process.env, DATABASE_URL: `file:${dbFile}` },
    stdio: "inherit",
  });
});

afterEach(async () => {
  const { prisma } = await import("@/src/lib/prisma");
  // Wipe in FK-safe order.
  await prisma.consensusSnapshot.deleteMany();
  await prisma.summary.deleteMany();
  await prisma.message.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.room.deleteMany();
  await prisma.magicLink.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  const { prisma } = await import("@/src/lib/prisma");
  await prisma.$disconnect();
  if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
});
