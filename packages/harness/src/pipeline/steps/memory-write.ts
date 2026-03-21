import type { MemoryStore, AgentEventType } from "../../types/memory";
import type { StepOutput } from "../../types/run";

// ---------------------------------------------------------------------------
// writeMemory — pipeline step 8: persist events and check lesson distillation
// ---------------------------------------------------------------------------

/**
 * Appends run events to the memory store and checks whether lesson
 * distillation should be triggered.
 *
 * - For each event: calls memoryStore.appendEvent with runId, agentId, etc.
 * - Lesson distillation is flagged (not executed) when both runCount and
 *   lessonDistillationInterval are provided and runCount % interval === 0.
 *   Actual LLM-based distillation is a future task.
 */
export async function writeMemory(params: {
  runId: string;
  agentId: string;
  memoryStore: MemoryStore;
  events: Array<{ type: AgentEventType; data: Record<string, unknown> }>;
  runCount?: number;
  lessonDistillationInterval?: number;
}): Promise<{
  eventsLogged: number;
  lessonsDistilled: boolean;
  stepOutput: StepOutput;
}> {
  const start = performance.now();

  // Append each event to the memory store
  for (const event of params.events) {
    await params.memoryStore.appendEvent({
      runId: params.runId,
      agentId: params.agentId,
      timestamp: new Date(),
      type: event.type,
      data: event.data,
    });
  }

  // Check if lesson distillation should be flagged
  const lessonsDistilled =
    params.runCount != null &&
    params.lessonDistillationInterval != null &&
    params.runCount % params.lessonDistillationInterval === 0;

  return {
    eventsLogged: params.events.length,
    lessonsDistilled,
    stepOutput: {
      step: "memory",
      duration: performance.now() - start,
      data: {
        eventsLogged: params.events.length,
        lessonsDistilled,
      },
    },
  };
}
