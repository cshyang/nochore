/**
 * Thin wrapper around `google-ads-api` for direct Google Ads API access.
 *
 * Credentials come from environment variables (app-level).
 * Customer ID comes from the caller (per-project, stored in connections.config).
 */

import { type Customer, GoogleAdsApi } from "google-ads-api";

const REQUIRED_ENV_VARS = ["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_DEVELOPER_TOKEN"] as const;

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

export function createGoogleAdsCustomer(params: {
  customerId: string;
  refreshToken?: string;
  managerCustomerId?: string;
}): Customer {
  const normalized = params.customerId.replace(/-/g, "").trim();
  const refreshToken = params.refreshToken?.trim() || process.env.GOOGLE_ADS_REFRESH_TOKEN;
  const loginCustomerId = params.managerCustomerId?.trim() || process.env.GOOGLE_ADS_MANAGER_ID;

  if (!refreshToken) {
    throw new Error("Missing Google Ads refresh token: set connection config refreshToken or GOOGLE_ADS_REFRESH_TOKEN");
  }

  return getApi().Customer({
    customer_id: normalized,
    refresh_token: refreshToken,
    login_customer_id: loginCustomerId?.replace(/-/g, "").trim(),
  });
}
