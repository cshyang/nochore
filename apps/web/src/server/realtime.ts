import { createServerFn } from "@tanstack/react-start";
import { auth } from "@trigger.dev/sdk/v3";
import { jsonSafe } from "./serializable";

export const getRealtimeToken = createServerFn({ method: "GET" })
  .inputValidator((input: { triggerRunId: string }) => input)
  .handler(async ({ data: { triggerRunId } }) => {
    const token = await auth.createPublicToken({
      scopes: {
        read: {
          runs: [triggerRunId],
        },
      },
      expirationTime: "1h",
    });
    return jsonSafe({ token, triggerRunId });
  });
