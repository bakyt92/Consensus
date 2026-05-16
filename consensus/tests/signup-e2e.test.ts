/**
 * E2E smoke test: boots the real custom server.ts on an ephemeral port and
 * exercises the auth flow over HTTP — the same way the browser does.
 *
 * Why magic-link instead of POSTing the Server Action:
 *   the Server-Action protocol (Next-Action header + form encoding) is an
 *   unstable internal contract that changes between Next minors. Driving it
 *   from a test would be flaky. The magic-link consume route uses the SAME
 *   code path (signSession + cookie set) so it's a precise regression guard
 *   for the bug we just fixed (custom server not loading .env.local meant
 *   AUTH_SECRET was undefined → signSession threw → form silently refreshed).
 *
 * If THIS test fails, the user's browser flow will fail the same way.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const testDir = mkdtempSync(path.join(tmpdir(), "consensus-e2e-"));
const dbFile = path.join(testDir, "e2e.db");
const envFile = path.join(testDir, "env.local");
const PORT = 5000 + Math.floor(Math.random() * 800);
const BASE = `http://localhost:${PORT}`;
const AUTH_SECRET = "test-secret-for-e2e-please-change-x-x-x";

let server: ChildProcessWithoutNullStreams | null = null;

/**
 * Next's dev server claims the project dir via a lock; a second invocation
 * for the same dir hangs forever at app.prepare(). Detect this case up
 * front by probing the well-known port 3000 — that's the only place a
 * developer's `pnpm dev` would be. Throw a clear message instead of timing
 * out 30s later.
 */
async function assertNoExistingDevServer(): Promise<void> {
  try {
    const r = await fetch("http://localhost:3000/sign-up", {
      signal: AbortSignal.timeout(1500),
    });
    if (r.ok || r.status === 307) {
      throw new Error(
        "A Consensus dev server is already running on :3000. Stop it before running e2e tests (Ctrl+C in the pnpm dev terminal).",
      );
    }
  } catch (err) {
    // If fetch fails (port closed / ECONNREFUSED / abort), we're good.
    if (err instanceof Error && err.message.startsWith("A Consensus dev")) throw err;
  }
}

async function waitFor(url: string, timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 307 || r.status === 308) return;
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server did not start at ${url} within ${timeoutMs}ms`);
}

beforeAll(async () => {
  // Write a real .env.local that the server's loadEnvConfig must pick up.
  // This is the bug-fix regression test: if loadEnvConfig isn't wired in
  // server.ts, AUTH_SECRET will be missing and signSession will throw.
  writeFileSync(
    envFile,
    [
      `DATABASE_URL="file:${dbFile}"`,
      `AUTH_SECRET="${AUTH_SECRET}"`,
      `APP_ORIGIN="${BASE}"`,
      `PORT="${PORT}"`,
      `OPENAI_API_KEY=""`,
      `RESEND_API_KEY=""`,
    ].join("\n") + "\n",
  );

  // Refuse to run if there's already a dev server for this project — Next
  // serializes on a project-dir lock and a second spawn just hangs at
  // app.prepare(). Surface a clear error instead of timing out at waitFor().
  await assertNoExistingDevServer();

  // Apply schema to the test DB.
  const { execSync } = await import("node:child_process");
  execSync(`pnpm exec prisma db push --accept-data-loss`, {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: `file:${dbFile}` },
    stdio: "inherit",
  });

  // Save the real .env.local (a symlink in this repo) then write our test
  // .env.local in its place. This makes loadEnvConfig() pick up our values
  // — that's the bug-fix path we're guarding.
  const realEnvPath = path.join(projectRoot, ".env.local");
  if (existsSync(realEnvPath)) {
    // It's a symlink to ../.env.local — preserve it.
    const { lstatSync, readlinkSync, unlinkSync } = await import("node:fs");
    const stat = lstatSync(realEnvPath);
    if (stat.isSymbolicLink()) {
      savedEnvSymlink = readlinkSync(realEnvPath);
    } else {
      const { readFileSync } = await import("node:fs");
      savedEnvContents = readFileSync(realEnvPath, "utf8");
    }
    unlinkSync(realEnvPath);
  }
  writeFileSync(
    realEnvPath,
    [
      `DATABASE_URL="file:${dbFile}"`,
      `AUTH_SECRET="${AUTH_SECRET}"`,
      `APP_ORIGIN="${BASE}"`,
      `PORT="${PORT}"`,
    ].join("\n") + "\n",
  );

  server = spawn(
    "node",
    [
      "--disable-warning=ExperimentalWarning",
      "--experimental-transform-types",
      "server.ts",
    ],
    {
      cwd: projectRoot,
      // Crucially: do NOT pass AUTH_SECRET / DATABASE_URL via spawn env.
      // We rely entirely on loadEnvConfig reading .env.local — that's what
      // we're testing.
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: "development",
      },
    },
  );

  server.stdout.on("data", (b) => process.stdout.write(`[server] ${b}`));
  server.stderr.on("data", (b) => process.stderr.write(`[server-err] ${b}`));

  await waitFor(`${BASE}/sign-up`);
}, 60000);

let savedEnvSymlink: string | null = null;
let savedEnvContents: string | null = null;

afterAll(async () => {
  if (server && !server.killed) {
    server.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
    if (!server.killed) server.kill("SIGKILL");
  }

  // Restore real .env.local
  const realEnvPath = path.join(projectRoot, ".env.local");
  const { unlinkSync, symlinkSync, writeFileSync: wf, existsSync: ex } =
    await import("node:fs");
  if (ex(realEnvPath)) unlinkSync(realEnvPath);
  if (savedEnvSymlink) {
    symlinkSync(savedEnvSymlink, realEnvPath);
  } else if (savedEnvContents) {
    wf(realEnvPath, savedEnvContents);
  }

  if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
});

describe("custom server loads .env.local (regression for signup refresh bug)", () => {
  it("the sign-up page renders without 500", async () => {
    const res = await fetch(`${BASE}/sign-up`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/Create your.*delegation/s);
  });

  it("magic-link consume sets the session cookie (proves AUTH_SECRET was loaded)", async () => {
    // Seed a user + magic link via a fresh PrismaClient that points at the
    // e2e DB explicitly. We can't reuse @/src/lib/prisma because vitest's
    // singleFork mode shares the singleton with the unit tests' DB.
    const { PrismaClient } = await import("@prisma/client");
    const { PrismaBetterSqlite3 } = await import(
      "@prisma/adapter-better-sqlite3"
    );
    const e2ePrisma = new PrismaClient({
      adapter: new PrismaBetterSqlite3({ url: `file:${dbFile}` }),
    });
    const user = await e2ePrisma.user.create({
      data: { email: "magic@example.com", username: "MagicUser" },
    });
    const token = "test-token-" + Math.random().toString(36).slice(2);
    await e2ePrisma.magicLink.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    await e2ePrisma.$disconnect();

    const res = await fetch(`${BASE}/auth/magic/${token}`, {
      redirect: "manual",
    });
    expect(
      [302, 307, 308].includes(res.status),
      `expected redirect, got ${res.status}: ${await res.clone().text().catch(() => "")}`,
    ).toBe(true);
    expect(res.headers.get("location")).toMatch(/\/lobby$/);

    const cookies = res.headers.getSetCookie?.() ?? [
      res.headers.get("set-cookie") ?? "",
    ];
    const session = cookies.find((c) => c.startsWith("consensus_session="));
    expect(session, "expected consensus_session cookie").toBeTruthy();
    // HttpOnly + SameSite=Lax flags
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=lax/i);
  });

  it("invalid magic-link token redirects to /error?reason=magic-link-invalid", async () => {
    const res = await fetch(`${BASE}/auth/magic/bogus-token`, {
      redirect: "manual",
    });
    expect([302, 307, 308]).toContain(res.status);
    expect(res.headers.get("location")).toMatch(/\/error\?reason=magic-link-invalid/);
  });

  // ============================================================
  // Real Server Action POST — the path the browser actually takes when
  // the user clicks "Continue" on the sign-up form.
  //
  // Previous tests only hit /auth/magic/[token] (a route.ts handler), so
  // they never exercised Server-Action dispatch. That's why the
  // path-resolution bug between Prisma CLI and the runtime adapter slipped
  // through — the form POST → action → prisma.user.create chain was never
  // tested end-to-end.
  // ============================================================

  /** Find the Next-Action hash for signupOrRequestLink by scraping chunks. */
  async function findSignupActionId(): Promise<string> {
    const html = await (await fetch(`${BASE}/sign-up`)).text();
    const chunks = [
      ...new Set(
        [...html.matchAll(/\/_next\/static\/chunks\/[^"'\s]+\.js/g)].map(
          (m) => m[0],
        ),
      ),
    ];
    for (const c of chunks) {
      const js = await (await fetch(`${BASE}${c}`)).text();
      const m = js.match(/"([0-9a-f]{40,})":\s*\{\s*"name":\s*"signupOrRequestLink"/);
      if (m) return m[1]!;
    }
    throw new Error("Server-action id for signupOrRequestLink not found");
  }

  it("POST /sign-up as Server Action: new email → 200, session cookie, body says kind=session", async () => {
    const actionId = await findSignupActionId();

    const res = await fetch(`${BASE}/sign-up`, {
      method: "POST",
      headers: {
        Accept: "text/x-component",
        "Content-Type": "text/plain;charset=UTF-8",
        "Next-Action": actionId,
      },
      // Server Action argument envelope: an array of args. signupOrRequestLink
      // takes one input object, so we pass [{...}].
      body: JSON.stringify([
        { email: "action-user@example.com", username: "ActionUser" },
      ]),
    });

    const body = await res.text();
    expect(
      res.status,
      `expected 200, got ${res.status}. body=${body.slice(0, 400)}`,
    ).toBe(200);

    // The RSC stream encodes the action return value. We don't decode the
    // whole format — just assert the literal "kind":"session" appears AND
    // that no "kind":"error" was returned (which would mean the action ran
    // but failed, e.g. because Prisma couldn't find a table).
    expect(body, `expected kind=session, body=${body.slice(0, 400)}`).toMatch(
      /"kind":\s*"session"/,
    );
    expect(body).not.toMatch(/"kind":\s*"error"/);

    const cookies = res.headers.getSetCookie?.() ?? [
      res.headers.get("set-cookie") ?? "",
    ];
    const session = cookies.find((c) => c.startsWith("consensus_session="));
    expect(session, `expected consensus_session cookie, got: ${cookies}`).toBeTruthy();
  });

  it("POST /sign-up as Server Action: existing email → 200, kind=magic_sent, NO session cookie", async () => {
    // Pre-seed an existing user so the second submit triggers the magic-link
    // branch instead of new-user creation.
    const { PrismaClient } = await import("@prisma/client");
    const { PrismaBetterSqlite3 } = await import(
      "@prisma/adapter-better-sqlite3"
    );
    const seed = new PrismaClient({
      adapter: new PrismaBetterSqlite3({ url: `file:${dbFile}` }),
    });
    await seed.user.create({
      data: { email: "returning-action@example.com", username: "Returning" },
    });
    await seed.$disconnect();

    const actionId = await findSignupActionId();
    const res = await fetch(`${BASE}/sign-up`, {
      method: "POST",
      headers: {
        Accept: "text/x-component",
        "Content-Type": "text/plain;charset=UTF-8",
        "Next-Action": actionId,
      },
      body: JSON.stringify([
        { email: "returning-action@example.com", username: "ignored" },
      ]),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/"kind":\s*"magic_sent"/);

    const cookies = res.headers.getSetCookie?.() ?? [
      res.headers.get("set-cookie") ?? "",
    ];
    expect(
      cookies.some((c) => c.startsWith("consensus_session=")),
      "returning-user flow must NOT set a session cookie",
    ).toBe(false);
  });
});
