import { useState } from "react";
import { COLORS, RADIUS, getAgentColor } from "~/lib/colors";
import { Button } from "~/components/Button";
import { Sparkle } from "@phosphor-icons/react";

interface ChatMessage {
  from: "agent" | "user";
  text: string;
  followUp?: string;
}

const agentColor = getAgentColor("ad-guardian");

export function AgentChat() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      from: "agent",
      text: "I noticed a budget reallocation opportunity. Campaign \"Generic - Broad\" could use more budget. Want me to walk you through my reasoning?",
    },
    {
      from: "user",
      text: "Why do you think Generic will convert better with more budget?",
    },
    {
      from: "agent",
      text: "Three reasons:\n\n1. Historical data shows Generic maintains its $8 CPL even during high-spend periods (we tested $150/day in January).\n\n2. Impression share data shows 42% of available searches aren't being shown \u2014 that's untapped demand, not just more spend on the same audience.\n\n3. The search terms feeding Generic are high intent (\"buy marketing software\", \"marketing tool pricing\") \u2014 these aren't window shoppers.",
      followUp:
        "Want me to run this as a 7-day experiment instead of a permanent change?",
    },
  ]);

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages((prev) => [...prev, { from: "user", text: input }]);
    setInput("");
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          from: "agent",
          text: "Good thinking. I'll set up a 7-day experiment: increase Generic budget by $80/day starting Monday. I'll track CPL, conversion volume, and impression share daily. If CPL rises above $10, I'll pause the experiment early.\n\nI'll send you a mid-week check-in on Wednesday and a full report next Monday.",
          followUp: "Should I go ahead and set this up?",
        },
      ]);
    }, 800);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 180px)",
      }}
    >
      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          paddingBottom: 16,
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent:
                msg.from === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "80%",
                padding: 16,
                borderRadius: RADIUS.sharp,
                background:
                  msg.from === "user"
                    ? COLORS.surfaceHover
                    : COLORS.surface,
                border:
                  msg.from === "agent"
                    ? `1px solid ${COLORS.border}`
                    : `1px solid ${COLORS.border}`,
                borderLeft: `1px solid ${COLORS.border}`,
                color: COLORS.text,
                fontSize: 14,
                lineHeight: 1.6,
              }}
            >
              {msg.from === "agent" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 8,
                  }}
                >
                  <Sparkle
                    size={12}
                    weight="light"
                    color={COLORS.textDim}
                  />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: COLORS.textSecondary,
                      fontFamily: '"Satoshi", sans-serif',
                    }}
                  >
                    Ad Spend Guardian
                  </span>
                </div>
              )}
              <div style={{ whiteSpace: "pre-wrap" }}>{msg.text}</div>
              {msg.followUp && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    background: "transparent",
                    borderLeft: `1px solid ${COLORS.border}`,
                    paddingLeft: 12,
                    fontSize: 13,
                    color: COLORS.textSecondary,
                  }}
                >
                  {msg.followUp}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div
        style={{ padding: "12px 0 0", borderTop: `1px solid ${COLORS.border}` }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.sharp,
            padding: "10px 14px",
            alignItems: "flex-end",
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask your agent anything..."
            rows={1}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              color: COLORS.text,
              fontSize: 14,
              resize: "none",
              outline: "none",
              fontFamily: "inherit",
              lineHeight: 1.5,
            }}
          />
          <Button
            size="sm"
            onClick={handleSend}
            style={{ flexShrink: 0, borderRadius: RADIUS.button }}
          >
            Send
          </Button>
        </div>
        <div
          style={{
            fontSize: 12,
            color: COLORS.textDim,
            marginTop: 8,
            textAlign: "center",
          }}
        >
          Agent has access to: campaign data, search terms, memory (14 lessons),
          your policies
        </div>
      </div>
    </div>
  );
}
