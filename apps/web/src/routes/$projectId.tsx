import { useState } from "react";
import {
  createFileRoute,
  Outlet,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { COLORS } from "~/lib/colors";
import { PROJECTS } from "~/lib/mock";
import { ProjectSidebar } from "~/components/ProjectSidebar";

export const Route = createFileRoute("/$projectId")({
  component: ProjectLayout,
});

function ProjectLayout() {
  const { projectId } = useParams({ from: "/$projectId" });
  const navigate = useNavigate();
  const project = PROJECTS.find((p) => p.id === projectId);

  if (!project) {
    return (
      <div style={{ padding: 48, color: COLORS.text }}>
        Project not found.
      </div>
    );
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
            params: { projectId, agentId: id },
          })
        }
        onGoHome={() => navigate({ to: "/" })}
        onNewAgent={() =>
          navigate({
            to: "/$projectId/agents/new",
            params: { projectId },
          })
        }
      />
      <div style={{ marginLeft: 260, padding: "32px 48px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 800 }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
