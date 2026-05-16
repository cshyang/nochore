import { useEffect, useState } from "react";
import { ConnectionDetail } from "~/components/chat/ConnectionDetail";
import { COLORS, MOTION, RADIUS, SPACE, TYPE } from "~/lib/colors";
import { getProviderMetadata } from "~/lib/provider-metadata";
import type { ConnectionView, ProviderRequirementView } from "~/lib/types";

interface ConnectionsIslandProps {
  connections: ConnectionView[];
  requiredProviders?: ProviderRequirementView[];
  projectId: string;
  providerLogos?: Record<string, string>;
  onConnect?: (provider: string) => void;
}

const CLOSED_MIN_WIDTH = 240;
const CLOSED_MAX_WIDTH = 300;
const EXPANDED_WIDTH = 400;
const MIN_HEIGHT = 260;

export function ConnectionsIsland({
  connections,
  requiredProviders = [],
  projectId,
  providerLogos = {},
  onConnect,
}: ConnectionsIslandProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = activeId ? (connections.find((c) => c.id === activeId) ?? null) : null;
  const viewportWidth = useViewportWidth();
  const isNarrow = viewportWidth < 1100;
  const expandedDrawer = isNarrow && active !== null;
  const activeConnections = connections.filter((c) => c.status === "active");
  const activeProviderSet = new Set(activeConnections.map((c) => c.provider));
  const missingProviders = requiredProviders.filter((requirement) => !activeProviderSet.has(requirement.provider));

  useEffect(() => {
    if (!activeId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setActiveId(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeId]);

  return (
    <aside
      style={{
        flexShrink: 0,
        alignSelf: "flex-start",
        width: active ? EXPANDED_WIDTH : "fit-content",
        minWidth: active ? undefined : CLOSED_MIN_WIDTH,
        maxWidth: active ? undefined : CLOSED_MAX_WIDTH,
        minHeight: MIN_HEIGHT,
        background: COLORS.cardRaised,
        border: `1px solid ${COLORS.borderStrong}`,
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.04)",
        borderRadius: RADIUS.lg,
        padding: `${SPACE[3]}px ${SPACE[3]}px`,
        transition: `width 220ms cubic-bezier(0.16, 1, 0.3, 1), min-width 220ms cubic-bezier(0.16, 1, 0.3, 1), max-width 220ms cubic-bezier(0.16, 1, 0.3, 1)`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        ...(expandedDrawer
          ? {
              position: "absolute" as const,
              top: SPACE[3],
              right: SPACE[3],
              bottom: SPACE[3],
              zIndex: 6,
              margin: 0,
            }
          : {
              position: "relative" as const,
              margin: `${SPACE[3]}px 0 ${SPACE[3]}px 0`,
            }),
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

      {!active && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {missingProviders.length > 0 ? (
              <div
                style={{
                  display: "grid",
                  gap: 8,
                  paddingBottom: activeConnections.length > 0 ? SPACE[2] : 0,
                  marginBottom: activeConnections.length > 0 ? SPACE[2] : 0,
                  borderBottom: activeConnections.length > 0 ? `1px solid ${COLORS.border}` : undefined,
                }}
              >
                <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textSecondary, lineHeight: TYPE.leading.normal }}>
                  This agent needs access before it can work.
                </div>
                {missingProviders.map((requirement) => (
                  <MissingConnectionRow
                    key={requirement.provider}
                    provider={requirement.provider}
                    reason={requirement.reason}
                    logo={providerLogos[requirement.provider]}
                    onConnect={onConnect}
                  />
                ))}
              </div>
            ) : null}

            {activeConnections.map((c) => (
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
        </>
      )}

      {active && (
        <ConnectionDetail
          connection={active}
          otherConnections={connections.filter((c) => c.id !== active.id && c.status === "active")}
          projectId={projectId}
          onClose={() => setActiveId(null)}
          onSelectOther={(id) => setActiveId(id)}
        />
      )}
    </aside>
  );
}

function useViewportWidth(): number {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1440);
  useEffect(() => {
    function onResize() {
      setW(window.innerWidth);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return w;
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

function MissingConnectionRow({
  provider,
  reason,
  logo,
  onConnect,
}: {
  provider: string;
  reason?: string | null;
  logo?: string;
  onConnect?: (provider: string) => void;
}) {
  const meta = getProviderMetadata(provider);
  return (
    <div
      style={{
        display: "grid",
        gap: 8,
        padding: SPACE[2],
        borderRadius: RADIUS.md,
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <ConnLogo logo={logo} fallback={meta.name.charAt(0).toUpperCase()} />
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
            {meta.name}
          </div>
          <div
            style={{
              fontSize: TYPE.scale.xs,
              color: COLORS.orange,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            Required
          </div>
        </div>
      </div>
      {reason ? (
        <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim, lineHeight: TYPE.leading.normal }}>
          {reason}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => onConnect?.(provider)}
        disabled={!onConnect}
        style={{
          fontFamily: TYPE.body,
          justifySelf: "start",
          padding: "6px 10px",
          borderRadius: RADIUS.md,
          border: `1px solid ${COLORS.accent}`,
          background: "transparent",
          color: COLORS.accent,
          fontSize: TYPE.scale.xs,
          fontWeight: TYPE.weight.medium,
          cursor: onConnect ? "pointer" : "default",
          opacity: onConnect ? 1 : 0.55,
        }}
      >
        Grant access
      </button>
    </div>
  );
}
