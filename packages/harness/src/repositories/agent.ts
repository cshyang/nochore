import { eq } from "drizzle-orm";
import type { HarnessDb } from "../db/client";
import { agents } from "../db/schema";
import {
  type AgentConfig,
  AgentConfigSchema,
  type AgentSchedule,
  AgentScheduleSchema,
  type AgentStatus,
  AgentStatusSchema,
  NotificationConfigSchema,
  ToolConfigSchema,
} from "../types";
import { parseJson } from "./marshaling";

type Db = HarnessDb;

export interface AgentRecord extends AgentConfig {
  id: string;
  projectId: string;
  name: string;
  description: string;
  status: AgentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAgentInput extends AgentConfig {
  id?: string;
  projectId: string;
  name: string;
  description: string;
  status?: AgentStatus;
}

export class AgentRepository {
  constructor(private db: Db) {}

  async create(input: CreateAgentInput): Promise<string> {
    const id = input.id ?? crypto.randomUUID().slice(0, 12);
    const now = Date.now();
    const config = AgentConfigSchema.parse(input);
    this.db
      .insert(agents)
      .values({
        id,
        projectId: input.projectId,
        name: input.name,
        description: input.description,
        instructions: config.instructions,
        skills: JSON.stringify(config.skills),
        toolConfig: JSON.stringify(config.toolConfig),
        notificationConfig: JSON.stringify(config.notificationConfig),
        schedule: config.schedule,
        primaryMetric: config.primaryMetric ?? null,
        status: input.status ?? "draft",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  async getById(id: string): Promise<AgentRecord | null> {
    const row = this.db.select().from(agents).where(eq(agents.id, id)).get();
    return row ? toAgentRecord(row) : null;
  }

  async listByProject(projectId: string): Promise<AgentRecord[]> {
    return this.db.select().from(agents).where(eq(agents.projectId, projectId)).all().map(toAgentRecord);
  }

  async update(
    id: string,
    patch: Partial<{
      name: string;
      description: string;
      instructions: string;
      skills: string[];
      toolConfig: AgentConfig["toolConfig"];
      notificationConfig: AgentConfig["notificationConfig"];
      schedule: AgentSchedule;
      primaryMetric: string;
      status: AgentStatus;
    }>,
  ): Promise<void> {
    const updateData: Partial<typeof agents.$inferInsert> = {
      updatedAt: Date.now(),
    };

    if (patch.name !== undefined) updateData.name = patch.name;
    if (patch.description !== undefined) updateData.description = patch.description;
    if (patch.instructions !== undefined) updateData.instructions = patch.instructions;
    if (patch.skills !== undefined) updateData.skills = JSON.stringify(patch.skills);
    if (patch.toolConfig !== undefined) {
      updateData.toolConfig = JSON.stringify(ToolConfigSchema.parse(patch.toolConfig));
    }
    if (patch.notificationConfig !== undefined) {
      updateData.notificationConfig = JSON.stringify(NotificationConfigSchema.parse(patch.notificationConfig));
    }
    if (patch.schedule !== undefined) {
      updateData.schedule = AgentScheduleSchema.parse(patch.schedule);
    }
    if (patch.primaryMetric !== undefined) {
      updateData.primaryMetric = patch.primaryMetric || null;
    }
    if (patch.status !== undefined) {
      updateData.status = AgentStatusSchema.parse(patch.status);
    }

    this.db.update(agents).set(updateData).where(eq(agents.id, id)).run();
  }

  async delete(id: string): Promise<void> {
    this.db.delete(agents).where(eq(agents.id, id)).run();
  }
}

function toAgentRecord(row: typeof agents.$inferSelect): AgentRecord {
  const skills = parseJson<unknown[]>(row.skills, []);
  const toolConfig = ToolConfigSchema.parse(parseJson(row.toolConfig, {}));
  const notificationConfig = NotificationConfigSchema.parse(parseJson(row.notificationConfig, {}));

  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    skills: Array.isArray(skills) ? skills.filter((item): item is string => typeof item === "string") : [],
    toolConfig,
    notificationConfig,
    schedule: AgentScheduleSchema.parse(row.schedule),
    primaryMetric: row.primaryMetric ?? undefined,
    status: AgentStatusSchema.parse(row.status),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}
