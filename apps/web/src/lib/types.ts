// ---------------------------------------------------------------------------
// AgentView — computed from DB (agents + runs + lessons + pending_actions)
// ---------------------------------------------------------------------------

export interface AgentView {
  id: string;
  name: string;
  description: string;
  intent: string;
  skills: string[]; // skill IDs from config
  schedule: string; // "hourly" | "6hours" | "daily" | "weekly" | "manual"
  policyRules: string[];
  globalApprovalRequired: boolean;
  scopeStrategy: "static" | "llm";
  status: "running" | "attention" | "idle" | "error";
  lastRunAt: number | null;
  lastRunRelative: string | null; // "2h ago", "Never"
  nextRunAt: number | null;
  pendingCount: number;
  lessonCount: number;
  runCount: number;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// ProjectView — computed from DB (projects + agents + connections)
// ---------------------------------------------------------------------------

export interface ProjectView {
  id: string;
  name: string;
  icon: string;
  color: string;
  agents: AgentView[];
  connectionCount: number;
  attentionCount: number;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Relative time helper — shared between server and potential client use
// ---------------------------------------------------------------------------

export function relativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}
