import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as harness from "../../index";

const PUBLIC_INDEX_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../index.ts");

describe("public harness exports", () => {
  it("does not use wildcard re-exports", () => {
    const source = readFileSync(PUBLIC_INDEX_PATH, "utf8");
    expect(source).not.toMatch(/export\s+\*/);
  });

  it("keeps the app and worker import surface available from the package root", () => {
    const expectedExports = [
      "AgentConfigSchema",
      "AgentScheduleSchema",
      "ApprovalStatusSchema",
      "CHECKPOINT_KEEP_RECENT_TOKENS",
      "INLINE_COMPACTION_KEEP_RECENT_TOKENS",
      "MetricObservationSchema",
      "RECENT_MODEL_MESSAGE_LIMIT",
      "RECENT_VISIBLE_MESSAGE_LIMIT",
      "WorkspaceStore",
      "agents",
      "approvals",
      "buildConversationTranscript",
      "buildToolConfigEntry",
      "classifyRunLessonWrites",
      "connections",
      "createAiSdkModel",
      "createComposioClient",
      "createDb",
      "createProjectRepositories",
      "detectAndSuggestLearnedRules",
      "estimateConversationStateTokens",
      "estimateTextTokens",
      "evaluatePolicy",
      "extractStructuredConversationEvents",
      "findCompactionBoundary",
      "getAgentDefinitionById",
      "getAgentWorkspacePath",
      "getComposioUserId",
      "getGoogleAdsToolsForPi",
      "getProjectDirectory",
      "getProjectPersistence",
      "getPromptDefinitionById",
      "getSkillDefinitionById",
      "getWebDataRoot",
      "initializeWorkspace",
      "learnedPolicyRules",
      "lessons",
      "listAgentDefinitions",
      "listPromptDefinitions",
      "listPromptSkills",
      "listSkillDefinitions",
      "openProjectDb",
      "projects",
      "rehydrateConversationMessages",
      "resolveAiSdkProvider",
      "runEvents",
      "runs",
      "sanitizeConversationMessage",
      "shouldAttemptChatMemoryDistillation",
      "shouldInlineCompact",
      "shouldRefreshCheckpoint",
      "suggestionSuppressions",
    ] as const;

    for (const name of expectedExports) {
      expect(harness).toHaveProperty(name);
    }
  });
});
