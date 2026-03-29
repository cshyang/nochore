import { useState } from "react";
import { Badge } from "~/components/Badge";
import { Button } from "~/components/Button";
import { Card } from "~/components/Card";
import { ProgressBar } from "~/components/ProgressBar";
import { COLORS } from "~/lib/colors";
import type { ProjectView } from "~/lib/types";

interface SubAccount {
  id: string;
  name: string;
  selected: boolean;
}

interface AgentUsage {
  agent: string;
  permission: string;
  lastUsed: string;
}

interface Connection {
  id: string;
  name: string;
  icon: string;
  status: "healthy" | "warning" | "error";
  lastUsed: string;
  connectedAt: string;
  authType: string;
  account: { name: string; id: string; type: string };
  subAccounts: SubAccount[] | null;
  permissions: { level: string; scopes: string[] };
  agentUsage: AgentUsage[];
  health: {
    uptime: string;
    lastCheck: string;
    apiQuota: { used: number; limit: number };
    tokenExpiry: string;
    warning?: string;
  };
}

interface ProjectConnectionsProps {
  project: ProjectView;
}

export function ProjectConnections({ project }: ProjectConnectionsProps) {
  const [expandedConn, setExpandedConn] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const connections: Connection[] = [
    {
      id: "google-ads",
      name: "Google Ads",
      icon: "\u{1F4CA}",
      status: "healthy",
      lastUsed: "2 hours ago",
      connectedAt: "Jan 15, 2026",
      authType: "OAuth 2.0",
      account: { name: "Acme Corp MCC", id: "123-456-7890", type: "Manager Account" },
      subAccounts: [
        { id: "111-222-3333", name: "Acme - US", selected: true },
        { id: "111-222-4444", name: "Acme - EU", selected: true },
        { id: "111-222-5555", name: "Acme - APAC", selected: false },
      ],
      permissions: {
        level: "read-write",
        scopes: ["campaigns.read", "campaigns.write", "reports.read", "keywords.write"],
      },
      agentUsage: [
        { agent: "Ad Spend Guardian", permission: "read-write", lastUsed: "2h ago" },
        { agent: "Content Scheduler", permission: "read-only", lastUsed: "1h ago" },
      ],
      health: {
        uptime: "99.8%",
        lastCheck: "5 min ago",
        apiQuota: { used: 12400, limit: 50000 },
        tokenExpiry: "Auto-refreshed",
      },
    },
    {
      id: "slack",
      name: "Slack",
      icon: "\u{1F4AC}",
      status: "healthy",
      lastUsed: "1 hour ago",
      connectedAt: "Jan 15, 2026",
      authType: "OAuth 2.0",
      account: { name: "Acme Workspace", id: "T0123ACME", type: "Workspace" },
      subAccounts: null,
      permissions: { level: "write", scopes: ["chat:write", "channels:read"] },
      agentUsage: [
        { agent: "Ad Spend Guardian", permission: "write", lastUsed: "2h ago" },
        { agent: "Lead Qualifier", permission: "write", lastUsed: "1h ago" },
      ],
      health: {
        uptime: "100%",
        lastCheck: "3 min ago",
        apiQuota: { used: 340, limit: 10000 },
        tokenExpiry: "Auto-refreshed",
      },
    },
    {
      id: "hubspot",
      name: "HubSpot",
      icon: "\u{1F7E0}",
      status: "warning",
      lastUsed: "6 hours ago",
      connectedAt: "Feb 2, 2026",
      authType: "API Key",
      account: { name: "Acme CRM", id: "hub-acme-001", type: "CRM Portal" },
      subAccounts: null,
      permissions: { level: "read-only", scopes: ["contacts.read", "deals.read"] },
      agentUsage: [{ agent: "Lead Qualifier", permission: "read-only", lastUsed: "6h ago" }],
      health: {
        uptime: "94.2%",
        lastCheck: "8 min ago",
        apiQuota: { used: 48200, limit: 50000 },
        tokenExpiry: "API key (no expiry)",
        warning: "API quota at 96% \u2014 agents may be throttled soon",
      },
    },
  ];

  const statusConfig: Record<Connection["status"], { color: string; label: string; bg: string }> = {
    healthy: { color: COLORS.green, label: "Healthy", bg: COLORS.greenDim },
    warning: { color: COLORS.orange, label: "Warning", bg: COLORS.orangeDim },
    error: { color: COLORS.red, label: "Disconnected", bg: COLORS.redDim },
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: COLORS.text, margin: 0 }}>Connections</h2>
          <p style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 4 }}>
            Shared across all agents in {project.icon} {project.name}
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAddModal(!showAddModal)}>
          + Add connection
        </Button>
      </div>

      {/* Add connection modal */}
      {showAddModal && (
        <Card style={{ marginBottom: 16, borderColor: COLORS.accent }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 12 }}>
            Connect a new service
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[
              { icon: "\u{1F4CA}", name: "Google Ads", type: "OAuth" },
              { icon: "\u{1F4F1}", name: "Meta Ads", type: "OAuth" },
              { icon: "\u{1F4AC}", name: "Slack", type: "OAuth" },
              { icon: "\u{1F4C8}", name: "GA4", type: "OAuth" },
              { icon: "\u{1F7E0}", name: "HubSpot", type: "API Key" },
              { icon: "\u{1F6D2}", name: "Shopify", type: "OAuth" },
              { icon: "\u{1F4B3}", name: "Stripe", type: "API Key" },
              { icon: "\u{1F4CB}", name: "Jira", type: "OAuth" },
              { icon: "\u{1F50D}", name: "Search Console", type: "OAuth" },
            ].map((svc) => (
              <button
                type="button"
                key={svc.name}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: COLORS.surfaceHover,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "background 0.15s",
                  border: "none",
                  textAlign: "left",
                  width: "100%",
                }}
                onClick={() => {
                  // Handle selection here
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = COLORS.border;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = COLORS.surfaceHover;
                }}
              >
                <span style={{ fontSize: 18 }}>{svc.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{svc.name}</div>
                  <div style={{ fontSize: 12, color: COLORS.textDim }}>{svc.type}</div>
                </div>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: COLORS.textDim }}>
            500+ integrations available via Composio ·{" "}
            <span style={{ color: COLORS.accentBright, cursor: "pointer" }}>Browse all →</span>
          </div>
        </Card>
      )}

      {/* Connection list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {connections.map((conn) => {
          const status = statusConfig[conn.status];
          const isExpanded = expandedConn === conn.id;

          return (
            <Card key={conn.id} style={{ padding: 0, overflow: "hidden" }}>
              {/* Connection header — always visible */}
              <button
                type="button"
                onClick={() => setExpandedConn(isExpanded ? null : conn.id)}
                style={{
                  padding: "16px 24px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  background: "none",
                  border: "none",
                  width: "100%",
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: 24 }}>{conn.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>{conn.name}</span>
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: status.color }} />
                    <span style={{ fontSize: 12, color: status.color }}>{status.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>
                    {conn.account.name} · {conn.account.id} · Last used {conn.lastUsed}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Badge
                    color={
                      conn.permissions.level === "read-write"
                        ? "accent"
                        : conn.permissions.level === "write"
                          ? "blue"
                          : "gray"
                    }
                  >
                    {conn.permissions.level}
                  </Badge>
                  <span
                    style={{
                      color: COLORS.textDim,
                      transform: isExpanded ? "rotate(90deg)" : "rotate(0)",
                      transition: "transform 0.15s ease",
                      display: "inline-block",
                    }}
                  >
                    {"\u25B6"}
                  </span>
                </div>
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "16px 24px" }}>
                  {/* Health warning */}
                  {conn.health.warning && (
                    <div
                      style={{
                        padding: "10px 14px",
                        background: COLORS.orangeDim,
                        borderRadius: 8,
                        marginBottom: 16,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 14 }}>{"\u26A0\uFE0F"}</span>
                      <span style={{ fontSize: 13, color: COLORS.orange }}>{conn.health.warning}</span>
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                    {/* Health stats */}
                    <div>
                      <div
                        style={{
                          fontSize: 12,
                          color: COLORS.textDim,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                          marginBottom: 12,
                        }}
                      >
                        Health
                      </div>
                      <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ color: COLORS.textSecondary }}>Uptime</span>
                          <span style={{ color: COLORS.text, fontWeight: 600 }}>{conn.health.uptime}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ color: COLORS.textSecondary }}>Last health check</span>
                          <span style={{ color: COLORS.text }}>{conn.health.lastCheck}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ color: COLORS.textSecondary }}>Token</span>
                          <span style={{ color: COLORS.text }}>{conn.health.tokenExpiry}</span>
                        </div>
                        <div style={{ fontSize: 13 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ color: COLORS.textSecondary }}>API quota</span>
                            <span
                              style={{
                                color:
                                  conn.health.apiQuota.used / conn.health.apiQuota.limit > 0.9
                                    ? COLORS.orange
                                    : COLORS.text,
                              }}
                            >
                              {(conn.health.apiQuota.used / 1000).toFixed(1)}k /{" "}
                              {(conn.health.apiQuota.limit / 1000).toFixed(0)}k
                            </span>
                          </div>
                          <ProgressBar
                            value={(conn.health.apiQuota.used / conn.health.apiQuota.limit) * 100}
                            color={
                              conn.health.apiQuota.used / conn.health.apiQuota.limit > 0.9
                                ? COLORS.orange
                                : COLORS.accent
                            }
                          />
                        </div>
                      </div>
                    </div>

                    {/* Connection details */}
                    <div>
                      <div
                        style={{
                          fontSize: 12,
                          color: COLORS.textDim,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                          marginBottom: 12,
                        }}
                      >
                        Details
                      </div>
                      <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ color: COLORS.textSecondary }}>Auth type</span>
                          <span style={{ color: COLORS.text }}>{conn.authType}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ color: COLORS.textSecondary }}>Account type</span>
                          <span style={{ color: COLORS.text }}>{conn.account.type}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ color: COLORS.textSecondary }}>Connected</span>
                          <span style={{ color: COLORS.text }}>{conn.connectedAt}</span>
                        </div>
                        <div style={{ fontSize: 13 }}>
                          <span style={{ color: COLORS.textSecondary }}>Scopes: </span>
                          <span style={{ color: COLORS.textDim }}>{conn.permissions.scopes.join(", ")}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sub-accounts (the "which account?" problem) */}
                  {conn.subAccounts && (
                    <div style={{ marginBottom: 20 }}>
                      <div
                        style={{
                          fontSize: 12,
                          color: COLORS.textDim,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                          marginBottom: 12,
                        }}
                      >
                        Sub-accounts
                      </div>
                      <div style={{ background: COLORS.bg, borderRadius: 8, padding: 12 }}>
                        {conn.subAccounts.map((sub) => (
                          <div
                            key={sub.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "8px 4px",
                              borderBottom: `1px solid ${COLORS.border}`,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <div
                                style={{
                                  width: 20,
                                  height: 20,
                                  borderRadius: 4,
                                  border: `2px solid ${sub.selected ? COLORS.accent : COLORS.borderStrong}`,
                                  background: sub.selected ? COLORS.accent : "transparent",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 12,
                                  color: COLORS.white,
                                  cursor: "pointer",
                                }}
                              >
                                {sub.selected ? "\u2713" : ""}
                              </div>
                              <div>
                                <div style={{ fontSize: 13, color: COLORS.text }}>{sub.name}</div>
                                <div style={{ fontSize: 12, color: COLORS.textDim }}>{sub.id}</div>
                              </div>
                            </div>
                            {sub.selected && <Badge color="green">Active</Badge>}
                          </div>
                        ))}
                        <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 8, fontStyle: "italic" }}>
                          Agents will only access data from selected sub-accounts
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Per-agent permission overrides */}
                  <div style={{ marginBottom: 16 }}>
                    <div
                      style={{
                        fontSize: 12,
                        color: COLORS.textDim,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        marginBottom: 12,
                      }}
                    >
                      Agent access
                    </div>
                    <div style={{ background: COLORS.bg, borderRadius: 8, overflow: "hidden" }}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto auto",
                          gap: 0,
                          padding: "8px 12px",
                          borderBottom: `1px solid ${COLORS.border}`,
                        }}
                      >
                        <span style={{ fontSize: 12, color: COLORS.textDim, textTransform: "uppercase" }}>Agent</span>
                        <span
                          style={{
                            fontSize: 12,
                            color: COLORS.textDim,
                            textTransform: "uppercase",
                            textAlign: "center",
                            width: 100,
                          }}
                        >
                          Permission
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            color: COLORS.textDim,
                            textTransform: "uppercase",
                            textAlign: "right",
                            width: 80,
                          }}
                        >
                          Last used
                        </span>
                      </div>
                      {conn.agentUsage.map((usage) => (
                        <div
                          key={usage.agent}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr auto auto",
                            gap: 0,
                            padding: "10px 12px",
                            borderBottom: `1px solid ${COLORS.border}`,
                            alignItems: "center",
                          }}
                        >
                          <span style={{ fontSize: 13, color: COLORS.text }}>{usage.agent}</span>
                          <div style={{ textAlign: "center", width: 100 }}>
                            <Badge
                              color={
                                usage.permission === "read-write"
                                  ? "accent"
                                  : usage.permission === "write"
                                    ? "blue"
                                    : "gray"
                              }
                            >
                              {usage.permission}
                            </Badge>
                          </div>
                          <span style={{ fontSize: 12, color: COLORS.textDim, textAlign: "right", width: 80 }}>
                            {usage.lastUsed}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 8, fontStyle: "italic" }}>
                      Override default permissions per agent in agent settings
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 8, paddingTop: 8, borderTop: `1px solid ${COLORS.border}` }}>
                    <Button size="sm" variant="secondary">
                      Reconnect
                    </Button>
                    <Button size="sm" variant="secondary">
                      Edit scopes
                    </Button>
                    <Button size="sm" variant="ghost" style={{ color: COLORS.red, marginLeft: "auto" }}>
                      Disconnect
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
