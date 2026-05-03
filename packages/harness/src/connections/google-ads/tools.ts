/**
 * Direct Google Ads tools for agent execution.
 *
 * Returns AgentToolDefinition[] — the same interface as getComposioAgentTools().
 * When Composio's Google Ads integration is fixed, delete this file and
 * remove the routing branch in agent-run.ts.
 */

import type { AgentToolDefinition, AgentToolResult } from "../../types";
import { createGoogleAdsCustomer } from "./client";
import {
  campaignPerformanceQuery,
  keywordQualityQuery,
  listCampaignsQuery,
  parseDateRangeParam,
  resolveCampaignQuery,
  searchTermsQuery,
} from "./queries";

function success(data: unknown): AgentToolResult {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    details: { successful: true, error: null },
  };
}

function failure(toolName: string, err: unknown): AgentToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: `Error executing ${toolName}: ${message}` }],
    details: { successful: false, error: message },
  };
}

function micros(value: number | null | undefined): number {
  return (value ?? 0) / 1_000_000;
}

export function getGoogleAdsAgentTools(params: { customerId: string }): AgentToolDefinition[] {
  const customer = createGoogleAdsCustomer(params.customerId);

  return [
    // ── Read tools ────────────────────────────────────────────────────
    {
      name: "googleads_list_campaigns",
      label: "List Google Ads Campaigns",
      description:
        "List all active campaigns with key metrics (impressions, clicks, cost, conversions). Returns a summary for each campaign over the specified date range.",
      parameters: {
        type: "object",
        properties: {
          dateRange: {
            type: "string",
            enum: ["LAST_7_DAYS", "LAST_14_DAYS", "LAST_30_DAYS", "LAST_90_DAYS"],
            description: "Date range for metrics. Defaults to LAST_30_DAYS.",
          },
        },
      },
      execute: async (_toolCallId, toolParams) => {
        try {
          const { startDate, endDate } = parseDateRangeParam(toolParams.dateRange as string | undefined);
          const rows = await customer.query(listCampaignsQuery(startDate, endDate));
          const campaigns = rows.map((row: any) => ({
            campaignId: String(row.campaign.id),
            campaignName: row.campaign.name,
            status: row.campaign.status,
            dailyBudget: micros(row.campaign_budget?.amount_micros),
            impressions: row.metrics.impressions ?? 0,
            clicks: row.metrics.clicks ?? 0,
            cost: micros(row.metrics.cost_micros),
            conversions: row.metrics.conversions ?? 0,
            conversionValue: row.metrics.conversions_value ?? 0,
            currency: row.customer.currency_code,
          }));
          return success({ campaigns, dateRange: { startDate, endDate }, count: campaigns.length });
        } catch (err) {
          return failure("googleads_list_campaigns", err);
        }
      },
    },

    {
      name: "googleads_campaign_performance",
      label: "Campaign Performance (Daily)",
      description:
        "Get daily performance breakdown for a specific campaign. Returns one row per day with impressions, clicks, cost, conversions, and conversion value.",
      parameters: {
        type: "object",
        properties: {
          campaignId: { type: "string", description: "The campaign ID to fetch performance for." },
          startDate: { type: "string", description: "Start date in YYYY-MM-DD format." },
          endDate: { type: "string", description: "End date in YYYY-MM-DD format." },
        },
        required: ["campaignId", "startDate", "endDate"],
      },
      execute: async (_toolCallId, toolParams) => {
        try {
          const { campaignId, startDate, endDate } = toolParams as {
            campaignId: string;
            startDate: string;
            endDate: string;
          };
          const rows = await customer.query(campaignPerformanceQuery(campaignId, startDate, endDate));
          const daily = rows.map((row: any) => ({
            date: row.segments.date,
            campaignId: String(row.campaign.id),
            campaignName: row.campaign.name,
            impressions: row.metrics.impressions ?? 0,
            clicks: row.metrics.clicks ?? 0,
            cost: micros(row.metrics.cost_micros),
            conversions: row.metrics.conversions ?? 0,
            allConversions: row.metrics.all_conversions ?? 0,
            conversionValue: row.metrics.conversions_value ?? 0,
            currency: row.customer.currency_code,
          }));
          return success({ daily, count: daily.length });
        } catch (err) {
          return failure("googleads_campaign_performance", err);
        }
      },
    },

    {
      name: "googleads_search_terms",
      label: "Search Terms Report",
      description:
        "Get top search terms that triggered ads for a campaign, ordered by cost descending. Returns at most `limit` results (default 100).",
      parameters: {
        type: "object",
        properties: {
          campaignId: { type: "string", description: "The campaign ID." },
          startDate: { type: "string", description: "Start date in YYYY-MM-DD format." },
          endDate: { type: "string", description: "End date in YYYY-MM-DD format." },
          limit: { type: "number", description: "Max results to return. Default 100." },
        },
        required: ["campaignId", "startDate", "endDate"],
      },
      execute: async (_toolCallId, toolParams) => {
        try {
          const { campaignId, startDate, endDate } = toolParams as {
            campaignId: string;
            startDate: string;
            endDate: string;
          };
          const limit = (toolParams.limit as number) || 100;
          const rows = await customer.query(searchTermsQuery(campaignId, startDate, endDate, limit));
          const terms = rows.map((row: any) => ({
            searchTerm: row.search_term_view.search_term,
            campaignName: row.campaign.name,
            adGroupName: row.ad_group.name,
            impressions: row.metrics.impressions ?? 0,
            clicks: row.metrics.clicks ?? 0,
            cost: micros(row.metrics.cost_micros),
            conversions: row.metrics.conversions ?? 0,
            currency: row.customer.currency_code,
          }));
          return success({ terms, count: terms.length });
        } catch (err) {
          return failure("googleads_search_terms", err);
        }
      },
    },

    {
      name: "googleads_keyword_quality",
      label: "Keyword Quality Scores",
      description:
        "Get quality scores for keywords — includes quality score, landing page experience, ad relevance, and expected CTR. Optionally filter by campaign.",
      parameters: {
        type: "object",
        properties: {
          campaignId: { type: "string", description: "Optional campaign ID to filter by." },
          startDate: { type: "string", description: "Start date in YYYY-MM-DD format. Defaults to last 30 days." },
          endDate: { type: "string", description: "End date in YYYY-MM-DD format. Defaults to today." },
        },
      },
      execute: async (_toolCallId, toolParams) => {
        try {
          const campaignId = toolParams.campaignId as string | undefined;
          const defaults = parseDateRangeParam("LAST_30_DAYS");
          const startDate = (toolParams.startDate as string) || defaults.startDate;
          const endDate = (toolParams.endDate as string) || defaults.endDate;
          const rows = await customer.query(keywordQualityQuery(startDate, endDate, campaignId));
          const keywords = rows.map((row: any) => ({
            campaignName: row.campaign.name,
            adGroupName: row.ad_group.name,
            keywordText: row.ad_group_criterion.keyword.text,
            matchType: row.ad_group_criterion.keyword.match_type,
            qualityScore: row.ad_group_criterion.quality_info?.quality_score ?? null,
            landingPageExperience: row.ad_group_criterion.quality_info?.post_click_quality_score ?? null,
            adRelevance: row.ad_group_criterion.quality_info?.creative_quality_score ?? null,
            expectedCtr: row.ad_group_criterion.quality_info?.search_predicted_ctr ?? null,
            impressions: row.metrics.impressions ?? 0,
            cost: micros(row.metrics.cost_micros),
            currency: row.customer.currency_code,
          }));
          return success({ keywords, count: keywords.length });
        } catch (err) {
          return failure("googleads_keyword_quality", err);
        }
      },
    },

    // ── Write tools ───────────────────────────────────────────────────
    {
      name: "googleads_add_negative_keywords",
      label: "Add Negative Keywords",
      description:
        "Add negative keywords to a campaign to prevent ads from showing for irrelevant searches. Resolves the campaign by ID or name first.",
      parameters: {
        type: "object",
        properties: {
          campaignId: { type: "string", description: "Campaign ID or exact campaign name." },
          keywords: {
            type: "array",
            items: { type: "string" },
            description: "List of keyword texts to add as negatives.",
          },
          matchType: {
            type: "string",
            enum: ["EXACT", "PHRASE", "BROAD"],
            description: "Match type for all keywords. Defaults to EXACT.",
          },
        },
        required: ["campaignId", "keywords"],
      },
      execute: async (_toolCallId, toolParams) => {
        try {
          const {
            campaignId,
            keywords,
            matchType = "EXACT",
          } = toolParams as {
            campaignId: string;
            keywords: string[];
            matchType?: string;
          };

          // Resolve campaign first
          const campaignRows = await customer.query(resolveCampaignQuery(campaignId));
          if (campaignRows.length === 0) {
            return failure("googleads_add_negative_keywords", new Error(`Campaign '${campaignId}' not found.`));
          }
          if (campaignRows.length > 1) {
            return failure(
              "googleads_add_negative_keywords",
              new Error(`'${campaignId}' matched multiple campaigns; use the numeric campaign ID.`),
            );
          }

          const campaign = campaignRows[0] as any;
          const resolvedId = String(campaign.campaign.id);
          const campaignResourceName = `customers/${params.customerId.replace(/-/g, "")}/campaigns/${resolvedId}`;

          // Build mutation operations — cast through any because the
          // google-ads-api MutateOperation generic requires protobuf entity types
          const matchTypeValue = matchType === "PHRASE" ? 3 : matchType === "BROAD" ? 2 : 4; // EXACT=4, PHRASE=3, BROAD=2

          const operations = keywords.map((keyword) => ({
            entity: "campaign_criterion" as any,
            operation: "create" as const,
            resource: {
              campaign: campaignResourceName,
              negative: true,
              keyword: {
                text: keyword,
                match_type: matchTypeValue,
              },
            },
          }));

          const result = await customer.mutateResources(operations as any);
          const responses = (result as any).mutate_operation_responses ?? [];

          return success({
            campaignId: resolvedId,
            campaignName: campaign.campaign.name,
            addedKeywords: keywords,
            matchType,
            resourceNames: responses.map((r: any) => r.campaign_criterion_result?.resource_name).filter(Boolean),
          });
        } catch (err) {
          return failure("googleads_add_negative_keywords", err);
        }
      },
    },

    {
      name: "googleads_adjust_budget",
      label: "Adjust Campaign Budget",
      description:
        "Change the daily budget for a campaign. Resolves the campaign by ID or name and shows previous vs new budget.",
      parameters: {
        type: "object",
        properties: {
          campaignId: { type: "string", description: "Campaign ID or exact campaign name." },
          newBudgetAmount: { type: "number", description: "New daily budget in the account's currency (e.g., 50.00)." },
        },
        required: ["campaignId", "newBudgetAmount"],
      },
      execute: async (_toolCallId, toolParams) => {
        try {
          const { campaignId, newBudgetAmount } = toolParams as {
            campaignId: string;
            newBudgetAmount: number;
          };

          // Resolve campaign first
          const campaignRows = await customer.query(resolveCampaignQuery(campaignId));
          if (campaignRows.length === 0) {
            return failure("googleads_adjust_budget", new Error(`Campaign '${campaignId}' not found.`));
          }
          if (campaignRows.length > 1) {
            return failure(
              "googleads_adjust_budget",
              new Error(`'${campaignId}' matched multiple campaigns; use the numeric campaign ID.`),
            );
          }

          const campaign = campaignRows[0] as any;
          const budgetResourceName = campaign.campaign.campaign_budget;
          const previousBudget = micros(campaign.campaign_budget?.amount_micros);

          const operations = [
            {
              entity: "campaign_budget" as any,
              operation: "update" as const,
              resource: {
                resource_name: budgetResourceName,
                amount_micros: Math.round(newBudgetAmount * 1_000_000),
              },
              update_mask: { paths: ["amount_micros"] },
            },
          ];

          const result = await customer.mutateResources(operations as any);
          const responses = (result as any).mutate_operation_responses ?? [];

          return success({
            campaignId: String(campaign.campaign.id),
            campaignName: campaign.campaign.name,
            previousBudget,
            newBudget: newBudgetAmount,
            currency: campaign.customer.currency_code,
            resourceName: responses[0]?.campaign_budget_result?.resource_name ?? budgetResourceName,
          });
        } catch (err) {
          return failure("googleads_adjust_budget", err);
        }
      },
    },
  ];
}
