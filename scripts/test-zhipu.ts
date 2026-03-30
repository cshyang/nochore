import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

const zai = createOpenAICompatible({
  name: "zai",
  baseURL: "https://open.bigmodel.cn/api/paas/v4",
  apiKey: process.env.ZAI_API_KEY,
});

async function main() {
  const models = ["glm-4-plus", "glm-4-0520", "glm-4-flash", "GLM-4", "glm-z1-flash"];
  for (const model of models) {
    try {
      const result = await generateText({
        model: zai(model),
        prompt: "Say hello in one word",
        maxTokens: 10,
      });
      console.log("✅ " + model + ': "' + result.text + '"');
    } catch (err) {
      const msg = (err as Error).message?.slice(0, 100) ?? String(err);
      console.log("❌ " + model + ": " + msg);
    }
  }
}

main();
