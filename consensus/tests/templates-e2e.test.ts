/**
 * E2E for the templates + GLiNER feature.
 *
 *   1. spawn a fresh server (same pattern as signup-e2e), with `GLINER_STUB=1`
 *      and no Pioneer key so the classifier deterministically falls back to
 *      `category = labels[0]`, `sentiment = neutral`.
 *   2. sign up → create room with `template=brainstorm` via the native form
 *      POST path (proves the picker submits the field).
 *   3. read the room back from the DB; assert `template === "brainstorm"`.
 *   4. enqueue a message through the pipeline (from the test process — same
 *      DB file, same DATABASE_URL). Poll until the message row has
 *      `category` populated. Assert it's the template's first label.
 *
 * We intentionally use stub GLiNER (not the real Pioneer call) — keeps the
 * test deterministic + offline. The real-API path was verified once via
 * `curl` against the live endpoint during development.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const projectRoot = path.resolve(import.meta.dirname, "..");
const dbName = `e2e-tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`;
const relativeDbUrl = `file:./${dbName}`;
const PORT = 5800 + Math.floor(Math.random() * 200);
const BASE = `http://localhost:${PORT}`;
const AUTH_SECRET = "test-secret-for-tpl-e2e-please-change-x-x-x";

let server: ChildProcessWithoutNullStreams | null = null;

async function assertNoExistingDevServer(): Promise<void> {
  try {
    const r = await fetch("http://localhost:3000/sign-up", {
      signal: AbortSignal.timeout(1500),
    });
    if (r.ok || r.status === 307) {
      throw new Error(
        "A Consensus dev server is already running on :3000. Stop it before running e2e tests.",
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("A Consensus dev")) throw err;
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
  throw new Error(`Server did not start at ${url}: ${String(lastErr)}`);
}

beforeAll(async () => {
  await assertNoExistingDevServer();
  const { execSync } = await import("node:child_process");
  execSync(`pnpm exec prisma db push --accept-data-loss`, {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: relativeDbUrl },
    stdio: "pipe",
  });

  // Spawn server with stub-mode classifier. We pass DATABASE_URL through so
  // the test process and the server hit the same SQLite file.
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
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: "development",
        DATABASE_URL: relativeDbUrl,
        AUTH_SECRET,
        APP_ORIGIN: BASE,
        PORT: String(PORT),
        // Force stub mode for deterministic classification in tests.
        GLINER_STUB: "1",
        PIONEER_API_KEY: "",
        OPENAI_API_KEY: "",
        RESEND_API_KEY: "",
      },
    },
  );
  server.stdout.on("data", (b) => process.stdout.write(`[tpl-srv] ${b}`));
  server.stderr.on("data", (b) => process.stderr.write(`[tpl-srv-err] ${b}`));
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

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

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
  for (const [k, v] of extractHiddenInputs(html)) fd.append(k, v);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fetch(pageUrl, {
    method: "POST",
    body: fd,
    redirect: "manual",
    headers: cookie ? { cookie } : {},
  });
}

function sessionCookieFrom(res: Response): string | undefined {
  const cookies = res.headers.getSetCookie?.() ?? [];
  const sess = cookies.find((c) => c.startsWith("consensus_session="));
  return sess ? sess.split(";")[0] : undefined;
}

describe("templates + GLiNER (e2e)", () => {
  it("create form renders the template picker with debate pre-selected", async () => {
    // sign up → land with a session cookie
    const signup = await nativeFormPost(`${BASE}/sign-up`, {
      email: `picker-${Date.now()}@example.com`,
      username: `picker_${Date.now()}`,
    });
    const cookie = sessionCookieFrom(signup);
    expect(cookie).toBeTruthy();

    const html = await (
      await fetch(`${BASE}/create`, { headers: { cookie: cookie! } })
    ).text();
    expect(html).toContain("template-picker");
    expect(html).toMatch(
      /<input[^>]*name="template"[^>]*value="debate"[^>]*checked|<input[^>]*name="template"[^>]*checked[^>]*value="debate"/,
    );
    for (const key of ["debate", "brainstorm", "standup", "retro", "negotiation"]) {
      expect(html).toContain(`value="${key}"`);
    }
  });

  it("posting /create with template=brainstorm persists Room.template", async () => {
    const stamp = Date.now();
    const signup = await nativeFormPost(`${BASE}/sign-up`, {
      email: `persist-${stamp}@example.com`,
      username: `persist_${stamp}`,
    });
    const cookie = sessionCookieFrom(signup);
    expect(cookie).toBeTruthy();

    const create = await nativeFormPost(
      `${BASE}/create`,
      {
        agenda:
          "How might we cut total meeting time in our org by a third in H2?",
        criteria:
          "Surface eight distinct ideas; pick three for quarterly experiments.",
        template: "brainstorm",
      },
      cookie!,
    );
    expect(create.status).toBe(303);
    const location = create.headers.get("location") ?? "";
    expect(location).toMatch(/^\/room\/[A-Z]{3}-[A-Z0-9]{4}$/);
    const code = location.split("/").pop()!;

    const db = new PrismaClient({
      adapter: new PrismaBetterSqlite3({ url: relativeDbUrl }),
    });
    try {
      const room = await db.room.findUnique({ where: { code } });
      expect(room).toBeTruthy();
      expect(room!.template).toBe("brainstorm");
    } finally {
      await db.$disconnect();
    }
  });

  // The pipeline-side glue (gliner.classify → message.update) is covered by
  // tests/gliner-pipeline.test.ts, which uses setup.ts's test harness so the
  // prisma singleton lines up with the test DB. Keeping it out of this file
  // avoids a two-DB process arrangement.
});
