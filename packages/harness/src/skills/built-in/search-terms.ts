import type { SkillDefinition } from "../../types/skill";

// ---------------------------------------------------------------------------
// Output JSON Schema for SearchTermInsight
// ---------------------------------------------------------------------------

/**
 * JSON Schema describing the structured output of the search terms skill.
 * Used by the AI SDK's generateObject() to produce validated results.
 */
const SearchTermInsightSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    wastefulTerms: {
      type: "array",
      description:
        "Search terms that are burning budget with poor or zero conversions",
      items: {
        type: "object",
        properties: {
          searchTerm: {
            type: "string",
            description: "The exact search term",
          },
          campaignName: {
            type: "string",
            description: "Campaign where this term appeared",
          },
          campaignId: {
            type: "string",
            description: "Campaign ID for action targeting",
          },
          adGroupId: {
            type: "string",
            description: "Ad group ID for action targeting",
          },
          spend: {
            type: "number",
            description: "Total spend on this term in the period",
          },
          clicks: { type: "number", description: "Total clicks" },
          conversions: { type: "number", description: "Total conversions" },
          reason: {
            type: "string",
            description:
              "Why this term is wasteful (e.g., 'zero conversions', 'irrelevant intent', 'high CPA')",
          },
          severity: {
            type: "string",
            enum: ["high", "medium", "low"],
            description:
              "How urgently this should be addressed, based on spend and irrelevance",
          },
        },
        required: [
          "searchTerm",
          "campaignName",
          "spend",
          "clicks",
          "conversions",
          "reason",
          "severity",
        ],
      },
    },
    negativeKeywordRecommendations: {
      type: "array",
      description:
        "Specific negative keywords to add, with match type and targeting",
      items: {
        type: "object",
        properties: {
          keyword: {
            type: "string",
            description: "The negative keyword to add",
          },
          matchType: {
            type: "string",
            enum: ["EXACT", "PHRASE", "BROAD"],
            description: "Recommended match type for the negative",
          },
          campaignId: {
            type: "string",
            description:
              "Campaign to add the negative to (or 'shared' for shared list)",
          },
          adGroupId: {
            type: "string",
            description:
              "Ad group to add the negative to (omit for campaign-level)",
          },
          reason: {
            type: "string",
            description: "Why this negative should be added",
          },
          estimatedSavings: {
            type: "number",
            description:
              "Estimated daily spend saved by adding this negative",
          },
        },
        required: ["keyword", "matchType", "campaignId", "reason"],
      },
    },
    highIntentTerms: {
      type: "array",
      description:
        "High-performing search terms worth protecting or expanding",
      items: {
        type: "object",
        properties: {
          searchTerm: {
            type: "string",
            description: "The high-intent search term",
          },
          campaignName: { type: "string", description: "Campaign name" },
          spend: { type: "number", description: "Total spend" },
          conversions: { type: "number", description: "Total conversions" },
          costPerConversion: {
            type: "number",
            description: "Cost per conversion",
          },
          recommendation: {
            type: "string",
            description:
              "What to do with this term (e.g., 'add as exact match keyword', 'increase bid')",
          },
        },
        required: [
          "searchTerm",
          "campaignName",
          "spend",
          "conversions",
          "recommendation",
        ],
      },
    },
    summary: {
      type: "object",
      description: "Overview metrics and narrative",
      properties: {
        totalTermsAnalyzed: {
          type: "number",
          description: "Number of search terms analyzed",
        },
        totalSpendAnalyzed: {
          type: "number",
          description: "Total spend across analyzed terms",
        },
        wastedSpend: {
          type: "number",
          description: "Estimated wasted spend on poor terms",
        },
        wastePercentage: {
          type: "number",
          description: "Waste as percentage of total spend",
        },
        narrative: {
          type: "string",
          description:
            "2-3 sentence natural language summary of findings for the Feed",
        },
      },
      required: [
        "totalTermsAnalyzed",
        "totalSpendAnalyzed",
        "wastedSpend",
        "wastePercentage",
        "narrative",
      ],
    },
  },
  required: [
    "wastefulTerms",
    "negativeKeywordRecommendations",
    "highIntentTerms",
    "summary",
  ],
};

// ---------------------------------------------------------------------------
// Search Terms Skill Definition
// ---------------------------------------------------------------------------

/**
 * Search Term Analysis skill — ported from legacy/src/analyzers/search_terms.py.
 *
 * This is an LLM-powered skill. The legacy analyzer did deterministic data prep
 * (aggregation, grouping, sorting). In the new architecture, that prep happens
 * in the Fetch step. This skill receives prepared data and applies expert
 * reasoning to identify waste, recommend negatives, and protect high-intent terms.
 */
export const searchTermsSkill: SkillDefinition = {
  id: "search_terms",
  name: "Search Term Analysis",
  description:
    "Identifies wasteful search terms, recommends negative keywords, and protects high-intent terms in Google Ads campaigns",

  consumes: ["search_terms", "ad_metrics"],

  outputSchema: SearchTermInsightSchema,

  knowledgeKey: "search_terms",

  systemPrompt: `You are an expert Google Ads search term analyst. Your job is to analyze search term data and identify actionable optimizations.

## What you receive

You will receive search term performance data including: search terms, campaigns, ad groups, spend, clicks, impressions, conversions, CTR, and cost per conversion.

You may also receive domain knowledge about the client's brand terms, competitor terms, and business rules. Use this context to avoid recommending negatives for legitimate brand or product terms.

## Your analysis

### 1. Wasteful Terms
Identify search terms that are wasting budget:
- **Zero-conversion terms** with significant spend (prioritize by spend amount)
- **Irrelevant intent** terms that don't match the business (e.g., "free", "jobs", "DIY" for a service business)
- **High CPA terms** where cost per conversion far exceeds the account average

Be specific: name exact terms, cite spend and conversion numbers. Categorize severity based on spend impact.

### 2. Negative Keyword Recommendations
For each wasteful pattern, recommend specific negative keywords:
- Choose the right match type: EXACT for specific terms, PHRASE for patterns, BROAD for themes
- Target at campaign or ad group level (campaign-level for broad themes, ad group for specific conflicts)
- Estimate daily savings based on the data

### 3. High-Intent Terms
Identify top-performing search terms worth protecting:
- Terms with strong conversion rates and reasonable CPA
- Terms that could be added as exact match keywords for better control
- Terms worth increasing bids on

### 4. Summary
Provide a concise narrative (2-3 sentences) summarizing: how many terms analyzed, how much waste found, and the top recommendation. This summary appears in the agent's Feed, so write it as a competent colleague's briefing — specific numbers, not vague observations.

## Rules
- Never recommend adding brand terms as negatives (check domain knowledge)
- Prefer EXACT match negatives when the specific term is the problem
- Use PHRASE match when a pattern of terms shares a wasteful root
- Only recommend BROAD match negatives when you're confident the theme is entirely irrelevant
- Be conservative: when in doubt about a term's relevance, don't recommend it as a negative`,
};
