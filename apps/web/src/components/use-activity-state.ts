import { useMemo } from "react";
import type { AgentActivityStateView, ProjectActivityStateView } from "~/lib/types";
import { useSseSnapshot } from "~/components/use-sse-snapshot";

export function useAgentActivityState(params: {
  projectId: string;
  agentId: string;
  initialSnapshot: AgentActivityStateView;
}) {
  const url = useMemo(
    () =>
      `/api/activity-stream?scope=agent&projectId=${encodeURIComponent(params.projectId)}&agentId=${encodeURIComponent(params.agentId)}`,
    [params.agentId, params.projectId],
  );

  return useSseSnapshot<AgentActivityStateView>(url, params.initialSnapshot);
}

export function useProjectActivityState(params: { projectId: string; initialSnapshot: ProjectActivityStateView }) {
  const url = useMemo(
    () => `/api/activity-stream?scope=project&projectId=${encodeURIComponent(params.projectId)}`,
    [params.projectId],
  );

  return useSseSnapshot<ProjectActivityStateView>(url, params.initialSnapshot);
}
