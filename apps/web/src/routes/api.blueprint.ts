/**
 * Streaming blueprint generation endpoint.
 *
 * Produces a draft-agent configuration aligned with the simplified platform:
 * name, description, instructions, skills, required providers, tool config,
 * notification config, and schedule.
 */

import type { AgentSchedule, NotificationConfig, ProviderRequirement, ToolConfig } from "@nochore/harness";
import { createAiSdkModel, resolveAiSdkProvider } from "@nochore/harness";
import { createFileRoute } from "@tanstack/react-router";
import { stepCountIs, ToolLoopAgent, tool } from "ai";
import { z } from "zod";
import { CONNECTABLE_PROVIDER_SLUGS, getProviderDefaultReason, getProviderName } from "~/lib/provider-metadata";

const DraftScheduleSchema = z.enum(["hourly", "6hours", "daily", "weekly", "manual"]);

const ToolInputSchema = z.object({
  name: z.string().min(1).describe("A short, memorable agent name"),
  description: z.string().min(1).describe("A concise one-sentence summary of the agent"),
  instructions: z.string().min(1).describe("Detailed markdown instructions that become the agent system prompt"),
  skills: z.array(z.string()).default([]).describe("Skill IDs chosen from the available skills list"),
  providers: z.array(z.string()).default([]).describe("Provider slugs the agent genuinely requires"),
  schedule: DraftScheduleSchema.describe("How often the agent should run"),
});

type ToolInput = z.infer<typeof ToolInputSchema>;

export interface BlueprintDraft {
  name: string;
  description: string;
  instructions: string;
  skills: string[];
  requiredProviders: ProviderRequirement[];
  toolConfig: ToolConfig;
  notificationConfig: NotificationConfig;
  schedule: AgentSchedule;
}

function resolveSkillIds(modelSkills: string[], available: Array<{ id: string; name: string }>): string[] {
  if (!modelSkills.length || !available.length) return [];

  const resolved: string[] = [];
  for (const raw of modelSkills) {
    const lower = raw.toLowerCase().replace(/[-_\s]/g, "");
    const exact = available.find((skill) => skill.id === raw);
    if (exact) {
      resolved.push(exact.id);
      continue;
    }

    const fuzzy = available.find((skill) => {
      const normId = skill.id.toLowerCase().replace(/[-_\s]/g, "");
      const normName = skill.name.toLowerCase().replace(/[-_\s]/g, "");
      return normId === lower || normName === lower || normId.includes(lower) || lower.includes(normId);
    });

    if (fuzzy) {
      resolved.push(fuzzy.id);
    }
  }

  return Array.from(new Set(resolved));
}

function expandBlueprint(raw: ToolInput): BlueprintDraft {
  return {
    name: raw.name.trim(),
    description: raw.description.trim(),
    instructions: raw.instructions.trim(),
    skills: raw.skills ?? [],
    requiredProviders: [],
    toolConfig: { globalApprovalRequired: false, requiredProviders: [], tools: {} },
    notificationConfig: { inApp: true, email: false, slack: false },
    schedule: raw.schedule,
  };
}

export const Route = createFileRoute("/api/blueprint")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json();
        const {
          intent,
          clarification,
          availableSkills = [],
          existingConnections = [],
        } = body as {
          intent: string;
          clarification?: string;
          availableSkills: Array<{
            id: string;
            name: string;
            description: string;
          }>;
          existingConnections?: string[];
        };

        const model = createAiSdkModel();
        const providerName = resolveAiSdkProvider();

        const skillsList = availableSkills
          .map((skill) => `- ${skill.id}: ${skill.name} — ${skill.description}`)
          .join("\n");

        const providerList = CONNECTABLE_PROVIDER_SLUGS.map(
          (slug) => `- ${slug}: ${getProviderName(slug)} — ${getProviderDefaultReason(slug)}`,
        ).join("\n");

        const prompt = `You design draft agents for Nochore's simplified platform.

Produce a practical draft configuration with:
- a concise name
- a short description
- detailed markdown instructions that the agent can follow without more platform magic
- a minimal set of relevant skills
- only the providers the agent actually needs
- a schedule matching the user's requested operating rhythm

User request: "${intent}"
${clarification ? `Additional context: "${clarification}"` : ""}

Available skills:
${skillsList || "- none"}

Available providers:
${providerList || "- none"}

Already connected providers:
        ${existingConnections.length ? existingConnections.map(getProviderName).join(", ") : "none"}

Instructions must be operational. They should tell the agent what to monitor, what good and bad patterns look like, how to communicate findings, and what outcome to optimize for.

If the user request is too vague to write usable instructions, ask one focused follow-up question instead of calling the tool.`;

        const blueprintAgent = new ToolLoopAgent({
          model,
          stopWhen: stepCountIs(5),
          providerOptions: {
            [providerName]: {
              reasoningEffort: "high",
            },
          },
          tools: {
            create_blueprint: tool({
              description: "Create a draft agent configuration once you have enough context.",
              inputSchema: ToolInputSchema,
              execute: async (input) => {
                const resolvedSkills = resolveSkillIds(input.skills, availableSkills);

                const blueprint = expandBlueprint({
                  ...input,
                  skills: resolvedSkills,
                });

                return {
                  success: true,
                  blueprint,
                };
              },
            }),
          },
        });

        const result = await blueprintAgent.stream({ prompt });
        const encoder = new TextEncoder();

        const stream = new ReadableStream({
          async start(controller) {
            const send = (obj: Record<string, unknown>) => {
              controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
            };

            let toolArgs = "";

            try {
              for await (const event of result.fullStream) {
                if (event.type === "reasoning-delta") {
                  send({ _type: "reasoning", text: event.text });
                } else if (event.type === "text-delta") {
                  send({ _type: "text", text: event.text });
                } else if (event.type === "tool-input-start") {
                  toolArgs = "";
                  send({ _type: "tool-status", text: "Drafting configuration..." });
                } else if (event.type === "tool-input-delta") {
                  toolArgs += event.delta;
                  try {
                    send({ _type: "blueprint", ...JSON.parse(toolArgs) });
                  } catch {
                    // partial JSON, keep streaming
                  }
                } else if (event.type === "tool-result") {
                  const output = (event as { output: unknown }).output as {
                    success?: boolean;
                    blueprint?: BlueprintDraft;
                  };

                  if (output?.success && output.blueprint) {
                    send({ _type: "tool-status", text: "Draft ready" });
                    send({ _type: "blueprint", ...output.blueprint });
                  }
                }
              }
            } catch (error) {
              send({
                _error: error instanceof Error ? error.message : "Blueprint stream failed",
              });
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "application/x-ndjson",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
