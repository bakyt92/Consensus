import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

declare global {
  // eslint-disable-next-line no-var
  var __consensusPrisma: PrismaClient | undefined;
}

// Exported for tests: the URL we hand to the adapter.
//
// IMPORTANT: we pass the URL through verbatim. `file:./dev.db` resolves
// relative to process.cwd() in BOTH the Prisma CLI (via prisma.config.ts)
// and the better-sqlite3 adapter (which strips `file:` and lets
// better-sqlite3 resolve cwd-relative). An earlier version of this file
// rewrote `./dev.db` → `<cwd>/prisma/dev.db`, which made the adapter open
// a DIFFERENT file than the one CLI migrations wrote to. Every query
// returned "table X does not exist". See tests/db-path.test.ts.
export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? "file:./dev.db";
}

function makeClient() {
  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: databaseUrl() }),
  });
}

export const prisma: PrismaClient =
  global.__consensusPrisma ?? makeClient();

if (process.env.NODE_ENV !== "production") {
  global.__consensusPrisma = prisma;
}
