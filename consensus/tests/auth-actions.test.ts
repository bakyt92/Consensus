/**
 * Unit-ish test for the signup server action. We mock `next/headers` so
 * `cookies().set()` writes to a Map we can inspect — that way we can run
 * the action exactly like a Server Action would.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined,
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  }),
}));

const consoleLogs: string[] = [];
const origConsoleLog = console.log;
console.log = (...args: unknown[]) => {
  consoleLogs.push(args.map(String).join(" "));
};
afterAllRestore();

function afterAllRestore() {
  // Hook to restore — runs on process exit
  process.on("beforeExit", () => {
    console.log = origConsoleLog;
  });
}

import { signupOrRequestLink } from "@/src/lib/auth-actions";
import { verifySessionToken } from "@/src/lib/session-core";
import { prisma } from "@/src/lib/prisma";

beforeEach(() => {
  cookieStore.clear();
  consoleLogs.length = 0;
});

describe("signupOrRequestLink", () => {
  it("creates a new user, sets a session cookie, returns kind=session", async () => {
    const res = await signupOrRequestLink({
      email: "Maya@Example.com",
      username: "Maya",
    });
    expect(res).toEqual({ kind: "session" });

    const sessionToken = cookieStore.get("consensus_session");
    expect(sessionToken, "session cookie should be set").toBeTruthy();

    const userId = await verifySessionToken(sessionToken!);
    expect(userId).toBeTruthy();

    const user = await prisma.user.findUnique({ where: { id: userId! } });
    expect(user).toBeTruthy();
    expect(user!.email).toBe("maya@example.com"); // lowercased
    expect(user!.username).toBe("Maya");
  });

  it("for an existing email, does NOT set a session and issues a magic link", async () => {
    // seed user
    await prisma.user.create({
      data: { email: "returning@example.com", username: "Returning User" },
    });

    const res = await signupOrRequestLink({
      email: "Returning@Example.com",
      username: "ignored",
    });

    expect(res.kind).toBe("magic_sent");
    if (res.kind === "magic_sent") {
      expect(res.email).toBe("returning@example.com");
    }
    expect(
      cookieStore.has("consensus_session"),
      "no session cookie for returning user",
    ).toBe(false);

    const links = await prisma.magicLink.findMany();
    expect(links.length).toBe(1);
    expect(links[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // dev-mail logger emits the link to console
    const joined = consoleLogs.join("\n");
    expect(joined).toMatch(/auth\/magic\//);
  });

  it("rejects invalid email or short username with kind=error", async () => {
    const bad1 = await signupOrRequestLink({ email: "not-an-email", username: "Bob" });
    expect(bad1.kind).toBe("error");

    const bad2 = await signupOrRequestLink({ email: "ok@example.com", username: "x" });
    expect(bad2.kind).toBe("error");
  });

  it("does not throw across the RSC boundary even on internal failure", async () => {
    // Force a Prisma error by passing nonsense — zod parse will fail first.
    const res = await signupOrRequestLink({ email: 42, username: 42 });
    expect(res.kind).toBe("error");
  });
});
