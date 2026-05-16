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
// Helpers — native multipart form submission
// =============================================================

/**
 * Submit Server-Action-backed forms the same way the browser does pre-hydration:
 * a multipart POST that includes the hidden `$ACTION_*` fields that Next renders
 * into the form. This is more robust than driving the JS-handled `Next-Action`
 * header path (which targets only the form-action wrapper in Next 16+ turbo,
 * uses a different body encoding, and shifts shape between Next versions).
 *
 * It also exercises the exact code path a user hits when client hydration is
 * delayed/broken — the failure mode we keep hitting in this app.
 */
function getSetCookies(res: Response): string[] {
  return (
    res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""]
  ).filter(Boolean);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Pull every <input type="hidden"> out of a rendered HTML page. */
function extractHiddenInputs(html: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const re = /<input([^>]*\btype="hidden"[^>]*?)\/?>/g;
  for (const m of html.matchAll(re)) {
    const attrs = m[1]!;
    const name = attrs.match(/\bname="([^"]*)"/)?.[1];
    const value = attrs.match(/\bvalue="([^"]*)"/)?.[1] ?? "";
    if (name) out.push([name, decodeEntities(value)]);
  }
  return out;
}

/**
 * Native multipart POST that replays the form on `pageUrl`. Hidden $ACTION_*
 * fields are pulled out of the rendered HTML and replayed verbatim; only the
 * `fields` are user-controlled. Mirrors how a browser submits a React 19
 * `<form action={serverAction}>` pre-hydration.
 */
async function nativeFormPost(
  pageUrl: string,
  fields: Record<string, string>,
  cookie?: string,
): Promise<Response> {
  const pageRes = await fetch(pageUrl, {
    headers: cookie ? { cookie } : {},
  });
  const html = await pageRes.text();
  const fd = new FormData();
  let sawActionRef = false;
  for (const [k, v] of extractHiddenInputs(html)) {
    fd.append(k, v);
    if (k.startsWith("$ACTION_")) sawActionRef = true;
  }
  if (!sawActionRef) {
    throw new Error(
      `No $ACTION_* hidden fields in ${pageUrl} — form did not render as a server-action target.`,
    );
  }
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);

  return fetch(pageUrl, {
    method: "POST",
    body: fd,
    redirect: "manual",
    headers: cookie ? { cookie } : {},
  });
}

async function postSignupAction(args: { email: string; username: string }) {
  return nativeFormPost(`${BASE}/sign-up`, args);
}

/** Extract the `name=value` of `consensus_session` from a Response's Set-Cookie. */
function extractSessionCookie(res: Response): string | undefined {
  const c = getSetCookies(res).find((c) =>
    c.startsWith("consensus_session="),
  );
  return c ? c.split(";")[0] : undefined;
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

  it("POST signup form: new email → 307 to /lobby, sets HttpOnly session cookie", async () => {
    const res = await postSignupAction({
      email: "newuser@example.com",
      username: "New User",
    });

    // signupOrRequestLink calls setSessionCookie and returns kind=session;
    // useEffect in <SignupForm> redirects to /lobby once that state is seen.
    // For native form POST, Next encodes the redirect as 307/303 with Location.
    expect(
      [200, 303, 307],
      `unexpected status ${res.status}. body=${(await res.clone().text()).slice(0, 400)}`,
    ).toContain(res.status);
    // If 200 (no router-driven redirect), the body must still indicate session;
    // if 307/303, the Location header must point at /lobby.
    if (res.status === 200) {
      const body = await res.text();
      expect(body, `expected kind=session, body=${body.slice(0, 400)}`).toMatch(
        /"kind":\s*"session"/,
      );
      expect(body).not.toMatch(/"kind":\s*"error"/);
    } else {
      expect(res.headers.get("location")).toMatch(/\/lobby$/);
    }

    const cookies = getSetCookies(res);
    const session = cookies.find((c) => c.startsWith("consensus_session="));
    expect(session, `expected consensus_session cookie, got: ${cookies}`).toBeTruthy();
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=lax/i);
  });

  it("POST signup form: existing email → magic_sent path, NO session cookie", async () => {
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

    // No client-side redirect for the magic-link branch: the form re-renders
    // in place with the "check your inbox" UI. Native POST returns 200 +
    // the new HTML (server-rendered with the updated state).
    expect([200, 303]).toContain(res.status);
    const body = await res.text();
    // Either the state encoding (kind=magic_sent) or the rendered "check your
    // inbox" screen is acceptable — both prove the magic-link branch ran.
    expect(body).toMatch(/(magic_sent|check your inbox|We sent you)/i);

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
 * Sign up via native form POST, return the session cookie string (`name=value`)
 * suitable for the `Cookie` request header.
 */
async function signUpAndGetCookie(email: string, username: string): Promise<string> {
  const res = await postSignupAction({ email, username });
  if (res.status >= 400) {
    throw new Error(`signup failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const cookie = extractSessionCookie(res);
  if (!cookie) {
    throw new Error(
      `signup did not set consensus_session cookie. status=${res.status}, set-cookie=${getSetCookies(res)}`,
    );
  }
  return cookie;
}

async function postCreateRoomAction(args: {
  cookie: string;
  agenda: string;
  criteria: string;
}): Promise<Response> {
  return nativeFormPost(
    `${BASE}/create`,
    { agenda: args.agenda, criteria: args.criteria },
    args.cookie,
  );
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
      [303, 307],
      `expected redirect status, got ${res.status}: ${(await res.clone().text()).slice(0, 400)}`,
    ).toContain(res.status);

    const loc = res.headers.get("location") ?? "";
    expect(
      loc,
      `expected /room/<code>, got Location=${loc}, status=${res.status}`,
    ).toMatch(/\/room\/[A-Z]+-[A-Z0-9]+/);
    expect(loc, "redirect must NOT land back at /create").not.toMatch(
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

    const loc = res.headers.get("location");
    if (!loc || !/\/room\//.test(loc)) {
      throw new Error(
        `createRoom didn't redirect to a room. status=${res.status}, location=${loc}`,
      );
    }

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
    // The agenda we submitted must appear in the rendered room — proves we
    // landed in the right room with the right state, not on /error or /sign-up.
    expect(roomBody).toMatch(/Decide whether to ship v3 redesign/);
    expect(roomBody).not.toMatch(/Create your.*delegation/s);
    expect(roomBody).not.toMatch(/Something went wrong/i);
  });

  it("POST createRoom: too-short input → no redirect, error surfaced", async () => {
    const cookie = await signUpAndGetCookie(
      `room-bad-${Date.now()}@example.com`,
      "RoomBadUser",
    );
    // Both fields well under the 10-char minLength so server-side zod fails.
    const res = await postCreateRoomAction({
      cookie,
      agenda: "x",
      criteria: "y",
    });
    expect(
      res.headers.get("location"),
      `validation fail must NOT redirect. got Location=${res.headers.get("location")}`,
    ).toBeFalsy();
    expect(res.status).toBeLessThan(400);
    const body = await res.text();
    expect(body).toMatch(/Agenda and criteria are required/);
  });

  it("POST createRoom WITHOUT session → no room redirect", async () => {
    // Get a session to render /create (so we can extract the action ref),
    // then strip the cookie on the final POST to simulate an anon submitter.
    const tmpCookie = await signUpAndGetCookie(
      `room-noauth-${Date.now()}@example.com`,
      "NoAuth",
    );
    const html = await (
      await fetch(`${BASE}/create`, { headers: { cookie: tmpCookie } })
    ).text();
    const fd = new FormData();
    for (const [k, v] of extractHiddenInputs(html)) fd.append(k, v);
    fd.append("agenda", goodAgenda);
    fd.append("criteria", goodCriteria);
    const res = await fetch(`${BASE}/create`, {
      method: "POST",
      body: fd,
      redirect: "manual",
      // deliberately no cookie
    });
    // Anon users must NOT end up redirected to /room/<code>. Acceptable:
    //  - 307/303 to /sign-up
    //  - 200 with the action's "Not signed in." message
    const loc = res.headers.get("location") ?? "";
    expect(loc).not.toMatch(/\/room\//);
    if (res.status >= 300 && res.status < 400) {
      expect(loc).toMatch(/\/sign-up$|^\/$/);
    } else {
      const body = await res.text();
      expect(body).toMatch(/Not signed in/);
    }
  });
});
