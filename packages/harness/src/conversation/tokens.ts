import type { UIMessage } from "ai";
import { isRequestInputToolPart, type MessagePartRecord } from "./sanitization";

export const RECENT_VISIBLE_MESSAGE_LIMIT = 12;
export const RECENT_MODEL_MESSAGE_LIMIT = 16;
export const CHECKPOINT_MESSAGE_THRESHOLD = 24;
export const CHECKPOINT_SOFT_TOKEN_THRESHOLD = 110_000;
export const CHECKPOINT_HARD_TOKEN_THRESHOLD = 140_000;
export const CHECKPOINT_KEEP_RECENT_TOKENS = 20_000;
export const INLINE_COMPACTION_KEEP_RECENT_TOKENS = 12_000;

export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessageTokens(message: UIMessage): number {
  let chars = 0;

  for (const part of message.parts as Array<MessagePartRecord>) {
    if (part.type === "text") {
      chars += String(part.text ?? "").length;
      continue;
    }

    if (isRequestInputToolPart(part)) {
      chars += JSON.stringify(part.input ?? {}).length;
      chars += JSON.stringify(part.output ?? {}).length;
    }
  }

  return Math.ceil(chars / 4);
}

export function estimateConversationStateTokens(params: {
  system: string;
  checkpointSummary?: string;
  lessons?: string[];
  recentRuns?: string[];
  messages: UIMessage[];
}): number {
  let total = estimateTextTokens(params.system);
  total += estimateTextTokens(params.checkpointSummary ?? "");
  total += (params.lessons ?? []).reduce((sum, lesson) => sum + estimateTextTokens(lesson), 0);
  total += (params.recentRuns ?? []).reduce((sum, run) => sum + estimateTextTokens(run), 0);
  total += params.messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
  return total;
}
