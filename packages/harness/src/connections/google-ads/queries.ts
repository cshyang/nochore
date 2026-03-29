/**
 * GAQL query templates for Google Ads tools.
 *
 * Ported from legacy/src/integrations/google_ads/fetcher.py and mutations.py.
 * Each function returns a GAQL string — no execution logic here.
 */

function dateRange(startDate: string, endDate: string): string {
  return `segments.date BETWEEN '${startDate}' AND '${endDate}'`;
}

function defaultDateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export function parseDateRangeParam(input?: string): { startDate: string; endDate: string } {
  const map: Record<string, number> = {
    LAST_7_DAYS: 7,
    LAST_14_DAYS: 14,
    LAST_30_DAYS: 30,
    LAST_90_DAYS: 90,
  };
  return defaultDateRange(map[input ?? "LAST_30_DAYS"] ?? 30);
}

export function listCampaignsQuery(startDate: string, endDate: string): string {
  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign_budget.amount_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      customer.currency_code
    FROM campaign
    WHERE ${dateRange(startDate, endDate)}
      AND campaign.status != 'REMOVED'
  `;
}

export function campaignPerformanceQuery(campaignId: string, startDate: string, endDate: string): string {
  return `
    SELECT
      campaign.id,
      campaign.name,
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.all_conversions,
      metrics.conversions_value,
      customer.currency_code
    FROM campaign
    WHERE campaign.id = ${campaignId}
      AND ${dateRange(startDate, endDate)}
    ORDER BY segments.date ASC
  `;
}

export function searchTermsQuery(campaignId: string, startDate: string, endDate: string, limit = 100): string {
  return `
    SELECT
      campaign.id,
      campaign.name,
      ad_group.id,
      ad_group.name,
      search_term_view.search_term,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      customer.currency_code
    FROM search_term_view
    WHERE campaign.id = ${campaignId}
      AND ${dateRange(startDate, endDate)}
      AND metrics.impressions > 0
    ORDER BY metrics.cost_micros DESC
    LIMIT ${limit}
  `;
}

export function keywordQualityQuery(startDate: string, endDate: string, campaignId?: string, limit = 200): string {
  const campaignFilter = campaignId ? `AND campaign.id = ${campaignId}` : "";
  return `
    SELECT
      campaign.id,
      campaign.name,
      ad_group.id,
      ad_group.name,
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.quality_info.quality_score,
      ad_group_criterion.quality_info.post_click_quality_score,
      ad_group_criterion.quality_info.creative_quality_score,
      ad_group_criterion.quality_info.search_predicted_ctr,
      metrics.impressions,
      metrics.cost_micros,
      customer.currency_code
    FROM keyword_view
    WHERE ${dateRange(startDate, endDate)}
      AND ad_group_criterion.status IN ('ENABLED', 'PAUSED')
      ${campaignFilter}
    LIMIT ${limit}
  `;
}

export function resolveCampaignQuery(campaignId: string): string {
  const predicate = /^\d+$/.test(campaignId)
    ? `campaign.id = ${campaignId}`
    : `campaign.name = '${campaignId.replace(/'/g, "''")}'`;
  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.campaign_budget,
      campaign_budget.amount_micros,
      customer.currency_code
    FROM campaign
    WHERE ${predicate}
      AND campaign.status != 'REMOVED'
    LIMIT 2
  `;
}
