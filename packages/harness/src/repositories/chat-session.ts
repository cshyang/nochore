import { eq, asc, desc } from "drizzle-orm";
import { chatMessages } from "../db/schema";
import type { createDb } from "../db/client";

type Db = ReturnType<typeof createDb>;

/** Input for appending a chat message (id and createdAt are optional/generated). */
export interface AppendMessageInput {
  agentId: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  createdAt?: Date;
}

/** A hydrated chat message record. */
export interface ChatMessage {
  id: string;
  agentId: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  createdAt: Date;
}

export class ChatSessionStore {
  constructor(private db: Db) {}

  /**
   * Append a message. Returns the generated id.
   * If createdAt is not provided, uses Date.now().
   */
  async append(input: AppendMessageInput): Promise<string> {
    const id = crypto.randomUUID();
    this.db
      .insert(chatMessages)
      .values({
        id,
        agentId: input.agentId,
        role: input.role,
        content: input.content,
        toolCallId: input.toolCallId ?? null,
        createdAt: input.createdAt ? input.createdAt.getTime() : Date.now(),
      })
      .run();
    return id;
  }

  /**
   * Load chat history for an agent, ordered by createdAt ASC.
   * If limit is provided, returns the most recent N messages (still in ASC order).
   */
  async loadHistory(agentId: string, limit?: number): Promise<ChatMessage[]> {
    if (limit) {
      // Get the most recent N messages by querying DESC, then reverse for ASC order
      const rows = this.db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.agentId, agentId))
        .orderBy(desc(chatMessages.createdAt))
        .limit(limit)
        .all();
      return rows.reverse().map(toChatMessage);
    }

    const rows = this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.agentId, agentId))
      .orderBy(asc(chatMessages.createdAt))
      .all();
    return rows.map(toChatMessage);
  }
}

function toChatMessage(row: typeof chatMessages.$inferSelect): ChatMessage {
  return {
    id: row.id,
    agentId: row.agentId,
    role: row.role as ChatMessage["role"],
    content: row.content,
    toolCallId: row.toolCallId ?? undefined,
    createdAt: new Date(row.createdAt),
  };
}
