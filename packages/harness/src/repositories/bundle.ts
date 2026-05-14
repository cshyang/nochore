import type { HarnessDb } from "../db/client";
import { AgentRepository } from "./agent";
import { AgentConnectionBindingRepository } from "./agent-connection-binding";
import { AgentSessionRepository } from "./agent-session";
import { AgentTaskRepository } from "./agent-task";
import { ApprovalRepository } from "./approval";
import { ConversationCheckpointRepository } from "./conversation-checkpoint";
import { ConversationEventRepository } from "./conversation-event";
import { ConversationThreadRepository } from "./conversation-thread";
import { ContextSnapshotRepository } from "./context-snapshot";
import { RunEventRepository } from "./event";
import { LearnedRuleRepository } from "./learned-rule";
import { LessonRepository } from "./lesson";
import { RunRepository } from "./run";
import { SandboxLeaseRepository } from "./sandbox-lease";
import { WorkItemRepository } from "./work-item";

// Concrete Drizzle-backed repository bundle for a single project database.
export function createProjectRepositories(db: HarnessDb) {
  return {
    agentRepository: new AgentRepository(db),
    agentConnectionBindingRepository: new AgentConnectionBindingRepository(db),
    agentSessionRepository: new AgentSessionRepository(db),
    approvalRepository: new ApprovalRepository(db),
    conversationCheckpointRepository: new ConversationCheckpointRepository(db),
    conversationEventRepository: new ConversationEventRepository(db),
    conversationThreadRepository: new ConversationThreadRepository(db),
    contextSnapshotRepository: new ContextSnapshotRepository(db),
    learnedRuleRepository: new LearnedRuleRepository(db),
    lessonRepository: new LessonRepository(db),
    runEventRepository: new RunEventRepository(db),
    runRepository: new RunRepository(db),
    sandboxLeaseRepository: new SandboxLeaseRepository(db),
    agentTaskRepository: new AgentTaskRepository(db),
    workItemRepository: new WorkItemRepository(db),
  };
}
