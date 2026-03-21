import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { generateText } from "ai";

import { createTestDb } from "../../db/client";
import { SqliteMemoryStore } from "../../memory/store";
import { ChatSessionStore } from "../../repositories/chat-session";
import { ApprovalRepository } from "../../repositories/approval";
import { RunRepository } from "../../repositories/run";
import { WorkspaceStore } from "../../workspace/store";
import { StubConnectionManager } from "../../connections/stub";
import { SkillRegistry } from "../../skills/registry";
import { handleChat, type ChatDependencies } from "../handler";
import type { AgentConfig } from "../../types/agent-config";
import type { ContextAssembler, AssembledContext } from "../../context/assembler";

// ---------------------------------------------------------------------------
// Mock the AI SDK — we do NOT want real LLM calls in tests
// ---------------------------------------------------------------------------

vi.mock("ai", async () => {
  const actual = await vi.importActual("ai");
  return {
    ...actual,
    generateText: vi.fn().mockResolvedValue({
      text: "I analyzed your campaigns and found 3 issues.",
      steps: [],
      toolCalls: [],
    }),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AGENT_ID = "agent_chat_test";

let tmpDir: string;

async function createTmpWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "chat-handler-test-"));
  await fs.mkdir(path.join(dir, "scratchpad"), { recursive: true });
  await fs.mkdir(path.join(dir, "reports"), { recursive: true });
  return dir;
}

function makeConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    id: AGENT_ID,
    projectId: "proj_001",
    name: "Test Agent",
    description: "Test agent for chat handler",
    intent: "Monitor ads",
    workspacePath: tmpDir,
    skills: ["search_terms"],
    skillKnowledge: {},
    triggers: [],
    policyRules: [],
    policyOverrides: [],
    globalApprovalRequired: false,
    operationalConstraints: [],
    connectionIds: [],
    memoryEnabled: true,
    lessonDistillationInterval: 100,
    scopeStrategy: "static",
    ...overrides,
  };
}

function makeContextAssembler(): ContextAssembler {
  return {
    forChat: vi.fn().mockResolvedValue({
      systemPrompt: "You are a helpful ads agent.",
      metadata: { step: "chat", agentId: AGENT_ID },
    } satisfies AssembledContext),
    forScopeResolution: vi.fn(),
    forSkillExecution: vi.fn(),
    forPlanning: vi.fn(),
  } as unknown as ContextAssembler;
}

function buildDeps(overrides?: Partial<ChatDependencies>): ChatDependencies {
  const db = createTestDb();
  return {
    memoryStore: new SqliteMemoryStore(db),
    skillRegistry: new SkillRegistry(),
    connectionManager: new StubConnectionManager({}),
    contextAssembler: makeContextAssembler(),
    approvalRepository: new ApprovalRepository(db),
    runRepository: new RunRepository(db),
    chatSessionStore: new ChatSessionStore(db),
    workspaceStore: new WorkspaceStore(tmpDir),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleChat", () => {
  beforeEach(async () => {
    tmpDir = await createTmpWorkspace();
    vi.mocked(generateText).mockReset();
    vi.mocked(generateText).mockResolvedValue({
      text: "I analyzed your campaigns and found 3 issues.",
      steps: [],
      toolCalls: [],
    } as any);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // 1. Basic flow
  // -------------------------------------------------------------------------

  it("returns response text from generateText", async () => {
    const deps = buildDeps();
    const config = makeConfig();

    const result = await handleChat({
      agentId: AGENT_ID,
      config,
      message: "How are my campaigns doing?",
      deps,
    });

    expect(result.response).toBe(
      "I analyzed your campaigns and found 3 issues."
    );
    expect(result.toolCalls).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 2. Context assembly
  // -------------------------------------------------------------------------

  it("passes system prompt from contextAssembler.forChat() to generateText", async () => {
    const contextAssembler = makeContextAssembler();
    const deps = buildDeps({ contextAssembler });
    const config = makeConfig();

    await handleChat({
      agentId: AGENT_ID,
      config,
      message: "Check performance",
      deps,
    });

    // contextAssembler.forChat should have been called with agentId
    expect(contextAssembler.forChat).toHaveBeenCalledWith(AGENT_ID);

    // generateText should receive the system prompt
    const call = vi.mocked(generateText).mock.calls[0]![0] as any;
    expect(call.system).toBe("You are a helpful ads agent.");
  });

  // -------------------------------------------------------------------------
  // 3. History loading
  // -------------------------------------------------------------------------

  it("loads chat history and includes it in messages to generateText", async () => {
    const db = createTestDb();
    const chatSessionStore = new ChatSessionStore(db);
    const deps = buildDeps({
      chatSessionStore,
      memoryStore: new SqliteMemoryStore(db),
      approvalRepository: new ApprovalRepository(db),
      runRepository: new RunRepository(db),
    });
    const config = makeConfig();

    // Pre-populate history
    await chatSessionStore.append({
      agentId: AGENT_ID,
      role: "user",
      content: "Previous question",
      createdAt: new Date(Date.now() - 2000),
    });
    await chatSessionStore.append({
      agentId: AGENT_ID,
      role: "assistant",
      content: "Previous answer",
      createdAt: new Date(Date.now() - 1000),
    });

    await handleChat({
      agentId: AGENT_ID,
      config,
      message: "Follow-up question",
      deps,
    });

    const call = vi.mocked(generateText).mock.calls[0]![0] as any;
    const messages = call.messages;

    // Should have: history user + history assistant + current user
    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({ role: "user", content: "Previous question" });
    expect(messages[1]).toEqual({
      role: "assistant",
      content: "Previous answer",
    });
    expect(messages[2]).toEqual({
      role: "user",
      content: "Follow-up question",
    });
  });

  // -------------------------------------------------------------------------
  // 4. Message persistence
  // -------------------------------------------------------------------------

  it("persists user message and assistant response in chat session store", async () => {
    const db = createTestDb();
    const chatSessionStore = new ChatSessionStore(db);
    const deps = buildDeps({
      chatSessionStore,
      memoryStore: new SqliteMemoryStore(db),
      approvalRepository: new ApprovalRepository(db),
      runRepository: new RunRepository(db),
    });
    const config = makeConfig();

    await handleChat({
      agentId: AGENT_ID,
      config,
      message: "What happened today?",
      deps,
    });

    const history = await chatSessionStore.loadHistory(AGENT_ID);
    expect(history).toHaveLength(2);

    expect(history[0].role).toBe("user");
    expect(history[0].content).toBe("What happened today?");
    expect(history[0].agentId).toBe(AGENT_ID);

    expect(history[1].role).toBe("assistant");
    expect(history[1].content).toBe(
      "I analyzed your campaigns and found 3 issues."
    );
    expect(history[1].agentId).toBe(AGENT_ID);
  });

  // -------------------------------------------------------------------------
  // 5. Tools registered
  // -------------------------------------------------------------------------

  it("passes all 8 tool factories to generateText", async () => {
    const deps = buildDeps();
    const config = makeConfig();

    await handleChat({
      agentId: AGENT_ID,
      config,
      message: "Do analysis",
      deps,
    });

    const call = vi.mocked(generateText).mock.calls[0]![0] as any;
    const toolNames = Object.keys(call.tools);

    expect(toolNames).toContain("read_workspace");
    expect(toolNames).toContain("write_scratchpad");
    expect(toolNames).toContain("generate_report");
    expect(toolNames).toContain("run_analysis");
    expect(toolNames).toContain("query_memory");
    expect(toolNames).toContain("get_insights");
    expect(toolNames).toContain("apply_action");
    expect(toolNames).toContain("explain_decision");
    expect(toolNames).toHaveLength(8);
  });

  // -------------------------------------------------------------------------
  // 6. Config model
  // -------------------------------------------------------------------------

  it("uses the model from config when provided", async () => {
    const deps = buildDeps();
    const config = makeConfig({ model: "claude-sonnet-4-20250514" });

    await handleChat({
      agentId: AGENT_ID,
      config,
      message: "Test model config",
      deps,
    });

    const call = vi.mocked(generateText).mock.calls[0]![0] as any;
    // The model should be created via createAnthropic() with the config model
    expect(call.model).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 7. Tool calls extraction from steps
  // -------------------------------------------------------------------------

  it("extracts tool calls from result steps", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: "I found wasteful keywords.",
      steps: [
        {
          toolCalls: [
            {
              toolName: "query_memory",
              args: { type: "lessons" },
            },
          ],
          toolResults: [
            {
              toolName: "query_memory",
              result: { type: "lessons", results: [] },
            },
          ],
        },
      ],
      toolCalls: [],
    } as any);

    const deps = buildDeps();
    const config = makeConfig();

    const result = await handleChat({
      agentId: AGENT_ID,
      config,
      message: "What have you learned?",
      deps,
    });

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].toolName).toBe("query_memory");
    expect(result.toolCalls[0].args).toEqual({ type: "lessons" });
    expect(result.toolCalls[0].result).toEqual({
      type: "lessons",
      results: [],
    });
  });

  // -------------------------------------------------------------------------
  // 8. History filters out tool-role messages
  // -------------------------------------------------------------------------

  it("skips tool-role messages when building history for generateText", async () => {
    const db = createTestDb();
    const chatSessionStore = new ChatSessionStore(db);
    const deps = buildDeps({
      chatSessionStore,
      memoryStore: new SqliteMemoryStore(db),
      approvalRepository: new ApprovalRepository(db),
      runRepository: new RunRepository(db),
    });
    const config = makeConfig();

    // Populate history including a tool message
    await chatSessionStore.append({
      agentId: AGENT_ID,
      role: "user",
      content: "Run analysis",
      createdAt: new Date(Date.now() - 3000),
    });
    await chatSessionStore.append({
      agentId: AGENT_ID,
      role: "tool",
      content: '{"result": "done"}',
      toolCallId: "call_1",
      createdAt: new Date(Date.now() - 2000),
    });
    await chatSessionStore.append({
      agentId: AGENT_ID,
      role: "assistant",
      content: "Analysis complete.",
      createdAt: new Date(Date.now() - 1000),
    });

    await handleChat({
      agentId: AGENT_ID,
      config,
      message: "What next?",
      deps,
    });

    const call = vi.mocked(generateText).mock.calls[0]![0] as any;
    const messages = call.messages;

    // Should have: history user + history assistant + current user (tool skipped)
    expect(messages).toHaveLength(3);
    expect(messages.every((m: any) => m.role !== "tool")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 9. maxSteps is set to 5
  // -------------------------------------------------------------------------

  it("sets maxSteps to 5 in generateText call", async () => {
    const deps = buildDeps();
    const config = makeConfig();

    await handleChat({
      agentId: AGENT_ID,
      config,
      message: "Do something",
      deps,
    });

    const call = vi.mocked(generateText).mock.calls[0]![0] as any;
    expect(call.maxSteps).toBe(5);
  });
});
