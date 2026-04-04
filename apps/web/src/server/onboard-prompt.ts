import { getPromptDefinitionById } from "@nochore/harness";
import { getProviderName } from "../lib/provider-metadata";

/**
 * System prompt for the conversational agent onboarding flow.
 *
 * Separated from the route handler so the prompt can be iterated on,
 * tested, and reviewed independently of the API plumbing.
 */

export interface ToolkitSummary {
  slug: string;
  name: string;
  description: string;
  categories: string[];
  logo: string | null;
}

export function buildOnboardingSystemPrompt(params: {
  availableSkills: Array<{ id: string; name: string; description: string }>;
  existingConnections: string[];
  toolkitSummaries: ToolkitSummary[];
}): string {
  const skillsList = params.availableSkills.map((s) => `- ${s.id}: ${s.name} — ${s.description}`).join("\n");

  const toolkitList = params.toolkitSummaries.length
    ? params.toolkitSummaries.map((tk) => `- **${tk.name}** (${tk.slug}) — ${tk.description}`).join("\n")
    : "none available";

  const prompt = getPromptDefinitionById("onboard-agent");
  if (!prompt) {
    throw new Error("Capability prompt not found: onboard-agent");
  }

  return renderTemplate(prompt.template, {
    toolkitList,
    skillsList: skillsList || "none available",
    existingConnections: params.existingConnections.length
      ? params.existingConnections.map(getProviderName).join(", ")
      : "none yet",
  });
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? "");
}
