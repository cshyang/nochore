/**
 * SetupWorkspace — 2-panel agent setup flow.
 *
 * Left (~40%): conversational chat — intent + refinements
 * Right (~60%): emerging blueprint — directly interactive
 *
 * Flow:
 *   1. User types intent → generateBlueprint
 *   2. If clarifyingQuestion → show in chat, wait for answer → generateBlueprint again
 *   3. Blueprint renders right panel — user adjusts via toggles OR chat
 *   4. "Launch agent →" creates project + agent, navigates to agent detail
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { X, PaperPlaneTilt, ArrowRight } from "@phosphor-icons/react";
import { COLORS } from "~/lib/colors";
import type { ProjectView } from "~/lib/types";
import { Badge } from "~/components/Badge";
import { Button } from "~/components/Button";
import { Card } from "~/components/Card";
import { BlueprintSchema } from "~/routes/api.blueprint";
import type { Blueprint } from "~/routes/api.blueprint";
import { createAgent } from "~/server/agents";
import { createProject } from "~/server/projects";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEMPLATES = [
  { label: "Ad Monitor", intent: "Monitor Google Ads for budget waste and search term issues" },
  { label: "E-commerce Tracker", intent: "Track Shopify orders, revenue trends, and inventory alerts" },
  { label: "Content Scheduler", intent: "Schedule and publish social media content across platforms" },
  { label: "Competitor Tracker", intent: "Watch competitor pricing, new products, and market activity" },
];

const PROVIDER_NAMES: Record<string, string> = {
  googleads: "Google Ads",
  slack: "Slack",
  meta: "Meta Ads",
  ga4: "Google Analytics",
  shopify: "Shopify",
  stripe: "Stripe",
  github: "GitHub",
};

const SCHEDULES = [
  { value: "hourly", label: "Hourly" },
  { value: "6hours", label: "6h" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "manual", label: "Manual" },
] as const;


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SetupWorkspaceProps {
  projectId?: string;
  project?: ProjectView | null;
  availableSkills?: Array<{ id: string; name: string; description: string }>;
  onComplete?: () => void;
}

type ChatMessage =
  | { role: "user"; content: string }
  | { role: "ai"; content: string; isLoading?: boolean };

// ---------------------------------------------------------------------------
// SetupWorkspace
// ---------------------------------------------------------------------------

export function SetupWorkspace({
  projectId,
  project,
  availableSkills = [],
  onComplete,
}: SetupWorkspaceProps) {
  const navigate = useNavigate();

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");

  // Blueprint state
  const [intent, setIntent] = useState("");
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [awaitingClarification, setAwaitingClarification] = useState(false);

  // Blueprint adjustments (live-editable)
  const [selectedSkills, setSelectedSkills] = useState<Record<string, boolean>>({});
  const [policyLevels, setPolicyLevels] = useState<Record<number, "auto" | "ask" | "notify">>({});
  const [schedule, setSchedule] = useState("daily");
  const [globalApproval, setGlobalApproval] = useState(false);

  // Launch state
  const [isLaunching, setIsLaunching] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // -------------------------------------------------------------------------
  // Streaming blueprint via fetch + ReadableStream
  // -------------------------------------------------------------------------

  const [streamingBlueprint, setStreamingBlueprint] = useState<Partial<Blueprint> | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamChunkCount, setStreamChunkCount] = useState(0);

  const submitBlueprint = useCallback(
    async (body: Record<string, unknown>) => {
      setIsGenerating(true);
      setStreamingBlueprint(null);
      setStreamChunkCount(0);

      try {
        const res = await fetch("/api/blueprint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok || !res.body) {
          throw new Error(`Blueprint generation failed: ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let lastPartial: Partial<Blueprint> | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse complete NDJSON lines (each line is a full JSON snapshot)
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? ""; // keep incomplete last line in buffer

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const parsed = JSON.parse(line);
              if (parsed._error) throw new Error(parsed._error);

              // Normalize field names — some models (e.g., Zhipu GLM) output
              // natural names instead of schema names when structuredOutputs
              // is not supported
              const normalized: Partial<Blueprint> = {
                ...parsed,
                agentName: parsed.agentName ?? parsed.name ?? parsed.agent_name,
                summary: parsed.summary ?? parsed.description ?? parsed.desc,
              };
              // Clean up alternate keys
              delete (normalized as Record<string, unknown>).name;
              delete (normalized as Record<string, unknown>).description;
              delete (normalized as Record<string, unknown>).desc;
              delete (normalized as Record<string, unknown>).agent_name;

              lastPartial = normalized;
              setStreamingBlueprint(normalized);
              setStreamChunkCount((c) => c + 1);
            } catch (e) {
              if (e instanceof Error && e.message !== "Stream error") throw e;
            }
          }
        }

        // Parse any remaining buffer
        if (buffer.trim()) {
          try {
            const parsed = JSON.parse(buffer);
            if (!parsed._error) lastPartial = parsed;
          } catch { /* ignore */ }
        }

        if (!lastPartial) throw new Error("No blueprint data received");
        const finalBlueprint = lastPartial as Blueprint;

        // Apply completed blueprint to editable state
        const skills: Record<string, boolean> = {};
        for (const s of availableSkills) {
          skills[s.id] = finalBlueprint.skills?.includes(s.id) ?? false;
        }
        setSelectedSkills(skills);

        const levels: Record<number, "auto" | "ask" | "notify"> = {};
        finalBlueprint.policies?.forEach((p, i) => {
          levels[i] = p.defaultLevel;
        });
        setPolicyLevels(levels);
        if (finalBlueprint.schedule) setSchedule(finalBlueprint.schedule);

        setBlueprint(finalBlueprint);

        // Update chat
        setMessages((prev) => {
          const withoutLoading = prev.filter((m) => !("isLoading" in m && m.isLoading));
          if (finalBlueprint!.clarifyingQuestion && !blueprint) {
            setAwaitingClarification(true);
            return [
              ...withoutLoading,
              { role: "ai" as const, content: finalBlueprint!.clarifyingQuestion! },
            ];
          }
          const name = finalBlueprint!.agentName ?? "Your Agent";
          return [
            ...withoutLoading,
            {
              role: "ai" as const,
              content: `Here's your blueprint for **${name}**. Review it on the right, adjust anything you like, and launch when ready.`,
            },
          ];
        });
      } catch (err) {
        setMessages((prev) => {
          const withoutLoading = prev.filter((m) => !("isLoading" in m && m.isLoading));
          return [
            ...withoutLoading,
            {
              role: "ai" as const,
              content: err instanceof Error ? err.message : "Something went wrong. Try again.",
            },
          ];
        });
        setError(err instanceof Error ? err.message : "Generation failed");
      } finally {
        setIsGenerating(false);
      }
    },
    [availableSkills, blueprint],
  );

  // Scroll chat to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // -------------------------------------------------------------------------
  // Trigger blueprint generation
  // -------------------------------------------------------------------------

  const runGenerate = useCallback(
    (userIntent: string, clarification?: string) => {
      setError(null);

      // Show loading bubble in chat
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: "", isLoading: true },
      ]);

      // Submit to streaming endpoint
      submitBlueprint({
        intent: userIntent,
        clarification,
        availableSkills: availableSkills.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
        })),
      });
    },
    [availableSkills, submitBlueprint],
  );

  // -------------------------------------------------------------------------
  // Chat refinements after blueprint exists
  // -------------------------------------------------------------------------

  const handleRefinement = useCallback(
    async (text: string) => {
      if (!blueprint) return;

      // Simple keyword-based adjustments for common refinements
      const lower = text.toLowerCase();

      // Schedule changes
      if (lower.includes("hourly")) {
        setSchedule("hourly");
        setMessages((prev) => [
          ...prev,
          { role: "ai", content: "Done — schedule updated to hourly." },
        ]);
        return;
      }
      if (lower.includes("daily")) {
        setSchedule("daily");
        setMessages((prev) => [
          ...prev,
          { role: "ai", content: "Done — schedule updated to daily." },
        ]);
        return;
      }
      if (lower.includes("weekly")) {
        setSchedule("weekly");
        setMessages((prev) => [
          ...prev,
          { role: "ai", content: "Done — schedule updated to weekly." },
        ]);
        return;
      }
      if (lower.includes("manual")) {
        setSchedule("manual");
        setMessages((prev) => [
          ...prev,
          { role: "ai", content: "Done — set to manual trigger only." },
        ]);
        return;
      }

      // Skill removal
      for (const skill of availableSkills) {
        if (
          lower.includes("remove") &&
          (lower.includes(skill.name.toLowerCase()) || lower.includes(skill.id.toLowerCase()))
        ) {
          setSelectedSkills((prev) => ({ ...prev, [skill.id]: false }));
          setMessages((prev) => [
            ...prev,
            { role: "ai", content: `Removed the **${skill.name}** skill.` },
          ]);
          return;
        }
        if (
          lower.includes("add") &&
          (lower.includes(skill.name.toLowerCase()) || lower.includes(skill.id.toLowerCase()))
        ) {
          setSelectedSkills((prev) => ({ ...prev, [skill.id]: true }));
          setMessages((prev) => [
            ...prev,
            { role: "ai", content: `Added the **${skill.name}** skill.` },
          ]);
          return;
        }
      }

      // Fallback: re-generate with refinement as clarification
      await runGenerate(intent, text);
    },
    [blueprint, availableSkills, intent, runGenerate],
  );

  // -------------------------------------------------------------------------
  // Send handler
  // -------------------------------------------------------------------------

  const handleSend = useCallback(
    async (text?: string) => {
      const value = (text ?? inputValue).trim();
      if (!value || isGenerating) return;

      setInputValue("");
      setMessages((prev) => [...prev, { role: "user", content: value }]);

      if (!intent) {
        // First message — this is the intent
        setIntent(value);
        runGenerate(value);
      } else if (awaitingClarification) {
        // Answering the LLM's clarifying question
        setAwaitingClarification(false);
        runGenerate(intent, value);
      } else {
        // Refining an existing blueprint
        await handleRefinement(value);
      }
    },
    [inputValue, isGenerating, intent, awaitingClarification, runGenerate, handleRefinement],
  );

  // -------------------------------------------------------------------------
  // Launch
  // -------------------------------------------------------------------------

  const handleLaunch = useCallback(async () => {
    if (isLaunching || !blueprint) return;
    setIsLaunching(true);
    setError(null);

    try {
      let finalProjectId = projectId;

      if (!finalProjectId) {
        const projectName = blueprint.projectName || "My Project";
        const proj = (await createProject({
          data: { name: projectName },
        })) as { id: string };
        finalProjectId = proj.id;
      }

      const activeSkills = Object.entries(selectedSkills)
        .filter(([, enabled]) => enabled)
        .map(([id]) => id);

      const policyRules: string[] = blueprint.policies.map((p, i) => {
        const level = policyLevels[i] ?? p.defaultLevel;
        return `${p.action}:${level}`;
      });

      const agent = (await createAgent({
        data: {
          projectId: finalProjectId,
          name: blueprint.agentName,
          description: blueprint.summary,
          intent,
          skills: activeSkills,
          scopeStrategy: "llm",
          policyRules,
          globalApprovalRequired: globalApproval,
          schedule,
        },
      })) as { id: string };

      setIsLive(true);

      setTimeout(() => {
        if (onComplete) {
          onComplete();
        } else {
          navigate({
            to: "/$projectId/agents/$agentId",
            params: { projectId: finalProjectId!, agentId: agent.id },
          });
        }
      }, 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
      setIsLaunching(false);
    }
  }, [
    isLaunching,
    blueprint,
    projectId,
    selectedSkills,
    policyLevels,
    globalApproval,
    schedule,
    intent,
    navigate,
    onComplete,
  ]);

  // -------------------------------------------------------------------------
  // "Agent is live" overlay
  // -------------------------------------------------------------------------

  if (isLive) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          background: COLORS.bg,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <style>{PULSE_CSS}</style>
        <div style={{ fontSize: 48, color: COLORS.accent, animation: "sw-pulse 1s ease-in-out infinite" }}>✦</div>
        <h2 style={{ color: COLORS.text, fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: -0.4 }}>
          Your agent is live
        </h2>
        <p style={{ color: COLORS.textSecondary, fontSize: 15, margin: 0 }}>
          Running first analysis now...
        </p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Main 2-panel layout
  // -------------------------------------------------------------------------

  const projectName = project?.name ?? "New Project";
  const chatIsEmpty = messages.length === 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: COLORS.bg,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <style>{PULSE_CSS}</style>

      {/* ------------------------------------------------------------------ */}
      {/* Top bar */}
      {/* ------------------------------------------------------------------ */}
      <div
        style={{
          height: 52,
          borderBottom: `1px solid ${COLORS.border}`,
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          flexShrink: 0,
        }}
      >
        {/* Brand */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            minWidth: 160,
          }}
        >
          <span style={{ color: COLORS.accent, fontSize: 16 }}>✦</span>
          <span
            style={{
              color: COLORS.text,
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: -0.3,
            }}
          >
            Nochore
          </span>
        </div>

        {/* Center label */}
        <div style={{ flex: 1, textAlign: "center" }}>
          <span style={{ color: COLORS.textSecondary, fontSize: 13 }}>
            Creating agent for{" "}
            <span style={{ color: COLORS.text, fontWeight: 500 }}>{projectName}</span>
          </span>
        </div>

        {/* Close */}
        <div style={{ minWidth: 160, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={() => navigate({ to: projectId ? `/$projectId` : "/", params: projectId ? { projectId } : {} })}
            style={{
              background: "transparent",
              border: "none",
              color: COLORS.textSecondary,
              cursor: "pointer",
              padding: 8,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.text)}
            onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textSecondary)}
          >
            <X size={18} weight="regular" />
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Two-panel body */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* ---------------------------------------------------------------- */}
        {/* Left panel — Chat */}
        {/* ---------------------------------------------------------------- */}
        <div
          style={{
            width: "40%",
            background: COLORS.bg,
            borderRight: `1px solid ${COLORS.border}`,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Opening prompt */}
          <div
            style={{
              padding: "32px 24px 0",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ color: COLORS.accent, fontSize: 16 }}>✦</span>
              <span
                style={{
                  color: COLORS.text,
                  fontSize: 16,
                  fontWeight: 600,
                  letterSpacing: -0.2,
                }}
              >
                What should this agent keep an eye on?
              </span>
            </div>
          </div>

          {/* Chat messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {messages.map((msg, i) => {
              // Derive thinking label from streaming progress
              let thinkingLabel: string | undefined;
              if ("isLoading" in msg && msg.isLoading && isGenerating) {
                const bp = streamingBlueprint;
                if (streamChunkCount === 0) {
                  thinkingLabel = "Understanding your intent";
                } else if (!bp?.agentName || bp.agentName.length < 3) {
                  thinkingLabel = "Naming your agent";
                } else if (!bp?.skills || bp.skills.length === 0) {
                  thinkingLabel = "Selecting skills";
                } else if (!bp?.connections || bp.connections.length === 0) {
                  thinkingLabel = "Identifying connections";
                } else if (!bp?.policies || bp.policies.length === 0) {
                  thinkingLabel = "Drafting policy rules";
                } else if (!bp?.schedule) {
                  thinkingLabel = "Setting schedule";
                } else {
                  thinkingLabel = "Finalizing blueprint";
                }
              }
              return (
                <ChatBubble
                  key={i}
                  message={msg}
                  thinkingLabel={thinkingLabel}
                />
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div
            style={{
              padding: "12px 24px 24px",
              flexShrink: 0,
            }}
          >
            {/* Template chips — only before first message */}
            {chatIsEmpty && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                {TEMPLATES.map((t) => (
                  <TemplateChip
                    key={t.label}
                    label={t.label}
                    onClick={() => {
                      setInputValue(t.intent);
                      handleSend(t.intent);
                    }}
                  />
                ))}
              </div>
            )}

            {/* Text input row */}
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "flex-end",
              }}
            >
              <input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={
                  chatIsEmpty
                    ? "e.g. Monitor Google Ads for budget waste..."
                    : awaitingClarification
                    ? "Your answer..."
                    : "Refine the blueprint..."
                }
                disabled={isGenerating}
                style={{
                  flex: 1,
                  background: COLORS.surface,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  padding: "10px 14px",
                  color: COLORS.text,
                  fontSize: 14,
                  outline: "none",
                  fontFamily: "inherit",
                  opacity: isGenerating ? 0.6 : 1,
                  transition: "border-color 0.15s ease",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = COLORS.accent)}
                onBlur={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
              />
              <button
                onClick={() => handleSend()}
                disabled={!inputValue.trim() || isGenerating}
                style={{
                  background: inputValue.trim() && !isGenerating ? COLORS.accent : COLORS.surface,
                  border: `1px solid ${inputValue.trim() && !isGenerating ? COLORS.accent : COLORS.border}`,
                  borderRadius: 8,
                  padding: "10px 12px",
                  color: inputValue.trim() && !isGenerating ? COLORS.white : COLORS.textDim,
                  cursor: inputValue.trim() && !isGenerating ? "pointer" : "default",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.15s ease",
                  flexShrink: 0,
                }}
              >
                <PaperPlaneTilt size={18} weight="fill" />
              </button>
            </div>

            {error && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: COLORS.red,
                  padding: "6px 10px",
                  background: COLORS.redSubtle,
                  borderRadius: 6,
                }}
              >
                {error}
              </div>
            )}
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Right panel — Blueprint */}
        {/* ---------------------------------------------------------------- */}
        <div
          style={{
            flex: 1,
            background: COLORS.surface,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {(() => {
            // Determine what to show: streaming partial, finalized blueprint, or empty
            const displayBlueprint = blueprint ?? (isGenerating ? streamingBlueprint : null);
            const hasAnyContent = displayBlueprint?.agentName || displayBlueprint?.summary;

            if (!hasAnyContent && !isGenerating) {
              // Empty state
              return (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 12,
                  }}
                >
                  <span style={{ color: COLORS.accent, fontSize: 28, opacity: 0.4 }}>✦</span>
                  <p
                    style={{
                      color: COLORS.textDim,
                      fontSize: 14,
                      margin: 0,
                      textAlign: "center",
                      maxWidth: 280,
                      lineHeight: 1.6,
                    }}
                  >
                    Your agent will appear here as we talk.
                  </p>
                </div>
              );
            }

            if (isGenerating && !hasAnyContent) {
              // Waiting for first data — show pulsing indicator
              return (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 16,
                  }}
                >
                  <span
                    style={{
                      color: COLORS.accent,
                      fontSize: 36,
                      animation: "sw-pulse 1.4s ease-in-out infinite",
                    }}
                  >
                    ✦
                  </span>
                  <p style={{ color: COLORS.textSecondary, fontSize: 14, margin: 0 }}>
                    Understanding your intent...
                  </p>
                </div>
              );
            }

            // Show blueprint (streaming partial or finalized)
            return (
            // Blueprint
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "32px 32px 120px",
              }}
            >
              {/* Identity block */}
              <div style={{ marginBottom: 32 }}>
                <h1
                  style={{
                    color: COLORS.text,
                    fontSize: 26,
                    fontWeight: 700,
                    margin: "0 0 8px",
                    letterSpacing: -0.5,
                    lineHeight: 1.2,
                  }}
                >
                  {displayBlueprint?.agentName ?? "..."}
                </h1>
                <p
                  style={{
                    color: COLORS.textSecondary,
                    fontSize: 14,
                    margin: 0,
                    lineHeight: 1.6,
                  }}
                >
                  {displayBlueprint?.summary ?? ""}
                </p>
              </div>

              {/* Skills block */}
              {availableSkills.length > 0 && (
                <BlueprintSection title="Skills">
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {availableSkills.map((skill) => {
                      const isSelected = selectedSkills[skill.id] ?? false;
                      const isRecommended = displayBlueprint?.skills?.includes(skill.id) ?? false;
                      return (
                        <div
                          key={skill.id}
                          onClick={() =>
                            setSelectedSkills((prev) => ({ ...prev, [skill.id]: !prev[skill.id] }))
                          }
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            padding: "10px 0",
                            cursor: "pointer",
                            opacity: isSelected ? 1 : 0.45,
                            transition: "opacity 0.15s ease",
                          }}
                        >
                          <Checkbox checked={isSelected} />
                          <div style={{ flex: 1 }}>
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 500,
                                color: COLORS.text,
                              }}
                            >
                              {skill.name}
                            </span>
                            <span
                              style={{
                                fontSize: 12,
                                color: COLORS.textDim,
                                marginLeft: 8,
                              }}
                            >
                              {skill.description}
                            </span>
                          </div>
                          {isRecommended && (
                            <Badge color="accent">Recommended</Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </BlueprintSection>
              )}

              {/* Connections block */}
              {(displayBlueprint?.connections?.length ?? 0) > 0 && (
                <BlueprintSection title="Connections">
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {(displayBlueprint?.connections ?? []).map((conn, ci) => {
                      if (!conn?.provider) return null;
                      return (
                        <div
                          key={conn.provider ?? ci}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 0",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 500,
                                color: COLORS.text,
                              }}
                            >
                              {PROVIDER_NAMES[conn.provider] ?? conn.provider}
                            </div>
                            {conn.reason && (
                              <div
                                style={{
                                  fontSize: 12,
                                  color: COLORS.textDim,
                                  marginTop: 2,
                                }}
                              >
                                {conn.reason}
                              </div>
                            )}
                          </div>
                          <Badge color="gray">After launch</Badge>
                        </div>
                      );
                    })}
                  </div>
                </BlueprintSection>
              )}

              {/* Policies block */}
              {(displayBlueprint?.policies?.length ?? 0) > 0 && (
                <BlueprintSection title="Policies">
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {(displayBlueprint?.policies ?? []).map((policy, i) => {
                      if (!policy?.question) return null;
                      return (
                      <div key={i}>
                        {i > 0 && (
                          <div
                            style={{
                              height: 1,
                              background: COLORS.border,
                              marginBottom: 12,
                            }}
                          />
                        )}
                        <div style={{ marginBottom: 12 }}>
                          <div
                            style={{
                              fontSize: 13,
                              color: COLORS.text,
                              marginBottom: 8,
                              lineHeight: 1.5,
                            }}
                          >
                            {policy.question}
                          </div>
                          <div style={{ display: "flex", gap: 4 }}>
                            {(["auto", "ask", "notify"] as const).map((level) => {
                              const active = (policyLevels[i] ?? policy.defaultLevel) === level;
                              return (
                                <button
                                  key={level}
                                  onClick={() =>
                                    setPolicyLevels((prev) => ({ ...prev, [i]: level }))
                                  }
                                  style={{
                                    padding: "4px 12px",
                                    borderRadius: 99,
                                    fontSize: 12,
                                    fontWeight: active ? 600 : 400,
                                    cursor: "pointer",
                                    background: active ? COLORS.accentDim : "transparent",
                                    color: active ? COLORS.accentLight : COLORS.textDim,
                                    border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                                    transition: "all 0.15s ease",
                                    fontFamily: "inherit",
                                  }}
                                >
                                  {level === "auto"
                                    ? "Auto-handle"
                                    : level === "ask"
                                    ? "Ask first"
                                    : "Notify after"}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      );
                    })}

                    {/* Global approval toggle */}
                    <div
                      style={{
                        borderTop: `1px solid ${COLORS.border}`,
                        paddingTop: 12,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ fontSize: 13, color: COLORS.textSecondary }}>
                        Require approval for ALL actions
                      </span>
                      <Toggle checked={globalApproval} onChange={setGlobalApproval} />
                    </div>
                  </div>
                </BlueprintSection>
              )}

              {/* Schedule block */}
              <BlueprintSection title="Schedule">
                <div
                  style={{
                    display: "flex",
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 8,
                    overflow: "hidden",
                  }}
                >
                  {SCHEDULES.map((s) => {
                    const active = schedule === s.value;
                    return (
                      <button
                        key={s.value}
                        onClick={() => setSchedule(s.value)}
                        style={{
                          flex: 1,
                          padding: "8px 0",
                          fontSize: 12,
                          fontWeight: active ? 600 : 400,
                          cursor: "pointer",
                          color: active ? COLORS.accentLight : COLORS.textDim,
                          background: active ? COLORS.accentDim : "transparent",
                          border: "none",
                          borderRight: `1px solid ${COLORS.border}`,
                          transition: "all 0.15s ease",
                          fontFamily: "inherit",
                        }}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </BlueprintSection>
            </div>
          );
          })()}

          {/* Launch button — pinned to bottom of right panel */}
          {blueprint && (
            <div
              style={{
                position: "absolute",
                bottom: 0,
                right: 0,
                width: "60%",
                padding: "16px 32px 32px",
                background: `linear-gradient(to top, ${COLORS.surface} 70%, transparent)`,
              }}
            >
              <button
                onClick={handleLaunch}
                disabled={isLaunching}
                style={{
                  width: "100%",
                  padding: "14px 24px",
                  background: isLaunching ? COLORS.accentDim : COLORS.accent,
                  border: "none",
                  borderRadius: 8,
                  color: COLORS.white,
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: isLaunching ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  transition: "all 0.15s ease",
                  fontFamily: "inherit",
                  letterSpacing: -0.2,
                  opacity: isLaunching ? 0.7 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isLaunching) e.currentTarget.style.opacity = "0.9";
                }}
                onMouseLeave={(e) => {
                  if (!isLaunching) e.currentTarget.style.opacity = "1";
                }}
              >
                {isLaunching ? (
                  <>
                    <span
                      style={{
                        animation: "sw-pulse 1s ease-in-out infinite",
                        display: "inline-block",
                      }}
                    >
                      ✦
                    </span>
                    Creating...
                  </>
                ) : (
                  <>
                    Launch agent
                    <ArrowRight size={16} weight="bold" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function ChatBubble({ message, thinkingLabel }: { message: ChatMessage; thinkingLabel?: string }) {
  const isUser = message.role === "user";
  const isLoading = "isLoading" in message && message.isLoading;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        alignItems: "flex-start",
        gap: 8,
      }}
    >
      {!isUser && (
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 99,
            background: COLORS.accentDim,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          <span style={{ color: COLORS.accent, fontSize: 12, animation: isLoading ? "sw-pulse 1.2s ease-in-out infinite" : "none" }}>✦</span>
        </div>
      )}
      <div
        style={{
          maxWidth: "80%",
          padding: "9px 13px",
          borderRadius: isUser ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
          background: isUser ? COLORS.accentDim : COLORS.surfaceHover,
          border: `1px solid ${isUser ? COLORS.accent : COLORS.border}`,
          fontSize: 13,
          color: isUser ? COLORS.accentLight : COLORS.text,
          lineHeight: 1.55,
        }}
      >
        {isLoading ? (
          <span style={{ color: COLORS.textSecondary, fontSize: 13 }}>
            {thinkingLabel || "Thinking"}
            <span style={{ animation: "sw-pulse 1s ease-in-out infinite", display: "inline-block", marginLeft: 2 }}>...</span>
          </span>
        ) : (
          renderMarkdown(message.content)
        )}
      </div>
    </div>
  );
}

function TemplateChip({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: 99,
        background: "transparent",
        border: `1px solid ${COLORS.border}`,
        color: COLORS.textSecondary,
        fontSize: 13,
        cursor: "pointer",
        transition: "all 0.15s ease",
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = COLORS.accent;
        e.currentTarget.style.color = COLORS.text;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.border;
        e.currentTarget.style.color = COLORS.textSecondary;
      }}
    >
      {label}
    </button>
  );
}

function BlueprintSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: COLORS.textDim,
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <div
      style={{
        width: 18,
        height: 18,
        borderRadius: 4,
        border: `2px solid ${checked ? COLORS.accent : COLORS.borderLight}`,
        background: checked ? COLORS.accent : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontSize: 11,
        color: COLORS.white,
        transition: "all 0.15s ease",
      }}
    >
      {checked ? "✓" : ""}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 99,
        background: checked ? COLORS.accent : COLORS.border,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        padding: 3,
        transition: "background 0.15s ease",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: 99,
          background: checked ? COLORS.white : COLORS.textSecondary,
          transition: "transform 0.15s ease",
          transform: checked ? "translateX(18px)" : "translateX(0)",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Minimal bold/italic markdown renderer (no deps)
// ---------------------------------------------------------------------------

function renderMarkdown(text: string): React.ReactNode {
  // Split on **bold** markers
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} style={{ fontWeight: 600 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

// ---------------------------------------------------------------------------
// Global keyframe CSS
// ---------------------------------------------------------------------------

const PULSE_CSS = `
  @keyframes sw-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
  }
`;
