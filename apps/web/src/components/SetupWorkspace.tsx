/**
 * SetupWorkspace — 2-panel agent setup flow.
 *
 * Left (~40%): conversational chat — intent + refinements
 * Right (~60%): emerging blueprint — directly interactive
 *
 * Flow:
 *   1. User types intent → generateBlueprint
 *   2. Blueprint renders right panel — user adjusts via toggles OR chat
 *   3. Blueprint renders right panel — user adjusts via toggles OR chat
 *   4. "Create agent →" creates project + agent, navigates to agent detail
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { X, PaperPlaneTilt, ArrowRight } from "@phosphor-icons/react";
import { COLORS } from "~/lib/colors";
import type { ProjectView } from "~/lib/types";
import { Badge } from "~/components/Badge";
import { Button } from "~/components/Button";
import { Card } from "~/components/Card";
import { SettingsCard, SettingsRow, SectionHeading } from "~/components/SettingsComponents";
import type { Blueprint } from "~/routes/api.blueprint";
import { createDraftAgent, updateDraftAgent, launchAgent } from "~/server/agents";
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

  // Editable agent configuration
  const [agentName, setAgentName] = useState("");
  const [agentSummary, setAgentSummary] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<Record<string, boolean>>({});
  const [guardrailLevels, setGuardrailLevels] = useState<Record<number, "auto" | "ask" | "block">>({});
  const [customGuardrails, setCustomGuardrails] = useState<string[]>([]);
  const [globalApproval, setGlobalApproval] = useState(false);
  const [notifications, setNotifications] = useState({ inApp: true, email: false, slack: false });
  const [triggerType, setTriggerType] = useState<"scheduled" | "webhook" | "manual">("scheduled");
  const [schedule, setSchedule] = useState<string>("daily");

  // Draft + launch state
  const [draftAgentId, setDraftAgentId] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const streamedTextRef = useRef("");

  // -------------------------------------------------------------------------
  // Streaming blueprint via fetch + ReadableStream
  // -------------------------------------------------------------------------

  const [streamingBlueprint, setStreamingBlueprint] = useState<Partial<Blueprint> | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamChunkCount, setStreamChunkCount] = useState(0);
  const [reasoningText, setReasoningText] = useState("");
  const [toolStatus, setToolStatus] = useState("");
  const [streamedText, setStreamedText] = useState("");

  const submitBlueprint = useCallback(
    async (body: Record<string, unknown>) => {
      setIsGenerating(true);
      setStreamingBlueprint(null);
      setStreamChunkCount(0);
      setReasoningText("");
      setToolStatus("");
      setStreamedText("");
      streamedTextRef.current = "";

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
            let parsed: Record<string, unknown>;
            try {
              parsed = JSON.parse(line);
            } catch {
              console.warn("[blueprint stream] unparseable line:", line.slice(0, 100));
              continue;
            }

            if (parsed._error) {
              throw new Error(parsed._error as string);
            }

            if (parsed._type === "reasoning") {
              setReasoningText((prev) => prev + (parsed.text ?? ""));
              continue;
            }

            if (parsed._type === "text") {
              const t = parsed.text ?? "";
              streamedTextRef.current += t;
              setStreamedText((prev) => prev + t);
              continue;
            }

            if (parsed._type === "tool-status") {
              setToolStatus(parsed.text as string);
              continue;
            }

            if (parsed._type === "blueprint") {
              const { _type, ...blueprint } = parsed;
              lastPartial = blueprint as Partial<Blueprint>;
              setStreamingBlueprint(lastPartial);
              setStreamChunkCount((c) => c + 1);
            }
          }
        }

        // Parse any remaining buffer
        if (buffer.trim()) {
          try {
            const parsed = JSON.parse(buffer);
            if (parsed._type === "blueprint") {
              const { _type, ...blueprint } = parsed;
              lastPartial = blueprint as Partial<Blueprint>;
            }
          } catch {
            console.warn("[blueprint stream] unparseable final buffer:", buffer.slice(0, 100));
          }
        }

        if (!lastPartial) {
          // No blueprint — model responded with text only (asking questions)
          // Use accumulated streamedText as the chat message
          setMessages((prev) => {
            const withoutLoading = prev.filter((m) => !("isLoading" in m && m.isLoading));
            const text = streamedTextRef.current.trim() || "Could you tell me more about what you'd like this agent to do?";
            return [
              ...withoutLoading,
              { role: "ai" as const, content: text },
            ];
          });
          setAwaitingClarification(true);
          setToolStatus("");
          setReasoningText("");
          return;
        }

        const finalBlueprint = lastPartial as Blueprint;

        // Apply completed blueprint to editable state
        setAgentName(finalBlueprint.agentName ?? "");
        setAgentSummary(finalBlueprint.summary ?? "");

        const skills: Record<string, boolean> = {};
        for (const s of availableSkills) {
          skills[s.id] = finalBlueprint.skills?.includes(s.id) ?? false;
        }
        setSelectedSkills(skills);

        const levels: Record<number, "auto" | "ask" | "block"> = {};
        (finalBlueprint.guardrails ?? []).forEach((g, i) => {
          levels[i] = g.defaultLevel;
        });
        setGuardrailLevels(levels);

        if (finalBlueprint.notifications) setNotifications(finalBlueprint.notifications);
        if (finalBlueprint.trigger) {
          setTriggerType(finalBlueprint.trigger.type);
          if (finalBlueprint.trigger.schedule) setSchedule(finalBlueprint.trigger.schedule);
        }

        setBlueprint(finalBlueprint);

        // Create draft agent in DB (survives refresh)
        if (!draftAgentId) {
          try {
            let finalProjectId = projectId;
            if (!finalProjectId) {
              const projectName = project?.name || "My Project";
              const proj = (await createProject({ data: { name: projectName } })) as { id: string };
              finalProjectId = proj.id;
            }

            const activeSkillIds = (finalBlueprint.skills ?? []);
            const policyRules = (finalBlueprint.guardrails ?? []).map(
              (g) => `${g.action}:${g.defaultLevel}`,
            );
            const scheduleValue = finalBlueprint.trigger?.type === "manual"
              ? "manual"
              : finalBlueprint.trigger?.schedule ?? "daily";

            const draft = (await createDraftAgent({
              data: {
                projectId: finalProjectId,
                name: finalBlueprint.agentName || "Untitled Agent",
                description: finalBlueprint.summary || "",
                intent,
                skills: activeSkillIds,
                scopeStrategy: "llm",
                policyRules,
                globalApprovalRequired: false,
                schedule: scheduleValue,
              },
            })) as { id: string };
            setDraftAgentId(draft.id);
          } catch (err) {
            console.warn("[draft] Failed to create draft:", err);
          }
        }

        // Update chat
        setMessages((prev) => {
          const withoutLoading = prev.filter((m) => !("isLoading" in m && m.isLoading));
          const name = finalBlueprint.agentName || "your agent";
          return [
            ...withoutLoading,
            { role: "ai" as const, content: `Here's your blueprint for **${name}**. Review it on the right, adjust anything you like, and launch when ready.` },
          ];
        });
        setToolStatus("");
        setReasoningText("");
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
        const projectName = project?.name || "My Project";
        const proj = (await createProject({
          data: { name: projectName },
        })) as { id: string };
        finalProjectId = proj.id;
      }

      // Save latest edits to draft, then launch
      const activeSkills = Object.entries(selectedSkills)
        .filter(([, enabled]) => enabled)
        .map(([id]) => id);

      const policyRules: string[] = (blueprint.guardrails ?? []).map((g, i) => {
        const level = guardrailLevels[i] ?? g.defaultLevel;
        return `${g.action}:${level}`;
      });
      for (const custom of customGuardrails) {
        policyRules.push(`custom:ask:${custom}`);
      }

      let agentId = draftAgentId;

      if (agentId) {
        // Update draft with latest edits, then launch
        await updateDraftAgent({
          data: {
            agentId,
            projectId: finalProjectId,
            name: agentName || blueprint.agentName,
            description: agentSummary || blueprint.summary,
            skills: activeSkills,
            policyRules,
            globalApprovalRequired: globalApproval,
            schedule: triggerType === "manual" ? "manual" : schedule,
          },
        });
        await launchAgent({ data: { agentId, projectId: finalProjectId } });
      } else {
        // No draft — create and launch directly (fallback)
        const { createAgent } = await import("~/server/agents");
        const agent = (await createAgent({
          data: {
            projectId: finalProjectId,
            name: agentName || blueprint.agentName,
            description: agentSummary || blueprint.summary,
            intent,
            skills: activeSkills,
            scopeStrategy: "llm",
            policyRules,
            globalApprovalRequired: globalApproval,
            schedule: triggerType === "manual" ? "manual" : schedule,
          },
        })) as { id: string };
        agentId = agent.id;
      }

      // Navigate immediately to the agent detail page
      if (onComplete) {
        onComplete();
      } else {
        navigate({
          to: "/$projectId/agents/$agentId",
          params: { projectId: finalProjectId!, agentId: agentId! },
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
      setIsLaunching(false);
    }
  }, [
    isLaunching,
    blueprint,
    projectId,
    project,
    agentName,
    agentSummary,
    selectedSkills,
    guardrailLevels,
    customGuardrails,
    globalApproval,
    triggerType,
    schedule,
    intent,
    draftAgentId,
    navigate,
    onComplete,
  ]);

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
        <div style={{ flex: 1, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
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
            className="sw-scroll"
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {messages
              .filter((m) => !("isLoading" in m && m.isLoading))
              .map((msg, i) => (
                <ChatBubble key={i} message={msg} />
              ))}

            {/* Ephemeral reasoning — italic shimmer, no bubble */}
            {isGenerating && reasoningText && (
              <div
                style={{
                  padding: "4px 0 4px 32px",
                  fontSize: 13,
                  fontStyle: "italic",
                  color: COLORS.textDim,
                  lineHeight: 1.5,
                  animation: "sw-shimmer 2s ease-in-out infinite",
                  maxHeight: 60,
                  overflow: "hidden",
                  maskImage: "linear-gradient(to bottom, black 60%, transparent)",
                  WebkitMaskImage: "linear-gradient(to bottom, black 60%, transparent)",
                }}
              >
                {reasoningText.trim().split("\n").slice(-2).join(" ")}
              </div>
            )}

            {/* Tool status — compact status line */}
            {isGenerating && toolStatus && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 0 4px 32px",
                  fontSize: 12,
                  color: COLORS.textDim,
                }}
              >
                <span style={{ color: COLORS.accent, fontSize: 12, animation: "sw-pulse 1.2s ease-in-out infinite" }}>✦</span>
                {toolStatus}
              </div>
            )}

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
            const displayBlueprint = blueprint ?? (isGenerating ? streamingBlueprint : null);
            const hasAnyContent = displayBlueprint?.agentName || displayBlueprint?.summary
              || (displayBlueprint?.skills?.length ?? 0) > 0
              || (displayBlueprint?.connections?.length ?? 0) > 0
              || displayBlueprint?.guardrails;
            const isEditable = !!blueprint;

            // Empty state
            if (!hasAnyContent && !isGenerating) {
              return (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
                  <span style={{ color: COLORS.accent, fontSize: 28, opacity: 0.4 }}>✦</span>
                  <p style={{ color: COLORS.textDim, fontSize: 14, margin: 0, textAlign: "center", maxWidth: 280, lineHeight: 1.6 }}>
                    Your agent will appear here as we talk.
                  </p>
                </div>
              );
            }

            // Generating, waiting for first data
            if (isGenerating && !hasAnyContent) {
              return (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
                  <span style={{ color: COLORS.accent, fontSize: 36, animation: "sw-pulse 1.4s ease-in-out infinite" }}>✦</span>
                  <p style={{ color: COLORS.textSecondary, fontSize: 14, margin: 0 }}>Understanding your intent...</p>
                </div>
              );
            }

            // Active skill count for subtitle
            const activeSkillCount = Object.values(selectedSkills).filter(Boolean).length;
            const guardrailCount = (blueprint?.guardrails?.length ?? 0) + customGuardrails.length;

            return (
              <div className="sw-scroll" style={{ flex: 1, overflowY: "auto", padding: "32px 32px 24px" }}>

                {/* ── Agent name — plain header ─────── */}
                <div style={{ marginBottom: 24 }}>
                  {isEditable ? (
                    <input
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      placeholder="Agent name"
                      style={{
                        width: "100%",
                        background: "transparent",
                        border: "none",
                        color: COLORS.text,
                        fontSize: 22,
                        fontWeight: 700,
                        letterSpacing: -0.5,
                        lineHeight: 1.2,
                        padding: 0,
                        outline: "none",
                        fontFamily: "inherit",
                      }}
                    />
                  ) : (
                    <h1 style={{ color: COLORS.text, fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: -0.5, lineHeight: 1.2 }}>
                      {displayBlueprint?.agentName || "..."}
                    </h1>
                  )}
                </div>

                {/* ── IDENTITY ─────────────────────────────── */}
                <SectionHeading>Identity</SectionHeading>
                <SettingsCard>
                  {/* Instructions — the agent's brain */}
                  <SettingsRow
                    icon="✦"
                    title="Instructions"
                    value={agentSummary || displayBlueprint?.summary ? undefined : "Not set"}
                    isLast={availableSkills.length === 0 && (displayBlueprint?.connections?.length ?? 0) === 0}
                    defaultExpanded={true}
                  >
                    {isEditable ? (
                      <textarea
                        value={agentSummary}
                        onChange={(e) => setAgentSummary(e.target.value)}
                        placeholder="Describe what this agent should do — this becomes its system prompt..."
                        rows={6}
                        style={{
                          width: "100%",
                          background: COLORS.surface,
                          border: `1px solid ${COLORS.border}`,
                          borderRadius: 6,
                          color: COLORS.text,
                          fontSize: 13,
                          lineHeight: 1.7,
                          padding: "10px 12px",
                          outline: "none",
                          fontFamily: "inherit",
                          resize: "vertical",
                        }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = COLORS.accent)}
                        onBlur={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
                      />
                    ) : (
                      <p style={{ color: COLORS.textSecondary, fontSize: 13, margin: 0, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                        {displayBlueprint?.summary || "No instructions yet."}
                      </p>
                    )}
                  </SettingsRow>

                  {/* Skills */}
                  {(availableSkills.length > 0 || (displayBlueprint?.connections?.length ?? 0) > 0) && (
                    <SettingsRow
                      icon="◈"
                      title="Skills"
                      value={isEditable ? `${activeSkillCount} selected` : undefined}
                      isLast={(displayBlueprint?.connections?.length ?? 0) === 0}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {availableSkills.map((skill) => {
                          const isSelected = selectedSkills[skill.id] ?? false;
                          const isRecommended = displayBlueprint?.skills?.includes(skill.id) ?? false;
                          return (
                            <div
                              key={skill.id}
                              onClick={() => isEditable && setSelectedSkills((prev) => ({ ...prev, [skill.id]: !prev[skill.id] }))}
                              style={{
                                display: "flex", alignItems: "center", gap: 12, padding: "8px 0",
                                cursor: isEditable ? "pointer" : "default",
                                opacity: isEditable ? (isSelected ? 1 : 0.45) : (isRecommended ? 1 : 0.45),
                                transition: "opacity 0.15s ease",
                              }}
                            >
                              <Checkbox checked={isEditable ? isSelected : isRecommended} />
                              <div style={{ flex: 1 }}>
                                <span style={{ fontSize: 13, fontWeight: 500, color: COLORS.text }}>{skill.name}</span>
                                <span style={{ fontSize: 12, color: COLORS.textDim, marginLeft: 8 }}>{skill.description}</span>
                              </div>
                              {isRecommended && <Badge color="accent">Recommended</Badge>}
                            </div>
                          );
                        })}
                      </div>
                    </SettingsRow>
                  )}

                  {/* Connections */}
                  {(displayBlueprint?.connections?.length ?? 0) > 0 && (
                    <SettingsRow
                      icon="🔌"
                      title="Connections"
                      value={`${displayBlueprint?.connections?.length ?? 0} required`}
                      isLast
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {(displayBlueprint?.connections ?? []).map((conn, ci) => {
                          if (!conn?.provider) return null;
                          return (
                            <div key={conn.provider ?? ci} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
                              <div>
                                <span style={{ fontSize: 13, fontWeight: 500, color: COLORS.text }}>{PROVIDER_NAMES[conn.provider] ?? conn.provider}</span>
                                {conn.reason && <span style={{ fontSize: 12, color: COLORS.textDim, marginLeft: 8 }}>{conn.reason}</span>}
                              </div>
                              <Badge color="gray">After launch</Badge>
                            </div>
                          );
                        })}
                      </div>
                    </SettingsRow>
                  )}
                </SettingsCard>

                {/* ── BEHAVIOR ─────────────────────────────── */}
                {isEditable && (
                  <>
                    <SectionHeading>Behavior</SectionHeading>
                    <SettingsCard>
                      {/* Guardrails */}
                      {(blueprint?.guardrails?.length ?? 0) > 0 && (
                        <SettingsRow
                          icon="⊘"
                          title="Guardrails"
                          value={`${guardrailCount} rule${guardrailCount !== 1 ? "s" : ""}`}
                        >
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            {(blueprint?.guardrails ?? []).map((guardrail, i) => (
                              <div key={i}>
                                {i > 0 && <div style={{ height: 1, background: COLORS.borderLight, margin: "10px 0" }} />}
                                <div>
                                  <div style={{ fontSize: 13, color: COLORS.text, marginBottom: 8, lineHeight: 1.5 }}>{guardrail.question}</div>
                                  <div style={{ display: "flex", gap: 4 }}>
                                    {(["auto", "ask", "block"] as const).map((level) => {
                                      const active = (guardrailLevels[i] ?? guardrail.defaultLevel) === level;
                                      return (
                                        <button
                                          key={level}
                                          onClick={() => setGuardrailLevels((prev) => ({ ...prev, [i]: level }))}
                                          style={{
                                            padding: "4px 12px", borderRadius: 99, fontSize: 12,
                                            fontWeight: active ? 600 : 400, cursor: "pointer",
                                            background: active ? COLORS.accentDim : "transparent",
                                            color: active ? COLORS.accentLight : COLORS.textDim,
                                            border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                                            transition: "all 0.15s ease", fontFamily: "inherit",
                                          }}
                                        >
                                          {level === "auto" ? "Auto" : level === "ask" ? "Approve first" : "Block"}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            ))}
                            {customGuardrails.map((rule, i) => (
                              <div key={`custom-${i}`}>
                                <div style={{ height: 1, background: COLORS.borderLight, margin: "10px 0" }} />
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                  <span style={{ fontSize: 13, color: COLORS.text }}>{rule}</span>
                                  <button onClick={() => setCustomGuardrails((prev) => prev.filter((_, j) => j !== i))} style={{ background: "transparent", border: "none", color: COLORS.textDim, cursor: "pointer", fontSize: 14, padding: "4px 8px", fontFamily: "inherit" }}>×</button>
                                </div>
                              </div>
                            ))}
                            <div style={{ height: 1, background: COLORS.borderLight, margin: "10px 0" }} />
                            <AddInlineInput placeholder="Add custom guardrail..." onAdd={(value) => setCustomGuardrails((prev) => [...prev, value])} />
                            <div style={{ borderTop: `1px solid ${COLORS.borderLight}`, marginTop: 10, paddingTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <span style={{ fontSize: 13, color: COLORS.textSecondary }}>Require approval for ALL actions</span>
                              <Toggle checked={globalApproval} onChange={setGlobalApproval} />
                            </div>
                          </div>
                        </SettingsRow>
                      )}

                      {/* Trigger */}
                      <SettingsRow
                        icon="◷"
                        title="Trigger"
                        value={triggerType === "scheduled" ? schedule : triggerType}
                        isLast
                      >
                        <div style={{ display: "flex", gap: 8, marginBottom: triggerType === "scheduled" ? 12 : 0 }}>
                          {(["scheduled", "webhook", "manual"] as const).map((type) => {
                            const active = triggerType === type;
                            const isComingSoon = type === "webhook";
                            return (
                              <button
                                key={type}
                                onClick={() => !isComingSoon && setTriggerType(type)}
                                style={{
                                  padding: "4px 12px", borderRadius: 99, fontSize: 12,
                                  fontWeight: active ? 600 : 400,
                                  cursor: isComingSoon ? "default" : "pointer",
                                  background: active ? COLORS.accentDim : "transparent",
                                  color: active ? COLORS.accentLight : isComingSoon ? COLORS.textDim : COLORS.textSecondary,
                                  border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                                  transition: "all 0.15s ease", fontFamily: "inherit",
                                  opacity: isComingSoon ? 0.5 : 1,
                                  display: "flex", alignItems: "center", gap: 6,
                                }}
                              >
                                {type === "scheduled" ? "Scheduled" : type === "webhook" ? "Webhook" : "Manual"}
                                {isComingSoon && <span style={{ fontSize: 10, color: COLORS.textDim, fontWeight: 400 }}>soon</span>}
                              </button>
                            );
                          })}
                        </div>
                        {triggerType === "scheduled" && (
                          <div style={{ display: "flex", border: `1px solid ${COLORS.border}`, borderRadius: 6, overflow: "hidden" }}>
                            {SCHEDULES.filter((s) => s.value !== "manual").map((s) => {
                              const active = schedule === s.value;
                              return (
                                <button key={s.value} onClick={() => setSchedule(s.value)} style={{
                                  flex: 1, padding: "8px 0", fontSize: 12, fontWeight: active ? 600 : 400, cursor: "pointer",
                                  color: active ? COLORS.accentLight : COLORS.textDim,
                                  background: active ? COLORS.accentDim : "transparent",
                                  border: "none", borderRight: `1px solid ${COLORS.border}`,
                                  transition: "all 0.15s ease", fontFamily: "inherit",
                                }}>{s.label}</button>
                              );
                            })}
                          </div>
                        )}
                        {triggerType === "manual" && (
                          <p style={{ fontSize: 12, color: COLORS.textDim, margin: 0 }}>Agent runs only when you trigger it manually.</p>
                        )}
                      </SettingsRow>
                    </SettingsCard>

                    {/* ── NOTIFICATIONS ─────────────────────── */}
                    <SectionHeading>Notifications</SectionHeading>
                    <SettingsCard>
                      {/* Approval requests — non-expandable, conditional */}
                      {(() => {
                        const approveCount = Object.values(guardrailLevels).filter((l) => l === "ask").length
                          + (blueprint?.guardrails ?? []).filter((g, i) => !(i in guardrailLevels) && g.defaultLevel === "ask").length;
                        return approveCount > 0 ? (
                          <SettingsRow
                            icon="◉"
                            title="Approval requests"
                            description={`${approveCount} guardrail${approveCount !== 1 ? "s" : ""} require approval`}
                            value={<span style={{ color: COLORS.accent }}>Always</span>}
                          />
                        ) : null;
                      })()}

                      {/* Run complete — toggle visible in row */}
                      <SettingsRow
                        icon="◎"
                        title="Run complete"
                        description="Notify when a run finishes"
                        trailing={<Toggle checked={notifications.inApp} onChange={(v) => setNotifications((prev) => ({ ...prev, inApp: v }))} />}
                      />

                      {/* Daily digest */}
                      <SettingsRow
                        icon="◷"
                        title="Daily digest"
                        description="Summary of agent activity"
                        value={<span style={{ color: COLORS.textDim }}>Coming soon</span>}
                        isLast
                      />
                    </SettingsCard>

                    {/* ── CHANNELS ──────────────────────────── */}
                    <SectionHeading>Channels</SectionHeading>
                    <SettingsCard>
                      {/* In-app — toggle visible in row */}
                      <SettingsRow
                        icon="◎"
                        title="In-app"
                        description="Notifications in Nochore"
                        trailing={<Toggle checked={notifications.inApp} onChange={(v) => setNotifications((prev) => ({ ...prev, inApp: v }))} />}
                      />

                      {/* Email */}
                      <SettingsRow
                        icon="◎"
                        title="Email"
                        description="Email notifications"
                        value={<span style={{ color: COLORS.textDim }}>Coming soon</span>}
                      />

                      {/* Slack — toggle visible if available */}
                      {blueprint?.notifications?.slack ? (
                        <SettingsRow
                          icon="◎"
                          title="Slack"
                          description="Channel notifications"
                          trailing={<Toggle checked={notifications.slack} onChange={(v) => setNotifications((prev) => ({ ...prev, slack: v }))} />}
                          isLast
                        />
                      ) : (
                        <SettingsRow
                          icon="◎"
                          title="Slack"
                          value={<span style={{ color: COLORS.textDim }}>Coming soon</span>}
                          isLast
                        />
                      )}
                    </SettingsCard>
                  </>
                )}
              </div>
            );
          })()}

          {/* Footer — Create agent */}
          {blueprint && (
            <div style={{ flexShrink: 0, padding: "16px 32px 24px", borderTop: `1px solid ${COLORS.border}` }}>
              <button
                onClick={handleLaunch}
                disabled={isLaunching}
                style={{
                  width: "100%",
                  padding: "14px 24px",
                  background: isLaunching ? COLORS.accentDim : COLORS.accent,
                  border: "none",
                  borderRadius: 6,
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
                onMouseEnter={(e) => { if (!isLaunching) e.currentTarget.style.opacity = "0.9"; }}
                onMouseLeave={(e) => { if (!isLaunching) e.currentTarget.style.opacity = "1"; }}
              >
                {isLaunching ? (
                  <>
                    <span style={{ animation: "sw-pulse 1s ease-in-out infinite", display: "inline-block" }}>✦</span>
                    Creating...
                  </>
                ) : (
                  <>
                    Create agent
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


function EditableTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 99,
        background: COLORS.surfaceHover,
        border: `1px solid ${COLORS.border}`,
        fontSize: 12,
        color: COLORS.text,
        lineHeight: 1.4,
      }}
    >
      {label}
      <span
        onClick={onRemove}
        style={{ cursor: "pointer", color: COLORS.textDim, fontSize: 14, lineHeight: 1 }}
      >
        ×
      </span>
    </span>
  );
}


function AddInlineInput({ placeholder, onAdd }: { placeholder: string; onAdd: (value: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && value.trim()) {
          onAdd(value.trim());
          setValue("");
        }
      }}
      placeholder={placeholder}
      style={{
        width: "100%",
        background: "transparent",
        border: "none",
        color: COLORS.textSecondary,
        fontSize: 13,
        outline: "none",
        fontFamily: "inherit",
        padding: "4px 0",
      }}
    />
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

function renderInline(text: string, keyPrefix = ""): React.ReactNode[] {
  // Handle **bold**, *italic*, and `code` inline markers
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${keyPrefix}${i}`} style={{ fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={`${keyPrefix}${i}`}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={`${keyPrefix}${i}`} style={{ background: COLORS.surface, padding: "1px 5px", borderRadius: 4, fontSize: "0.9em" }}>
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Skip --- horizontal rules
    if (/^-{3,}$/.test(line.trim())) { i++; continue; }

    // Headings (### > ## > #)
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const sizes = { 1: 16, 2: 14, 3: 13 } as Record<number, number>;
      elements.push(
        <div key={i} style={{ fontWeight: 600, fontSize: sizes[level] ?? 13, marginTop: elements.length > 0 ? 12 : 0, marginBottom: 4, color: COLORS.text }}>
          {renderInline(headingMatch[2]!, `h${i}-`)}
        </div>,
      );
      i++;
      continue;
    }

    // Numbered list items (1. 2. etc)
    if (/^\d+\.\s/.test(line)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i]!)) {
        const content = lines[i]!.replace(/^\d+\.\s/, "");
        listItems.push(<li key={i} style={{ marginBottom: 4 }}>{renderInline(content, `li${i}-`)}</li>);
        i++;
      }
      elements.push(<ol key={`ol-${i}`} style={{ margin: "4px 0", paddingLeft: 20, listStyleType: "decimal" }}>{listItems}</ol>);
      continue;
    }

    // Bullet list items (- or *)
    if (/^[-*]\s/.test(line)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i]!)) {
        const content = lines[i]!.replace(/^[-*]\s/, "");
        listItems.push(<li key={i} style={{ marginBottom: 4 }}>{renderInline(content, `ul${i}-`)}</li>);
        i++;
      }
      elements.push(<ul key={`ul-${i}`} style={{ margin: "4px 0", paddingLeft: 20 }}>{listItems}</ul>);
      continue;
    }

    // Empty line = paragraph break
    if (!line.trim()) { i++; continue; }

    // Regular paragraph
    elements.push(<p key={i} style={{ margin: "4px 0", lineHeight: 1.55 }}>{renderInline(line, `p${i}-`)}</p>);
    i++;
  }

  return <>{elements}</>;
}

// ---------------------------------------------------------------------------
// Global keyframe CSS
// ---------------------------------------------------------------------------

const PULSE_CSS = `
  @keyframes sw-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
  }
  @keyframes sw-shimmer {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 0.8; }
  }

  /* Themed scrollbars */
  .sw-scroll::-webkit-scrollbar {
    width: 6px;
  }
  .sw-scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  .sw-scroll::-webkit-scrollbar-thumb {
    background: #2A2630;
    border-radius: 3px;
  }
  .sw-scroll::-webkit-scrollbar-thumb:hover {
    background: #352F3D;
  }

  /* Firefox */
  .sw-scroll {
    scrollbar-width: thin;
    scrollbar-color: #2A2630 transparent;
  }
`;
