import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: [
      "src/db/__tests__/schema-v2.test.ts",
      "src/persistence/__tests__/project.test.ts",
      "src/repositories/__tests__/repositories-v2.test.ts",
      "src/workspace/__tests__/store-v2.test.ts",
      "src/skills/__tests__/prompt-skills.test.ts",
      "src/skills/__tests__/executor.test.ts",
      "src/policy/__tests__/engine-v2.test.ts",
      "src/policy/__tests__/rule-resolver.test.ts",
      "src/policy/__tests__/pattern-detector.test.ts",
      "src/policy/__tests__/condition-extractor.test.ts",
      "src/pipeline/__tests__/**/*.test.ts",
      "src/connections/google-ads/__tests__/**/*.test.ts",
    ],
  },
});
