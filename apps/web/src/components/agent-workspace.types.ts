import type {
  AgentView,
  ConnectionView,
  ConversationStateView,
  ConversationThreadSummaryView,
  NotificationConfigView,
  ProjectView,
  ProviderRequirementView,
  RunView,
  SkillView,
  ToolConfigEntryView,
  ToolConfigView,
} from "~/lib/types";

export type WorkspaceTab = "runs" | "chat" | "learned" | "settings";

export interface AgentWorkspaceUpdate {
  name: string;
  description: string;
  instructions: string;
  skills: string[];
  schedule: string;
  toolConfig: ToolConfigView;
  notificationConfig: NotificationConfigView;
  status: string;
  primaryMetric?: string;
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
  conversationThreads?: ConversationThreadSummaryView[];
  isDraft?: boolean;
  initialTab?: WorkspaceTab;
  initialRunId?: string | null;
  initialPendingActionId?: string | null;
  onTabChange?: (tab: WorkspaceTab) => void;
  onSelectRun?: (runId: string | null) => void;
  onSelectThread?: (threadId: string) => void;
  onCreateThread?: () => Promise<void> | void;
  onConnect?: (provider: string) => void;
  onDisconnect?: (provider: string, connectedAccountId: string) => void;
  activeRunId?: string | null;
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
