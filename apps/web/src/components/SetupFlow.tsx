import { useState } from "react";
import { COLORS } from "~/lib/colors";
import type { Project } from "~/lib/types";
import { Badge } from "~/components/Badge";
import { Button } from "~/components/Button";
import { Card } from "~/components/Card";

interface SetupFlowProps {
  project: Project | null;
  onComplete: () => void;
}

interface PolicyOptionProps {
  group: string;
  value: string;
  label: string;
  sublabel?: string;
}

interface SkillMap {
  search: boolean;
  budget: boolean;
  trend: boolean;
}

interface ConnectionMap {
  google: boolean;
  slack: boolean;
}

interface PolicyMap {
  negatives: string;
  budget: string;
}

interface SubAccountMap {
  us: boolean;
  eu: boolean;
  apac: boolean;
}

export function SetupFlow({ project, onComplete }: SetupFlowProps) {
  const [step, setStep] = useState(0);
  const [text, setText] = useState("");
  const [showTemplates, setShowTemplates] = useState(true);
  const [skills, setSkills] = useState<SkillMap>({ search: true, budget: true, trend: false });
  const [connections, setConnections] = useState<ConnectionMap>({ google: false, slack: false });
  const [policies, setPolicies] = useState<PolicyMap>({ negatives: "auto", budget: "tiered" });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedSubAccounts, setSelectedSubAccounts] = useState<SubAccountMap>({ us: true, eu: true, apac: false });

  const templates = [
    { icon: "📊", name: "Ad Spend Manager", desc: "Monitor and optimize advertising budgets", apps: ["Google Ads", "Slack"], appIcons: ["📊", "💬"] },
    { icon: "🛒", name: "E-commerce Monitor", desc: "Track orders, inventory, and revenue", apps: ["Shopify", "Stripe", "Slack"], appIcons: ["🛒", "💳", "💬"] },
    { icon: "🔍", name: "Competitor Tracker", desc: "Watch competitor pricing and activity", apps: ["Web", "Slack"], appIcons: ["🌐", "💬"] },
  ];

  const skillList = [
    { key: "search" as const, name: "Search Term Analysis", desc: "Detects wasteful search terms and suggests negatives", recommended: true },
    { key: "budget" as const, name: "Budget Allocation", desc: "Spots over/under-spending across campaigns", recommended: true },
    { key: "trend" as const, name: "Trend Forecasting", desc: "Predicts next-week performance trends", recommended: false },
  ];

  const toolList = [
    { key: "google" as const, name: "Google Ads", icon: "📊", reason: "Pull campaign and search term data" },
    { key: "slack" as const, name: "Slack", icon: "💬", reason: "Send alerts and recommendations" },
  ];

  const PolicyOption = ({ group, value, label, sublabel }: PolicyOptionProps) => (
    <div onClick={() => setPolicies((prev) => ({ ...prev, [group]: value }))}
      style={{
        display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 12px", borderRadius: 8, cursor: "pointer",
        background: policies[group as keyof PolicyMap] === value ? COLORS.accentDim : "transparent", transition: "background 0.15s ease",
      }}>
      <div style={{
        width: 20, height: 20, borderRadius: 99, border: `2px solid ${policies[group as keyof PolicyMap] === value ? COLORS.accent : COLORS.borderLight}`,
        background: policies[group as keyof PolicyMap] === value ? COLORS.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1,
      }}>
        {policies[group as keyof PolicyMap] === value && <div style={{ width: 8, height: 8, borderRadius: 99, background: COLORS.white }} />}
      </div>
      <div>
        <div style={{ fontSize: 14, color: COLORS.text, fontWeight: policies[group as keyof PolicyMap] === value ? 600 : 400 }}>{label}</div>
        {sublabel && <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>{sublabel}</div>}
      </div>
    </div>
  );

  if (step === 0) {
    return (
      <div>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✦</div>
          <h2 style={{ color: COLORS.text, fontSize: 22, fontWeight: 600, margin: 0 }}>What do you want your agent to help with?</h2>
          {project && <p style={{ color: COLORS.textSecondary, marginTop: 8, fontSize: 14 }}>Adding to {project.icon} {project.name}</p>}
        </div>
        <div style={{ background: COLORS.surface, border: `1px solid ${text ? COLORS.accent : COLORS.border}`, borderRadius: 12, padding: 16, transition: "border-color 0.15s ease" }}>
          <textarea value={text} onChange={(e) => { setText(e.target.value); setShowTemplates(e.target.value.length === 0); }}
            placeholder="e.g. Monitor our Google Ads and flag budget waste..."
            rows={3} style={{ width: "100%", background: "transparent", border: "none", color: COLORS.text, fontSize: 15, lineHeight: 1.6, resize: "none", outline: "none", fontFamily: "inherit" }} />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <Button onClick={() => setStep(1)} variant={text ? "primary" : "secondary"}>Continue →</Button>
          </div>
        </div>
        {showTemplates && (
          <div style={{ marginTop: 28 }}>
            <p style={{ color: COLORS.textDim, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Or start from a template</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {templates.map((t) => (
                <Card key={t.name} onClick={() => { setText(t.desc); setShowTemplates(false); }} style={{ padding: 16, cursor: "pointer", textAlign: "center" }}>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginBottom: 8, minHeight: 24 }}>
                    {t.appIcons.map((ai, idx) => (
                      <span key={idx} title={t.apps[idx]} style={{
                        width: 24, height: 24, borderRadius: 4, background: COLORS.surfaceHover,
                        display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12,
                      }}>{ai}</span>
                    ))}
                  </div>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>{t.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 4 }}>{t.desc}</div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (step === 1) {
    const allConnected = connections.google && connections.slack;
    const hasSubAccountSelection = Object.values(selectedSubAccounts).some(Boolean);

    // Scaffold status items
    const scaffoldItems = [
      { label: "Search Term Analysis", status: "ready", detail: "Detects wasteful terms, suggests negatives" },
      { label: "Budget Allocation", status: "ready", detail: "Spots over/under-spending across campaigns" },
      { label: "Google Ads", status: connections.google ? "ready" : "needs_action", detail: connections.google ? "Connected via project" : "Needs connection", actionLabel: "Connect" },
      { label: "Slack", status: connections.slack ? "ready" : "optional", detail: connections.slack ? "Connected for alerts" : "Optional — for sending alerts", actionLabel: "Connect" },
      { label: "Sub-accounts", status: connections.google ? (hasSubAccountSelection ? "ready" : "needs_action") : "blocked", detail: connections.google ? "Select which accounts to monitor" : "Connect Google Ads first" },
    ];

    return (
      <div>
        <p style={{ color: COLORS.accentLight, fontSize: 13, fontWeight: 600, marginBottom: 4 }}>STEP 2 OF 3</p>
        <h2 style={{ color: COLORS.text, fontSize: 20, fontWeight: 600, margin: "0 0 6px" }}>Here's what I'd set up for you</h2>
        <p style={{ color: COLORS.textSecondary, fontSize: 14, marginBottom: 20 }}>Based on your description, I've configured what I can and flagged what needs you.</p>

        {/* AI scaffold summary — chat-like presentation */}
        <Card style={{ marginBottom: 20, padding: 24, borderColor: COLORS.accent, background: COLORS.accentSubtle }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 14, color: COLORS.accent }}>✦</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.accentLight }}>Agent Configuration</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {scaffoldItems.map((item) => {
              const isReady = item.status === "ready";
              const needsAction = item.status === "needs_action";
              const isOptional = item.status === "optional";
              const isBlocked = item.status === "blocked";
              return (
                <div key={item.label} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 8,
                  background: needsAction ? COLORS.yellowDim : isBlocked ? COLORS.grayDim : "transparent",
                  border: needsAction ? `1px solid ${COLORS.yellowDim}` : "1px solid transparent",
                }}>
                  <span style={{ fontSize: 15, flexShrink: 0 }}>
                    {isReady ? "✅" : needsAction ? "⚠️" : isOptional ? "○" : "🔒"}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: isBlocked ? COLORS.textDim : COLORS.text }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: isBlocked ? COLORS.textDim : COLORS.textSecondary, marginTop: 1 }}>{item.detail}</div>
                  </div>
                  {(needsAction || isOptional) && item.actionLabel && (
                    <Button size="sm" variant={needsAction ? "primary" : "secondary"}
                      onClick={() => {
                        if (item.label === "Google Ads") setConnections(p => ({ ...p, google: true }));
                        if (item.label === "Slack") setConnections(p => ({ ...p, slack: true }));
                      }}>
                      {item.actionLabel}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Sub-account picker — appears when Google Ads is connected */}
        {connections.google && (
          <Card style={{ marginBottom: 20, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 14 }}>⚠️</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>Which accounts should I monitor?</span>
            </div>
            <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 12 }}>
              Your Google Ads manager account has 3 sub-accounts. Select which ones this agent can access.
            </div>
            <div style={{ background: COLORS.bg, borderRadius: 8, padding: 8 }}>
              {[
                { key: "us" as const, name: "Acme Corp — US", id: "111-222-3333" },
                { key: "eu" as const, name: "Acme Corp — EU", id: "111-222-4444" },
                { key: "apac" as const, name: "Acme Corp — APAC", id: "111-222-5555" },
              ].map((sub) => (
                <div key={sub.key}
                  onClick={() => setSelectedSubAccounts(p => ({ ...p, [sub.key]: !p[sub.key] }))}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", cursor: "pointer",
                    borderBottom: `1px solid ${COLORS.border}`,
                  }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 4,
                    border: `2px solid ${selectedSubAccounts[sub.key] ? COLORS.accent : COLORS.borderLight}`,
                    background: selectedSubAccounts[sub.key] ? COLORS.accent : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, color: COLORS.white, flexShrink: 0,
                  }}>
                    {selectedSubAccounts[sub.key] ? "✓" : ""}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: COLORS.text }}>{sub.name}</div>
                    <div style={{ fontSize: 12, color: COLORS.textDim }}>{sub.id}</div>
                  </div>
                  {selectedSubAccounts[sub.key] && <Badge color="green">Active</Badge>}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Skills detail — collapsed by default, expandable */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
            Adjust skills
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {skillList.map((s) => (
              <Card key={s.key} onClick={() => setSkills((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
                style={{ padding: 12, display: "flex", alignItems: "center", gap: 12, cursor: "pointer", borderColor: skills[s.key] ? COLORS.accent : COLORS.border, background: skills[s.key] ? COLORS.accentDim : COLORS.surface }}>
                <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${skills[s.key] ? COLORS.accent : COLORS.borderLight}`, background: skills[s.key] ? COLORS.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 12, color: COLORS.white }}>
                  {skills[s.key] ? "✓" : ""}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{s.name}</span>
                    {s.recommended && <Badge color="accent">Recommended</Badge>}
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 1 }}>{s.desc}</div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Button variant="ghost" onClick={() => setStep(0)}>← Back</Button>
          <Button onClick={() => setStep(2)}>Set ground rules →</Button>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div>
        <p style={{ color: COLORS.accentLight, fontSize: 13, fontWeight: 600, marginBottom: 4 }}>STEP 3 OF 3</p>
        <h2 style={{ color: COLORS.text, fontSize: 20, fontWeight: 600, margin: "0 0 6px" }}>Before I start, a few ground rules</h2>
        <p style={{ color: COLORS.textSecondary, fontSize: 14, marginBottom: 20 }}>Set how much autonomy your agent has. You can always adjust these later.</p>

        {/* Negative keywords policy */}
        <Card style={{ marginBottom: 12, padding: 16 }}>
          <p style={{ color: COLORS.text, fontSize: 14, fontWeight: 600, marginBottom: 12 }}>When I find wasteful search terms...</p>
          <PolicyOption group="negatives" value="auto" label="Add negative keywords automatically" sublabel="I'll handle it and keep you posted" />
          <PolicyOption group="negatives" value="ask" label="Show me first, I'll decide" />
          <PolicyOption group="negatives" value="notify" label="Add them, but notify me after" />
        </Card>

        {/* Budget policy — with tiered thresholds */}
        <Card style={{ marginBottom: 12, padding: 16 }}>
          <p style={{ color: COLORS.text, fontSize: 14, fontWeight: 600, marginBottom: 12 }}>For budget changes...</p>
          <PolicyOption group="budget" value="tiered" label="Smart thresholds" sublabel="Different rules based on amount" />
          <PolicyOption group="budget" value="ask" label="Always ask me first" sublabel="I'll propose, you approve" />
          <PolicyOption group="budget" value="never" label="Never touch budgets" />

          {/* Tiered breakdown — shows when "smart thresholds" is selected */}
          {policies.budget === "tiered" && (
            <div style={{ marginTop: 16, marginLeft: 28, padding: 16, background: COLORS.bg, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
              <div style={{ fontSize: 12, color: COLORS.accentLight, fontWeight: 600, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Threshold rules
              </div>
              {[
                { range: "Under $50/day", action: "Auto-approve", color: COLORS.green, icon: "✅", desc: "Small changes, let the agent handle it" },
                { range: "$50 – $200/day", action: "Ask me first", color: COLORS.yellow, icon: "🟡", desc: "Medium changes, I'll review before executing" },
                { range: "Over $200/day", action: "Ask + explain reasoning", color: COLORS.red, icon: "🔴", desc: "Large changes, show full analysis" },
              ].map((tier, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0",
                  borderBottom: i < 2 ? `1px solid ${COLORS.border}` : "none",
                }}>
                  <span style={{ fontSize: 14, marginTop: 1 }}>{tier.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{tier.range}</span>
                      <Badge color={tier.color === COLORS.green ? "green" : tier.color === COLORS.yellow ? "yellow" : "red"}>
                        {tier.action}
                      </Badge>
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>{tier.desc}</div>
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 12, fontSize: 12, color: COLORS.textDim, fontStyle: "italic" }}>
                Thresholds are customizable after setup
              </div>
            </div>
          )}
        </Card>

        {/* Global override */}
        <Card style={{ marginBottom: 16, padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>Require approval for ALL actions</div>
            <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 4 }}>Override all policies — nothing runs without your OK</div>
          </div>
          <div style={{
            width: 48, height: 24, borderRadius: 99, background: COLORS.border, cursor: "pointer",
            display: "flex", alignItems: "center", padding: 4, transition: "background 0.15s ease",
          }}>
            <div style={{ width: 16, height: 16, borderRadius: 99, background: COLORS.textSecondary, transition: "transform 0.15s ease" }} />
          </div>
        </Card>

        {/* Advanced settings */}
        <div onClick={() => setShowAdvanced(!showAdvanced)}
          style={{ display: "flex", alignItems: "center", gap: 8, color: COLORS.textSecondary, fontSize: 13, cursor: "pointer", marginBottom: 16, padding: "4px 0" }}>
          <span style={{ transform: showAdvanced ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s ease", display: "inline-block" }}>▶</span>
          Advanced settings
        </div>

        {showAdvanced && (
          <Card style={{ marginBottom: 16, padding: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: COLORS.textSecondary, display: "block", marginBottom: 8 }}>Max total budget change / day</label>
                <div style={{ padding: "8px 12px", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 14 }}>$ 500</div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: COLORS.textSecondary, display: "block", marginBottom: 8 }}>Check frequency</label>
                <div style={{ padding: "8px 12px", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 14 }}>Every 6 hours</div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: COLORS.textSecondary, display: "block", marginBottom: 8 }}>Active hours</label>
                <div style={{ padding: "8px 12px", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 14 }}>9am – 6pm EST</div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: COLORS.textSecondary, display: "block", marginBottom: 8 }}>Notify via</label>
                <div style={{ padding: "8px 12px", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 14 }}>Slack + In-app</div>
              </div>
            </div>
          </Card>
        )}

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Button variant="ghost" onClick={() => setStep(1)}>← Back</Button>
          <Button onClick={() => setStep(3)}>Launch agent →</Button>
        </div>
      </div>
    );
  }

  // Step 3: Complete
  return (
    <div style={{ textAlign: "center", paddingTop: 40 }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>✦</div>
      <h2 style={{ color: COLORS.text, fontSize: 24, fontWeight: 600, margin: 0 }}>Your agent is live</h2>
      <p style={{ color: COLORS.textSecondary, marginTop: 8, fontSize: 15, lineHeight: 1.6 }}>
        Ad Spend Guardian is now monitoring your campaigns.
        {project && <><br />Added to {project.icon} {project.name}</>}
      </p>

      <Card style={{ marginTop: 28, textAlign: "left", maxWidth: 400, margin: "28px auto 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accentLight})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>✦</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.text }}>Ad Spend Guardian</div>
            <Badge color="green">Active</Badge>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
          <div><div style={{ color: COLORS.textDim, marginBottom: 3 }}>Skills</div><div style={{ color: COLORS.textSecondary }}>Search Terms · Budget</div></div>
          <div><div style={{ color: COLORS.textDim, marginBottom: 3 }}>Tools</div><div style={{ color: COLORS.textSecondary }}>Google Ads · Slack</div></div>
          <div><div style={{ color: COLORS.textDim, marginBottom: 3 }}>Policy</div><div style={{ color: COLORS.textSecondary }}>Auto negatives · Ask budgets</div></div>
          <div><div style={{ color: COLORS.textDim, marginBottom: 3 }}>Schedule</div><div style={{ color: COLORS.textSecondary }}>Every 6 hours</div></div>
        </div>
      </Card>

      <div style={{ marginTop: 28 }}>
        <Button onClick={onComplete} size="lg">Go to dashboard →</Button>
      </div>
    </div>
  );
}
