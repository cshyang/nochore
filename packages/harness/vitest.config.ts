import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: [
      "src/db/__tests__/schema-v2.test.ts",
      "src/repositories/__tests__/repositories-v2.test.ts",
      "src/workspace/__tests__/store-v2.test.ts",
      "src/skills/__tests__/prompt-skills.test.ts",
      "src/skills/__tests__/executor.test.ts",
      "src/policy/__tests__/engine-v2.test.ts",
      "src/pipeline/__tests__/**/*.test.ts",
    ],
  },
});
