import { Button } from "~/components/Button";
import { fieldStyle } from "~/components/SettingsComponents";
import { COLORS, MOTION, RADIUS, TYPE } from "~/lib/colors";
import { humanize } from "~/lib/text-format";

export interface SettingsBasicsPanelProps {
  name: string;
  briefing: string;
  schedule: string;
  primaryMetric: string;
  onNameChange: (value: string) => void;
  onScheduleChange: (value: string) => void;
  onPrimaryMetricChange: (value: string) => void;
  onCommitName: () => void;
  onCommitPrimaryMetric: () => void;
  onOpenBriefing: () => void;
}

export function SettingsBasicsPanel({
  name,
  briefing,
  schedule,
  primaryMetric,
  onNameChange,
  onScheduleChange,
  onPrimaryMetricChange,
  onCommitName,
  onCommitPrimaryMetric,
  onOpenBriefing,
}: SettingsBasicsPanelProps) {
  const lineCount = briefing ? briefing.split("\n").length : 0;
  const briefingSummary = briefing ? `${lineCount} line${lineCount === 1 ? "" : "s"}` : "Not set";

  const labelStyle = {
    fontSize: TYPE.scale.sm,
    fontWeight: TYPE.weight.medium,
    color: COLORS.text,
    fontFamily: TYPE.body,
    paddingTop: 8,
  } as const;

  const hintStyle = {
    fontSize: TYPE.scale.xs,
    color: COLORS.textDim,
    marginTop: 2,
  } as const;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr",
        gap: "16px 20px",
        alignItems: "start",
        paddingTop: 8,
      }}
    >
      {/* Name */}
      <div style={labelStyle}>Name</div>
      <input
        className="input"
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        onBlur={onCommitName}
        style={fieldStyle}
      />

      {/* Briefing */}
      <div style={labelStyle}>Briefing</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: TYPE.scale.sm, color: COLORS.textSecondary }}>{briefingSummary}</span>
        <Button variant="secondary" size="sm" onClick={onOpenBriefing}>
          Edit
        </Button>
      </div>

      {/* Schedule */}
      <div style={labelStyle}>Schedule</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {["manual", "hourly", "6hours", "daily", "weekly"].map((value) => (
          <button
            type="button"
            className="pill"
            key={value}
            onClick={() => onScheduleChange(value)}
            style={{
              fontFamily: TYPE.body,
              padding: "5px 12px",
              borderRadius: RADIUS.pill,
              border: `1px solid ${schedule === value ? COLORS.accent : COLORS.border}`,
              background: schedule === value ? COLORS.accentDim : "transparent",
              color: schedule === value ? COLORS.accent : COLORS.textSecondary,
              fontSize: TYPE.scale.xs,
              fontWeight: TYPE.weight.medium,
              cursor: "pointer",
              transition: `all ${MOTION.duration} ${MOTION.ease}`,
            }}
          >
            {humanize(value)}
          </button>
        ))}
      </div>

      {/* Primary metric */}
      <div>
        <div style={labelStyle}>Metric key</div>
        <div style={hintStyle}>Tracked across runs</div>
      </div>
      <input
        className="input"
        value={primaryMetric}
        onChange={(event) => onPrimaryMetricChange(event.target.value)}
        onBlur={onCommitPrimaryMetric}
        placeholder="e.g., qualified_cpa|last_7_days|account"
        style={{ ...fieldStyle, fontFamily: TYPE.mono, fontSize: TYPE.scale.sm }}
      />
    </div>
  );
}
