import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Homepage } from "~/components/Homepage";
import { PROJECTS } from "~/lib/mock";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  const navigate = useNavigate();

  return (
    <Homepage
      projects={PROJECTS}
      onSelectProject={(id) => navigate({ to: "/$projectId", params: { projectId: id } })}
    />
  );
}
