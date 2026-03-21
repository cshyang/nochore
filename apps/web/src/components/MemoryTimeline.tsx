import { COLORS, RADIUS, getAgentColor } from "~/lib/colors";
import { Badge } from "~/components/Badge";
import { Button } from "~/components/Button";
import { Card } from "~/components/Card";
import { ProgressBar } from "~/components/ProgressBar";
import {
  ShieldCheck,
  Bell,
  Lightbulb,
  Flask,
  CheckCircle,
} from "@phosphor-icons/react";

interface MemoryItem {
  type: "lesson" | "experiment" | "outcome";
  date: string;
  title: string;
  body: string;
  evidence?: string;
  verdict?: { success: boolean; label: string };
}

interface MemoryGroup {
  week: string;
  items: MemoryItem[];
}

const ICON_MAP = {
  lesson: Lightbulb,
  experiment: Flask,
  outcome: CheckCircle,
} as const;

const DOT_COLORS: Record<MemoryItem["type"], string> = {
  lesson: COLORS.accent,
  experiment: COLORS.blue,
  outcome: COLORS.green,
};

function getTrustColor(value: number): string {
  if (value >= 80) return COLORS.green;
  if (value >= 60) return COLORS.yellow;
  return COLORS.textDim;
}

export function MemoryTimeline() {
  const trustScore = 78;

  const events: MemoryGroup[] = [
    {
      week: "This week",
      items: [
        {
          type: "lesson",
          date: "Mar 18",
          title: "Weekend budgets don't convert",
          body: "Weekend budget increases on Generic don't convert \u2014 CPL rises 40% on Sat/Sun. Now excluding weekends from budget recommendations.",
          evidence: "Experiment #12 (Mar 8\u201315)",
        },
        {
          type: "experiment",
          date: "Mar 15",
          title: "Tested +$50/day on Generic weekends",
          body: "Result: CPL rose from $8 \u2192 $11.20",
          verdict: { success: false, label: "Not effective" },
        },
      ],
    },
    {
      week: "Last week",
      items: [
        {
          type: "lesson",
          date: "Mar 10",
          title: '"Free" = non-buyer intent',
          body: 'Search terms containing "free" almost always indicate non-buyer intent. Now flagging "free" terms at higher priority.',
          evidence: '23 "free" terms analyzed, 0 conversions',
        },
        {
          type: "outcome",
          date: "Mar 9",
          title: "Budget reallocation succeeded",
          body: "Moved $80/day from Brand \u2192 Generic. Result: +8 conversions/week, CPL held at $8.40",
          verdict: { success: true, label: "Kept change" },
        },
      ],
    },
    {
      week: "Week of Mar 1",
      items: [
        {
          type: "lesson",
          date: "Mar 4",
          title: "Broad match needs tighter negatives",
          body: "Broad match campaigns generate 3x more irrelevant terms than phrase match.",
          evidence: "142 search terms analyzed",
        },
        {
          type: "outcome",
          date: "Mar 2",
          title: "First negative keyword batch worked",
          body: "Removed 18 wasteful terms. Saved $32/day, no impact on conversions.",
          verdict: { success: true, label: "Successful" },
        },
      ],
    },
  ];

  const trustColor = getTrustColor(trustScore);

  return (
    <div>
      {/* Trust score */}
      <Card style={{ marginBottom: 20 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ShieldCheck
              size={20}
              weight="duotone"
              color={trustColor}
            />
            <div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: COLORS.text,
                  fontFamily: '"Satoshi", sans-serif',
                }}
              >
                Agent Confidence
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: COLORS.textSecondary,
                  marginTop: 2,
                }}
              >
                14 lessons learned over 6 weeks
              </div>
            </div>
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: trustColor,
              fontFamily: '"Satoshi", sans-serif',
            }}
          >
            {trustScore}%
          </div>
        </div>
        <ProgressBar value={trustScore} color={trustColor} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 12,
            marginTop: 16,
          }}
        >
          {[
            { val: "23", label: "Actions proposed" },
            { val: "91%", label: "Approval rate" },
            { val: "82%", label: "Positive outcomes" },
          ].map((m) => (
            <div key={m.label} style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: COLORS.text,
                  fontFamily: '"Satoshi", sans-serif',
                }}
              >
                {m.val}
              </div>
              <div style={{ fontSize: 12, color: COLORS.textSecondary }}>
                {m.label}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Trust upgrade — invitation, not alert */}
      <Card
        style={{
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <Bell
            size={18}
            weight="light"
            color={COLORS.textSecondary}
            style={{ flexShrink: 0, marginTop: 2 }}
          />
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: COLORS.text,
                marginBottom: 4,
                fontFamily: '"Satoshi", sans-serif',
              }}
            >
              Your agent has earned more trust
            </div>
            <div
              style={{
                fontSize: 13,
                color: COLORS.textSecondary,
                lineHeight: 1.5,
                marginBottom: 12,
              }}
            >
              You approved 21 of 23 budget recommendations (91%), and 18 had
              positive outcomes. Let it handle small changes (under $50/day)
              automatically?
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button size="sm" variant="secondary">Yes, increase autonomy</Button>
              <Button size="sm" variant="ghost">
                Not yet
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Timeline */}
      {events.map((group) => (
        <div key={group.week} style={{ marginBottom: 24 }}>
          <div
            style={{
              fontSize: 12,
              color: COLORS.textDim,
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 12,
              paddingLeft: 20,
              fontFamily: '"Satoshi", sans-serif',
            }}
          >
            {group.week}
          </div>
          <div style={{ position: "relative" }}>
            <div
              style={{
                position: "absolute",
                left: 7,
                top: 8,
                bottom: 8,
                width: 1,
                background: COLORS.border,
              }}
            />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {group.items.map((item, i) => {
                const Icon = ICON_MAP[item.type];
                const dotColor = DOT_COLORS[item.type];

                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: 16,
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: RADIUS.pill,
                        background: COLORS.surface,
                        border: `2px solid ${dotColor}`,
                        flexShrink: 0,
                        marginTop: 4,
                        zIndex: 1,
                      }}
                    />
                    <Card style={{ flex: 1, padding: 16 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 8,
                        }}
                      >
                        <Icon
                          size={16}
                          weight="light"
                          color={dotColor}
                          style={{ flexShrink: 0 }}
                        />
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: COLORS.text,
                          }}
                        >
                          {item.title}
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            color: COLORS.textDim,
                            marginLeft: "auto",
                            flexShrink: 0,
                          }}
                        >
                          {item.date}
                        </span>
                      </div>
                      <p
                        style={{
                          fontSize: 13,
                          color: COLORS.textSecondary,
                          lineHeight: 1.5,
                          margin: 0,
                        }}
                      >
                        {item.body}
                      </p>
                      {item.evidence && (
                        <div
                          style={{
                            fontSize: 12,
                            color: COLORS.textDim,
                            marginTop: 8,
                          }}
                        >
                          Evidence: {item.evidence}
                        </div>
                      )}
                      {item.verdict && (
                        <div style={{ marginTop: 8 }}>
                          <Badge
                            color={item.verdict.success ? "green" : "red"}
                          >
                            {item.verdict.success ? "\u2713" : "\u2717"}{" "}
                            {item.verdict.label}
                          </Badge>
                        </div>
                      )}
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
