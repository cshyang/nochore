import { Badge } from "~/components/Badge";
import { Card } from "~/components/Card";
import { COLORS, RADIUS, TYPE } from "~/lib/colors";
import { CONNECTABLE_PROVIDER_SLUGS, getProviderMetadata } from "~/lib/provider-metadata";
import type { ConnectionView, ProjectView } from "~/lib/types";

interface ProjectConnectionsProps {
  project: ProjectView;
  connections: ConnectionView[];
}

function humanizeStatus(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatConnectionDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getStatusColor(status: string): "green" | "yellow" | "red" | "gray" {
  switch (status) {
    case "active":
      return "green";
    case "pending":
      return "yellow";
    case "disconnected":
      return "red";
    default:
      return "gray";
  }
}

export function ProjectConnections({ project, connections }: ProjectConnectionsProps) {
  const sortedConnections = [...connections].sort((left, right) => right.createdAt - left.createdAt);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: COLORS.text, margin: 0 }}>Connections</h2>
        <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: "4px 0 0" }}>
          Shared across all agents in {project.icon} {project.name}
        </p>
      </div>

      {sortedConnections.length === 0 ? (
        <Card>
          <div
            style={{
              display: "grid",
              gap: 12,
            }}
          >
            <div
              style={{
                fontSize: TYPE.scale.base,
                fontWeight: TYPE.weight.semibold,
                color: COLORS.text,
              }}
            >
              No project connections yet
            </div>
            <div
              style={{
                fontSize: TYPE.scale.sm,
                lineHeight: TYPE.leading.normal,
                color: COLORS.textSecondary,
              }}
            >
              Connect providers from an agent&apos;s Tools tab. Once active, they appear here as shared project
              connections.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {CONNECTABLE_PROVIDER_SLUGS.slice(0, 8).map((provider) => {
                const meta = getProviderMetadata(provider);
                return (
                  <span
                    key={provider}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      borderRadius: RADIUS.pill,
                      background: COLORS.surfaceHover,
                      color: COLORS.textSecondary,
                      fontSize: TYPE.scale.xs,
                    }}
                  >
                    <span>{meta.icon}</span>
                    <span>{meta.name}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </Card>
      ) : (
        sortedConnections.map((connection) => {
          const meta = getProviderMetadata(connection.provider);

          return (
            <Card key={connection.id} style={{ padding: 0, overflow: "hidden" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  padding: "16px 20px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{meta.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: TYPE.scale.base,
                        fontWeight: TYPE.weight.semibold,
                        color: COLORS.text,
                      }}
                    >
                      {meta.name}
                    </div>
                    <div
                      style={{
                        fontSize: TYPE.scale.xs,
                        color: COLORS.textSecondary,
                        marginTop: 2,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                      }}
                    >
                      <span>Connected {formatConnectionDate(connection.createdAt)}</span>
                      {connection.connectedAccountId ? <span>• {connection.connectedAccountId}</span> : null}
                    </div>
                  </div>
                </div>
                <Badge color={getStatusColor(connection.status)}>{humanizeStatus(connection.status)}</Badge>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
