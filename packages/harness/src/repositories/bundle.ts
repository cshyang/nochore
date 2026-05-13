import type { HarnessDb } from "../db/client";
import { AgentRepository } from "./agent";
import { AgentConnectionBindingRepository } from "./agent-connection-binding";
import { AgentTaskRepository } from "./agent-task";
import { ApprovalRepository } from "./approval";
import { ConversationCheckpointRepository } from "./conversation-checkpoint";
import { ConversationEventRepository } from "./conversation-event";
import { ConversationThreadRepository } from "./conversation-thread";
import { RunEventRepository } from "./event";
import { LearnedRuleRepository } from "./learned-rule";
import { LessonRepository } from "./lesson";
import { RunRepository } from "./run";

// Concrete Drizzle-backed repository bundle for a single project database.
export function createProjectRepositories(db: HarnessDb) {
  return {
    agentRepository: new AgentRepository(db),
    agentConnectionBindingRepository: new AgentConnectionBindingRepository(db),
    approvalRepository: new ApprovalRepository(db),
    conversationCheckpointRepository: new ConversationCheckpointRepository(db),
    conversationEventRepository: new ConversationEventRepository(db),
    conversationThreadRepository: new ConversationThreadRepository(db),
    learnedRuleRepository: new LearnedRuleRepository(db),
    lessonRepository: new LessonRepository(db),
    runEventRepository: new RunEventRepository(db),
    runRepository: new RunRepository(db),
    agentTaskRepository: new AgentTaskRepository(db),
  };
}
