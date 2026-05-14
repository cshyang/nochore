import { X } from "@phosphor-icons/react";
import type React from "react";
import { COLORS, RADIUS, SPACE, TYPE } from "~/lib/colors";
import { formatRelativeTime } from "~/lib/time-format";
import type { ConnectionView } from "~/lib/types";

interface ConnectionDetailProps {
  connection: ConnectionView;
  otherConnections: ConnectionView[];
  projectId: string;
  onClose: () => void;
  onSelectOther: (id: string) => void;
}

export function ConnectionDetail({
  connection,
  otherConnections,
  projectId,
  onClose,
  onSelectOther,
}: ConnectionDetailProps) {
  const isHealthy = connection.status === "active";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE[3], minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: SPACE[2] }}>
        <DetailLogo
          logo={connection.logo}
          fallback={(connection.providerName ?? connection.provider).charAt(0).toUpperCase()}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: TYPE.scale.base,
              color: COLORS.text,
              fontWeight: TYPE.weight.semibold,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {connection.providerName ?? connection.provider}
          </div>
          {connection.accountLabel && connection.accountLabel !== connection.connectedAccountId && (
            <div
              style={{
                fontSize: TYPE.scale.xs,
                color: COLORS.textDim,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              Account · {connection.accountLabel}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            background: "transparent",
            border: "none",
            color: COLORS.textDim,
            cursor: "pointer",
            padding: 4,
            display: "grid",
            placeItems: "center",
          }}
        >
          <X size={14} weight="bold" />
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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

      <div style={{ display: "flex", gap: 8 }}>
        <a
          href={`/${projectId}/callback/composio?provider=${encodeURIComponent(connection.provider)}`}
          style={{
            flex: 1,
            background: COLORS.accent,
            border: "none",
            borderRadius: RADIUS.md,
            padding: "7px 12px",
            color: COLORS.white,
            fontSize: TYPE.scale.xs,
            fontWeight: TYPE.weight.semibold,
            cursor: "pointer",
            fontFamily: "inherit",
            textDecoration: "none",
            textAlign: "center",
          }}
        >
          Reconnect
        </a>
        <a
          href={`/${projectId}`}
          style={{
            flex: 1,
            background: "transparent",
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.md,
            padding: "7px 12px",
            color: COLORS.text,
            fontSize: TYPE.scale.xs,
            fontWeight: TYPE.weight.medium,
            cursor: "pointer",
            fontFamily: "inherit",
            textDecoration: "none",
            textAlign: "center",
          }}
        >
          Open in project
        </a>
      </div>

      {otherConnections.length > 0 && (
        <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: SPACE[2] }}>
          <div
            style={{
              fontSize: TYPE.scale.xs,
              color: COLORS.textDim,
              fontWeight: TYPE.weight.semibold,
              textTransform: "uppercase",
              letterSpacing: TYPE.tracking.wide,
              marginBottom: 6,
            }}
          >
            Other connections
          </div>
          {otherConnections.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelectOther(c.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: `${SPACE[2]}px ${SPACE[2]}px`,
                background: "transparent",
                border: "none",
                borderRadius: RADIUS.md,
                cursor: "pointer",
                width: "100%",
                textAlign: "left",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surfaceHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <DetailLogo logo={c.logo} fallback={(c.providerName ?? c.provider).charAt(0).toUpperCase()} small />
              <span style={{ fontSize: TYPE.scale.sm, color: COLORS.text, fontWeight: TYPE.weight.medium }}>
                {c.providerName ?? c.provider}
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  width: 6,
                  height: 6,
                  borderRadius: 99,
                  background: c.status === "active" ? COLORS.green : COLORS.red,
                }}
              />
            </button>
          ))}
        </div>
      )}
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

function DetailLogo({
  logo,
  fallback,
  small = false,
}: {
  logo: string | null | undefined;
  fallback: string;
  small?: boolean;
}) {
  const size = small ? 18 : 28;
  if (logo) {
    return (
      <img
        src={logo}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        style={{
          width: size,
          height: size,
          borderRadius: 5,
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
        width: size,
        height: size,
        borderRadius: 5,
        background: COLORS.bgRaised,
        color: COLORS.accent,
        fontSize: small ? 10 : 13,
        fontWeight: TYPE.weight.semibold,
        flexShrink: 0,
      }}
    >
      {fallback}
    </span>
  );
}
