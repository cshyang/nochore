import { createContext, useContext, useMemo, type ReactNode } from "react";
import { mergeProjectViewWithActivity } from "~/lib/activity";
import type { ProjectActivityStateView, ProjectView } from "~/lib/types";
import { useProjectActivityState } from "~/components/use-activity-state";

type ProjectLiveContextValue = {
  project: ProjectView;
  connected: boolean;
};

const ProjectLiveContext = createContext<ProjectLiveContextValue | null>(null);

export function ProjectLiveProvider({
  initialProject,
  initialActivity,
  children,
}: {
  initialProject: ProjectView;
  initialActivity: ProjectActivityStateView;
  children: ReactNode;
}) {
  const { snapshot, connected } = useProjectActivityState({
    projectId: initialProject.id,
    initialSnapshot: initialActivity,
  });

  const value = useMemo(
    () => ({
      project: mergeProjectViewWithActivity(initialProject, snapshot),
      connected,
    }),
    [connected, initialProject, snapshot],
  );

  return <ProjectLiveContext.Provider value={value}>{children}</ProjectLiveContext.Provider>;
}

export function useProjectLiveContext() {
  const value = useContext(ProjectLiveContext);
  if (!value) {
    throw new Error("useProjectLiveContext must be used inside ProjectLiveProvider");
  }
  return value;
}
