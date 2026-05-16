import { describe, expect, it } from "vitest";
import { extractComposioGoogleAdsCustomerId } from "./connections";

describe("extractComposioGoogleAdsCustomerId", () => {
  it("reads Google Ads customer id from Composio generic_id metadata", () => {
    expect(extractComposioGoogleAdsCustomerId({ data: { generic_id: "107-310-0792" } })).toBe("1073100792");
    expect(extractComposioGoogleAdsCustomerId({ params: { generic_id: "4827228419" } })).toBe("4827228419");
  });

  it("reads Google Ads customer id from Composio customer headers", () => {
    expect(extractComposioGoogleAdsCustomerId({ headers: { customer_id: "233-039-7593" } })).toBe("2330397593");
    expect(extractComposioGoogleAdsCustomerId({ params: { headers: { customer_id: "776-034-8870" } } })).toBe(
      "7760348870",
    );
  });

  it("returns null when Composio metadata has no customer id", () => {
    expect(extractComposioGoogleAdsCustomerId({ data: { account_url: "https://ads.google.com/" } })).toBeNull();
  });
});
