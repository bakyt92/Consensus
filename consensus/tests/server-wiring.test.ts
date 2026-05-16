/**
 * Static checks that catch the original "form silently refreshes" bug class:
 *
 * 1. server.ts must import the env-loader side-effect module FIRST. ESM
 *    hoists static imports, so a later loadEnvConfig() call doesn't run
 *    before other top-level module code (e.g., prisma.ts reading
 *    DATABASE_URL). The fix only works if load-env.ts is the very first
 *    `import` in server.ts.
 *
 * 2. load-env.ts must actually call loadEnvConfig with cwd.
 *
 * These are tiny but surgical. They survive even when env is passed via
 * spawn() in the e2e test (which would otherwise mask a regression here).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");

describe("server wiring (regression for silent signup refresh)", () => {
  it("server.ts: first import is the env-loader side effect", () => {
    const src = readFileSync(path.join(projectRoot, "server.ts"), "utf8");

    // Strip leading comments and blank lines.
    const lines = src.split("\n");
    let i = 0;
    while (i < lines.length) {
      const line = lines[i]!.trim();
      if (line === "" || line.startsWith("//") || line.startsWith("/*") || line.startsWith("*")) {
        i++;
        continue;
      }
      break;
    }
    const firstCode = lines[i] ?? "";

    expect(
      firstCode,
      `server.ts's first non-comment line must import load-env. Got: ${firstCode}`,
    ).toMatch(/import\s+["']\.\/src\/server\/load-env(\.ts)?["']/);
  });

  it("load-env.ts: calls loadEnvConfig with process.cwd()", () => {
    const src = readFileSync(
      path.join(projectRoot, "src/server/load-env.ts"),
      "utf8",
    );
    expect(src).toMatch(/loadEnvConfig\s*\(\s*process\.cwd\(\)\s*\)/);
  });
});
