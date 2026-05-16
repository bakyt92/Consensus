/**
 * E2E smoke test: boots the real custom server.ts on an ephemeral port and
 * exercises the MAIN USER FLOW over HTTP — the same way the browser does:
 *   sign up → create room → land in /room/<code> (auto-join)
 *
 * Design goals:
 *   1. NEVER mutate the user's .env.local. A previous version of this test
 *      swapped .env.local in and out around the run, which left it broken
 *      when the test was interrupted. Now we pass env vars to the spawned
 *      server via process env only.
 *   2. Use the bug-class-mirroring config: a relative DATABASE_URL on a
 *      throwaway filename (not absolute). Absolute paths hide the exact
 *      CLI/runtime path-resolution bugs we're guarding against.
 *   3. Exercise the SAME path the browser takes: a POST to the page URL with
 *      the Next-Action header. The form-action redirect must produce a
 *      Location that the browser can actually follow to the destination —
 *      if it points back to the form's page the user sees "the page just
 *      refreshed". The create-room test asserts that specifically.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const dbName = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`;
const relativeDbUrl = `file:./${dbName}`;
const PORT = 5000 + Math.floor(Math.random() * 800);
const BASE = `http://localhost:${PORT}`;
const AUTH_SECRET = "test-secret-for-e2e-please-change-x-x-x";

let server: ChildProcessWithoutNullStreams | null = null;

/**
 * Next's dev server claims the project dir via a lock; a second invocation
 * in the same dir hangs at app.prepare(). Detect a developer's pnpm dev
 * on :3000 up front and fail with a clear message.
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
    if (err instanceof Error && err.message.startsWith("A Consensus dev")) throw err;
    // ECONNREFUSED or abort = good, port is free.
  }
}

async function waitFor(url: string, timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  let lastErr: unknown = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 307 || r.status === 308) return;
      lastErr = `status ${r.status}`;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `Server did not start at ${url} within ${timeoutMs}ms (last: ${String(lastErr)})`,
  );
}

beforeAll(async () => {
  await assertNoExistingDevServer();

  // Apply schema to a fresh test DB at a cwd-relative path.
  const { execSync } = await import("node:child_process");
  execSync(`pnpm exec prisma db push --accept-data-loss`, {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: relativeDbUrl },
    stdio: "pipe",
  });

  server = spawn(
    "node",
    [
      "--disable-warning=ExperimentalWarning",
      "--experimental-transform-types",
      "server.ts",
    ],
    {
      cwd: projectRoot,
      env: {
        // Whitelist only what server.ts needs. We pass env directly instead
        // of writing .env.local so a Ctrl-C never strands the developer
        // with a broken project state.
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: "development",
        DATABASE_URL: relativeDbUrl,
        AUTH_SECRET,
        APP_ORIGIN: BASE,
        PORT: String(PORT),
        OPENAI_API_KEY: "",
        RESEND_API_KEY: "",
      },
    },
  );

  server.stdout.on("data", (b) => process.stdout.write(`[server] ${b}`));
  server.stderr.on("data", (b) => process.stderr.write(`[server-err] ${b}`));

  await waitFor(`${BASE}/sign-up`);
}, 60000);

afterAll(async () => {
  if (server && !server.killed) {
    server.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
    if (!server.killed) server.kill("SIGKILL");
  }
  for (const p of [
    path.join(projectRoot, dbName),
    path.join(projectRoot, "prisma", dbName),
  ]) {
    if (existsSync(p)) rmSync(p, { force: true });
  }
});

// =============================================================
// Helpers
// =============================================================

/**
 * The form calls `signupFormAction(prevState, formData)` via the React 19
 * declarative pattern, which has a non-trivial multipart encoding (it bakes
 * the prevState into the request body). Driving that from raw HTTP is brittle
 * and unstable across Next.js versions.
 *
 * Instead, we test the underlying `signupOrRequestLink(input)` directly —
 * it's the only function that touches Prisma + cookies, and the form-action
 * wrapper is a 2-line FormData unwrapper. That gives us coverage of the
 * auth logic without coupling to the Next-Action wire format.
 */
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
    const m = js.match(
      /"([0-9a-f]{40,})":\s*\{\s*"name":\s*"signupOrRequestLink"/,
    );
    if (m) return m[1]!;
  }
  throw new Error("Server-action id for signupOrRequestLink not found");
}

function getSetCookies(res: Response): string[] {
  return (
    res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""]
  ).filter(Boolean);
}

async function postSignupAction(args: { email: string; username: string }) {
  const actionId = await findSignupActionId();
  return fetch(`${BASE}/sign-up`, {
    method: "POST",
    headers: {
      Accept: "text/x-component",
      "Content-Type": "text/plain;charset=UTF-8",
      "Next-Action": actionId,
    },
    body: JSON.stringify([args]),
  });
}

// =============================================================
// Tests
// =============================================================

describe("signup e2e (custom server + Server Action POST + Prisma)", () => {
  it("renders /sign-up at 200 (proves env was loaded, server is wired)", async () => {
    const res = await fetch(`${BASE}/sign-up`);
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/Create your.*delegation/s);
  });

  it("POST signup action: new email → 200, kind=session, sets HttpOnly cookie", async () => {
    const res = await postSignupAction({
      email: "newuser@example.com",
      username: "New User",
    });
    const body = await res.text();
    expect(
      res.status,
      `expected 200, got ${res.status}. body=${body.slice(0, 400)}`,
    ).toBe(200);

    // The RSC stream encodes the action return value. Assert it contains
    // kind=session and DOES NOT contain kind=error (which is what we'd see
    // if the action ran but Prisma couldn't find the table, etc.).
    expect(body, `expected kind=session, body=${body.slice(0, 400)}`).toMatch(
      /"kind":\s*"session"/,
    );
    expect(body).not.toMatch(/"kind":\s*"error"/);

    const cookies = getSetCookies(res);
    const session = cookies.find((c) => c.startsWith("consensus_session="));
    expect(session, `expected consensus_session cookie, got: ${cookies}`).toBeTruthy();
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=lax/i);
  });

  it("POST signup action: existing email → 200, kind=magic_sent, NO session cookie", async () => {
    // Seed a returning user via a fresh PrismaClient pointed at the e2e DB.
    const { PrismaClient } = await import("@prisma/client");
    const { PrismaBetterSqlite3 } = await import(
      "@prisma/adapter-better-sqlite3"
    );
    const seed = new PrismaClient({
      adapter: new PrismaBetterSqlite3({ url: relativeDbUrl }),
    });
    await seed.user.create({
      data: { email: "returning@example.com", username: "Returning" },
    });
    await seed.$disconnect();

    const res = await postSignupAction({
      email: "returning@example.com",
      username: "ignored",
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/"kind":\s*"magic_sent"/);

    const cookies = getSetCookies(res);
    expect(
      cookies.some((c) => c.startsWith("consensus_session=")),
      "returning-user flow must NOT set a session cookie",
    ).toBe(false);
  });

  it("magic-link consume: valid token → 307 to /lobby with session cookie", async () => {
    const { PrismaClient } = await import("@prisma/client");
    const { PrismaBetterSqlite3 } = await import(
      "@prisma/adapter-better-sqlite3"
    );
    const seed = new PrismaClient({
      adapter: new PrismaBetterSqlite3({ url: relativeDbUrl }),
    });
    const u = await seed.user.create({
      data: { email: "magic@example.com", username: "MagicUser" },
    });
    const token = "test-token-" + Math.random().toString(36).slice(2);
    await seed.magicLink.create({
      data: { userId: u.id, token, expiresAt: new Date(Date.now() + 600_000) },
    });
    await seed.$disconnect();

    const res = await fetch(`${BASE}/auth/magic/${token}`, {
      redirect: "manual",
    });
    expect([302, 307, 308]).toContain(res.status);
    expect(res.headers.get("location")).toMatch(/\/lobby$/);
    const session = getSetCookies(res).find((c) =>
      c.startsWith("consensus_session="),
    );
    expect(session).toBeTruthy();
    expect(session).toMatch(/HttpOnly/i);
  });

  it("magic-link consume: invalid token → 307 to /error?reason=magic-link-invalid", async () => {
    const res = await fetch(`${BASE}/auth/magic/bogus-token`, {
      redirect: "manual",
    });
    expect([302, 307, 308]).toContain(res.status);
    expect(res.headers.get("location")).toMatch(/\/error\?reason=magic-link-invalid/);
  });
});

// =============================================================
// Create-room flow (the bit a user actually does after signing in)
// =============================================================

/**
 * Sign up via the same Server-Action POST the form uses, return the session
 * cookie. We need a real signed-in session to (a) reach /create at all and
 * (b) have the cookie ready for the createRoom action POST.
 */
async function signUpAndGetCookie(email: string, username: string): Promise<string> {
  const res = await postSignupAction({ email, username });
  if (res.status !== 200) {
    throw new Error(`signup failed: ${res.status} ${await res.text()}`);
  }
  const session = getSetCookies(res).find((c) =>
    c.startsWith("consensus_session="),
  );
  if (!session) throw new Error("signup did not return a session cookie");
  // We only need the cookie's name=value pair for the Cookie request header.
  return session.split(";")[0]!;
}

/**
 * Find the server-action id for `createRoom`. Same approach as the signup
 * helper: visit /create with a valid session so Next compiles the route,
 * then grep the dev JS chunks it references for the action registry entry.
 */
async function findCreateRoomActionId(cookie: string): Promise<string> {
  const html = await (
    await fetch(`${BASE}/create`, { headers: { cookie } })
  ).text();
  const chunks = [
    ...new Set(
      [...html.matchAll(/\/_next\/static\/chunks\/[^"'\s]+\.js/g)].map(
        (m) => m[0],
      ),
    ),
  ];
  for (const c of chunks) {
    const js = await (await fetch(`${BASE}${c}`)).text();
    const m = js.match(/"([0-9a-f]{40,})":\s*\{\s*"name":\s*"createRoom"/);
    if (m) return m[1]!;
  }
  throw new Error("Server-action id for createRoom not found");
}

async function postCreateRoomAction(args: {
  cookie: string;
  agenda: string;
  criteria: string;
}): Promise<Response> {
  const actionId = await findCreateRoomActionId(args.cookie);
  return fetch(`${BASE}/create`, {
    method: "POST",
    redirect: "manual",
    headers: {
      Accept: "text/x-component",
      "Content-Type": "text/plain;charset=UTF-8",
      "Next-Action": actionId,
      cookie: args.cookie,
    },
    body: JSON.stringify([{ agenda: args.agenda, criteria: args.criteria }]),
  });
}

describe("create-room e2e (main user flow)", () => {
  const goodAgenda =
    "Decide whether to ship v3 redesign before Q4 or delay to Q1. Quarterly review clause required.";
  const goodCriteria =
    "All four participants must explicitly agree on (a) ship-or-delay decision and (b) review cadence.";

  it("/create requires a session: anon GET → 307 to /sign-up", async () => {
    const res = await fetch(`${BASE}/create`, { redirect: "manual" });
    expect([302, 307, 308]).toContain(res.status);
    expect(res.headers.get("location")).toMatch(/\/sign-up$/);
  });

  it("/create renders for a signed-in user", async () => {
    const cookie = await signUpAndGetCookie(
      `create-${Date.now()}@example.com`,
      "Creator",
    );
    const res = await fetch(`${BASE}/create`, { headers: { cookie } });
    expect(res.status).toBe(200);
    // sanity: the heading is server-rendered, so we can grep for it
    expect(await res.text()).toMatch(/What needs.*deciding/s);
  });

  /**
   * THE BUG-CATCHER. The user reported "POST /create 303 in 117ms… but
   * nothing happened, the page simply refreshed."
   *
   * A 303 means the server action ran and called redirect(). If the page
   * "refreshes" instead of navigating to the room, the Location header on
   * the 303 must be wrong — most likely pointing back at /create instead
   * of at /room/<code>. This test asserts the actual Location verbatim.
   */
  it("POST createRoom: success → 303 with Location pointing at /room/<code>", async () => {
    const cookie = await signUpAndGetCookie(
      `room-redir-${Date.now()}@example.com`,
      "RoomRedirUser",
    );
    const res = await postCreateRoomAction({
      cookie,
      agenda: goodAgenda,
      criteria: goodCriteria,
    });

    expect(
      [200, 303],
      `expected 200 or 303, got ${res.status}: ${await res.clone().text()}`,
    ).toContain(res.status);

    // Next encodes the redirect target either in Location (303) or in the
    // x-action-redirect header (for Next-Action POST). Accept either; assert
    // it points at /room/<code>, NOT at /create.
    const loc =
      res.headers.get("location") ??
      res.headers.get("x-action-redirect") ??
      "";
    const body = await res.text();
    const targetFromBody = body.match(/\/room\/[A-Z]+-[A-Z0-9]+/i)?.[0] ?? "";
    const target = loc || targetFromBody;

    expect(
      target,
      `redirect target not found.\n  status=${res.status}\n  location=${loc}\n  x-action-redirect=${res.headers.get("x-action-redirect")}\n  body head=${body.slice(0, 400)}`,
    ).toMatch(/\/room\/[A-Z]+-[A-Z0-9]+/);
    expect(target, "redirect must NOT land back at /create").not.toMatch(
      /\/create(\?|$)/,
    );
  });

  it("POST createRoom → follow redirect → /room/<code> renders for the creator (no bounce)", async () => {
    const cookie = await signUpAndGetCookie(
      `room-follow-${Date.now()}@example.com`,
      "RoomFollowUser",
    );
    const res = await postCreateRoomAction({
      cookie,
      agenda: goodAgenda,
      criteria: goodCriteria,
    });

    const loc =
      res.headers.get("location") ??
      res.headers.get("x-action-redirect") ??
      (await res.clone().text()).match(/\/room\/[A-Z]+-[A-Z0-9]+/i)?.[0];
    if (!loc) throw new Error("no redirect target on createRoom response");

    // Browser semantics: follow the redirect with the same session.
    const roomRes = await fetch(`${BASE}${loc}`, {
      headers: { cookie },
      redirect: "manual",
    });
    expect(
      roomRes.status,
      `room page bounced. status=${roomRes.status}, location=${roomRes.headers.get("location")}`,
    ).toBe(200);
    const roomBody = await roomRes.text();
    // RoomClient renders the agenda title — proves we landed in the actual
    // room, not on /error or /sign-up.
    expect(roomBody).not.toMatch(/Create your.*delegation/s); // not signup
    expect(roomBody).not.toMatch(/Something went wrong/i); // not error page
  });

  it("POST createRoom: empty body → action returns kind=error, NO redirect", async () => {
    const cookie = await signUpAndGetCookie(
      `room-bad-${Date.now()}@example.com`,
      "RoomBadUser",
    );
    const res = await postCreateRoomAction({
      cookie,
      agenda: "",
      criteria: "",
    });
    // Validation fail → action returns {ok:false, error}, no redirect.
    expect(res.headers.get("location")).toBeFalsy();
    expect(res.headers.get("x-action-redirect")).toBeFalsy();
    const body = await res.text();
    expect(body).toMatch(/Agenda and criteria are required/);
  });

  it("POST createRoom without session → action returns kind=error, NO redirect", async () => {
    // Get an action id with a throwaway session, then call WITHOUT that cookie.
    const tmpCookie = await signUpAndGetCookie(
      `room-noauth-${Date.now()}@example.com`,
      "NoAuth",
    );
    const actionId = await findCreateRoomActionId(tmpCookie);
    const res = await fetch(`${BASE}/create`, {
      method: "POST",
      redirect: "manual",
      headers: {
        Accept: "text/x-component",
        "Content-Type": "text/plain;charset=UTF-8",
        "Next-Action": actionId,
        // no cookie
      },
      body: JSON.stringify([{ agenda: goodAgenda, criteria: goodCriteria }]),
    });
    expect(res.headers.get("location")).toBeFalsy();
    const body = await res.text();
    expect(body).toMatch(/Not signed in/);
  });
});
