import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { ProjectSidebar } from "~/components/ProjectSidebar";
import { COLORS } from "~/lib/colors";
import { parseProjectView } from "~/lib/view-models";
import { getProject } from "~/server/projects";

export const Route = createFileRoute("/$projectId")({
  loader: async ({ params }) => {
    const project = await getProject({ data: { projectId: params.projectId } });
    return { project };
  },
  component: ProjectLayout,
});

function ProjectLayout() {
  const navigate = useNavigate();
  const loaderData = Route.useLoaderData();
  const project = parseProjectView(loaderData.project);

  if (!project) {
    return <div style={{ padding: 48, color: COLORS.text }}>Project not found.</div>;
  }

  return (
    <div
      style={{
        background: COLORS.bg,
        minHeight: "100vh",
        color: COLORS.text,
      }}
    >
      <ProjectSidebar
        project={project}
        activeAgentId={null}
        onSelectAgent={(id) =>
          navigate({
            to: "/$projectId/agents/$agentId",
            params: { projectId: project.id, agentId: id },
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
      <div style={{ marginLeft: 240, padding: "32px 48px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 800 }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
