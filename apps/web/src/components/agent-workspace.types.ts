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
  WorkItemView,
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
  onRunNow?: () => Promise<{ runId?: string; workItemId?: string } | undefined>;
  onUpdateAgent?: (updates: Partial<AgentWorkspaceUpdate>) => Promise<void> | void;
  onRunTriggered?: (runId: string, triggerRunId: string, workItemId?: string) => void;
  availableSkills?: SkillView[];
  skills?: SkillView[];
  projectConnections?: ConnectionView[];
  policyToolCatalog?: ToolConfigEntryView[];
  requiredProviders?: ProviderRequirementView[];
  runs?: RunView[];
  workItems?: WorkItemView[];
  conversation?: ConversationStateView;
  conversationThreads?: ConversationThreadSummaryView[];
  activeThreadId?: string;
  draftThreadOpen?: boolean;
  isDraft?: boolean;
  initialTab?: WorkspaceTab;
  initialRunId?: string | null;
  initialWorkItemId?: string | null;
  initialPendingActionId?: string | null;
  onTabChange?: (tab: WorkspaceTab) => void;
  onSelectRun?: (runId: string | null) => void;
  onSelectWorkItem?: (workItemId: string | null, runId?: string | null) => void;
  onSelectThread?: (threadId: string) => void;
  onCreateThread?: () => void;
  onDeleteThread?: (thread: ConversationThreadSummaryView) => Promise<void> | void;
  onThreadCreated?: (threadId: string) => void;
  onConnect?: (provider: string) => void;
  onDisconnect?: (provider: string, connectedAccountId: string) => void;
  onListGoogleAdsAccounts?: (connectionId?: string) => Promise<{
    accounts?: Array<{ id: string; formattedId: string; label: string }>;
    error?: string;
  }>;
  onSetConnectionConfig?: (
    provider: string,
    config: Record<string, unknown>,
    connectionId?: string,
  ) => Promise<void> | void;
  onSetAgentConnectionBinding?: (binding: {
    provider: string;
    connectionId: string;
    resourceType?: string | null;
    resourceId?: string | null;
    resourceLabel?: string | null;
    alias?: string;
    purpose?: string | null;
    isDefault?: boolean;
  }) => Promise<void> | void;
  activeRunId?: string | null;
  activeWorkItemId?: string | null;
  runError?: string | null;
  onApprove?: (actionId: string, reason: string) => void | Promise<void>;
  onReject?: (actionId: string, reason: string) => void | Promise<void>;
  onAcceptLearnedRule?: (ruleId: string) => void | Promise<void>;
  onDismissLearnedRule?: (ruleId: string) => void | Promise<void>;
  onSuppressLearnedRule?: (ruleId: string) => void | Promise<void>;
  onRevokeLearnedRule?: (ruleId: string) => void | Promise<void>;
  onCancelRun?: () => void;
  onCancelWorkItem?: () => void;
  cancelling?: boolean;
  providerLogos?: Record<string, string>;
}
