import { readFile } from "node:fs/promises";
import {
  type AgentRecord,
  agentConnectionBindings,
  connections,
  createAiSdkModel,
  createComposioClient,
  createProjectRepositories,
  getAgentDefinitionById,
  getAgentWorkspacePath,
  getComposioUserId,
  type HarnessDb,
  listPromptSkills,
  openProjectDb,
  type PromptSkill,
  type RunTrigger,
  WorkspaceStore,
} from "@nochore/harness";
import type { LanguageModel } from "ai";
import { and, eq } from "drizzle-orm";

type AgentRepositories = Pick<
  ReturnType<typeof createProjectRepositories>,
  | "agentRepository"
  | "agentConnectionBindingRepository"
  | "approvalRepository"
  | "conversationEventRepository"
  | "conversationThreadRepository"
  | "learnedRuleRepository"
  | "lessonRepository"
  | "runEventRepository"
  | "runRepository"
  | "agentTaskRepository"
>;

export interface AgentRuntime extends AgentRepositories {
  db: HarnessDb;
  composio: Awaited<ReturnType<typeof createComposioClient>>;
  userId: string;
  activeProviders: string[];
  providerConfigs: Record<string, Record<string, unknown>>;
  providerBindings: AgentProviderBinding[];
}

export interface PromptBundle {
  system: string;
  user: string;
  selectedSkills: PromptSkill[];
  workspaceKnowledge: string;
}

export interface AgentProviderBinding {
  id: string;
  provider: string;
  alias: string;
  connectionId: string;
  composioConnectedAccountId?: string;
  connector?: string;
  resourceType?: string;
  resourceId?: string;
  resourceLabel?: string;
  accountLabel?: string;
  config: Record<string, unknown>;
}

export interface AgentConnectionContext {
  activeProviders: string[];
  providerConfigs: Record<string, Record<string, unknown>>;
  providerBindings: AgentProviderBinding[];
}

export async function createModel(modelOverride?: string): Promise<LanguageModel> {
  return createAiSdkModel(modelOverride);
}

export async function createAgentRuntime(projectId: string): Promise<AgentRuntime> {
  const db = openProjectDb(projectId);
  const composio = await createComposioClient();
  const repositories = createProjectRepositories(db);

  const { providers, configs } = await listActiveProvidersWithConfig(db, projectId);

  return {
    db,
    agentRepository: repositories.agentRepository,
    approvalRepository: repositories.approvalRepository,
    conversationEventRepository: repositories.conversationEventRepository,
    conversationThreadRepository: repositories.conversationThreadRepository,
    learnedRuleRepository: repositories.learnedRuleRepository,
    lessonRepository: repositories.lessonRepository,
    runEventRepository: repositories.runEventRepository,
    runRepository: repositories.runRepository,
    agentTaskRepository: repositories.agentTaskRepository,
    composio,
    userId: getComposioUserId(projectId),
    activeProviders: providers,
    providerConfigs: configs,
    providerBindings: [],
  };
}

export async function buildPromptBundle(params: {
  agent: AgentRecord;
  trigger: RunTrigger;
  providerConfigs?: Record<string, Record<string, unknown>>;
  providerBindings?: AgentProviderBinding[];
}): Promise<PromptBundle> {
  const workspaceStore = new WorkspaceStore(getAgentWorkspacePath(params.agent.projectId, params.agent.id));
  const workspaceKnowledge = (await workspaceStore.readFile("KNOWLEDGE.md")) ?? "";
  const availableSkills = listPromptSkills({ productOnly: true });
  const skillIds: string[] = params.agent.skills;
  const selectedSkills = skillIds
    .map((skillId) => availableSkills.find((skill) => skill.id === skillId))
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
    describeProviderConfigContext(params.providerBindings, params.providerConfigs),
    skillSections.length > 0 ? ["Selected skills:", ...skillSections].join("\n\n") : "Selected skills: none",
    workspaceKnowledge ? `Workspace knowledge:\n${workspaceKnowledge}` : "Workspace knowledge: none",
    [
      "Execution rules:",
      "- Use tools when they are relevant to the current task.",
      "- If a tool call is denied, do not retry the same call unless new context justifies it.",
      "- When you have completed your analysis, call submit_report with the full response in markdown. This is mandatory — the run is not complete until submit_report is called.",
      "- Prefer findings, actions, and lessons over generic narration.",
      "",
      "Response approach:",
      "- Lead with your conclusion in the first sentence. Do not open with a title, a period header, or a restatement of who you are — the user already knows.",
      "- Match depth to the trigger. An ad-hoc question gets a focused answer. A scheduled sweep gets a broader one. Do not fall back on a default template.",
      "- Structure your response around what was asked, not a fixed section order. Prose over tables where prose conveys the point. Reserve tables for genuinely tabular data.",
      "- Put evidence and recommended actions before raw data. Deep data is a reference, not the body.",
      "",
      "Delegation:",
      "- You can delegate focused tasks to specialists using delegate_task.",
      "- Roles: scout (research & data gathering), analyst (pattern analysis & insights), builder (executing specific actions).",
      "- Use delegation when a task benefits from focused attention. You receive the specialist's output and synthesize the final result.",
      "- Do not delegate simple tool calls — only multi-step tasks that require focused reasoning.",
      "",
      "Metric recording:",
      "- When you observe quantitative metrics relevant to your outcome, use record_metric to capture them.",
      "- Use a consistent comparabilityKey so the same metric can be tracked over time (format: metric_name|scope|window).",
      "- Include the unit and source when available.",
      "- Only record metrics you have actually observed — do not fabricate values.",
      ...(params.agent.primaryMetric
        ? [
            `- PRIORITY: This agent tracks "${params.agent.primaryMetric}" as its primary metric. Always record this metric with comparabilityKey "${params.agent.primaryMetric}".`,
          ]
        : []),
    ].join("\n"),
  ]
    .filter((section) => section.trim().length > 0)
    .join("\n\n");

  const framing = frameTrigger(params.trigger, params.agent.schedule);
  const context = JSON.stringify(
    {
      projectId: params.agent.projectId,
      agentId: params.agent.id,
      schedule: params.agent.schedule,
      notificationConfig: params.agent.notificationConfig,
      triggerMetadata: params.trigger.metadata ?? null,
    },
    null,
    2,
  );
  const user = `${framing}\n\nContext:\n${context}`;

  return {
    system: systemSections,
    user,
    selectedSkills,
    workspaceKnowledge,
  };
}

function describeProviderConfigContext(
  providerBindings?: AgentProviderBinding[],
  providerConfigs?: Record<string, Record<string, unknown>>,
): string {
  if (providerBindings && providerBindings.length > 0) {
    const lines = providerBindings.map((binding) => {
      if (binding.provider === "googleads") {
        const resource =
          binding.resourceLabel ?? (binding.resourceId ? formatGoogleAdsCustomerId(binding.resourceId) : null);
        const account = binding.accountLabel ? ` via ${binding.accountLabel}` : "";
        return resource
          ? `- googleads: ${binding.alias} -> ${resource}${account}`
          : `- googleads: ${binding.alias}${account}`;
      }
      const account = binding.accountLabel ? ` -> ${binding.accountLabel}` : "";
      return `- ${binding.provider}: ${binding.alias}${account}`;
    });
    return ["Connected systems:", ...lines].join("\n");
  }

  if (!providerConfigs || Object.keys(providerConfigs).length === 0) {
    return "";
  }

  const lines = Object.entries(providerConfigs)
    .map(([provider, config]) => {
      if (provider === "googleads") {
        const customerId = getGoogleAdsCustomerId(config);
        return customerId
          ? `- googleads: project account ${formatGoogleAdsCustomerId(customerId)}`
          : "- googleads: project account not selected";
      }
      return `- ${provider}: connected`;
    })
    .filter(Boolean);

  return lines.length > 0 ? ["Connected systems:", ...lines].join("\n") : "";
}

function getGoogleAdsCustomerId(config: Record<string, unknown>): string | null {
  const value = config.selectedCustomerId ?? config.customerId;
  return typeof value === "string" && value.trim() ? value.replace(/\D/g, "") : null;
}

function formatGoogleAdsCustomerId(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10) return value;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function frameTrigger(trigger: RunTrigger, schedule?: string): string {
  const reason = typeof trigger.metadata?.reason === "string" ? trigger.metadata.reason.trim() : "";

  switch (trigger.type) {
    case "chat":
      return reason
        ? `The user asked: ${reason}\n\nRespond directly to that question.`
        : "The user started a chat-triggered run without a specific question. Do your standard sweep and lead with what matters most.";
    case "cron":
      return schedule
        ? `This is your scheduled ${schedule} sweep. Lead with the most important finding for this period.`
        : "This is your scheduled sweep. Lead with the most important finding for this period.";
    case "manual":
      return "Manual run triggered. Do your standard sweep and lead with what matters most.";
    case "webhook":
      return "Webhook-triggered run. Respond to the event described in the context below, leading with your conclusion.";
    default:
      return "Run triggered. Lead with your conclusion.";
  }
}

export function buildAgentTaskPrompt(params: {
  role: string;
  task: string;
  context?: string;
  agentInstructions: string;
  primaryMetric?: string;
}): string {
  const rolePrompt = loadSpecialistPrompt(params.role);
  const metricInstruction = params.primaryMetric
    ? `If you observe quantitative metrics relevant to the task, use record_metric to capture them. Prioritize the primary metric with comparabilityKey "${params.primaryMetric}".`
    : "If you observe quantitative metrics relevant to the task, use record_metric to capture them.";
  const sections = [
    rolePrompt,
    params.agentInstructions ? `## Agent Context\n${params.agentInstructions}` : "",
    `## Your Task\n${params.task}`,
    params.context ? `## Context\n${params.context}` : "",
    metricInstruction,
    "When you have completed your work, call submit_report with your findings.",
  ].filter((s) => s.length > 0);
  return sections.join("\n\n");
}

function loadSpecialistPrompt(role: string): string {
  const definition = getAgentDefinitionById(role);
  if (!definition) {
    const roleName = humanize(role);
    return [
      `# ${roleName}`,
      "",
      `You are a ${roleName} specialist.`,
      "Use the available tools to complete the task precisely.",
      "Report your work factually and concisely.",
    ].join("\n");
  }

  return definition.instructions;
}

function humanize(value: string): string {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

async function listActiveProvidersWithConfig(
  db: HarnessDb,
  projectId: string,
): Promise<{ providers: string[]; configs: Record<string, Record<string, unknown>> }> {
  const rows = (
    db.select().from(connections).where(eq(connections.projectId, projectId)).all() as Array<{
      provider: string;
      composioEntityId: string | null;
      config: string | null;
      status: string;
      updatedAt: number;
    }>
  )
    .filter((row) => row.status === "active")
    .sort((left, right) => left.updatedAt - right.updatedAt);

  const providers = Array.from(new Set(rows.map((row) => row.provider)));
  const configs: Record<string, Record<string, unknown>> = {};
  for (const row of rows) {
    let config: Record<string, unknown> = {};
    if (row.config) {
      try {
        config = JSON.parse(row.config) as Record<string, unknown>;
      } catch {
        // Invalid JSON in config — skip
      }
    }
    if (row.composioEntityId) {
      config.composioConnectedAccountId = row.composioEntityId;
      config.connector = "composio";
    }
    configs[row.provider] = config;
  }
  return { providers, configs };
}

export async function resolveAgentConnectionContext(params: {
  db: HarnessDb;
  projectId: string;
  agent: AgentRecord;
}): Promise<AgentConnectionContext> {
  const rows = params.db
    .select({
      binding: agentConnectionBindings,
      connection: connections,
    })
    .from(agentConnectionBindings)
    .innerJoin(connections, eq(agentConnectionBindings.connectionId, connections.id))
    .where(
      and(
        eq(agentConnectionBindings.agentId, params.agent.id),
        eq(agentConnectionBindings.status, "active"),
        eq(connections.status, "active"),
      ),
    )
    .all();

  const explicitBindings = rows.map(({ binding, connection }) =>
    toAgentProviderBinding({
      binding,
      connection,
      purpose: "explicit",
    }),
  );

  const providerBindings =
    explicitBindings.length > 0
      ? explicitBindings
      : await resolveImplicitProviderBindings({
          db: params.db,
          projectId: params.projectId,
          agent: params.agent,
        });
  const activeProviders = Array.from(new Set(providerBindings.map((binding) => binding.provider)));
  const providerConfigs: Record<string, Record<string, unknown>> = {};
  for (const binding of providerBindings) {
    if (!providerConfigs[binding.provider] || binding.config.isDefault === true || binding.config.isDefault === 1) {
      providerConfigs[binding.provider] = binding.config;
    }
  }

  return { activeProviders, providerConfigs, providerBindings };
}

async function resolveImplicitProviderBindings(params: {
  db: HarnessDb;
  projectId: string;
  agent: AgentRecord;
}): Promise<AgentProviderBinding[]> {
  const requiredProviders = params.agent.toolConfig.requiredProviders.map((requirement) => requirement.provider);
  if (requiredProviders.length === 0) {
    return [];
  }
  const activeRows = (
    params.db.select().from(connections).where(eq(connections.projectId, params.projectId)).all() as Array<
      typeof connections.$inferSelect
    >
  )
    .filter((row) => row.status === "active" && requiredProviders.includes(row.provider))
    .sort((left, right) => left.updatedAt - right.updatedAt);

  const latestByProvider = new Map<string, typeof connections.$inferSelect>();
  for (const row of activeRows) {
    latestByProvider.set(row.provider, row);
  }

  return [...latestByProvider.values()].map((connection) =>
    toAgentProviderBinding({
      binding: null,
      connection,
      purpose: "implicit_required_provider",
    }),
  );
}

function toAgentProviderBinding(params: {
  binding: typeof agentConnectionBindings.$inferSelect | null;
  connection: typeof connections.$inferSelect;
  purpose: string;
}): AgentProviderBinding {
  const connectionConfig = parseConfig(params.connection.config);
  const bindingConfig = parseConfig(params.binding?.config ?? null);
  const resourceId =
    params.binding?.resourceId ??
    (params.connection.provider === "googleads" ? getGoogleAdsCustomerId(connectionConfig) : null);
  const resourceLabel =
    params.binding?.resourceLabel ??
    (params.connection.provider === "googleads" && resourceId ? formatGoogleAdsCustomerId(resourceId) : null);
  const alias = params.binding?.alias ?? defaultBindingAlias(params.connection.provider, resourceId);
  const accountLabel = getConnectionAccountLabel(params.connection, connectionConfig);
  const config = {
    ...connectionConfig,
    ...bindingConfig,
    connectionId: params.connection.id,
    bindingId: params.binding?.id ?? null,
    alias,
    accountLabel,
    isDefault: params.binding?.isDefault ?? true,
    purpose: params.binding?.purpose ?? params.purpose,
    ...(params.connection.composioEntityId
      ? { composioConnectedAccountId: params.connection.composioEntityId, connector: "composio" }
      : {}),
    ...(resourceId ? { selectedCustomerId: resourceId, resourceId } : {}),
    ...(resourceLabel ? { selectedCustomerLabel: resourceLabel, resourceLabel } : {}),
    ...(params.binding?.resourceType ? { resourceType: params.binding.resourceType } : {}),
  };

  return {
    id: params.binding?.id ?? `implicit:${params.connection.id}`,
    provider: params.connection.provider,
    alias,
    connectionId: params.connection.id,
    composioConnectedAccountId: params.connection.composioEntityId ?? undefined,
    connector: params.connection.composioEntityId ? "composio" : "direct",
    resourceType:
      params.binding?.resourceType ?? (params.connection.provider === "googleads" ? "google_ads_customer" : undefined),
    resourceId: resourceId ?? undefined,
    resourceLabel: resourceLabel ?? undefined,
    accountLabel,
    config,
  };
}

function parseConfig(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function getConnectionAccountLabel(
  connection: typeof connections.$inferSelect,
  config: Record<string, unknown>,
): string | undefined {
  const value = config.accountLabel ?? config.email ?? config.loginEmail ?? config.selectedCustomerLabel;
  if (typeof value === "string" && value.trim()) return value;
  return connection.composioEntityId ?? undefined;
}

function defaultBindingAlias(provider: string, resourceId: string | null): string {
  if (provider === "googleads" && resourceId) {
    return `googleads_${resourceId.replace(/\D/g, "")}`;
  }
  return provider;
}
