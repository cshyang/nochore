export type CapabilityOrigin = "capabilities";

export interface CapabilityLookupOptions {
  repoRoot?: string;
  rootDir?: string;
}

export interface CapabilityDefinitionBase {
  id: string;
  name: string;
  description: string;
  path: string;
  source: string;
  body: string;
  origin: CapabilityOrigin;
}

export interface SkillDefinition extends CapabilityDefinitionBase {
  knowledgeFiles: string[];
  instructions: string;
  product: boolean;
}

export interface AgentDefinition extends CapabilityDefinitionBase {
  instructions: string;
  icon?: string;
  model?: string;
  role?: string;
  sourceType?: string;
}

export interface PromptDefinition extends CapabilityDefinitionBase {
  template: string;
}
