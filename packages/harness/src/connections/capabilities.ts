import { z } from "zod";
import type { ToolApprovalMode, ToolConfig, ToolConfigEntry, ToolMode } from "../types";

export interface ToolCapabilityDefinition {
  toolName: string;
  slug: string;
  provider: string;
  title: string;
  description: string;
  mode: ToolMode;
  inputSchema: z.ZodTypeAny;
  defaultApprovalMode: ToolApprovalMode;
}

const readQuerySchema = z
  .object({
    dateRange: z.string().optional(),
    campaignId: z.string().optional(),
    adGroupId: z.string().optional(),
    limit: z.number().int().positive().optional(),
  })
  .catchall(z.unknown());

const addNegativeKeywordSchema = z
  .object({
    keyword: z.string(),
    matchType: z.enum(["EXACT", "PHRASE", "BROAD"]).optional(),
    campaignId: z.string().optional(),
    adGroupId: z.string().optional(),
  })
  .catchall(z.unknown());

const adjustBudgetSchema = z
  .object({
    campaignId: z.string(),
    amount: z.number().optional(),
    percentage: z.number().optional(),
  })
  .catchall(z.unknown());

const pauseEntitySchema = z
  .object({
    customerId: z.string().optional(),
    campaignId: z.string().optional(),
    adGroupId: z.string().optional(),
    adId: z.string().optional(),
    keywordId: z.string().optional(),
  })
  .catchall(z.unknown());

const updateBidSchema = z
  .object({
    keywordId: z.string(),
    bid: z.number(),
  })
  .catchall(z.unknown());

const slackMessageSchema = z
  .object({
    channel: z.string(),
    text: z.string(),
  })
  .catchall(z.unknown());

const gmailSendSchema = z
  .object({
    recipient_email: z.string(),
    subject: z.string(),
    body: z.string(),
  })
  .catchall(z.unknown());

export const DEFAULT_TOOL_CAPABILITIES: ToolCapabilityDefinition[] = [
  {
    toolName: "googleads_search_terms_report",
    slug: "GOOGLEADS_SEARCH_TERMS_REPORT",
    provider: "googleads",
    title: "Search Terms Report",
    description: "Read Google Ads search terms for waste and intent analysis.",
    mode: "read",
    inputSchema: readQuerySchema,
    defaultApprovalMode: "auto",
  },
  {
    toolName: "googleads_campaign_performance",
    slug: "GOOGLEADS_CAMPAIGN_PERFORMANCE",
    provider: "googleads",
    title: "Campaign Performance",
    description: "Read campaign spend, clicks, conversions, CPA, and trends.",
    mode: "read",
    inputSchema: readQuerySchema,
    defaultApprovalMode: "auto",
  },
  {
    toolName: "googleads_campaign_budgets",
    slug: "GOOGLEADS_CAMPAIGN_BUDGETS",
    provider: "googleads",
    title: "Campaign Budgets",
    description: "Read Google Ads budget configuration and pacing data.",
    mode: "read",
    inputSchema: readQuerySchema,
    defaultApprovalMode: "auto",
  },
  {
    toolName: "googleads_impression_share",
    slug: "GOOGLEADS_IMPRESSION_SHARE",
    provider: "googleads",
    title: "Impression Share",
    description: "Read impression share and auction visibility metrics.",
    mode: "read",
    inputSchema: readQuerySchema,
    defaultApprovalMode: "auto",
  },
  {
    toolName: "googleads_quality_scores",
    slug: "GOOGLEADS_QUALITY_SCORES",
    provider: "googleads",
    title: "Quality Scores",
    description: "Read keyword quality score signals.",
    mode: "read",
    inputSchema: readQuerySchema,
    defaultApprovalMode: "auto",
  },
  {
    toolName: "googleads_add_negative_keyword",
    slug: "GOOGLEADS_ADD_NEGATIVE_KEYWORD",
    provider: "googleads",
    title: "Add Negative Keyword",
    description: "Create a negative keyword in Google Ads.",
    mode: "write",
    inputSchema: addNegativeKeywordSchema,
    defaultApprovalMode: "approval",
  },
  {
    toolName: "googleads_adjust_budget",
    slug: "GOOGLEADS_ADJUST_BUDGET",
    provider: "googleads",
    title: "Adjust Budget",
    description: "Update a Google Ads campaign budget.",
    mode: "write",
    inputSchema: adjustBudgetSchema,
    defaultApprovalMode: "approval",
  },
  {
    toolName: "googleads_pause_ad",
    slug: "GOOGLEADS_PAUSE_AD",
    provider: "googleads",
    title: "Pause Ad",
    description: "Pause a Google Ads ad.",
    mode: "write",
    inputSchema: pauseEntitySchema,
    defaultApprovalMode: "approval",
  },
  {
    toolName: "googleads_pause_keyword",
    slug: "GOOGLEADS_PAUSE_KEYWORD",
    provider: "googleads",
    title: "Pause Keyword",
    description: "Pause a Google Ads keyword.",
    mode: "write",
    inputSchema: pauseEntitySchema,
    defaultApprovalMode: "approval",
  },
  {
    toolName: "googleads_update_bid",
    slug: "GOOGLEADS_UPDATE_BID",
    provider: "googleads",
    title: "Update Bid",
    description: "Update a keyword bid in Google Ads.",
    mode: "write",
    inputSchema: updateBidSchema,
    defaultApprovalMode: "approval",
  },
  {
    toolName: "meta_pause_campaign",
    slug: "METAADS_PAUSE_CAMPAIGN",
    provider: "meta",
    title: "Pause Campaign",
    description: "Pause a Meta Ads campaign.",
    mode: "write",
    inputSchema: pauseEntitySchema,
    defaultApprovalMode: "approval",
  },
  {
    toolName: "slack_send_message",
    slug: "SLACK_SEND_MESSAGE",
    provider: "slack",
    title: "Send Slack Message",
    description: "Send an approval or finding notification to Slack.",
    mode: "write",
    inputSchema: slackMessageSchema,
    defaultApprovalMode: "auto",
  },
  {
    toolName: "gmail_send_email",
    slug: "GMAIL_SEND_EMAIL",
    provider: "gmail",
    title: "Send Email",
    description: "Send an approval or finding notification by email.",
    mode: "write",
    inputSchema: gmailSendSchema,
    defaultApprovalMode: "auto",
  },
];

export const DEFAULT_TOOL_CAPABILITY_MAP = new Map(
  DEFAULT_TOOL_CAPABILITIES.map((tool) => [tool.toolName, tool]),
);

export function getToolCapabilitiesForProviders(
  providers: Iterable<string>,
): ToolCapabilityDefinition[] {
  const activeProviders = new Set(providers);
  return DEFAULT_TOOL_CAPABILITIES.filter((tool) =>
    activeProviders.has(tool.provider),
  );
}

export function getToolCapability(toolName: string): ToolCapabilityDefinition | undefined {
  return DEFAULT_TOOL_CAPABILITY_MAP.get(toolName);
}

export function buildDefaultToolConfig(
  providers: Iterable<string>,
  requiredProviders: ToolConfig["requiredProviders"] = [],
): ToolConfig {
  const tools = Object.fromEntries(
    getToolCapabilitiesForProviders(providers).map((tool) => [
      tool.toolName,
      {
        toolName: tool.toolName,
        slug: tool.slug,
        provider: tool.provider,
        title: tool.title,
        description: tool.description,
        mode: tool.mode,
        enabled: true,
        approvalMode: tool.defaultApprovalMode,
      } satisfies ToolConfigEntry,
    ]),
  );

  return {
    requiredProviders,
    tools,
  };
}
