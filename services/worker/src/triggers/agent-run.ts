import { resolve } from "node:path";
import { task, wait } from "@trigger.dev/sdk/v3";
import { runPipeline } from "../../../../packages/harness/src/pipeline/runner";
import { SqliteMemoryStore } from "../../../../packages/harness/src/memory/store";
import { SkillRegistry } from "../../../../packages/harness/src/skills/registry";
import { ContextAssembler } from "../../../../packages/harness/src/context/assembler";
import { WorkspaceStore } from "../../../../packages/harness/src/workspace/store";
import { RunRepository } from "../../../../packages/harness/src/repositories/run";
import { ApprovalRepository } from "../../../../packages/harness/src/repositories/approval";
import { createDb } from "../../../../packages/harness/src/db/client";
import { searchTermsSkill } from "../../../../packages/harness/src/skills/built-in/search-terms";
import type { AgentConfig } from "../../../../packages/harness/src/types/agent-config";
import type { TriggerEvent } from "../../../../packages/harness/src/types/run";
import type { ConnectionManager } from "../../../../packages/harness/src/connections/types";
import {
  createComposioClient,
  ComposioConnectionManager,
  DEFAULT_DATA_TYPE_MAPPINGS,
} from "../../../../packages/harness/src/connections/composio";

// ---------------------------------------------------------------------------
// Agent Run Task — wraps runPipeline in trigger.dev durable execution
// ---------------------------------------------------------------------------

export const agentRunTask = task({
  id: "agent-run",
  retry: { maxAttempts: 2 },
  run: async (payload: {
    agentId: string;
    projectId: string;
    trigger: TriggerEvent;
  }) => {
    const { agentId, projectId, trigger } = payload;

    // Build dependencies from project context
    // Resolve absolute path — trigger.dev worker runs in a sandboxed temp dir
    // Web server cwd is apps/web/, so data/ lives under apps/web/data/
    const projectRoot = process.env.PROJECT_ROOT ?? process.cwd();
    const dataRoot = resolve(projectRoot, "apps/web");
    const dbPath = resolve(dataRoot, `data/projects/${projectId}/nochore.db`);
    const db = createDb(dbPath);
    const memoryStore = new SqliteMemoryStore(db);
    const runRepository = new RunRepository(db);
    const approvalRepository = new ApprovalRepository(db);

    // Load agent config from DB
    const agentRow = db.query.agents.findFirst({
      where: (agents, { eq }) => eq(agents.id, agentId),
    });
    if (!agentRow) {
      throw new Error(`Agent ${agentId} not found`);
    }
    const config: AgentConfig =
      typeof agentRow.config === "string"
        ? JSON.parse(agentRow.config)
        : agentRow.config;

    // Build skill registry with built-in skills
    const skillRegistry = new SkillRegistry();
    skillRegistry.register(searchTermsSkill);
    // TODO: register additional built-in skills as they're ported

    // Build workspace + context assembler
    const rawWorkspacePath = config.workspacePath ?? `data/projects/${projectId}/agents/${agentId}`;
    const workspacePath = resolve(dataRoot, rawWorkspacePath);
    const workspaceStore = new WorkspaceStore(workspacePath);
    const contextAssembler = new ContextAssembler(workspaceStore, memoryStore);

    // Connection manager — real Composio if API key available, stub otherwise
    const connectionManager = await buildConnectionManager(projectId);

    // Run the pipeline
    const result = await runPipeline({
      agentId,
      trigger,
      config,
      deps: {
        memoryStore,
        skillRegistry,
        connectionManager,
        contextAssembler,
        approvalRepository,
        runRepository,
      },
    });

    return result;
  },
});

// ---------------------------------------------------------------------------
// Approval Task — waits for human decision via waitpoint token
// ---------------------------------------------------------------------------

export const waitForApprovalTask = task({
  id: "wait-for-approval",
  run: async (payload: {
    proposalId: string;
    agentId: string;
    runId: string;
  }) => {
    const { proposalId } = payload;

    // Create a waitpoint token for this approval
    const token = await wait.createToken({
      idempotencyKey: `approval-${proposalId}`,
      timeout: "7d",
      tags: [`proposal-${proposalId}`],
    });

    // Wait for the token to be completed (by the frontend calling wait.completeToken)
    const result = await wait.forToken<{
      approved: boolean;
      reason?: string;
    }>(token);

    return result.output;
  },
});

// ---------------------------------------------------------------------------
// Connection manager — Composio-backed if API key available, stub otherwise
// ---------------------------------------------------------------------------

async function buildConnectionManager(projectId: string): Promise<ConnectionManager> {
  if (!process.env.COMPOSIO_API_KEY) {
    // No API key — return stub so pipeline still runs (skills work without data)
    return {
      async fetch() { return null; },
      async execute() { return { status: "skipped" as const, message: "No Composio API key" }; },
      availableDataTypes() { return []; },
      async getHealth() { return []; },
    };
  }

  const composio = await createComposioClient();
  const userId = `nochore-${projectId}`;
  return new ComposioConnectionManager(composio, userId, DEFAULT_DATA_TYPE_MAPPINGS);
}
