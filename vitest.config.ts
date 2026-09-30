import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 400_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      exclude: ["lib/**/index.ts"],
      reporter: ["text-summary", "text", "json-summary"],
      thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
    },
  },
});
