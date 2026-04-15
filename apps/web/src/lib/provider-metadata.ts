export interface ProviderMetadata {
  name: string;
  icon: string;
  defaultReason?: string;
  connectionType?: "composio" | "direct";
}

export const PROVIDER_METADATA: Record<string, ProviderMetadata> = {
  googleads: {
    name: "Google Ads",
    icon: "📊",
    defaultReason: "Read campaign performance and adjust paid media execution",
    connectionType: "direct",
  },
  meta: {
    name: "Meta Ads",
    icon: "📱",
    defaultReason: "Monitor and adjust Meta campaign execution",
  },
  slack: {
    name: "Slack",
    icon: "💬",
    defaultReason: "Send findings and run updates to the team",
  },
  gmail: {
    name: "Gmail",
    icon: "✉️",
    defaultReason: "Send finding summaries by email",
  },
  ga4: {
    name: "Google Analytics",
    icon: "📈",
    defaultReason: "Use website conversion and traffic context in decisions",
  },
  shopify: {
    name: "Shopify",
    icon: "🛒",
    defaultReason: "Use storefront order and revenue context in analysis",
  },
  stripe: {
    name: "Stripe",
    icon: "💳",
    defaultReason: "Use payments and subscription data as operating context",
  },
  github: {
    name: "GitHub",
    icon: "🐙",
    defaultReason: "Inspect repository and deployment activity when required",
  },
  google_search_console: {
    name: "Search Console",
    icon: "🔍",
    defaultReason: "Use search visibility and query data in analysis",
  },
  tiktok: {
    name: "TikTok",
    icon: "🎵",
    defaultReason: "Monitor and adjust TikTok campaign execution",
  },
  hubspot: {
    name: "HubSpot",
    icon: "🟠",
    defaultReason: "Use CRM contacts and deal context in analysis",
  },
  jira: {
    name: "Jira",
    icon: "📋",
    defaultReason: "Track and update work items when required",
  },
  builtin: {
    name: "Nochore built-ins",
    icon: "✦",
    defaultReason: "Always-on capabilities provided by Nochore",
  },
};

export const CONNECTABLE_PROVIDER_SLUGS = [
  "googleads",
  "meta",
  "slack",
  "gmail",
  "ga4",
  "shopify",
  "stripe",
  "github",
  "google_search_console",
  "tiktok",
  "hubspot",
  "jira",
] as const;

/** Providers whose tool metadata (names, logos) we fetch from Composio. Same as connectable list. */
export const TOOLKIT_CATALOG_PROVIDER_SLUGS = CONNECTABLE_PROVIDER_SLUGS;

export function getProviderMetadata(provider: string): ProviderMetadata {
  return (
    PROVIDER_METADATA[provider] ?? {
      name: humanizeProvider(provider),
      icon: "🔌",
    }
  );
}

export function getProviderName(provider: string): string {
  return getProviderMetadata(provider).name;
}

export function getProviderDefaultReason(provider: string): string {
  return getProviderMetadata(provider).defaultReason ?? `Required for ${getProviderName(provider)} integrations`;
}

export function isDirectProvider(provider: string): boolean {
  return getProviderMetadata(provider).connectionType === "direct";
}

function humanizeProvider(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
