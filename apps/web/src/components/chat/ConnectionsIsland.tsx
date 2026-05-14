import { useState } from "react";
import { COLORS, MOTION, RADIUS, SPACE, TYPE } from "~/lib/colors";
import type { ConnectionView } from "~/lib/types";

interface ConnectionsIslandProps {
  connections: ConnectionView[];
  projectId: string;
}

const CLOSED_WIDTH = 220;
const EXPANDED_WIDTH = 340;

export function ConnectionsIsland({ connections, projectId }: ConnectionsIslandProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = activeId ? (connections.find((c) => c.id === activeId) ?? null) : null;

  return (
    <aside
      style={{
        flexShrink: 0,
        width: active ? EXPANDED_WIDTH : CLOSED_WIDTH,
        background: COLORS.cardRaised,
        border: `1px solid ${COLORS.borderStrong}`,
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.04)",
        borderRadius: RADIUS.lg,
        padding: `${SPACE[3]}px ${SPACE[3]}px`,
        margin: `${SPACE[3]}px ${SPACE[3]}px ${SPACE[3]}px 0`,
        transition: `width 220ms cubic-bezier(0.16, 1, 0.3, 1)`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minHeight: 0,
      }}
    >
      <div
        style={{
          fontSize: TYPE.scale.xs,
          color: COLORS.textDim,
          fontWeight: TYPE.weight.semibold,
          textTransform: "uppercase",
          letterSpacing: TYPE.tracking.wide,
          marginBottom: SPACE[2],
        }}
      >
        Connections
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
        {connections
          .filter((c) => c.status === "active")
          .map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveId(activeId === c.id ? null : c.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: `${SPACE[2]}px ${SPACE[2]}px`,
                background: activeId === c.id ? COLORS.accentSurface : "transparent",
                border: "none",
                borderRadius: RADIUS.md,
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
                width: "100%",
                transition: `background ${MOTION.duration} ${MOTION.ease}`,
              }}
              onMouseEnter={(e) => {
                if (activeId !== c.id) e.currentTarget.style.background = COLORS.surfaceHover;
              }}
              onMouseLeave={(e) => {
                if (activeId !== c.id) e.currentTarget.style.background = "transparent";
              }}
            >
              <ConnLogo logo={c.logo} fallback={(c.providerName ?? c.provider).charAt(0).toUpperCase()} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: TYPE.scale.sm,
                    color: COLORS.text,
                    fontWeight: TYPE.weight.medium,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.providerName ?? c.provider}
                </div>
                {c.accountLabel && c.accountLabel !== c.connectedAccountId && (
                  <div
                    style={{
                      fontSize: TYPE.scale.xs,
                      color: COLORS.textDim,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.accountLabel}
                  </div>
                )}
              </div>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: COLORS.green, flexShrink: 0 }} />
            </button>
          ))}
      </div>

      <div
        style={{
          marginTop: SPACE[2],
          paddingTop: SPACE[2],
          borderTop: `1px solid ${COLORS.border}`,
        }}
      >
        <a
          href={`/${projectId}`}
          style={{
            display: "block",
            textAlign: "center",
            fontSize: TYPE.scale.xs,
            color: COLORS.accent,
            fontWeight: TYPE.weight.medium,
            textDecoration: "none",
          }}
        >
          Manage in project →
        </a>
      </div>

      {active && (
        <div style={{ marginTop: SPACE[3], paddingTop: SPACE[3], borderTop: `1px solid ${COLORS.border}` }}>
          {/* Expanded detail content lands in Task 6.3 */}
          <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim }}>
            Detail for {active.providerName ?? active.provider} — coming next task.
          </div>
        </div>
      )}
    </aside>
  );
}

function ConnLogo({ logo, fallback }: { logo: string | null | undefined; fallback: string }) {
  const [errored, setErrored] = useState(false);
  if (logo && !errored) {
    return (
      <img
        src={logo}
        alt=""
        width={20}
        height={20}
        loading="lazy"
        onError={() => setErrored(true)}
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          background: COLORS.bgRaised,
          objectFit: "contain",
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 20,
        height: 20,
        borderRadius: 4,
        background: COLORS.bgRaised,
        color: COLORS.accent,
        fontSize: 10,
        fontWeight: TYPE.weight.semibold,
        flexShrink: 0,
      }}
    >
      {fallback}
    </span>
  );
}
