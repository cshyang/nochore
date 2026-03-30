/**
 * System prompt builder for agent chat mode.
 *
 * Wraps the agent's identity and instructions in a chat-specific meta-layer.
 * Template-backed renderer — takes agent fields, returns a string. The
 * authored prompt body lives in the capabilities catalog.
 */

import { getPromptDefinitionById } from "../../../../packages/harness/src/catalog";

export function buildAgentChatSystemPrompt(agent: {
  name: string;
  description: string;
  instructions: string;
  schedule: string;
  skills: string[];
}): string {
  const prompt = getPromptDefinitionById("agent-chat");
  if (!prompt) {
    throw new Error("Capability prompt not found: agent-chat");
  }

  return renderTemplate(prompt.template, {
    agentName: agent.name,
    agentDescription: agent.description,
    agentInstructions: agent.instructions,
    schedule: agent.schedule,
    skills: agent.skills.length > 0 ? agent.skills.join(", ") : "None configured",
  });
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? "");
}
