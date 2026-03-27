import { useState, useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Homepage } from "~/components/Homepage";
import { SetupWorkspace } from "~/components/SetupWorkspace";
import { ToastContainer, type ToastData } from "~/components/Toast";
import { listProjects, createProject } from "~/server/projects";
import { listAvailableSkills } from "~/server/skills";

export const Route = createFileRoute("/")({
  loader: async () => {
    const [projects, skills] = await Promise.all([
      listProjects(),
      listAvailableSkills(),
    ]);
    return { projects, skills };
  },
  component: IndexPage,
});

function IndexPage() {
  const { projects, skills } = Route.useLoaderData();
  const navigate = useNavigate();
  const projectList = (projects ?? []) as any[];
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback((message: string, type: ToastData["type"] = "error") => {
    setToasts((prev) => [...prev, { id: crypto.randomUUID(), message, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleCreateProject = async (name: string) => {
    try {
      const result = await createProject({ data: { name } });
      if (result && typeof result === "object" && "id" in result) {
        navigate({
          to: "/$projectId",
          params: { projectId: (result as { id: string }).id },
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast(msg, "error");
    }
  };

  if (projectList.length === 0) {
    return (
      <>
        <SetupWorkspace
          availableSkills={(skills ?? []) as any[]}
          onCreateProject={handleCreateProject}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  return (
    <>
      <Homepage
        projects={projectList}
        onSelectProject={(id) =>
          navigate({ to: "/$projectId", params: { projectId: id } })
        }
        onCreateProject={handleCreateProject}
      />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
