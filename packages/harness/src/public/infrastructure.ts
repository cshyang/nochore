// Infrastructure surface — wiring API.
// Repositories, db client/schema, workspace, LLM factory, connection factories.
// These touch I/O and external SDKs. Prefer importing from `./domain` in
// pure code; import from here only where wiring is being assembled.

export {
  createComposioAdapter,
  createComposioClient,
  getComposioUserId,
  getGoogleAdsToolsForPi,
} from "../connections/index";

export { createDb, type HarnessDb } from "../db/client";

export {
  agents,
  agentTasks,
  approvals,
  connections,
  learnedPolicyRules,
  lessons,
  projects,
  runEvents,
  runs,
  suggestionSuppressions,
} from "../db/schema";
export { createAiSdkModel, resolveAiSdkProvider } from "../llm/model";
export { getProjectPersistence, openProjectDb } from "../persistence/index";
export {
  type AgentRecord,
  createProjectRepositories,
  type LessonRecord,
} from "../repositories/index";
export {
  getAgentWorkspacePath,
  getProjectDirectory,
  getWebDataRoot,
  initializeWorkspace,
  WorkspaceStore,
} from "../workspace/index";
