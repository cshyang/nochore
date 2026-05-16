import { ArrowLeft, DotsThree, Info, Play } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { WorkspaceTab } from "~/components/agent-workspace.types";
import { Badge } from "~/components/Badge";
import { Button } from "~/components/Button";
import { Card } from "~/components/Card";
import { COLORS, MOTION, RADIUS, TYPE } from "~/lib/colors";
import { getProviderMetadata } from "~/lib/provider-metadata";
import { humanize } from "~/lib/text-format";
import type { AgentView, ProjectView, ProviderRequirementView } from "~/lib/types";

export type ChecklistItem = {
  label: string;
  done: boolean;
  hint?: string;
  action?: { label: string; onClick: () => void };
};

export function DraftChecklist({
  items,
  onGoLive,
  goingLive,
}: {
  items: ChecklistItem[];
  onGoLive: () => void;
  goingLive: boolean;
}) {
  const doneCount = items.filter((item) => item.done).length;
  const allDone = doneCount === items.length;

  return (
    <div
      style={{
        marginBottom: 18,
        background: COLORS.surface,
        border: `1px solid ${allDone ? COLORS.green : COLORS.border}`,
        borderRadius: RADIUS.lg,
        overflow: "hidden",
        transition: `border-color ${MOTION.duration} ${MOTION.ease}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "16px 20px",
          borderBottom: `1px solid ${COLORS.border}`,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: TYPE.scale.xs,
              fontWeight: TYPE.weight.semibold,
              color: COLORS.textDim,
              textTransform: "uppercase",
              letterSpacing: TYPE.tracking.wide,
              marginBottom: 4,
            }}
          >
            Before you go live
          </div>
          <div
            style={{
              fontSize: TYPE.scale.base,
              fontWeight: TYPE.weight.medium,
              color: COLORS.text,
            }}
          >
            {allDone ? "All set — your agent is ready to launch." : `${doneCount} of ${items.length} complete`}
          </div>
        </div>
        <button
          type="button"
          className="btn"
          onClick={onGoLive}
          disabled={!allDone || goingLive}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            border: "none",
            borderRadius: RADIUS.md,
            background: allDone ? COLORS.accent : COLORS.border,
            color: allDone ? COLORS.white : COLORS.textDim,
            padding: "10px 16px",
            fontSize: TYPE.scale.sm,
            fontWeight: TYPE.weight.semibold,
            cursor: allDone && !goingLive ? "pointer" : "default",
            transition: `all ${MOTION.duration} ${MOTION.ease}`,
          }}
        >
          {goingLive ? "Going live..." : "Go live"}
        </button>
      </div>

      <div style={{ display: "grid" }}>
        {items.map((item, index) => (
          <div
            key={item.label}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              padding: "14px 20px",
              borderBottom: index === items.length - 1 ? "none" : `1px solid ${COLORS.border}`,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: TYPE.scale.sm, fontWeight: TYPE.weight.medium, color: COLORS.text }}>
                {item.label}
              </div>
              {item.hint ? (
                <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textSecondary, marginTop: 3 }}>{item.hint}</div>
              ) : null}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <Badge color={item.done ? "green" : "gray"}>{item.done ? "Done" : "Pending"}</Badge>
              {item.action ? (
                <button
                  type="button"
                  className="btn"
                  onClick={item.action.onClick}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: COLORS.accent,
                    fontSize: TYPE.scale.xs,
                    fontWeight: TYPE.weight.semibold,
                    cursor: "pointer",
                  }}
                >
                  {item.action.label}
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AgentWorkspaceHeader({
  project,
  agent,
  isDraft,
  runAction,
  moreOpen,
  onToggleMore,
  onCloseMore,
  onBack,
  onDeleteAgent,
}: {
  project: ProjectView;
  agent: AgentView;
  isDraft: boolean;
  runAction?: ReactNode;
  moreOpen: boolean;
  onToggleMore: () => void;
  onCloseMore: () => void;
  onBack: () => void;
  onDeleteAgent?: () => void;
}) {
  const statusBadgeColor = isDraft
    ? "orange"
    : agent.status === "attention"
      ? "orange"
      : agent.status === "running"
        ? "green"
        : agent.status === "error"
          ? "red"
          : "gray";

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: "1 1 auto" }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              background: "transparent",
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.md,
              cursor: "pointer",
              color: COLORS.textSecondary,
              width: 32,
              height: 32,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ArrowLeft size={14} />
          </button>
          <Badge color="accent">
            {project.icon} {project.name}
          </Badge>
          <h1
            style={{
              margin: 0,
              fontSize: TYPE.scale.lg,
              fontFamily: TYPE.display,
              fontWeight: TYPE.weight.semibold,
              letterSpacing: TYPE.tracking.tight,
              color: COLORS.text,
              lineHeight: TYPE.leading.tight,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {agent.name}
          </h1>
          <Badge color={statusBadgeColor}>{humanize(agent.status ?? (isDraft ? "draft" : "idle"))}</Badge>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {runAction}
          <Button variant="ghost" onClick={onToggleMore}>
            <DotsThree size={18} />
            More
          </Button>
        </div>
      </div>

      {moreOpen ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={onCloseMore}
            style={{ position: "fixed", inset: 0, border: "none", background: "transparent", zIndex: 19 }}
          />
          <div
            style={{
              position: "relative",
              zIndex: 20,
              marginTop: 10,
              padding: "12px 14px",
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.md,
            }}
          >
            <p
              style={{
                margin: 0,
                color: COLORS.textSecondary,
                fontSize: TYPE.scale.sm,
                fontFamily: TYPE.body,
                lineHeight: TYPE.leading.normal,
              }}
            >
              {agent.description || agent.instructions || "No description yet."}
            </p>
            {onDeleteAgent ? (
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    onCloseMore();
                    onDeleteAgent();
                  }}
                  style={{
                    padding: "6px 12px",
                    background: "transparent",
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.red,
                    cursor: "pointer",
                    borderRadius: RADIUS.md,
                    fontSize: TYPE.scale.xs,
                    fontWeight: TYPE.weight.medium,
                  }}
                >
                  Delete agent
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function WorkspaceTabs({
  tab,
  onChange,
  activeConnections,
  requiredProviders,
  threadSlot,
}: {
  tab: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
  activeConnections: number;
  requiredProviders: number;
  threadSlot?: ReactNode;
}) {
  const tabs: Array<{ value: WorkspaceTab; label: string }> = [
    { value: "chat", label: "Chat" },
    { value: "runs", label: "Activity" },
    { value: "learned", label: "Memory" },
    { value: "settings", label: "Settings" },
  ];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 24,
        borderBottom: `1px solid ${COLORS.border}`,
        marginBottom: 14,
      }}
    >
      {tabs.map((item) => (
        <button
          type="button"
          key={item.value}
          onClick={() => onChange(item.value)}
          style={{
            background: "transparent",
            border: "none",
            padding: "10px 0",
            marginBottom: -1,
            cursor: "pointer",
            color: tab === item.value ? COLORS.text : COLORS.textDim,
            borderBottom: `2px solid ${tab === item.value ? COLORS.accent : "transparent"}`,
            fontWeight: TYPE.weight.medium,
            fontSize: TYPE.scale.sm,
            fontFamily: TYPE.body,
            transition: `color ${MOTION.duration} ${MOTION.ease}`,
          }}
        >
          {item.label}
        </button>
      ))}
      <div
        style={{
          marginLeft: "auto",
          display: "flex",
          alignItems: "center",
          gap: 16,
          paddingBottom: 6,
        }}
      >
        {threadSlot}
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: COLORS.textDim, fontSize: TYPE.scale.xs }}>
          <span>{activeConnections} connected</span>
          <span>•</span>
          <span>{requiredProviders} required</span>
        </div>
      </div>
    </div>
  );
}

export function FirstRunPrompt({
  providerNames,
  onCancel,
  onStartRun,
}: {
  providerNames: string[];
  onCancel: () => void;
  onStartRun: () => void;
}) {
  return (
    <Card style={{ padding: "20px 24px", marginBottom: 18, borderColor: COLORS.accent }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: RADIUS.lg,
            background: COLORS.accentDim,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Info size={18} weight="bold" color={COLORS.accent} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div
            style={{
              fontSize: TYPE.scale.md,
              fontWeight: TYPE.weight.semibold,
              color: COLORS.text,
              fontFamily: TYPE.display,
              marginBottom: 6,
            }}
          >
            Ready to start the first run?
          </div>
          <div
            style={{
              fontSize: TYPE.scale.base,
              color: COLORS.textSecondary,
              lineHeight: TYPE.leading.normal,
              marginBottom: 4,
            }}
          >
            The agent will work in the background, gather context from connected tools when needed, and record the
            resulting findings in Activity.
          </div>
          <ul
            style={{
              margin: "10px 0 0",
              padding: "0 0 0 18px",
              color: COLORS.textSecondary,
              fontSize: TYPE.scale.sm,
              lineHeight: 1.8,
            }}
          >
            <li>Background runs typically take 30 seconds to a few minutes</li>
            {providerNames.length > 0 ? <li>Using: {providerNames.join(", ")}</li> : null}
          </ul>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, alignSelf: "center" }}>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onStartRun}>
            <Play size={13} weight="bold" />
            Start background run
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function listProviderNames(requiredProviders: ProviderRequirementView[]): string[] {
  return requiredProviders.map((provider) => getProviderMetadata(provider.provider).name);
}
