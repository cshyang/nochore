import type { UIMessage } from "ai";
import { isRequestInputToolPart, type MessagePartRecord } from "./sanitization";
import {
  CHECKPOINT_HARD_TOKEN_THRESHOLD,
  CHECKPOINT_MESSAGE_THRESHOLD,
  CHECKPOINT_SOFT_TOKEN_THRESHOLD,
  estimateMessageTokens,
} from "./tokens";

export interface CompactionBoundary {
  firstKeptMessageIndex: number;
  turnStartIndex: number;
  isSplitTurn: boolean;
}

export function findTurnStartIndex(messages: UIMessage[], entryIndex: number): number {
  for (let index = entryIndex; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      return index;
    }
  }

  return -1;
}

export function findCompactionBoundary(messages: UIMessage[], keepRecentTokens: number): CompactionBoundary {
  if (messages.length === 0) {
    return { firstKeptMessageIndex: 0, turnStartIndex: -1, isSplitTurn: false };
  }

  let accumulated = 0;
  let cutIndex = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    accumulated += estimateMessageTokens(messages[index]!);
    if (accumulated >= keepRecentTokens) {
      cutIndex = index;
      break;
    }
  }

  if (accumulated < keepRecentTokens) {
    cutIndex = 0;
  }

  const isSplitTurn = messages[cutIndex]?.role === "assistant";
  const turnStartIndex = isSplitTurn ? findTurnStartIndex(messages, cutIndex) : -1;

  return {
    firstKeptMessageIndex: cutIndex,
    turnStartIndex,
    isSplitTurn: isSplitTurn && turnStartIndex !== -1,
  };
}

export function shouldRefreshCheckpoint(messageCount: number, estimatedTokens: number): boolean {
  return messageCount > CHECKPOINT_MESSAGE_THRESHOLD || estimatedTokens > CHECKPOINT_SOFT_TOKEN_THRESHOLD;
}

export function shouldInlineCompact(estimatedTokens: number): boolean {
  return estimatedTokens > CHECKPOINT_HARD_TOKEN_THRESHOLD;
}

export function buildConversationTranscript(messages: UIMessage[]): string {
  return messages
    .map((message) => {
      const prefix = message.role === "user" ? "User" : "Assistant";
      const text = (message.parts as Array<MessagePartRecord>)
        .map((part) => {
          if (part.type === "text") {
            return String(part.text ?? "");
          }

          if (isRequestInputToolPart(part)) {
            const input = part.input as { question?: string } | undefined;
            const output = part.output as
              | { selectedKeys?: string[]; customText?: string; skipped?: boolean }
              | undefined;
            const answer = output?.skipped
              ? "Skipped"
              : (output?.customText ?? (output?.selectedKeys ?? []).join(", "));
            return `Question: ${input?.question ?? ""}\nAnswer: ${answer}`;
          }

          return "";
        })
        .filter(Boolean)
        .join("\n")
        .trim();

      return text ? `${prefix}: ${text}` : `${prefix}: (no visible content)`;
    })
    .join("\n\n");
}
