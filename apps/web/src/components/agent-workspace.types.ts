import type {
  AgentView,
  ConnectionView,
  NotificationConfigView,
  ProjectView,
  ProviderRequirementView,
  RunView,
  SkillView,
  ToolConfigView,
} from "~/lib/types";

export type WorkspaceTab = "activity" | "chat" | "memory" | "settings";

export interface ActiveRunState {
  runId: string;
  triggerRunId: string;
  accessToken: string;
}

export interface AgentWorkspaceUpdate {
  name: string;
  description: string;
  instructions: string;
  skills: string[];
  schedule: string;
  toolConfig: ToolConfigView;
  notificationConfig: NotificationConfigView;
  status: string;
}

export interface AgentWorkspaceProps {
  agent: AgentView;
  project: ProjectView;
  onBack: () => void;
  onDeleteAgent?: () => void;
  onRunNow?: () => Promise<{ runId?: string } | undefined>;
  onUpdateAgent?: (updates: Partial<AgentWorkspaceUpdate>) => Promise<void> | void;
  onRunTriggered?: (runId: string, triggerRunId: string) => void;
  availableSkills?: SkillView[];
  skills?: SkillView[];
  projectConnections?: ConnectionView[];
  requiredProviders?: ProviderRequirementView[];
  runs?: RunView[];
  isDraft?: boolean;
  onConnect?: (provider: string) => void;
  onDisconnect?: (provider: string, connectedAccountId: string) => void;
  activeRun?: ActiveRunState | null;
  onLiveRunComplete?: () => void;
  runError?: string | null;
  onApprove?: (actionId: string, reason: string) => void | Promise<void>;
  onReject?: (actionId: string, reason: string) => void | Promise<void>;
  onCancelRun?: () => void;
  cancelling?: boolean;
  providerLogos?: Record<string, string>;
}
