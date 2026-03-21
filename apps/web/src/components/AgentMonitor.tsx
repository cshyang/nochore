import { useState } from "react";
import { COLORS, RADIUS, getAgentColor } from "~/lib/colors";
import { Badge } from "~/components/Badge";
import { Card } from "~/components/Card";
import {
  TrendUp,
  TrendDown,
  ArrowRight,
  Lightbulb,
} from "@phosphor-icons/react";
import type { Agent } from "~/lib/types";

interface AgentMonitorProps {
  agent: Agent;
}

type TrendDirection = "up" | "down" | "flat";

function TrendIcon({ direction }: { direction: TrendDirection }) {
  switch (direction) {
    case "up":
      return <TrendUp weight="light" size={16} color={COLORS.green} />;
    case "down":
      return <TrendDown weight="light" size={16} color={COLORS.red} />;
    case "flat":
      return <ArrowRight weight="light" size={16} color={COLORS.textDim} />;
  }
}

export function AgentMonitor({ agent }: AgentMonitorProps) {
  const [timeRange, setTimeRange] = useState("7d");
  const agentColor = getAgentColor(agent.id);

  const ranges = [
    { key: "24h", label: "24h" },
    { key: "7d", label: "7 days" },
    { key: "30d", label: "30 days" },
    { key: "90d", label: "90 days" },
  ];

  // Mock data -- in reality, skills define what metrics to surface
  const primaryKpi = {
    label: "Cost per Lead",
    value: "$34.20",
    change: "-12.5%",
    direction: "down" as const,
    favorable: true,
  };

  const secondaryKpis = [
    { label: "Total Spend", value: "$12,480", change: "+8.2%", direction: "up" as const, favorable: false },
    { label: "Conversions", value: "365", change: "+22.1%", direction: "up" as const, favorable: true },
    { label: "Wasted Spend", value: "$1,840", change: "-31.4%", direction: "down" as const, favorable: true },
  ];

  const keywordRows = [
    { keyword: "enterprise software demo", clicks: 482, cpl: "$18.40", conv: 26, score: 9, trend: "up" as TrendDirection },
    { keyword: "saas pricing calculator", clicks: 341, cpl: "$22.10", conv: 15, score: 8, trend: "up" as TrendDirection },
    { keyword: "best crm for startups", clicks: 298, cpl: "$31.50", conv: 9, score: 7, trend: "flat" as TrendDirection },
    { keyword: "free project management", clicks: 512, cpl: "$48.20", conv: 4, score: 4, trend: "down" as TrendDirection },
    { keyword: "how to manage employees", clicks: 189, cpl: "$67.30", conv: 1, score: 2, trend: "down" as TrendDirection },
  ];

  // Mini sparkline (simplified bar chart)
  const spendByDay = [68, 72, 55, 80, 92, 78, 85, 70, 95, 88, 76, 82, 90, 73];

  function changeColor(direction: TrendDirection, favorable: boolean): string {
    if (direction === "flat") return COLORS.textDim;
    if (favorable) return COLORS.green;
    return COLORS.textSecondary;
  }

  return (
    <div>
      {/* Header: what this monitor covers + time range */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              color: COLORS.textDim,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Monitoring {"\u00B7"} powered by skills
          </div>
          <div style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 4 }}>
            Data from <Badge color="accent">Google Ads</Badge> {"\u00B7"} Last synced 12 min ago
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 4,
            background: COLORS.surface,
            padding: 4,
            borderRadius: RADIUS.button,
          }}
        >
          {ranges.map((r) => (
            <button
              key={r.key}
              onClick={() => setTimeRange(r.key)}
              style={{
                padding: "4px 12px",
                border: "none",
                borderRadius: RADIUS.button,
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 600,
                background: timeRange === r.key ? COLORS.surfaceHover : "transparent",
                color: timeRange === r.key ? COLORS.text : COLORS.textDim,
                transition: "all 0.15s ease",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI section: flat layout, primary + secondaries */}
      <div style={{ marginBottom: 24 }}>
        {/* Primary KPI */}
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 12,
              color: COLORS.textDim,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 4,
            }}
          >
            {primaryKpi.label}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span
              style={{
                fontSize: 32,
                fontWeight: 700,
                fontFamily: '"Satoshi", sans-serif',
                color: COLORS.text,
              }}
            >
              {primaryKpi.value}
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 13,
                fontWeight: 600,
                color: changeColor(primaryKpi.direction, primaryKpi.favorable),
              }}
            >
              <TrendIcon direction={primaryKpi.direction} />
              {primaryKpi.change} vs prev period
            </span>
          </div>
        </div>

        {/* Secondary KPIs */}
        <div
          style={{
            display: "flex",
            gap: 0,
          }}
        >
          {secondaryKpis.map((kpi, i) => (
            <div
              key={kpi.label}
              style={{
                flex: 1,
                paddingLeft: i > 0 ? 20 : 0,
                paddingRight: i < secondaryKpis.length - 1 ? 20 : 0,
                borderLeft: i > 0 ? `1px solid ${COLORS.border}` : "none",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: COLORS.textDim,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 4,
                }}
              >
                {kpi.label}
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  fontFamily: '"Satoshi", sans-serif',
                  color: COLORS.text,
                  marginBottom: 2,
                }}
              >
                {kpi.value}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                  color: changeColor(kpi.direction, kpi.favorable),
                }}
              >
                <TrendIcon direction={kpi.direction} />
                {kpi.change}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Spend trend mini-chart */}
      <Card style={{ marginBottom: 20, padding: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              fontFamily: '"Satoshi", sans-serif',
              color: COLORS.text,
            }}
          >
            Daily Spend Trend
          </div>
          <Badge color="gray">Last {timeRange}</Badge>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}>
          {spendByDay.map((val, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${val}%`,
                borderRadius: `${RADIUS.sharp}px ${RADIUS.sharp}px 0 0`,
                background:
                  i === spendByDay.length - 1
                    ? COLORS.textDim
                    : COLORS.border,
                transition: "height 0.15s ease",
              }}
            />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          <span style={{ fontSize: 12, color: COLORS.textDim }}>Mar 7</span>
          <span style={{ fontSize: 12, color: COLORS.textDim }}>Mar 20</span>
        </div>
      </Card>

      {/* Keywords table */}
      <div
        style={{
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.sharp,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 16px",
            borderBottom: `1px solid ${COLORS.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              fontFamily: '"Satoshi", sans-serif',
              color: COLORS.text,
            }}
          >
            Top Keywords by Spend
          </div>
          <span style={{ fontSize: 12, color: COLORS.textDim }}>
            Sorted by cost-per-lead
          </span>
        </div>
        {/* Table header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 0.8fr 0.8fr 0.8fr 0.6fr 0.5fr",
            padding: "8px 16px",
            borderBottom: `1px solid ${COLORS.border}`,
            fontSize: 12,
            color: COLORS.textDim,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          <span>Keyword</span>
          <span style={{ textAlign: "right" }}>Clicks</span>
          <span style={{ textAlign: "right" }}>CPL</span>
          <span style={{ textAlign: "right" }}>Conv.</span>
          <span style={{ textAlign: "right" }}>QS</span>
          <span style={{ textAlign: "center" }}>Trend</span>
        </div>
        {/* Table rows */}
        {keywordRows.map((row, i) => {
          const isWaste = row.score <= 4;
          return (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 0.8fr 0.8fr 0.8fr 0.6fr 0.5fr",
                padding: "10px 16px",
                borderBottom:
                  i < keywordRows.length - 1
                    ? `1px solid ${COLORS.border}`
                    : "none",
                background: isWaste ? COLORS.redSubtle : "transparent",
                fontSize: 13,
                alignItems: "center",
              }}
            >
              <span style={{ color: COLORS.text, fontWeight: 600 }}>
                {row.keyword}
                {isWaste && (
                  <span style={{ marginLeft: 8 }}>
                    <Badge color="red">waste</Badge>
                  </span>
                )}
              </span>
              <span style={{ textAlign: "right", color: COLORS.textSecondary }}>
                {row.clicks}
              </span>
              <span
                style={{
                  textAlign: "right",
                  color: isWaste ? COLORS.red : COLORS.text,
                  fontWeight: 600,
                }}
              >
                {row.cpl}
              </span>
              <span style={{ textAlign: "right", color: COLORS.textSecondary }}>
                {row.conv}
              </span>
              <span style={{ textAlign: "right" }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 24,
                    height: 24,
                    borderRadius: RADIUS.pill,
                    fontSize: 12,
                    fontWeight: 700,
                    lineHeight: "24px",
                    textAlign: "center",
                    background:
                      row.score >= 7
                        ? COLORS.greenDim
                        : row.score >= 5
                          ? COLORS.yellowDim
                          : COLORS.redDim,
                    color:
                      row.score >= 7
                        ? COLORS.green
                        : row.score >= 5
                          ? COLORS.yellow
                          : COLORS.red,
                  }}
                >
                  {row.score}
                </span>
              </span>
              <span
                style={{
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <TrendIcon direction={row.trend} />
              </span>
            </div>
          );
        })}
      </div>

      {/* Agent insight callout */}
      <div
        style={{
          marginTop: 20,
          borderTop: `1px solid ${COLORS.border}`,
          paddingTop: 20,
        }}
      >
        <div style={{ display: "flex", gap: 12 }}>
          <Lightbulb
            weight="light"
            size={18}
            color={COLORS.textDim}
            style={{ flexShrink: 0, marginTop: 1 }}
          />
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                fontFamily: '"Satoshi", sans-serif',
                color: COLORS.text,
                marginBottom: 4,
              }}
            >
              Agent Insight
            </div>
            <div
              style={{
                fontSize: 13,
                color: COLORS.textSecondary,
                lineHeight: 1.6,
              }}
            >
              2 keywords flagged as waste are consuming 14.7% of budget but
              producing only 3.4% of conversions. "free project management" and
              "how to manage employees" have been underperforming for 12 days.
              The agent has already raised this in the Feed — pending your
              approval to add them as negative keywords.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
