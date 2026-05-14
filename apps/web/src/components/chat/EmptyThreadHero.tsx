import type { RefObject } from "react";
import { ChatInput } from "~/components/chat/ChatInput";
import { getSuggestionsForAgent } from "~/lib/chat-suggestions";
import { COLORS, MOTION, RADIUS, SPACE, TYPE } from "~/lib/colors";
import type { AgentView } from "~/lib/types";

interface EmptyThreadHeroProps {
  agent: AgentView;
  inputValue: string;
  onInputChange: (v: string) => void;
  onSubmit: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  isLoading: boolean;
  /** Called when a suggestion card is clicked — passes the suggestion's `title` as the message text. */
  onPickSuggestion: (text: string) => void;
}

export function EmptyThreadHero({
  agent,
  inputValue,
  onInputChange,
  onSubmit,
  onKeyDown,
  inputRef,
  isLoading,
  onPickSuggestion,
}: EmptyThreadHeroProps) {
  const suggestions = getSuggestionsForAgent({ skills: agent.skills });
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: SPACE[5],
        maxWidth: 580,
        margin: "0 auto",
        padding: `0 ${SPACE[4]}px`,
      }}
    >
      <h2
        style={{
          fontSize: TYPE.scale.lg,
          fontWeight: TYPE.weight.semibold,
          fontFamily: TYPE.display,
          color: COLORS.text,
          letterSpacing: TYPE.tracking.tight,
          margin: 0,
          textAlign: "center",
        }}
      >
        What should we look at?
      </h2>
      <div style={{ width: "100%" }}>
        <ChatInput
          value={inputValue}
          onChange={onInputChange}
          onSubmit={onSubmit}
          onKeyDown={onKeyDown}
          inputRef={inputRef}
          isLoading={isLoading}
          variant="hero"
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: SPACE[2],
          width: "100%",
        }}
      >
        {suggestions.slice(0, 4).map((s) => (
          <button
            key={s.title}
            type="button"
            onClick={() => onPickSuggestion(s.title)}
            style={{
              textAlign: "left",
              background: COLORS.bgRaised,
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.lg,
              padding: `${SPACE[3]}px ${SPACE[3]}px`,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: `border-color ${MOTION.duration} ${MOTION.ease}`,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = COLORS.accent)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
          >
            <div style={{ fontSize: 16, marginBottom: 4 }} aria-hidden>
              {s.icon}
            </div>
            <div
              style={{
                fontSize: TYPE.scale.sm,
                color: COLORS.text,
                fontWeight: TYPE.weight.medium,
                lineHeight: TYPE.leading.snug,
                marginBottom: 2,
              }}
            >
              {s.title}
            </div>
            <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim }}>{s.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
