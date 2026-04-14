// Public barrel — re-exports both tiers for backward compatibility.
// New code should prefer explicit tier imports:
//   import { AgentConfigSchema, evaluatePolicy } from "@nochore/harness/domain";
//   import { createProjectRepositories } from "@nochore/harness/infrastructure";
export * from "./domain";
export * from "./infrastructure";
