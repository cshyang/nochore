import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

export type AiSdkProvider = "anthropic" | "openai" | "zai" | "custom";

export function resolveAiSdkProvider(provider = process.env.LLM_PROVIDER): AiSdkProvider {
  switch (provider) {
    case "openai":
    case "zai":
    case "custom":
      return provider;
    default:
      return "anthropic";
  }
}

export function resolveAiSdkModelName(provider: AiSdkProvider, modelOverride?: string): string {
  if (modelOverride) {
    return modelOverride;
  }

  if (process.env.LLM_MODEL) {
    return process.env.LLM_MODEL;
  }

  switch (provider) {
    case "zai":
      return "glm-4.7";
    case "openai":
      return "gpt-4o";
    case "custom":
      return "gpt-4o";
    default:
      return "claude-sonnet-4-20250514";
  }
}

export function createAiSdkModel(modelOverride?: string): LanguageModel {
  const provider = resolveAiSdkProvider();
  const modelName = resolveAiSdkModelName(provider, modelOverride);

  switch (provider) {
    case "zai":
      return createCompatibleModel({
        providerName: "zai",
        baseURL: process.env.LLM_BASE_URL ?? "https://open.bigmodel.cn/api/paas/v4",
        apiKey: process.env.ZAI_API_KEY,
        modelName,
      });
    case "openai":
      return createCompatibleModel({
        providerName: "openai",
        baseURL: process.env.LLM_BASE_URL ?? "https://api.openai.com/v1",
        apiKey: process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY,
        modelName,
      });
    case "custom":
      return createCompatibleModel({
        providerName: "custom",
        baseURL: process.env.LLM_BASE_URL ?? "",
        apiKey: process.env.LLM_API_KEY,
        modelName,
      });
    default:
      return anthropic(modelName);
  }
}

function createCompatibleModel(params: {
  providerName: string;
  baseURL: string;
  apiKey: string | undefined;
  modelName: string;
}) {
  const provider = createOpenAICompatible({
    name: params.providerName,
    baseURL: params.baseURL,
    apiKey: params.apiKey,
  });

  return provider(params.modelName);
}
