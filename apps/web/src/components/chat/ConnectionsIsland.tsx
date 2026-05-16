import { CaretDown } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { COLORS, MOTION, RADIUS, SPACE, TYPE } from "~/lib/colors";
import { getProviderMetadata } from "~/lib/provider-metadata";
import { formatRelativeTime } from "~/lib/time-format";
import type { ConnectionView, ProviderRequirementView } from "~/lib/types";

interface ConnectionsIslandProps {
  connections: ConnectionView[];
  requiredProviders?: ProviderRequirementView[];
  projectId: string;
  providerLogos?: Record<string, string>;
  onConnect?: (provider: string) => void;
  onReconnect?: (provider: string, oldConnectionId: string) => void;
  onDisconnect?: (provider: string, connectedAccountId: string) => void;
}

const MIN_WIDTH = 240;
const MAX_WIDTH = 300;
const MIN_HEIGHT = 260;

export function ConnectionsIsland({
  connections,
  requiredProviders = [],
  projectId,
  providerLogos = {},
  onConnect,
  onReconnect,
  onDisconnect,
}: ConnectionsIslandProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
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
        position: "relative",
        width: "fit-content",
        minWidth: MIN_WIDTH,
        maxWidth: MAX_WIDTH,
        minHeight: MIN_HEIGHT,
        margin: `${SPACE[3]}px 0 ${SPACE[3]}px 0`,
        background: COLORS.cardRaised,
        border: `1px solid ${COLORS.borderStrong}`,
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.04)",
        borderRadius: RADIUS.lg,
        padding: `${SPACE[3]}px ${SPACE[3]}px`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
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

        {activeConnections.map((c) => {
          const isOpen = activeId === c.id;
          return (
            <div key={c.id} style={{ display: "flex", flexDirection: "column" }}>
              <button
                type="button"
                onClick={() => setActiveId(isOpen ? null : c.id)}
                aria-expanded={isOpen}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: `${SPACE[2]}px ${SPACE[2]}px`,
                  background: isOpen ? COLORS.accentSurface : "transparent",
                  border: "none",
                  borderRadius: RADIUS.md,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                  width: "100%",
                  transition: `background ${MOTION.duration} ${MOTION.ease}`,
                }}
                onMouseEnter={(e) => {
                  if (!isOpen) e.currentTarget.style.background = COLORS.surfaceHover;
                }}
                onMouseLeave={(e) => {
                  if (!isOpen) e.currentTarget.style.background = "transparent";
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
                <CaretDown
                  size={10}
                  weight="bold"
                  color={COLORS.textDim}
                  style={{
                    transition: `transform ${MOTION.duration} ${MOTION.ease}`,
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    flexShrink: 0,
                  }}
                />
              </button>
              {isOpen ? (
                <InlineConnectionDetail
                  connection={c}
                  projectId={projectId}
                  onReconnect={onReconnect}
                  onDisconnect={onDisconnect}
                />
              ) : null}
            </div>
          );
        })}
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
    </aside>
  );
}

function InlineConnectionDetail({
  connection,
  projectId,
  onReconnect,
  onDisconnect,
}: {
  connection: ConnectionView;
  projectId: string;
  onReconnect?: (provider: string, oldConnectionId: string) => void;
  onDisconnect?: (provider: string, connectedAccountId: string) => void;
}) {
  const isHealthy = connection.status === "active";
  const canDisconnect = Boolean(onDisconnect && connection.connectedAccountId);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: `${SPACE[2]}px ${SPACE[3]}px ${SPACE[3]}px`,
        marginTop: 2,
        marginBottom: 4,
        borderRadius: RADIUS.md,
        background: COLORS.bg,
        borderLeft: `2px solid ${COLORS.accent}`,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <DetailRow k="Status">
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              color: isHealthy ? COLORS.green : COLORS.red,
            }}
          >
            <span
              style={{ width: 6, height: 6, borderRadius: 99, background: isHealthy ? COLORS.green : COLORS.red }}
            />
            {isHealthy ? "Healthy" : "Disconnected"}
          </span>
        </DetailRow>
        <DetailRow k="Connected">{formatRelativeTime(new Date(connection.createdAt).toISOString())}</DetailRow>
        {connection.connector && (
          <DetailRow k="Routed by">{connection.connector === "composio" ? "Composio" : "Direct"}</DetailRow>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <button
          type="button"
          onClick={() => onReconnect?.(connection.provider, connection.id)}
          disabled={!onReconnect}
          style={{
            flex: 1,
            background: COLORS.accent,
            border: "none",
            borderRadius: RADIUS.md,
            padding: "5px 10px",
            color: COLORS.white,
            fontSize: TYPE.scale.xs,
            fontWeight: TYPE.weight.semibold,
            cursor: onReconnect ? "pointer" : "default",
            opacity: onReconnect ? 1 : 0.55,
            fontFamily: "inherit",
            textAlign: "center",
          }}
        >
          Reconnect
        </button>
        <a
          href={`/${projectId}`}
          style={{
            flex: 1,
            background: "transparent",
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.md,
            padding: "5px 10px",
            color: COLORS.text,
            fontSize: TYPE.scale.xs,
            fontWeight: TYPE.weight.medium,
            cursor: "pointer",
            fontFamily: "inherit",
            textDecoration: "none",
            textAlign: "center",
          }}
        >
          Open
        </a>
      </div>
      {canDisconnect ? (
        <button
          type="button"
          onClick={() => {
            if (!connection.connectedAccountId) return;
            onDisconnect?.(connection.provider, connection.connectedAccountId);
          }}
          style={{
            marginTop: 2,
            alignSelf: "center",
            background: "transparent",
            border: "none",
            color: COLORS.red,
            fontSize: TYPE.scale.xs,
            fontWeight: TYPE.weight.medium,
            cursor: "pointer",
            fontFamily: "inherit",
            padding: "2px 6px",
          }}
        >
          Disconnect
        </button>
      ) : null}
    </div>
  );
}

function DetailRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: TYPE.scale.xs }}>
      <span style={{ color: COLORS.textDim }}>{k}</span>
      <span style={{ color: COLORS.text }}>{children}</span>
    </div>
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
        <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim, lineHeight: TYPE.leading.normal }}>{reason}</div>
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
