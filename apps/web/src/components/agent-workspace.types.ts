import type {
  AgentView,
  ConnectionView,
  ConversationStateView,
  NotificationConfigView,
  ProjectView,
  ProviderRequirementView,
  RunView,
  SkillView,
  ToolConfigEntryView,
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
  policyToolCatalog?: ToolConfigEntryView[];
  requiredProviders?: ProviderRequirementView[];
  runs?: RunView[];
  conversation?: ConversationStateView;
  isDraft?: boolean;
  initialTab?: WorkspaceTab;
  initialRunId?: string | null;
  initialPendingActionId?: string | null;
  onConnect?: (provider: string) => void;
  onDisconnect?: (provider: string, connectedAccountId: string) => void;
  activeRun?: ActiveRunState | null;
  onLiveRunComplete?: (status: "completed" | "failed" | "cancelled") => void | Promise<void>;
  runError?: string | null;
  onApprove?: (actionId: string, reason: string) => void | Promise<void>;
  onReject?: (actionId: string, reason: string) => void | Promise<void>;
  onAcceptLearnedRule?: (ruleId: string) => void | Promise<void>;
  onDismissLearnedRule?: (ruleId: string) => void | Promise<void>;
  onSuppressLearnedRule?: (ruleId: string) => void | Promise<void>;
  onRevokeLearnedRule?: (ruleId: string) => void | Promise<void>;
  onCancelRun?: () => void;
  cancelling?: boolean;
  providerLogos?: Record<string, string>;
}
