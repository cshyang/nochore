export interface ChatSuggestion {
  icon: string;
  title: string;
  description: string;
}

export const SKILL_SUGGESTIONS: Record<string, ChatSuggestion[]> = {
  "google-ads-optimizer": [
    { icon: "📊", title: "Why is CPL up this week?", description: "Diagnose recent change" },
    { icon: "🔍", title: "Find waste in search terms", description: "Scan low-converting keywords" },
    { icon: "📈", title: "Review last week's runs", description: "What did you find recently?" },
    { icon: "⚙️", title: "Adjust approval rules", description: "Update thresholds" },
  ],
};

export const DEFAULT_SUGGESTIONS: ChatSuggestion[] = [
  { icon: "📰", title: "What did you find this week?", description: "Recent findings review" },
  { icon: "▶️", title: "What's running right now?", description: "Live status" },
  { icon: "⚙️", title: "Update my instructions", description: "Evolve scope or behavior" },
];

/**
 * Returns the suggestion list to show in an empty thread for the given agent.
 * Looks up by the agent's first skill; falls back to DEFAULT_SUGGESTIONS.
 */
export function getSuggestionsForAgent(agent: { skills: string[] }): ChatSuggestion[] {
  const primarySkill = agent.skills[0];
  if (!primarySkill) return DEFAULT_SUGGESTIONS;
  return SKILL_SUGGESTIONS[primarySkill] ?? DEFAULT_SUGGESTIONS;
}
