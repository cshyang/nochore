import { streamText } from "ai";

export type InlineAgentExecutionSpec = Parameters<typeof streamText>[0];
export type InlineAgentExecutionResult = ReturnType<typeof streamText>;

export function executeInlineAgent(spec: InlineAgentExecutionSpec): InlineAgentExecutionResult {
  return streamText(spec);
}
