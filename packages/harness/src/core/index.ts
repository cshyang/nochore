// Logical core layer: deterministic contracts and policy logic over in-memory inputs.
// This is an internal grouping surface, not yet a strict physical boundary.
export { extractConditions } from "../policy/condition-extractor";
export { evaluatePolicy } from "../policy/engine";
export {
  type ApprovalPattern,
  DEFAULT_DETECTION_CONFIG,
  type DetectionConfig,
  detectApprovalPatterns,
} from "../policy/pattern-detector";
export { findMatchingLearnedRule, resolveDecision } from "../policy/rule-resolver";
export { buildToolConfigEntry, inferToolMode, mergeToolCatalog } from "../policy/tool-catalog";
export * from "../types/index";
