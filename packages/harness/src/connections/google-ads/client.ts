/**
 * Thin wrapper around `google-ads-api` for direct Google Ads API access.
 *
 * Credentials come from environment variables (app-level).
 * Customer ID comes from the caller (per-project, stored in connections.config).
 */

import { GoogleAdsApi, type Customer } from "google-ads-api";

const REQUIRED_ENV_VARS = [
  "GOOGLE_ADS_CLIENT_ID",
  "GOOGLE_ADS_CLIENT_SECRET",
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_ADS_REFRESH_TOKEN",
] as const;

let _api: GoogleAdsApi | null = null;

function getApi(): GoogleAdsApi {
  if (!_api) {
    const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(`Missing Google Ads env vars: ${missing.join(", ")}`);
    }

    _api = new GoogleAdsApi({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
      developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    });
  }
  return _api;
}

export function createGoogleAdsCustomer(customerId: string): Customer {
  const normalized = customerId.replace(/-/g, "").trim();
  return getApi().Customer({
    customer_id: normalized,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    login_customer_id: process.env.GOOGLE_ADS_MANAGER_ID?.replace(/-/g, "").trim(),
  });
}
