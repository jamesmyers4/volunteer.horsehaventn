import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/vitest/**/*.test.ts"],
    setupFiles: ["tests/vitest/setup.ts"],
    // All test files share one real Postgres test DB (see docker-compose.test.yml) and
    // truncate it between tests — running files in parallel would race on that shared state.
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 15000
  }
})
