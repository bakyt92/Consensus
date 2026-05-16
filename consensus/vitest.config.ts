import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    // Serial file execution — multiple e2e specs that each spawn `next dev`
    // can't share the project lock, so we run files one-at-a-time.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
    },
  },
});
