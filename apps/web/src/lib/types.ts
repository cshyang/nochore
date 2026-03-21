export interface Agent {
  id: string;
  name: string;
  status: "attention" | "running";
  statusText: string;
  lastRun: string;
  skills: number;
  lessons: number;
  confidence: number;
  domain?: string; // e.g. "ads", "content", "leads", "analytics", "finance", "competitive"
}

export interface Project {
  id: string;
  name: string;
  icon: string;
  color: string;
  sharedTools: string[];
  agents: Agent[];
  attentionCount: number;
}
