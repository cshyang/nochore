import { readFile } from "node:fs/promises";
import type { Composio } from "@composio/core";
import type { LanguageModel } from "ai";
import { eq } from "drizzle-orm";
import { createAiSdkModel } from "../../../../packages/harness/src/llm/model";
import { createComposioClient, getComposioUserId } from "../../../../packages/harness/src/connections";
import { createDb } from "../../../../packages/harness/src/db/client";
import { connections } from "../../../../packages/harness/src/db/schema";
import {
  type AgentRecord,
  AgentRepository,
  LessonRepository,
  RunEventRepository,
  RunRepository,
} from "../../../../packages/harness/src/repositories";
import { listPromptSkills, type PromptSkill } from "../../../../packages/harness/src/skills";
import type { RunTrigger } from "../../../../packages/harness/src/types";
import { getAgentWorkspacePath, getProjectDbPath, WorkspaceStore } from "../../../../packages/harness/src/workspace";

export interface WorkerRuntime {
  db: ReturnType<typeof createDb>;
  agentRepository: AgentRepository;
  lessonRepository: LessonRepository;
  runEventRepository: RunEventRepository;
  runRepository: RunRepository;
  composio: Composio;
  userId: string;
  activeProviders: string[];
  providerConfigs: Record<string, Record<string, unknown>>;
}

export interface PromptBundle {
  system: string;
  user: string;
  selectedSkills: PromptSkill[];
  workspaceKnowledge: string;
}

export async function createModel(modelOverride?: string): Promise<LanguageModel> {
  return createAiSdkModel(modelOverride);
}

export async function createWorkerRuntime(projectId: string): Promise<WorkerRuntime> {
  const db = createDb(getProjectDbPath(projectId));
  const composio = await createComposioClient();

  const { providers, configs } = await listActiveProvidersWithConfig(db, projectId);

  return {
    db,
    agentRepository: new AgentRepository(db),
    lessonRepository: new LessonRepository(db),
    runEventRepository: new RunEventRepository(db),
    runRepository: new RunRepository(db),
    composio,
    userId: getComposioUserId(projectId),
    activeProviders: providers,
    providerConfigs: configs,
  };
}

export async function buildPromptBundle(params: { agent: AgentRecord; trigger: RunTrigger }): Promise<PromptBundle> {
  const workspaceStore = new WorkspaceStore(getAgentWorkspacePath(params.agent.projectId, params.agent.id));
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
    skillSections.length > 0 ? ["Selected skills:", ...skillSections].join("\n\n") : "Selected skills: none",
    workspaceKnowledge ? `Workspace knowledge:\n${workspaceKnowledge}` : "Workspace knowledge: none",
    [
      "Execution rules:",
      "- Use tools when they are relevant to the current task.",
      "- If a tool call is denied, do not retry the same call unless new context justifies it.",
      "- When you have completed your analysis, call submit_report with the full report in markdown. This is mandatory — the run is not complete until submit_report is called.",
      "- Prefer findings, actions, and lessons over generic narration.",
      "",
      "Delegation:",
      "- You can delegate focused sub-tasks to specialists using spawn_sub_run.",
      "- Roles: scout (research & data gathering), analyst (pattern analysis & insights), builder (executing specific actions).",
      "- Use delegation when a sub-task benefits from focused attention. You receive the specialist's output and synthesize the final result.",
      "- Do not delegate simple tool calls — only multi-step sub-tasks that require focused reasoning.",
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

const SPECIALIST_ROLES: Record<string, string> = {
  scout:
    "You are a research specialist. Your job is to gather data, explore, and surface what's relevant. " +
    "Use tools to fetch data. Report what you found factually — no speculation, no filler.",
  analyst:
    "You are an analysis specialist. Given data or findings, identify patterns, anomalies, and actionable insights. " +
    "Be quantitative and specific. Support claims with numbers.",
  builder:
    "You are an execution specialist. When given a specific action to take, execute it precisely using the available tools. " +
    "Confirm what you did and report any errors.",
};

export function buildSubRunPrompt(params: {
  role: string;
  task: string;
  context?: string;
  agentInstructions: string;
}): string {
  const rolePrompt = SPECIALIST_ROLES[params.role] ?? SPECIALIST_ROLES.scout;
  const sections = [
    rolePrompt,
    params.agentInstructions ? `## Agent Context\n${params.agentInstructions}` : "",
    `## Your Task\n${params.task}`,
    params.context ? `## Context\n${params.context}` : "",
    "When you have completed your work, call submit_report with your findings.",
  ].filter((s) => s.length > 0);
  return sections.join("\n\n");
}

async function listActiveProvidersWithConfig(
  db: ReturnType<typeof createDb>,
  projectId: string,
): Promise<{ providers: string[]; configs: Record<string, Record<string, unknown>> }> {
  const rows = db
    .select()
    .from(connections)
    .where(eq(connections.projectId, projectId))
    .all()
    .filter((row) => row.status === "active");

  const providers = Array.from(new Set(rows.map((row) => row.provider)));
  const configs: Record<string, Record<string, unknown>> = {};
  for (const row of rows) {
    if (row.config) {
      try {
        configs[row.provider] = JSON.parse(row.config) as Record<string, unknown>;
      } catch {
        // Invalid JSON in config — skip
      }
    }
  }
  return { providers, configs };
}
