import { BookOpen, CaretDown, CaretRight } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownStyles } from "~/components/run/styles";
import { COLORS, MOTION, RADIUS, TYPE } from "~/lib/colors";
import type { ConversationStateView, LessonView } from "~/lib/types";

const SCOPE_CATEGORIES = [
  { key: "preferences", label: "Preferences", scopes: ["memory:preference"] },
  { key: "corrections", label: "Corrections", scopes: ["memory:correction"] },
  { key: "decisions", label: "Decisions", scopes: ["memory:decision"] },
  { key: "run-insights", label: "Run insights", scopes: ["memory:insight"] },
] as const;

type CategoryKey = (typeof SCOPE_CATEGORIES)[number]["key"];

interface MemoryDossierProps {
  conversation?: ConversationStateView;
}

export function MemoryDossier({ conversation }: MemoryDossierProps) {
  const durable = conversation?.lessons ?? [];
  const episodic = conversation?.episodicLessons ?? [];
  const grouped = useMemo(() => groupByCategory(durable), [durable]);

  return (
    <div style={panelStyle}>
      <header style={headerStyle}>
        <div style={iconChipStyle}>
          <BookOpen size={20} weight="bold" color={COLORS.accent} />
        </div>
        <div>
          <div style={titleStyle}>Memory dossier</div>
          <div style={subtitleStyle}>
            Relationship summary, distilled run learnings, and context the agent can carry forward.
          </div>
        </div>
      </header>

      <SummaryStrip grouped={grouped} episodicCount={episodic.length} mostRecent={findMostRecent(durable)} />

      {conversation?.checkpointSummary ? (
        <section style={sectionStyle}>
          <SectionLabel>Relationship summary</SectionLabel>
          <div style={summaryCardStyle}>
            <div style={metaLineStyle}>
              Covers {conversation.checkpointMessageCount} earlier
              {conversation.checkpointMessageCount === 1 ? " message" : " messages"}
            </div>
            <div style={bodyTextStyle}>{conversation.checkpointSummary}</div>
          </div>
        </section>
      ) : null}

      {durable.length === 0 ? (
        <section style={sectionStyle}>
          <SectionLabel>Durable memory</SectionLabel>
          <div style={emptyStateStyle}>
            No durable memory yet. As this agent completes runs and learns stable preferences, corrections, or decisions,
            they will show up here and feed future chat context.
          </div>
        </section>
      ) : (
        SCOPE_CATEGORIES.map((category) => {
          const items = grouped[category.key];
          if (items.length === 0) return null;
          return (
            <section key={category.key} style={sectionStyle}>
              <SectionLabel>
                {category.label}{" "}
                <span style={{ color: COLORS.textDim, fontWeight: TYPE.weight.regular }}>· {items.length}</span>
              </SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {items.map((lesson) => (
                  <LessonCard key={lesson.id} lesson={lesson} />
                ))}
              </div>
            </section>
          );
        })
      )}

      {episodic.length > 0 ? <EpisodicSection lessons={episodic} /> : null}
    </div>
  );
}

function SummaryStrip({
  grouped,
  episodicCount,
  mostRecent,
}: {
  grouped: Record<CategoryKey, LessonView[]>;
  episodicCount: number;
  mostRecent: LessonView | null;
}) {
  const parts = SCOPE_CATEGORIES.map((category) => {
    const count = grouped[category.key].length;
    return count > 0 ? `${count} ${category.label.toLowerCase()}` : null;
  }).filter((part): part is string => part != null);

  if (episodicCount > 0) {
    parts.push(`${episodicCount} recent ${episodicCount === 1 ? "entry" : "entries"}`);
  }

  if (parts.length === 0) return null;

  return (
    <div style={summaryStripStyle}>
      <span style={{ color: COLORS.textSecondary }}>{parts.join(" · ")}</span>
      {mostRecent ? (
        <span style={{ color: COLORS.textDim }}>
          {" · Latest: "}
          <span style={{ color: COLORS.textSecondary }}>
            {extractTitle(mostRecent)}
          </span>
          {` · ${formatRelative(mostRecent.createdAt)}`}
        </span>
      ) : null}
    </div>
  );
}

function LessonCard({ lesson, showExpiry = false }: { lesson: LessonView; showExpiry?: boolean }) {
  const [open, setOpen] = useState(false);
  const bodyId = `lesson-body-${lesson.id}`;
  const title = extractTitle(lesson);
  const age = formatRelative(lesson.createdAt);
  const expiry = showExpiry && lesson.expiresAt ? formatExpiry(lesson.expiresAt) : null;

  return (
    <div style={lessonRowStyle}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={bodyId}
        style={{ ...lessonButtonStyle, alignItems: open ? "flex-start" : "center" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = COLORS.surfaceHover;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            color: COLORS.textDim,
            marginTop: open ? 4 : 0,
          }}
        >
          {open ? <CaretDown size={12} weight="bold" /> : <CaretRight size={12} weight="bold" />}
        </span>
        <span
          style={{
            fontSize: TYPE.scale.sm,
            color: COLORS.textSecondary,
            flex: 1,
            minWidth: 0,
            overflow: open ? "visible" : "hidden",
            textOverflow: open ? "clip" : "ellipsis",
            whiteSpace: open ? "pre-wrap" : "nowrap",
            wordBreak: open ? "break-word" : "normal",
            lineHeight: open ? TYPE.leading.normal : undefined,
          }}
        >
          {title}
        </span>
        {!open && <span style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim }}>{age}</span>}
        {!open && expiry ? <span style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim }}>{expiry}</span> : null}
      </button>

      {open ? (
        <div id={bodyId} style={lessonBodyStyle}>
          {title !== lesson.content ? (
            <div className="run-report-md" style={fullContentStyle}>
              <style>{markdownStyles}</style>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{lesson.content}</ReactMarkdown>
            </div>
          ) : null}
          <div style={lessonMetaRowStyle}>
            <span>{humanScope(lesson.scope)}</span>
            <span>{capitalize(lesson.confidence)} confidence</span>
            <span>Recorded {age}</span>
            {expiry ? <span>{expiry}</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EpisodicSection({ lessons }: { lessons: LessonView[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section style={sectionStyle}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={episodicToggleStyle}
      >
        <span aria-hidden style={{ display: "inline-flex", color: COLORS.textDim }}>
          {open ? <CaretDown size={12} weight="bold" /> : <CaretRight size={12} weight="bold" />}
        </span>
        <span style={{ ...sectionLabelStyle, marginBottom: 0 }}>Recent activity</span>
        <span style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim, fontWeight: TYPE.weight.regular }}>
          · {lessons.length} short-lived
        </span>
      </button>
      {open ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {lessons.map((lesson) => (
            <LessonCard key={lesson.id} lesson={lesson} showExpiry />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={sectionLabelStyle}>{children}</div>;
}

function groupByCategory(lessons: LessonView[]): Record<CategoryKey, LessonView[]> {
  const out: Record<CategoryKey, LessonView[]> = {
    preferences: [],
    corrections: [],
    decisions: [],
    "run-insights": [],
  };
  for (const lesson of lessons) {
    for (const category of SCOPE_CATEGORIES) {
      if ((category.scopes as readonly string[]).includes(lesson.scope)) {
        out[category.key].push(lesson);
        break;
      }
    }
  }
  return out;
}

function findMostRecent(lessons: LessonView[]): LessonView | null {
  if (lessons.length === 0) return null;
  return [...lessons].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

function extractTitle(lesson: LessonView): string {
  const firstLine = lesson.content.split("\n").find((line) => line.trim().length > 0)?.trim() ?? lesson.content;
  const stripped = firstLine.replace(/^#+\s*/, "");
  return stripped.length > 140 ? `${stripped.slice(0, 140)}…` : stripped;
}

function humanScope(scope: string): string {
  const found = SCOPE_CATEGORIES.find((category) => (category.scopes as readonly string[]).includes(scope));
  if (found) return found.label;
  if (scope === "episode:no-finding") return "No finding";
  if (scope === "episode:attempted") return "Attempted";
  return scope;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

function formatExpiry(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "expired";
  const hours = Math.round(diff / 3_600_000);
  if (hours < 24) return `expires in ${hours}h`;
  const days = Math.round(hours / 24);
  return `expires in ${days}d`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const panelStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 20,
  padding: "8px 0 24px",
  width: "100%",
  maxWidth: 760,
};

const headerStyle = {
  display: "flex",
  alignItems: "center",
  gap: 14,
};

const iconChipStyle = {
  width: 48,
  height: 48,
  borderRadius: RADIUS.lg,
  background: COLORS.accentDim,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const titleStyle = {
  fontSize: TYPE.scale.md,
  fontWeight: TYPE.weight.semibold,
  color: COLORS.text,
  fontFamily: TYPE.display,
  marginBottom: 4,
};

const subtitleStyle = {
  fontSize: TYPE.scale.sm,
  color: COLORS.textSecondary,
  lineHeight: TYPE.leading.normal,
  maxWidth: 560,
};

const summaryStripStyle = {
  fontSize: TYPE.scale.sm,
  lineHeight: TYPE.leading.normal,
  color: COLORS.textSecondary,
};

const sectionStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 10,
};

const sectionLabelStyle = {
  fontSize: TYPE.scale.xs,
  fontWeight: TYPE.weight.semibold,
  color: COLORS.textDim,
  textTransform: "uppercase" as const,
  letterSpacing: TYPE.tracking.wide,
  marginBottom: 2,
};

const summaryCardStyle = {
  borderRadius: RADIUS.sm,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.surface,
  padding: 14,
};

const metaLineStyle = {
  fontSize: TYPE.scale.xs,
  color: COLORS.textDim,
  marginBottom: 8,
};

const bodyTextStyle = {
  fontSize: TYPE.scale.sm,
  color: COLORS.textSecondary,
  lineHeight: TYPE.leading.normal,
  whiteSpace: "pre-wrap" as const,
};

const emptyStateStyle = {
  fontSize: TYPE.scale.sm,
  color: COLORS.textSecondary,
  lineHeight: TYPE.leading.normal,
  padding: "20px 14px",
  border: `1px dashed ${COLORS.border}`,
  borderRadius: RADIUS.sm,
};

const lessonRowStyle = {
  background: COLORS.surface,
  border: `1px solid ${COLORS.border}`,
  borderRadius: RADIUS.sm,
  overflow: "hidden" as const,
};

const lessonButtonStyle = {
  display: "flex",
  gap: 10,
  padding: "10px 14px",
  width: "100%",
  background: "transparent",
  border: "none",
  color: "inherit",
  font: "inherit",
  textAlign: "left" as const,
  cursor: "pointer",
  minWidth: 0,
  transition: `background ${MOTION.duration} ${MOTION.ease}`,
};

const lessonBodyStyle = {
  padding: "0 14px 14px 36px",
  display: "flex",
  flexDirection: "column" as const,
  gap: 10,
};

const fullContentStyle = {
  paddingTop: 10,
  borderTop: `1px solid ${COLORS.border}`,
};

const lessonMetaRowStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 10,
  fontSize: TYPE.scale.xs,
  color: COLORS.textDim,
};

const episodicToggleStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  background: "transparent",
  border: "none",
  padding: 0,
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
  textAlign: "left" as const,
};
