import type { UIMessage } from "ai";

type PersistentUIMessageStreamOptions<UI_MESSAGE extends UIMessage> = {
  originalMessages: UI_MESSAGE[];
  onFinish?: (event: {
    isAborted: boolean;
    isContinuation: boolean;
    responseMessage: UI_MESSAGE;
    messages: UI_MESSAGE[];
    finishReason?: unknown;
  }) => void | Promise<void>;
};

export function createPersistentChatMessageId(): string {
  return crypto.randomUUID();
}

export function buildPersistentUIMessageStreamOptions<UI_MESSAGE extends UIMessage>(
  options: PersistentUIMessageStreamOptions<UI_MESSAGE>,
) {
  return {
    ...options,
    generateMessageId: createPersistentChatMessageId,
  };
}
