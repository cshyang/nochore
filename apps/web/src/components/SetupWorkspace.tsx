import { ArrowRight, CheckCircle, CircleNotch, FolderSimplePlus, Sparkle } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { COLORS, RADIUS } from "~/lib/colors";
import type { SkillView } from "~/lib/types";

type SetupWorkspaceProps = {
  availableSkills: SkillView[];
  onCreateProject?: (name: string) => Promise<void>;
};

export function SetupWorkspace({ availableSkills, onCreateProject }: SetupWorkspaceProps) {
  const [projectName, setProjectName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const featuredSkills = useMemo(() => availableSkills.slice(0, 6), [availableSkills]);

  const handleSubmit = async () => {
    const name = projectName.trim();
    if (!name || submitting || !onCreateProject) return;
    setSubmitting(true);
    try {
      await onCreateProject(name);
      setProjectName("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 920,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)",
          gap: 24,
        }}
      >
        <section
          style={{
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.lg,
            padding: 32,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
            <Sparkle size={20} weight="duotone" color={COLORS.accent} />
            <span
              style={{
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: -0.2,
                fontFamily: '"Satoshi", sans-serif',
              }}
            >
              Nochore
            </span>
          </div>

          <div style={{ maxWidth: 560 }}>
            <p
              style={{
                margin: "0 0 12px",
                color: COLORS.accentBright,
                fontSize: 12,
                letterSpacing: 1,
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              First workspace setup
            </p>
            <h1
              style={{
                margin: "0 0 12px",
                fontSize: 40,
                lineHeight: 1.05,
                letterSpacing: -1,
                fontFamily: '"Satoshi", sans-serif',
              }}
            >
              Create your first project and start assigning work.
            </h1>
            <p
              style={{
                margin: "0 0 28px",
                color: COLORS.textSecondary,
                fontSize: 16,
                lineHeight: 1.6,
              }}
            >
              Projects give your agents a shared workspace for goals, context, and runs. Start with a single project
              now—you can add more as your workflows grow.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: 14,
              borderRadius: RADIUS.md,
              background: COLORS.bg,
              border: `1px solid ${COLORS.border}`,
              marginBottom: 28,
            }}
          >
            <FolderSimplePlus size={20} weight="duotone" color={COLORS.accent} />
            <input
              ref={inputRef}
              type="text"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleSubmit();
                }
              }}
              placeholder="Name your first project"
              disabled={submitting || !onCreateProject}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: COLORS.text,
                fontSize: 16,
                fontWeight: 600,
                fontFamily: '"Satoshi", sans-serif',
              }}
            />
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!projectName.trim() || submitting || !onCreateProject}
              style={{
                border: "none",
                borderRadius: RADIUS.md,
                padding: "10px 14px",
                background: !projectName.trim() || submitting || !onCreateProject ? COLORS.border : COLORS.accent,
                color: COLORS.white,
                cursor: !projectName.trim() || submitting || !onCreateProject ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontWeight: 600,
                fontFamily: "inherit",
              }}
            >
              {submitting ? (
                <CircleNotch size={16} weight="bold" style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <>
                  Create project
                  <ArrowRight size={16} weight="bold" />
                </>
              )}
            </button>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {[
              "Create a project home for your agents and runs.",
              "Connect tools and services as your workflow expands.",
              "Use skills to shape what each agent can do safely.",
            ].map((item) => (
              <div key={item} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <CheckCircle size={18} weight="duotone" color={COLORS.green} style={{ marginTop: 2, flexShrink: 0 }} />
                <span style={{ color: COLORS.textSecondary, lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <aside
          style={{
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.lg,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <div>
            <p
              style={{
                margin: "0 0 8px",
                color: COLORS.textDim,
                fontSize: 12,
                letterSpacing: 0.8,
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              Available skills
            </p>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontFamily: '"Satoshi", sans-serif',
              }}
            >
              Ready-to-use capabilities for your first agents.
            </h2>
          </div>

          {featuredSkills.length > 0 ? (
            <div style={{ display: "grid", gap: 10 }}>
              {featuredSkills.map((skill) => (
                <div
                  key={skill.id}
                  style={{
                    padding: "14px 16px",
                    borderRadius: RADIUS.sm,
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{skill.name}</div>
                  {skill.description ? (
                    <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.5 }}>
                      {skill.description}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                padding: 16,
                borderRadius: RADIUS.sm,
                background: COLORS.bg,
                border: `1px solid ${COLORS.border}`,
                color: COLORS.textSecondary,
                lineHeight: 1.5,
              }}
            >
              Skills will appear here once they are available to the workspace.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
