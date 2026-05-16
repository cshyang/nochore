import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { agentConnectionBindings, connections, createDb, createProjectRepositories, projects } from "@nochore/harness";
import { afterEach, describe, expect, it } from "vitest";
import { buildAgentTaskPrompt, resolveAgentConnectionContext } from "./agent-runtime";

const tempDirs: string[] = [];
const previousProjectRoot = process.env.PROJECT_ROOT;

afterEach(async () => {
  process.env.PROJECT_ROOT = previousProjectRoot;
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("buildAgentTaskPrompt", () => {
  it("loads specialist role definitions from capabilities", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "nochore-specialist-"));
    tempDirs.push(root);
    process.env.PROJECT_ROOT = root;

    const rolePath = path.join(root, "capabilities/agents/analyst");
    await mkdir(rolePath, { recursive: true });
    await writeFile(
      path.join(rolePath, "AGENT.md"),
      ["# Analyst", "", "Catalog-backed analyst prompt."].join("\n"),
      "utf-8",
    );

    const prompt = buildAgentTaskPrompt({
      role: "analyst",
      task: "Summarize the numbers.",
      agentInstructions: "Keep the response concise.",
      context: "Use recent data only.",
    });

    expect(prompt).toContain("Catalog-backed analyst prompt.");
    expect(prompt).toContain("Keep the response concise.");
    expect(prompt).toContain("Summarize the numbers.");
    expect(prompt).toContain("Use recent data only.");
  });
});

describe("resolveAgentConnectionContext", () => {
  it("resolves only explicit agent bindings when multiple project connections share a provider", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "nochore-bindings-"));
    tempDirs.push(root);
    const db = createDb(path.join(root, "project.db"));
    const repositories = createProjectRepositories(db);
    const now = Date.now();

    db.insert(projects).values({ id: "project_001", name: "Project", createdAt: now }).run();
    const agentA = await repositories.agentRepository.create({
      id: "agent_a",
      projectId: "project_001",
      name: "Agent A",
      description: "",
      instructions: "Use one inbox.",
      skills: [],
      toolConfig: {
        globalApprovalRequired: false,
        requiredProviders: [{ provider: "gmail" }],
        tools: {},
      },
      notificationConfig: { inApp: true, email: false, slack: false },
      schedule: "manual",
    });
    await repositories.agentRepository.create({
      id: "agent_b",
      projectId: "project_001",
      name: "Agent B",
      description: "",
      instructions: "Use another inbox.",
      skills: [],
      toolConfig: {
        globalApprovalRequired: false,
        requiredProviders: [{ provider: "gmail" }],
        tools: {},
      },
      notificationConfig: { inApp: true, email: false, slack: false },
      schedule: "manual",
    });

    db.insert(connections)
      .values([
        {
          id: "conn_personal",
          projectId: "project_001",
          provider: "gmail",
          composioEntityId: "ca_personal",
          status: "active",
          config: JSON.stringify({ accountLabel: "me@example.com" }),
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "conn_support",
          projectId: "project_001",
          provider: "gmail",
          composioEntityId: "ca_support",
          status: "active",
          config: JSON.stringify({ accountLabel: "support@example.com" }),
          createdAt: now + 1,
          updatedAt: now + 1,
        },
      ])
      .run();
    db.insert(agentConnectionBindings)
      .values({
        id: "binding_support",
        agentId: agentA,
        provider: "gmail",
        connectionId: "conn_support",
        alias: "support_inbox",
        isDefault: true,
        status: "active",
        config: "{}",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const agent = await repositories.agentRepository.getById(agentA);
    if (!agent) throw new Error("missing test agent");

    const context = await resolveAgentConnectionContext({ db, projectId: "project_001", agent });
    expect(context.providerBindings).toHaveLength(1);
    expect(context.providerBindings[0]).toMatchObject({
      provider: "gmail",
      alias: "support_inbox",
      connectionId: "conn_support",
      composioConnectedAccountId: "ca_support",
      accountLabel: "support@example.com",
    });
  });

  it("ignores empty active Google Ads rows that have no OAuth account or customer id", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "nochore-googleads-empty-"));
    tempDirs.push(root);
    const db = createDb(path.join(root, "project.db"));
    const repositories = createProjectRepositories(db);
    const now = Date.now();

    db.insert(projects).values({ id: "project_001", name: "Project", createdAt: now }).run();
    const agentId = await repositories.agentRepository.create({
      id: "agent_googleads",
      projectId: "project_001",
      name: "Google Ads Agent",
      description: "",
      instructions: "Use Google Ads.",
      skills: [],
      toolConfig: {
        globalApprovalRequired: false,
        requiredProviders: [{ provider: "googleads" }],
        tools: {},
      },
      notificationConfig: { inApp: true, email: false, slack: false },
      schedule: "manual",
    });

    db.insert(connections)
      .values({
        id: "conn_empty_googleads",
        projectId: "project_001",
        provider: "googleads",
        composioEntityId: null,
        status: "active",
        config: "{}",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const agent = await repositories.agentRepository.getById(agentId);
    if (!agent) throw new Error("missing test agent");

    const context = await resolveAgentConnectionContext({ db, projectId: "project_001", agent });
    expect(context.activeProviders).toEqual([]);
    expect(context.providerBindings).toEqual([]);
    expect(context.providerConfigs).toEqual({});
  });

  it("does not treat Google Ads OAuth as runnable until a customer id is selected", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "nochore-googleads-oauth-no-customer-"));
    tempDirs.push(root);
    const db = createDb(path.join(root, "project.db"));
    const repositories = createProjectRepositories(db);
    const now = Date.now();

    db.insert(projects).values({ id: "project_001", name: "Project", createdAt: now }).run();
    const agentId = await repositories.agentRepository.create({
      id: "agent_googleads",
      projectId: "project_001",
      name: "Google Ads Agent",
      description: "",
      instructions: "Use Google Ads.",
      skills: [],
      toolConfig: {
        globalApprovalRequired: false,
        requiredProviders: [{ provider: "googleads" }],
        tools: {},
      },
      notificationConfig: { inApp: true, email: false, slack: false },
      schedule: "manual",
    });

    db.insert(connections)
      .values({
        id: "conn_oauth_googleads",
        projectId: "project_001",
        provider: "googleads",
        composioEntityId: "ca_googleads",
        status: "active",
        config: "{}",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const agent = await repositories.agentRepository.getById(agentId);
    if (!agent) throw new Error("missing test agent");

    const context = await resolveAgentConnectionContext({ db, projectId: "project_001", agent });
    expect(context.activeProviders).toEqual([]);
    expect(context.providerBindings).toEqual([]);
    expect(context.providerConfigs).toEqual({});
  });

  it("uses the Composio-authorized Google Ads customer instead of a stale binding resource", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "nochore-googleads-authoritative-customer-"));
    tempDirs.push(root);
    const db = createDb(path.join(root, "project.db"));
    const repositories = createProjectRepositories(db);
    const now = Date.now();

    db.insert(projects).values({ id: "project_001", name: "Project", createdAt: now }).run();
    const agentId = await repositories.agentRepository.create({
      id: "agent_googleads",
      projectId: "project_001",
      name: "Google Ads Agent",
      description: "",
      instructions: "Use Google Ads.",
      skills: [],
      toolConfig: {
        globalApprovalRequired: false,
        requiredProviders: [{ provider: "googleads" }],
        tools: {},
      },
      notificationConfig: { inApp: true, email: false, slack: false },
      schedule: "manual",
    });

    db.insert(connections)
      .values({
        id: "conn_googleads",
        projectId: "project_001",
        provider: "googleads",
        composioEntityId: "ca_googleads",
        status: "active",
        config: JSON.stringify({
          selectedCustomerId: "1073100792",
          selectedCustomerLabel: "107-310-0792",
          selectedCustomerSource: "composio_auth",
        }),
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(agentConnectionBindings)
      .values({
        id: "binding_stale",
        agentId,
        provider: "googleads",
        connectionId: "conn_googleads",
        resourceType: "google_ads_customer",
        resourceId: "4827228419",
        resourceLabel: "482-722-8419",
        alias: "googleads_4827228419",
        isDefault: true,
        status: "active",
        config: "{}",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const agent = await repositories.agentRepository.getById(agentId);
    if (!agent) throw new Error("missing test agent");

    const context = await resolveAgentConnectionContext({ db, projectId: "project_001", agent });
    expect(context.providerBindings).toHaveLength(1);
    expect(context.providerBindings[0]).toMatchObject({
      provider: "googleads",
      connectionId: "conn_googleads",
      resourceId: "1073100792",
      resourceLabel: "107-310-0792",
    });
    expect(context.providerBindings[0].config.selectedCustomerId).toBe("1073100792");
    expect(context.providerConfigs.googleads.selectedCustomerId).toBe("1073100792");
  });
});
