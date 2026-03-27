import { readFile } from "node:fs/promises";
import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { Composio } from "@composio/core";
import { eq } from "drizzle-orm";
import { tool, type ToolSet } from "ai";
import type { LanguageModel } from "ai";
import {
  buildAgentToolSet,
  buildDefaultToolConfig,
  createComposioClient,
  getComposioUserId,
  sendNotificationTool,
} from "../../../../packages/harness/src/connections";
import { createDb } from "../../../../packages/harness/src/db/client";
import { connections } from "../../../../packages/harness/src/db/schema";
import {
  AgentRepository,
  ApprovalRepository,
  LessonRepository,
  RunEventRepository,
  RunRepository,
  type AgentRecord,
} from "../../../../packages/harness/src/repositories";
import {
  listPromptSkills,
  type PromptSkill,
} from "../../../../packages/harness/src/skills";
import {
  type AgentConfig,
  type NotificationConfig,
  type ProviderRequirement,
  type RunTrigger,
  type ToolConfigEntry,
} from "../../../../packages/harness/src/types";
import {
  WorkspaceStore,
  getAgentWorkspacePath,
  getProjectDbPath,
} from "../../../../packages/harness/src/workspace";

export interface WorkerRuntime {
  db: ReturnType<typeof createDb>;
  agentRepository: AgentRepository;
  approvalRepository: ApprovalRepository;
  lessonRepository: LessonRepository;
  runEventRepository: RunEventRepository;
  runRepository: RunRepository;
  composio: Composio;
  userId: string;
  activeProviders: string[];
}

export interface PromptBundle {
  system: string;
  user: string;
  selectedSkills: PromptSkill[];
  workspaceKnowledge: string;
}

export async function createModel(modelOverride?: string): Promise<LanguageModel> {
  const provider = process.env.LLM_PROVIDER ?? "anthropic";
  const modelName = modelOverride ?? process.env.LLM_MODEL ?? "claude-sonnet-4-20250514";

  switch (provider) {
    case "zai": {
      const zai = createOpenAICompatible({
        name: "zai",
        baseURL: process.env.LLM_BASE_URL ?? "https://open.bigmodel.cn/api/paas/v4",
        apiKey: process.env.ZAI_API_KEY,
      });
      return zai(modelName);
    }
    case "openai": {
      const openai = createOpenAICompatible({
        name: "openai",
        baseURL: process.env.LLM_BASE_URL ?? "https://api.openai.com/v1",
        apiKey: process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY,
      });
      return openai(modelName);
    }
    case "custom": {
      const custom = createOpenAICompatible({
        name: "custom",
        baseURL: process.env.LLM_BASE_URL ?? "",
        apiKey: process.env.LLM_API_KEY,
      });
      return custom(modelName);
    }
    case "anthropic":
    default:
      return anthropic(modelName);
  }
}

export async function createWorkerRuntime(projectId: string): Promise<WorkerRuntime> {
  const db = createDb(getProjectDbPath(projectId));
  const composio = await createComposioClient();

  return {
    db,
    agentRepository: new AgentRepository(db),
    approvalRepository: new ApprovalRepository(db),
    lessonRepository: new LessonRepository(db),
    runEventRepository: new RunEventRepository(db),
    runRepository: new RunRepository(db),
    composio,
    userId: getComposioUserId(projectId),
    activeProviders: await listActiveProviders(db, projectId),
  };
}

export async function buildPromptBundle(params: {
  agent: AgentRecord;
  trigger: RunTrigger;
}): Promise<PromptBundle> {
  const workspaceStore = new WorkspaceStore(
    getAgentWorkspacePath(params.agent.projectId, params.agent.id),
  );
  const workspaceKnowledge = (await workspaceStore.readFile("KNOWLEDGE.md")) ?? "";
  const availableSkills = listPromptSkills({ productOnly: true });
  const selectedSkills = params.agent.skills
    .map((skillId: string) => availableSkills.find((skill) => skill.id === skillId))
    .filter((skill): skill is PromptSkill => skill != null);
  const skillSections = await Promise.all(
    selectedSkills.map(async (skill) => {
      const knowledgeSections = await Promise.all(
        skill.knowledgeFiles.map(async (knowledgePath) => {
          const knowledge = await readFile(knowledgePath, "utf-8").catch(() => "");
          if (!knowledge) {
            return null;
          }

          return `### ${knowledgePath}\n${knowledge}`;
        }),
      );

      return [
        `## ${skill.name} (${skill.id})`,
        skill.instructions,
        ...knowledgeSections.filter((section): section is string => section != null),
      ].join("\n\n");
    }),
  );

  const systemSections = [
    `You are the autonomous operating loop for ${params.agent.name}.`,
    params.agent.description ? `Agent summary:\n${params.agent.description}` : "",
    params.agent.instructions ? `Instructions:\n${params.agent.instructions}` : "",
    skillSections.length > 0
      ? ["Selected skills:", ...skillSections].join("\n\n")
      : "Selected skills: none",
    workspaceKnowledge
      ? `Workspace knowledge:\n${workspaceKnowledge}`
      : "Workspace knowledge: none",
    [
      "Execution rules:",
      "- Use tools when they are relevant to the current task.",
      "- If a tool call is denied, do not retry the same call unless new context justifies it.",
      "- Keep the final response concise and evidence-based.",
      "- Prefer findings, actions, approvals, and lessons over generic narration.",
    ].join("\n"),
  ]
    .filter((section) => section.trim().length > 0)
    .join("\n\n");

  const user = JSON.stringify(
    {
      trigger: params.trigger,
      projectId: params.agent.projectId,
      agentId: params.agent.id,
      schedule: params.agent.schedule,
      notificationConfig: params.agent.notificationConfig,
    },
    null,
    2,
  );

  return {
    system: systemSections,
    user,
    selectedSkills,
    workspaceKnowledge,
  };
}

export async function buildRuntimeTools(params: {
  runtime: WorkerRuntime;
  agent: AgentRecord;
}): Promise<ToolSet> {
  const effectiveToolConfig = buildEffectiveToolConfig(
    params.agent,
    params.runtime.activeProviders,
  );
  const baseTools = buildAgentToolSet({
    composio: params.runtime.composio,
    userId: params.runtime.userId,
    providers: params.runtime.activeProviders,
    toolConfig: effectiveToolConfig,
  });

  return Object.fromEntries(
    Object.entries(baseTools).map(([toolName, baseTool]) => {
      const configured = effectiveToolConfig.tools[toolName];
      const approvalMode = configured?.approvalMode;
      const baseNeedsApproval = baseTool.needsApproval;
      const needsApproval =
        approvalMode === "blocked" || approvalMode === "approval"
          ? true
          : approvalMode === "auto"
            ? false
            : typeof baseNeedsApproval === "function"
              ? baseNeedsApproval()
              : Boolean(baseNeedsApproval);

      return [
        toolName,
        tool({
          description: baseTool.description,
          inputSchema: baseTool.inputSchema,
          needsApproval,
          execute: baseTool.execute,
        }),
      ];
    }),
  ) as Record<string, ReturnType<typeof tool>>;
}

export function getMissingRequiredProviders(agent: AgentRecord, activeProviders: string[]): ProviderRequirement[] {
  const active = new Set(activeProviders);
  return agent.toolConfig.requiredProviders.filter(
    (provider) => !active.has(provider.provider),
  );
}

export function buildEffectiveToolConfig(
  agent: AgentRecord,
  activeProviders: string[],
): AgentConfig["toolConfig"] {
  const defaults = buildDefaultToolConfig(
    activeProviders,
    agent.toolConfig.requiredProviders,
  );

  return {
    requiredProviders: agent.toolConfig.requiredProviders,
    tools: {
      ...defaults.tools,
      ...agent.toolConfig.tools,
    },
  };
}

export function getEffectiveToolEntry(
  agent: AgentRecord,
  activeProviders: string[],
  toolName: string,
): ToolConfigEntry | undefined {
  return buildEffectiveToolConfig(agent, activeProviders).tools[toolName];
}

export async function sendApprovalNotification(params: {
  runtime: WorkerRuntime;
  agent: AgentRecord;
  approval: {
    approvalId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
    waitTokenId: string;
  };
}): Promise<"slack" | "in-app" | "email"> {
  const notificationConfig: NotificationConfig = params.agent.notificationConfig;
  const slackAvailable = notificationConfig.slack && params.runtime.activeProviders.includes("slack");
  const emailAvailable =
    notificationConfig.email &&
    params.runtime.activeProviders.includes("gmail") &&
    typeof process.env.NOTIFICATION_EMAIL === "string" &&
    process.env.NOTIFICATION_EMAIL.length > 0;

  if (slackAvailable) {
    await sendNotificationTool({
      composio: params.runtime.composio,
      userId: params.runtime.userId,
      provider: "slack",
      payload: {
        channel: process.env.APPROVAL_NOTIFICATION_CHANNEL ?? "#approvals",
        text: [
          `Approval needed for ${params.agent.name}`,
          `Approval ID: ${params.approval.approvalId}`,
          `Run wait token: ${params.approval.waitTokenId}`,
          `Tool: ${params.approval.toolName}`,
          `Input: ${JSON.stringify(params.approval.toolInput)}`,
        ].join("\n"),
      },
    });
    return "slack";
  }

  if (emailAvailable) {
    await sendNotificationTool({
      composio: params.runtime.composio,
      userId: params.runtime.userId,
      provider: "gmail",
      payload: {
        recipient_email: process.env.NOTIFICATION_EMAIL!,
        subject: `Approval needed for ${params.agent.name}`,
        body: [
          `Approval ID: ${params.approval.approvalId}`,
          `Run wait token: ${params.approval.waitTokenId}`,
          `Tool: ${params.approval.toolName}`,
          `Input: ${JSON.stringify(params.approval.toolInput)}`,
        ].join("\n"),
      },
    });
    return "email";
  }

  return "in-app";
}

async function listActiveProviders(
  db: ReturnType<typeof createDb>,
  projectId: string,
): Promise<string[]> {
  const rows = db
    .select()
    .from(connections)
    .where(eq(connections.projectId, projectId))
    .all()
    .filter((row) => row.status === "active");

  return Array.from(new Set(rows.map((row) => row.provider)));
}
