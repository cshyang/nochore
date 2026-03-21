// Chat handler
export { handleChat, type ChatDependencies } from "./handler";

// Tool factories
export { createReadWorkspaceTool } from "./tools/read-workspace";
export { createWriteScratchpadTool } from "./tools/write-scratchpad";
export { createGenerateReportTool } from "./tools/generate-report";
export {
  createRunAnalysisTool,
  type RunAnalysisDeps,
} from "./tools/run-analysis";
export {
  createQueryMemoryTool,
  type QueryMemoryDeps,
} from "./tools/query-memory";
export {
  createGetInsightsTool,
  type GetInsightsDeps,
} from "./tools/get-insights";
export {
  createApplyActionTool,
  type ApplyActionDeps,
} from "./tools/apply-action";
export {
  createExplainDecisionTool,
  type ExplainDecisionDeps,
} from "./tools/explain-decision";
