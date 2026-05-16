/**
 * Side-effect module: loads .env.local (and friends) into process.env.
 *
 * MUST be imported FIRST in server.ts — before prisma / session / openai — so
 * that those modules see env vars at their initial evaluation. ESM hoists all
 * `import` declarations, so putting `loadEnvConfig(...)` in server.ts's body
 * doesn't work: child modules evaluate first.
 *
 * @next/env is CJS; named imports don't survive Node's --experimental-transform-types
 * (which treats .ts as ESM), so go through createRequire.
 */

import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);
const { loadEnvConfig } = _require("@next/env") as typeof import("@next/env");

loadEnvConfig(process.cwd());
