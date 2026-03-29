# Direct Google Ads Connector

**Date:** 2026-03-29
**Status:** Approved
**Context:** Composio's Google Ads integration is broken (DEVELOPER_TOKEN_PROHIBITED on their GCP project 511566560828, tracked at ComposioHQ/composio#3066). This connector bypasses Composio for Google Ads while keeping the same tool interface so we can switch back when they fix it.

## Design

### Tool Definitions

Six tools covering the read + write loop:

**Read:**
| Tool | Purpose | Params |
|------|---------|--------|
| `googleads_list_campaigns` | List all active campaigns with basic metrics | `dateRange?` |
| `googleads_campaign_performance` | Daily performance for a campaign | `campaignId`, `startDate`, `endDate` |
| `googleads_search_terms` | Search terms with spend/conversions | `campaignId`, `startDate`, `endDate` |
| `googleads_keyword_quality` | Quality scores for keywords | `campaignId?` |

**Write:**
| Tool | Purpose | Params |
|------|---------|--------|
| `googleads_add_negative_keywords` | Add negative keywords to a campaign | `campaignId`, `keywords[]`, `matchType` |
| `googleads_adjust_budget` | Change daily budget | `campaignId`, `newBudgetAmount` |

### File Layout

**New files:**

```
packages/harness/src/connections/google-ads/
  client.ts     — GoogleAdsClient wrapper (credentials, GAQL execution)
  tools.ts      — getGoogleAdsToolsForPi() → PiToolDefinition[]
  queries.ts    — GAQL query templates and result type definitions
```

- **client.ts** — Thin wrapper around `google-ads-api` npm package. Takes credentials from `.env` + customer ID from param. Exposes `query(gaql)` and `mutate(operations)`.
- **queries.ts** — Pure GAQL strings and result type definitions. No logic, just query templates.
- **tools.ts** — Builds `PiToolDefinition[]` using client + queries. Only public surface.

**Modified files:**

```
services/worker/src/triggers/agent-run.ts    — Route googleads to direct connector
services/worker/src/lib/agent-runtime.ts     — Pass customer ID from connections.config
```

### Swap Point

Single condition in `agent-run.ts`:

```typescript
// When Composio is fixed, delete the if-branch
if (provider === "googleads") {
  tools.push(...getGoogleAdsToolsForPi({ customerId, credentials }));
} else {
  tools.push(...await getComposioToolsForPi({ userId, toolkits: [provider] }));
}
```

### Credential Handling

| Credential | Source | Scope |
|------------|--------|-------|
| Developer token | `.env` (`GOOGLE_ADS_DEVELOPER_TOKEN`) | Fixed, app-level |
| Client ID | `.env` (`GOOGLE_ADS_CLIENT_ID`) | Fixed, app-level |
| Client secret | `.env` (`GOOGLE_ADS_CLIENT_SECRET`) | Fixed, app-level |
| Refresh token | `.env` (`GOOGLE_ADS_REFRESH_TOKEN`) | Fixed for now, OAuth later |
| Customer ID | `connections.config` JSON | Per-project |

### Connection Flow

User enters Customer ID during "Connect Google Ads" step. Connection record:

```typescript
connections.insert({
  provider: "googleads",
  status: "active",
  composioEntityId: null,    // Not using Composio
  config: JSON.stringify({ customerId: "1073100792" }),
});
```

No OAuth dance — `.env` credentials are used directly. When Composio is fixed, the flow switches back to `session.authorize("googleads")`.

### Interface Contract

`getGoogleAdsToolsForPi()` returns `PiToolDefinition[]` — the same interface as `getComposioToolsForPi()`. Each tool returns:

```typescript
{
  content: [{ type: "text", text: JSON.stringify(result) }],
  details: { successful: boolean, error: string | null }
}
```

### Dependencies

- `google-ads-api` npm package — lightweight, GAQL-based Google Ads client
- Installed in `packages/harness/`

### Out of Scope

- Multi-tenant OAuth consent flow (use `.env` refresh token for now)
- UI changes for customer ID input (can use existing connection config infrastructure)
- Additional tools beyond the 6 defined (impression share, device breakdown, etc. — add later)
