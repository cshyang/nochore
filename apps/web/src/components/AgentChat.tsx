import { useState, useEffect, useRef } from "react";
import { COLORS, RADIUS, getAgentColor } from "~/lib/colors";
import { Button } from "~/components/Button";
import { Sparkle, CircleNotch } from "@phosphor-icons/react";
import { sendChat, getChatHistory } from "~/server/chat";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

interface AgentChatProps {
  agentId: string;
  projectId: string;
}

export function AgentChat({ agentId, projectId }: AgentChatProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load chat history on mount
  useEffect(() => {
    getChatHistory({ data: { agentId, projectId, limit: 50 } })
      .then((history) => {
        setMessages(
          (history as Array<{ id: string; role: string; content: string; createdAt: string | number }>).map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            createdAt: new Date(m.createdAt),
          })),
        );
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [agentId, projectId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const result = await sendChat({
        data: { agentId, projectId, message: userMsg.content },
      });
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: (result as { response: string }).response,
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Sorry, something went wrong. Please try again.",
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSending(false);
    }
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
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          paddingBottom: 16,
        }}
      >
        {loading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: 32,
              color: COLORS.textDim,
              fontSize: 13,
            }}
          >
            <CircleNotch
              size={16}
              weight="light"
              style={{ animation: "spin 1s linear infinite" }}
            />
            Loading conversation...
          </div>
        ) : messages.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 32,
              color: COLORS.textDim,
              fontSize: 13,
            }}
          >
            No messages yet. Start a conversation with your agent.
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: "flex",
                justifyContent:
                  msg.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  maxWidth: "80%",
                  padding: 16,
                  borderRadius: RADIUS.sharp,
                  background:
                    msg.role === "user"
                      ? COLORS.surfaceHover
                      : COLORS.surface,
                  border: `1px solid ${COLORS.border}`,
                  borderLeft: `1px solid ${COLORS.border}`,
                  color: COLORS.text,
                  fontSize: 14,
                  lineHeight: 1.6,
                }}
              >
                {msg.role === "assistant" && (
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
                      Agent
                    </span>
                  </div>
                )}
                <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
              </div>
            </div>
          ))
        )}

        {/* Sending indicator */}
        {sending && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-start",
            }}
          >
            <div
              style={{
                padding: 16,
                borderRadius: RADIUS.sharp,
                background: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: COLORS.textDim,
                fontSize: 13,
              }}
            >
              <CircleNotch
                size={14}
                weight="light"
                style={{ animation: "spin 1s linear infinite" }}
              />
              Thinking...
            </div>
          </div>
        )}
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
            style={{
              flexShrink: 0,
              borderRadius: RADIUS.button,
              opacity: sending ? 0.5 : 1,
              pointerEvents: sending ? "none" : "auto",
            }}
          >
            {sending ? "Sending..." : "Send"}
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
          Agent has access to: workspace data, analysis tools, memory, your
          policies
        </div>
      </div>

      {/* Keyframe animation for spinner */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
