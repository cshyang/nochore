import { useState } from "react";
import { COLORS, RADIUS } from "~/lib/colors";
import { Badge } from "~/components/Badge";
import { Button } from "~/components/Button";
import { Card } from "~/components/Card";
import {
  WarningCircle,
  CheckCircle,
  Info,
  CaretRight,
} from "@phosphor-icons/react";

interface Insight {
  id: string;
  tier: "input" | "auto" | "fyi";
  title: string;
  summary: string;
  recommendation?: string;
  reasoning?: string[];
  policy: string;
  time: string;
  items?: { term: string; cost: string; conv: string }[];
  metrics?: {
    label: string;
    value: string;
    change: string;
    good: boolean;
  }[];
  summary2?: string;
}

const tierConfig: Record<
  Insight["tier"],
  {
    color: "yellow" | "green" | "gray";
    label: string;
    Icon: React.ComponentType<{ size?: number; weight?: "light"; color?: string }>;
    iconColor: string;
    borderColor?: string;
  }
> = {
  input: {
    color: "yellow",
    label: "Needs your input",
    Icon: WarningCircle,
    iconColor: COLORS.yellow,
    borderColor: COLORS.yellow,
  },
  auto: {
    color: "green",
    label: "Auto-handled",
    Icon: CheckCircle,
    iconColor: COLORS.green,
  },
  fyi: {
    color: "gray",
    label: "FYI",
    Icon: Info,
    iconColor: COLORS.textDim,
  },
};

export function InsightFeed() {
  const [expandedReasoning, setExpandedReasoning] = useState<string | null>(
    null,
  );
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});

  const insights: Insight[] = [
    {
      id: "budget",
      tier: "input",
      title: "Budget Reallocation Opportunity",
      summary:
        'Campaign "Brand - Exact" is spending $340/day at $12 CPL. Campaign "Generic - Broad" is capped at $100/day at $8 CPL.',
      recommendation:
        "Move $80/day from Brand \u2192 Generic. Expected impact: ~6 more conversions/week.",
      reasoning: [
        "Generic has maintained $8 CPL even at higher spend (tested $150/day in Jan)",
        "Generic is losing 42% impression share due to budget \u2014 untapped demand",
        "Brand already captures 91% of available impressions",
      ],
      policy: 'Your policy: "Always ask for budget changes"',
      time: "2 hours ago",
    },
    {
      id: "negatives",
      tier: "auto",
      title: "Added 12 Negative Keywords",
      summary:
        "Found search terms burning ~$45/day with 0 conversions over 14 days.",
      items: [
        { term: "free marketing tools", cost: "$12/day", conv: "0" },
        { term: "marketing degree online", cost: "$9/day", conv: "0" },
        { term: "what is digital marketing", cost: "$8/day", conv: "0" },
      ],
      policy: "Per your policy: auto-add negatives \u2713",
      time: "2 hours ago",
    },
    {
      id: "snapshot",
      tier: "fyi",
      title: "Weekly Performance Snapshot",
      metrics: [
        { label: "CPL", value: "$14.20", change: "\u2193 8%", good: true },
        { label: "Spend", value: "$2,840", change: "On pace", good: true },
        { label: "Conversions", value: "200", change: "\u2191 12%", good: true },
      ],
      summary: "Nothing unusual. Your agent is watching.",
      time: "6 hours ago",
      policy: "",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {insights.map((insight) => {
        const tier = tierConfig[insight.tier];
        const isApproved = approved[insight.id];
        const isDismissed = dismissed[insight.id];

        // Tier-specific card styling — minimal, quiet
        const cardStyle: React.CSSProperties = {
          opacity: isDismissed ? 0.5 : 1,
          transition: "opacity 0.15s ease",
          ...(insight.tier === "fyi"
            ? {
                background: "transparent",
                border: "none",
                borderBottom: `1px solid ${COLORS.border}`,
                borderRadius: 0,
                paddingLeft: 0,
                paddingRight: 0,
              }
            : {}),
        };

        return (
          <Card key={insight.id} style={cardStyle}>
            {/* Header row: tier badge + timestamp */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <Badge color={tier.color}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <tier.Icon size={14} weight="light" color={tier.iconColor} />
                  {tier.label}
                </span>
              </Badge>
              <span style={{ fontSize: 12, color: COLORS.textDim }}>
                {insight.time}
              </span>
            </div>

            {/* Title */}
            <h3
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: COLORS.text,
                margin: "0 0 8px 0",
                fontFamily: '"Satoshi", sans-serif',
              }}
            >
              {insight.title}
            </h3>

            {/* Summary */}
            <p
              style={{
                fontSize: 14,
                color: COLORS.textSecondary,
                lineHeight: 1.6,
                margin: 0,
                fontFamily: '"General Sans", sans-serif',
              }}
            >
              {insight.summary}
            </p>

            {/* Recommendation callout */}
            {insight.recommendation && (
              <div
                style={{
                  marginTop: 16,
                  paddingLeft: 16,
                  borderLeft: `1px solid ${COLORS.border}`,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: COLORS.textDim,
                    fontWeight: 500,
                    marginBottom: 4,
                    fontFamily: '"Satoshi", sans-serif',
                  }}
                >
                  Recommendation
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: COLORS.text,
                    lineHeight: 1.5,
                    fontFamily: '"General Sans", sans-serif',
                  }}
                >
                  {insight.recommendation}
                </div>
              </div>
            )}

            {/* Reasoning toggle */}
            {insight.reasoning && (
              <div style={{ marginTop: 12 }}>
                <div
                  onClick={() =>
                    setExpandedReasoning(
                      expandedReasoning === insight.id ? null : insight.id,
                    )
                  }
                  style={{
                    fontSize: 13,
                    color: COLORS.textSecondary,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    userSelect: "none",
                  }}
                >
                  <CaretRight
                    size={14}
                    weight="light"
                    style={{
                      transform:
                        expandedReasoning === insight.id
                          ? "rotate(90deg)"
                          : "rotate(0deg)",
                      transition: "transform 0.15s ease",
                    }}
                  />
                  Why I think this
                </div>
                {expandedReasoning === insight.id && (
                  <div style={{ marginTop: 8, paddingLeft: 4 }}>
                    {insight.reasoning.map((r, i) => (
                      <div
                        key={i}
                        style={{ display: "flex", gap: 8, marginBottom: 8 }}
                      >
                        <span style={{ color: COLORS.textDim, fontSize: 13 }}>
                          {i === insight.reasoning!.length - 1
                            ? "\u2514"
                            : "\u251C"}
                        </span>
                        <span
                          style={{
                            fontSize: 13,
                            color: COLORS.textSecondary,
                            lineHeight: 1.5,
                            fontFamily: '"General Sans", sans-serif',
                          }}
                        >
                          {r}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Negative keyword items list */}
            {insight.items && (
              <div style={{ marginTop: 12 }}>
                {insight.items.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 0",
                      borderBottom:
                        i < insight.items!.length - 1
                          ? `1px solid ${COLORS.border}`
                          : "none",
                      fontSize: 13,
                    }}
                  >
                    <span
                      style={{
                        color: COLORS.text,
                        fontFamily: '"General Sans", sans-serif',
                      }}
                    >
                      &ldquo;{item.term}&rdquo;
                    </span>
                    <div
                      style={{
                        display: "flex",
                        gap: 16,
                        color: COLORS.textSecondary,
                      }}
                    >
                      <span>{item.cost}</span>
                      <span style={{ color: COLORS.red }}>
                        {item.conv} conv
                      </span>
                    </div>
                  </div>
                ))}
                <div
                  style={{
                    fontSize: 12,
                    color: COLORS.textDim,
                    marginTop: 8,
                  }}
                >
                  ...and 9 more
                </div>
              </div>
            )}

            {/* Metrics grid */}
            {insight.metrics && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 12,
                  marginTop: 16,
                }}
              >
                {insight.metrics.map((m) => (
                  <div
                    key={m.label}
                    style={{
                      textAlign: "center",
                      padding: 12,
                      background: COLORS.bg,
                      borderRadius: RADIUS.sharp,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        color: COLORS.textDim,
                        marginBottom: 4,
                        fontFamily: '"General Sans", sans-serif',
                      }}
                    >
                      {m.label}
                    </div>
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color: COLORS.text,
                        fontFamily: '"Satoshi", sans-serif',
                      }}
                    >
                      {m.value}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: m.good ? COLORS.green : COLORS.red,
                        marginTop: 2,
                      }}
                    >
                      {m.change}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Action footer: policy text + buttons */}
            <div
              style={{
                marginTop: 16,
                paddingTop: 12,
                borderTop: `1px solid ${COLORS.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: COLORS.textDim,
                  fontStyle: "italic",
                  fontFamily: '"General Sans", sans-serif',
                }}
              >
                {insight.policy}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                {insight.tier === "input" && !isApproved && !isDismissed && (
                  <>
                    <Button
                      size="sm"
                      onClick={() =>
                        setApproved((p) => ({ ...p, [insight.id]: true }))
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setDismissed((p) => ({ ...p, [insight.id]: true }))
                      }
                    >
                      Dismiss
                    </Button>
                  </>
                )}
                {isApproved && (
                  <Badge color="green">
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <CheckCircle size={12} weight="light" />
                      Approved
                    </span>
                  </Badge>
                )}
                {isDismissed && <Badge color="gray">Dismissed</Badge>}
                {insight.tier === "auto" && (
                  <Button size="sm" variant="ghost">
                    Undo
                  </Button>
                )}
                {insight.tier === "fyi" && (
                  <Button size="sm" variant="ghost">
                    Full report
                  </Button>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
