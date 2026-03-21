import type { AgentConfig } from "../types/agent-config";
import type { TriggerEvent, RunResult, StepOutput } from "../types/run";
import type { ActionProposal } from "../types/action";
import type { AgentEventType } from "../types/memory";
import type { MemoryStore } from "../types/memory";
import type { SkillRegistry } from "../skills/registry";
import type { ConnectionManager } from "../connections/types";
import type { ContextAssembler } from "../context/assembler";
import type { ApprovalRepository } from "../repositories/approval";
import type { RunRepository } from "../repositories/run";

import { resolveScope } from "./steps/scope";
import { fetchData } from "./steps/fetch";
import { analyzeSkills, type SkillOutput } from "./steps/analyze";
import { planActions } from "./steps/plan";
import { executeActions } from "./steps/execute";
import { writeMemory } from "./steps/memory-write";
import { evaluatePolicy, type PolicyEvalConfig } from "../policy/engine";
import type { PolicyRule } from "../types/policy";
import { budgetDeltaRule } from "../policy/rules/budget-delta";
import { cooldownRule } from "../policy/rules/cooldown";
import { operationalRule } from "../policy/rules/operational";
import { globalOverrideRule } from "../policy/rules/global-override";

// ---------------------------------------------------------------------------
// PipelineDependencies — all external dependencies the pipeline needs
// ---------------------------------------------------------------------------

export interface PipelineDependencies {
  memoryStore: MemoryStore;
  skillRegistry: SkillRegistry;
  connectionManager: ConnectionManager;
  contextAssembler: ContextAssembler;
  approvalRepository: ApprovalRepository;
  runRepository: RunRepository;
}

// ---------------------------------------------------------------------------
// Built-in rule registry — maps config string IDs to PolicyRule objects
// ---------------------------------------------------------------------------

const BUILT_IN_RULES: Record<string, PolicyRule> = {
  budget_delta: budgetDeltaRule,
  cooldown: cooldownRule,
  operational: operationalRule,
  global_override: globalOverrideRule,
};

// ---------------------------------------------------------------------------
// Event collector — accumulates events during a pipeline run
// ---------------------------------------------------------------------------

interface PipelineEvent {
  type: AgentEventType;
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// runPipeline — the main orchestrator
// ---------------------------------------------------------------------------

/**
 * Execute a full agent pipeline: scope → fetch → analyze → plan → policy →
 * execute → memory. Creates a run record, collects events at each step,
 * and finalizes the run when complete (or on error).
 */
export async function runPipeline(params: {
  agentId: string;
  trigger: TriggerEvent;
  config: AgentConfig;
  deps: PipelineDependencies;
}): Promise<RunResult> {
  const { agentId, trigger, config, deps } = params;
  const startedAt = new Date();
  const pipelineStart = performance.now();
  const events: PipelineEvent[] = [];
  const steps: StepOutput[] = [];
  let allProposals: ActionProposal[] = [];

  // Step 1: Setup — generate runId, create run record
  const runId = await deps.runRepository.create({
    agentId,
    triggerType: trigger.type,
    startedAt,
  });

  try {
    // Step 2: Scope Resolution
    const scopeContext = await deps.contextAssembler.forScopeResolution(agentId);
    const { skillIds, stepOutput: scopeStep } = await resolveScope({
      config,
      trigger,
      context: scopeContext,
      skillRegistry: deps.skillRegistry,
    });
    steps.push(scopeStep);
    events.push({
      type: "scope_resolved",
      data: { skillIds },
    });

    // Step 3: Data Fetch
    const { data, stepOutput: fetchStep } = await fetchData({
      skillIds,
      skillRegistry: deps.skillRegistry,
      connectionManager: deps.connectionManager,
    });
    steps.push(fetchStep);
    events.push({
      type: "data_fetched",
      data: { dataTypes: Object.keys(data) },
    });

    // Step 4: Analyze
    const { outputs, stepOutput: analyzeStep } = await analyzeSkills({
      skillIds,
      data,
      skillRegistry: deps.skillRegistry,
      skillKnowledge: config.skillKnowledge,
      model: config.model,
    });
    steps.push(analyzeStep);
    for (const output of outputs) {
      events.push({
        type: "skill_output",
        data: {
          skillId: output.skillId,
          hasError: !!output.error,
          ...(output.error ? { error: output.error } : {}),
        },
      });
    }

    // Step 5: Plan
    const planContext = await deps.contextAssembler.forPlanning(agentId, outputs);
    const { proposals, stepOutput: planStep } = await planActions({
      skillOutputs: outputs,
      context: planContext,
      model: config.model,
    });
    steps.push(planStep);
    allProposals = proposals;
    for (const proposal of proposals) {
      events.push({
        type: "action_proposed",
        data: {
          proposalId: proposal.id,
          action: proposal.action,
          confidence: proposal.confidence,
        },
      });
    }

    // Step 6: Policy Gate
    const policyStart = performance.now();
    const rules = resolvePolicyRules(config.policyRules);
    const policyEvalConfig: PolicyEvalConfig = {
      policyOverrides: config.policyOverrides,
      globalApprovalRequired: config.globalApprovalRequired,
      operationalConstraints: config.operationalConstraints,
    };
    const decisions = evaluatePolicy(proposals, rules, policyEvalConfig);

    // Categorize proposals by decision
    const autoApproved: ActionProposal[] = [];
    const needsReview: ActionProposal[] = [];
    const blocked: ActionProposal[] = [];

    for (const proposal of proposals) {
      const decision = decisions.get(proposal.id);
      if (!decision) continue;

      events.push({
        type: "policy_decision",
        data: {
          proposalId: proposal.id,
          result: decision.result,
          reason: decision.reason,
        },
      });

      switch (decision.result) {
        case "approved":
          autoApproved.push(proposal);
          break;
        case "needs_review":
          needsReview.push(proposal);
          break;
        case "blocked":
          blocked.push(proposal);
          break;
      }
    }

    const policyDuration = performance.now() - policyStart;
    steps.push({
      step: "policy",
      duration: policyDuration,
      data: {
        total: proposals.length,
        autoApproved: autoApproved.length,
        needsReview: needsReview.length,
        blocked: blocked.length,
      },
    });

    // Step 7: Execute
    const { results: executionResults, stepOutput: executeStep } =
      await executeActions({
        proposals: autoApproved,
        connectionManager: deps.connectionManager,
      });
    steps.push(executeStep);

    for (const result of executionResults) {
      events.push({
        type: "action_executed",
        data: {
          proposalId: result.proposalId,
          status: result.status,
          ...(result.error ? { error: result.error } : {}),
        },
      });
    }

    // Queue needsReview proposals
    for (const proposal of needsReview) {
      await deps.approvalRepository.queue({
        runId,
        agentId,
        proposal,
      });
    }

    // Step 8: Memory Write
    const { eventsLogged, stepOutput: memoryStep } = await writeMemory({
      runId,
      agentId,
      memoryStore: deps.memoryStore,
      events,
    });
    steps.push(memoryStep);

    // Finalize
    const duration = performance.now() - pipelineStart;
    const runResult: RunResult = {
      runId,
      agentId,
      duration,
      steps,
      proposals: allProposals,
      eventsLogged,
    };

    await deps.runRepository.complete(runId, new Date(), runResult);

    return runResult;
  } catch (error) {
    // Error path: log the error, append an error event, complete run with error
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    events.push({
      type: "action_executed",
      data: { error: errorMessage, pipelineError: true },
    });

    // Try to write whatever events we collected
    let eventsLogged = 0;
    try {
      const memResult = await writeMemory({
        runId,
        agentId,
        memoryStore: deps.memoryStore,
        events,
      });
      eventsLogged = memResult.eventsLogged;
      steps.push(memResult.stepOutput);
    } catch {
      // Memory write failed too — continue with what we have
    }

    const duration = performance.now() - pipelineStart;
    const runResult: RunResult = {
      runId,
      agentId,
      duration,
      steps,
      proposals: allProposals,
      eventsLogged,
    };

    try {
      await deps.runRepository.complete(runId, new Date(), runResult);
    } catch {
      // Run completion failed — still return the result
    }

    return runResult;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve policy rule string IDs to actual PolicyRule objects.
 * Unknown rule IDs are silently skipped.
 */
function resolvePolicyRules(ruleIds: string[]): PolicyRule[] {
  const rules: PolicyRule[] = [];
  for (const id of ruleIds) {
    const rule = BUILT_IN_RULES[id];
    if (rule) {
      rules.push(rule);
    }
  }
  return rules;
}
