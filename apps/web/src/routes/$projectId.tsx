import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { ProjectLiveProvider } from "~/components/project-live-context";
import { ProjectSidebar } from "~/components/ProjectSidebar";
import { COLORS } from "~/lib/colors";
import { parseProjectActivityStateView, parseProjectView } from "~/lib/view-models";
import { getProjectActivityState } from "~/server/activity";
import { getProject } from "~/server/projects";

export const Route = createFileRoute("/$projectId")({
  loader: async ({ params }) => {
    const [project, activity] = await Promise.all([
      getProject({ data: { projectId: params.projectId } }),
      getProjectActivityState({ data: { projectId: params.projectId } }),
    ]);

    return { project, activity };
  },
  component: ProjectLayout,
});

function ProjectLayout() {
  const navigate = useNavigate();
  const loaderData = Route.useLoaderData();
  const project = parseProjectView(loaderData.project);
  const activity = parseProjectActivityStateView(loaderData.activity);

  if (!project || !activity) {
    return <div style={{ padding: 48, color: COLORS.text }}>Project not found.</div>;
  }

  return (
    <ProjectLiveProvider initialProject={project} initialActivity={activity}>
      <div
        style={{
          background: COLORS.bg,
          minHeight: "100vh",
          color: COLORS.text,
        }}
      >
        <ProjectSidebar
          activeAgentId={null}
          onSelectAgent={(id) =>
            navigate({
              to: "/$projectId/agents/$agentId",
              params: { projectId: project.id, agentId: id },
              search: { tab: undefined, runId: undefined, pendingActionId: undefined },
            })
          }
          onGoHome={() => navigate({ to: "/" })}
          onNewAgent={() =>
            navigate({
              to: "/$projectId/agents/new",
              params: { projectId: project.id },
            })
          }
        />
        <div style={{ marginLeft: 240, padding: "20px 40px", display: "flex", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: 1200 }}>
            <Outlet />
          </div>
        </div>
      </div>
    </ProjectLiveProvider>
  );
}
