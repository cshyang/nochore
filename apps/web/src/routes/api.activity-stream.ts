import { createFileRoute } from "@tanstack/react-router";
import { loadAgentActivityState, loadProjectActivityState } from "~/server/activity";

const HEARTBEAT_MS = 15_000;
const POLL_MS = 1_000;

export const Route = createFileRoute("/api/activity-stream")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const scope = url.searchParams.get("scope");
        const projectId = url.searchParams.get("projectId");
        const agentId = url.searchParams.get("agentId");

        if (!projectId || (scope !== "agent" && scope !== "project")) {
          return new Response("Missing or invalid stream parameters", { status: 400 });
        }

        if (scope === "agent" && !agentId) {
          return new Response("Missing agentId", { status: 400 });
        }

        const encoder = new TextEncoder();
        let cleanup: (() => void) | null = null;

        const stream = new ReadableStream({
          start(controller) {
            let closed = false;
            let currentVersion = -1;
            let polling = false;

            const write = (event: string, data: unknown) => {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            };

            const close = () => {
              if (closed) {
                return;
              }
              closed = true;
              clearInterval(pollInterval);
              clearInterval(heartbeatInterval);
              request.signal.removeEventListener("abort", abortListener);
              try {
                controller.close();
              } catch {
                // Stream already closed.
              }
            };
            cleanup = close;

            const poll = async () => {
              if (closed || polling) {
                return;
              }
              polling = true;

              try {
                const snapshot =
                  scope === "project"
                    ? await loadProjectActivityState(projectId)
                    : await loadAgentActivityState(projectId, agentId!);

                if (!snapshot) {
                  write("error", { message: "Not found" });
                  close();
                  return;
                }

                if (snapshot.version !== currentVersion) {
                  currentVersion = snapshot.version;
                  write("snapshot", snapshot);
                }
              } finally {
                polling = false;
              }
            };

            const abortListener = () => close();
            request.signal.addEventListener("abort", abortListener);

            const pollInterval = setInterval(() => {
              void poll();
            }, POLL_MS);

            const heartbeatInterval = setInterval(() => {
              if (!closed) {
                write("heartbeat", {});
              }
            }, HEARTBEAT_MS);

            void poll().catch(() => {
              write("error", { message: "Activity stream failed" });
              close();
            });
          },
          cancel() {
            cleanup?.();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
