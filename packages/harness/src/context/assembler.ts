import type { WorkspaceStore } from "../workspace/store";
import type { MemoryStore, Lesson, AgentEvent } from "../types/memory";
import { assembleSections, type Section } from "./token-budget";

// ---------------------------------------------------------------------------
// AssembledContext — the output of every context assembly method
// ---------------------------------------------------------------------------

export interface AssembledContext {
  systemPrompt: string;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default token budget for chat mode. Pipeline methods have no limit. */
const CHAT_MAX_TOKENS = 8000;

/** Maximum number of recent events to include in chat context. */
const RECENT_EVENTS_LIMIT = 10;

// ---------------------------------------------------------------------------
// ContextAssembler — shared context boundary for pipeline and chat runtimes
// ---------------------------------------------------------------------------

/**
 * Merges workspace files + DB state into context for both pipeline and chat.
 *
 * Both Mode 1 (pipeline) and Mode 2 (chat) use this same assembler, ensuring
 * no reasoning divergence between automated runs and human conversations.
 */
export class ContextAssembler {
  constructor(
    private workspaceStore: WorkspaceStore,
    private memoryStore: MemoryStore
  ) {}

  // -------------------------------------------------------------------------
  // forScopeResolution — pipeline step: determine what data to fetch
  // -------------------------------------------------------------------------

  /**
   * Context for scope resolution (pipeline step 1).
   *
   * Reads: AGENT.md (identity), active lessons.
   */
  async forScopeResolution(agentId: string): Promise<AssembledContext> {
    const [identity, lessons] = await Promise.all([
      this.workspaceStore.loadIdentity(),
      this.memoryStore.getLessons(agentId),
    ]);

    const sections: Section[] = [];

    if (identity.agentMd) {
      sections.push({
        content: identity.agentMd,
        priority: 1,
        label: "Agent Identity",
      });
    }

    if (lessons.length > 0) {
      sections.push({
        content: formatLessons(lessons),
        priority: 4,
        label: "Active Lessons",
      });
    }

    return {
      systemPrompt: assembleSections(sections),
      metadata: {
        step: "scope",
        agentId,
        lessonCount: lessons.length,
      },
    };
  }

  // -------------------------------------------------------------------------
  // forSkillExecution — pipeline step: run a skill with domain knowledge
  // -------------------------------------------------------------------------

  /**
   * Context for skill execution (pipeline step 2).
   *
   * Reads: KNOWLEDGE.md, optional skill-specific knowledge.
   */
  async forSkillExecution(
    agentId: string,
    skillId: string,
    knowledge?: string
  ): Promise<AssembledContext> {
    const identity = await this.workspaceStore.loadIdentity();

    const sections: Section[] = [];

    if (identity.knowledgeMd) {
      sections.push({
        content: identity.knowledgeMd,
        priority: 1,
        label: "Domain Knowledge",
      });
    }

    if (knowledge) {
      sections.push({
        content: knowledge,
        priority: 2,
        label: "Skill Knowledge",
      });
    }

    return {
      systemPrompt: assembleSections(sections),
      metadata: {
        step: "analyze",
        agentId,
        skillId,
      },
    };
  }

  // -------------------------------------------------------------------------
  // forPlanning — pipeline step: decide what actions to propose
  // -------------------------------------------------------------------------

  /**
   * Context for planning (pipeline step 3).
   *
   * Reads: AGENT.md (intent), POLICY.md (constraints), active lessons.
   * Note: skillOutputs are NOT included in the system prompt — they are
   * passed as the user message by the caller.
   */
  async forPlanning(
    agentId: string,
    skillOutputs: unknown[]
  ): Promise<AssembledContext> {
    const [identity, lessons] = await Promise.all([
      this.workspaceStore.loadIdentity(),
      this.memoryStore.getLessons(agentId),
    ]);

    const sections: Section[] = [];

    if (identity.agentMd) {
      sections.push({
        content: identity.agentMd,
        priority: 1,
        label: "Agent Identity",
      });
    }

    if (identity.policyMd) {
      sections.push({
        content: identity.policyMd,
        priority: 2,
        label: "Policy Constraints",
      });
    }

    if (lessons.length > 0) {
      sections.push({
        content: formatLessons(lessons),
        priority: 4,
        label: "Active Lessons",
      });
    }

    return {
      systemPrompt: assembleSections(sections),
      metadata: {
        step: "plan",
        agentId,
        lessonCount: lessons.length,
        skillOutputCount: skillOutputs.length,
      },
    };
  }

  // -------------------------------------------------------------------------
  // forChat — full context for conversational mode
  // -------------------------------------------------------------------------

  /**
   * Context for chat mode (Mode 2).
   *
   * Reads ALL workspace identity files + active lessons + recent events.
   * Uses token budget to fit within limits.
   */
  async forChat(agentId: string): Promise<AssembledContext> {
    const [identity, lessons, recentEvents] = await Promise.all([
      this.workspaceStore.loadIdentity(),
      this.memoryStore.getLessons(agentId),
      this.memoryStore.getRecentEvents(agentId, RECENT_EVENTS_LIMIT),
    ]);

    const sections: Section[] = [];

    if (identity.agentMd) {
      sections.push({
        content: identity.agentMd,
        priority: 1,
        label: "Agent Identity",
      });
    }

    if (identity.knowledgeMd) {
      sections.push({
        content: identity.knowledgeMd,
        priority: 3,
        label: "Domain Knowledge",
      });
    }

    if (identity.policyMd) {
      sections.push({
        content: identity.policyMd,
        priority: 2,
        label: "Policy Constraints",
      });
    }

    if (lessons.length > 0) {
      sections.push({
        content: formatLessons(lessons),
        priority: 4,
        label: "Active Lessons",
      });
    }

    const eventCount = Math.min(recentEvents.length, RECENT_EVENTS_LIMIT);
    if (eventCount > 0) {
      sections.push({
        content: formatRecentEvents(recentEvents.slice(0, RECENT_EVENTS_LIMIT)),
        priority: 5,
        label: "Recent Activity",
      });
    }

    return {
      systemPrompt: assembleSections(sections, CHAT_MAX_TOKENS),
      metadata: {
        step: "chat",
        agentId,
        lessonCount: lessons.length,
        recentEventCount: eventCount,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format lessons as a bulleted list with scope and confidence.
 *
 * Example:
 *   - [Budget] (high confidence): Campaign X budget is protected during Q2 push
 */
function formatLessons(lessons: Lesson[]): string {
  return lessons
    .map((l) => `- [${l.scope}] (${l.confidence} confidence): ${l.content}`)
    .join("\n");
}

/**
 * Format recent events as a bulleted list with relative time descriptions.
 *
 * Example:
 *   - 2h ago: Analyzed search terms, found 5 wasteful keywords
 */
function formatRecentEvents(events: AgentEvent[]): string {
  const now = Date.now();

  return events
    .map((e) => {
      const ago = formatRelativeTime(now - e.timestamp.getTime());
      const summary = extractEventSummary(e);
      return `- ${ago}: ${summary}`;
    })
    .join("\n");
}

/**
 * Convert milliseconds to a human-readable relative time string.
 */
function formatRelativeTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

/**
 * Extract a human-readable summary from an agent event.
 * Uses the `summary` field from data if present, otherwise falls back
 * to the event type.
 */
function extractEventSummary(event: AgentEvent): string {
  const data = event.data as Record<string, unknown>;
  if (typeof data.summary === "string" && data.summary.length > 0) {
    return data.summary;
  }
  // Fallback: humanize the event type
  return event.type.replace(/_/g, " ");
}
