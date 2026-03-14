"""Client configuration management.

Supported layouts:
  1. Directory mode (preferred): ``config/defaults.yaml`` + ``config/clients/<id>.yaml``
  2. Single-file mode (legacy container only): ``clients.yaml`` with top-level ``clients:``

Within each client config, the supported schema is:
  - ``context``: human/agent business context
  - ``sources``: external source registry keyed by alias
  - ``business``: brands, themes, and lead normalization rules
"""

from __future__ import annotations

import copy
import logging
from pathlib import Path
from typing import Any, Dict, List

import yaml
from rich.console import Console

from ..models import (
    BrandDefinition,
    BusinessConfig,
    GA4Source,
    GoogleAdsSource,
    GoogleLeadRule,
    LeadRules,
    MetaLeadRule,
    MetaSource,
    SearchConsoleSource,
    SourceFilterSet,
    SourceRegistry,
    ThemeRule,
)

logger = logging.getLogger(__name__)
console = Console(stderr=True)

DEFAULT_META_ACTION_TYPES = [
    "messaging_conversation_started_7d",
    "onsite_conversion.messaging_conversation_started_7d",
]

SOURCE_TYPES = ("google_ads", "meta", "ga4", "search_console")
LEGACY_TOP_LEVEL_KEYS = ("google_ads", "meta", "reporting")


def _deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively merge *override* into a copy of *base*."""
    result = copy.deepcopy(base)
    for key, val in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(val, dict):
            result[key] = _deep_merge(result[key], val)
        elif key in result and isinstance(result[key], list) and isinstance(val, list):
            result[key] = result[key] + val
        else:
            result[key] = copy.deepcopy(val)
    return result


class ConfigValidator:
    """Validates client configuration."""

    @classmethod
    def validate_client(cls, client_id: str, client_config: Dict[str, Any]) -> bool:
        if not isinstance(client_config, dict):
            console.print(
                f"[red]Error: Client '{client_id}' configuration must be a dictionary[/red]"
            )
            return False

        legacy_keys = [key for key in LEGACY_TOP_LEVEL_KEYS if key in client_config]
        if legacy_keys:
            joined = ", ".join(legacy_keys)
            console.print(
                f"[red]Error: Client '{client_id}' uses legacy config keys ({joined}). "
                "Use top-level 'sources' and 'business' instead.[/red]"
            )
            return False

        sources_raw = client_config.get("sources")
        if not isinstance(sources_raw, dict):
            console.print(
                f"[red]Error: Client '{client_id}' must define a top-level 'sources' mapping[/red]"
            )
            return False

        business_raw = client_config.get("business")
        if not isinstance(business_raw, dict):
            console.print(
                f"[red]Error: Client '{client_id}' must define a top-level 'business' mapping[/red]"
            )
            return False

        alias_map = cls._validate_sources(client_id, sources_raw)
        if alias_map is None:
            return False
        if not alias_map:
            console.print(
                f"[red]Error: Client '{client_id}' must define at least one source alias[/red]"
            )
            return False

        brands_raw = business_raw.get("brands")
        if not isinstance(brands_raw, list) or not brands_raw:
            console.print(
                f"[red]Error: Client '{client_id}' business.brands must be a non-empty list[/red]"
            )
            return False

        if not cls._validate_brands(client_id, brands_raw, alias_map):
            return False

        if not cls._validate_rule_list(
            client_id,
            business_raw.get("theme_rules"),
            {"source", "theme"},
            "business.theme_rules",
        ):
            return False

        theme_rules = business_raw.get("theme_rules") or []
        for item in theme_rules:
            source_alias = str(item.get("source", "")).strip()
            if source_alias not in alias_map:
                console.print(
                    f"[red]Error: Client '{client_id}' business.theme_rules references unknown source alias '{source_alias}'[/red]"
                )
                return False

        return True

    @classmethod
    def _validate_sources(
        cls, client_id: str, sources_raw: Dict[str, Any]
    ) -> Dict[str, str] | None:
        alias_map: Dict[str, str] = {}

        for source_type, entries in sources_raw.items():
            if source_type not in SOURCE_TYPES:
                console.print(
                    f"[red]Error: Client '{client_id}' has unsupported sources block '{source_type}'[/red]"
                )
                return None
            if not isinstance(entries, dict):
                console.print(
                    f"[red]Error: Client '{client_id}' sources.{source_type} must be a mapping of aliases[/red]"
                )
                return None

            required_field = {
                "google_ads": "customer_id",
                "meta": "account_id",
                "ga4": "property_id",
                "search_console": "site_url",
            }[source_type]

            for alias, raw in entries.items():
                alias_name = str(alias).strip()
                if not alias_name:
                    console.print(
                        f"[red]Error: Client '{client_id}' sources.{source_type} has an empty alias[/red]"
                    )
                    return None
                if alias_name in alias_map:
                    console.print(
                        f"[red]Error: Client '{client_id}' source alias '{alias_name}' is duplicated across source types[/red]"
                    )
                    return None
                if not isinstance(raw, dict):
                    console.print(
                        f"[red]Error: Client '{client_id}' sources.{source_type}.{alias_name} must be a mapping[/red]"
                    )
                    return None
                if not str(raw.get(required_field, "")).strip():
                    console.print(
                        f"[red]Error: Client '{client_id}' sources.{source_type}.{alias_name} is missing {required_field}[/red]"
                    )
                    return None
                alias_map[alias_name] = source_type

        return alias_map

    @classmethod
    def _validate_brands(
        cls,
        client_id: str,
        brands_raw: List[Any],
        alias_map: Dict[str, str],
    ) -> bool:
        for brand in brands_raw:
            if not isinstance(brand, dict):
                console.print(
                    f"[red]Error: Client '{client_id}' business.brands entries must be mappings[/red]"
                )
                return False

            brand_name = str(brand.get("name", "")).strip()
            if not brand_name:
                console.print(
                    f"[red]Error: Client '{client_id}' business.brands is missing name[/red]"
                )
                return False

            source_aliases = brand.get("sources")
            if not isinstance(source_aliases, list) or not source_aliases:
                console.print(
                    f"[red]Error: Client '{client_id}' business.brands[{brand_name}] must define a non-empty sources list[/red]"
                )
                return False

            normalized_aliases = {str(alias).strip() for alias in source_aliases if str(alias).strip()}
            if not normalized_aliases:
                console.print(
                    f"[red]Error: Client '{client_id}' business.brands[{brand_name}] must define valid source aliases[/red]"
                )
                return False

            unknown_aliases = [alias for alias in normalized_aliases if alias not in alias_map]
            if unknown_aliases:
                joined = ", ".join(sorted(unknown_aliases))
                console.print(
                    f"[red]Error: Client '{client_id}' business.brands[{brand_name}] references unknown source aliases: {joined}[/red]"
                )
                return False

            filters_raw = brand.get("filters") or {}
            if filters_raw and not isinstance(filters_raw, dict):
                console.print(
                    f"[red]Error: Client '{client_id}' business.brands[{brand_name}].filters must be a mapping keyed by source alias[/red]"
                )
                return False

            for alias, filter_raw in filters_raw.items():
                alias_name = str(alias).strip()
                if alias_name not in normalized_aliases:
                    console.print(
                        f"[red]Error: Client '{client_id}' business.brands[{brand_name}] has filters for alias '{alias_name}' that is not listed in brand.sources[/red]"
                    )
                    return False
                if not isinstance(filter_raw, dict):
                    console.print(
                        f"[red]Error: Client '{client_id}' business.brands[{brand_name}].filters.{alias_name} must be a mapping[/red]"
                    )
                    return False
                if not cls._validate_filter_fields(
                    client_id,
                    brand_name,
                    alias_name,
                    alias_map[alias_name],
                    filter_raw,
                ):
                    return False

        return True

    @staticmethod
    def _validate_filter_fields(
        client_id: str,
        brand_name: str,
        alias: str,
        source_type: str,
        filter_raw: Dict[str, Any],
    ) -> bool:
        allowed_fields = {
            "google_ads": {"campaign_name_regex"},
            "meta": {"campaign_name_regex"},
            "ga4": {"landing_page_regex", "key_events"},
            "search_console": {"page_regex", "brand_terms"},
        }[source_type]

        unknown_fields = sorted(set(filter_raw.keys()) - allowed_fields)
        if unknown_fields:
            joined = ", ".join(unknown_fields)
            console.print(
                f"[red]Error: Client '{client_id}' business.brands[{brand_name}].filters.{alias} "
                f"has unsupported fields for {source_type}: {joined}[/red]"
            )
            return False

        list_fields = {"key_events", "brand_terms"}
        for field in list_fields.intersection(filter_raw.keys()):
            if not isinstance(filter_raw.get(field), list):
                console.print(
                    f"[red]Error: Client '{client_id}' business.brands[{brand_name}].filters.{alias}.{field} must be a list[/red]"
                )
                return False
        return True

    @staticmethod
    def _validate_rule_list(
        client_id: str,
        rules: Any,
        required_fields: set[str],
        field_name: str,
    ) -> bool:
        if rules is None:
            return True
        if not isinstance(rules, list):
            console.print(
                f"[red]Error: Client '{client_id}' {field_name} must be a list[/red]"
            )
            return False
        for item in rules:
            if not isinstance(item, dict):
                console.print(
                    f"[red]Error: Client '{client_id}' {field_name} entries must be mappings[/red]"
                )
                return False
            missing = [field for field in required_fields if not str(item.get(field, "")).strip()]
            if missing:
                console.print(
                    f"[red]Error: Client '{client_id}' {field_name} is missing {', '.join(missing)}[/red]"
                )
                return False
        return True


class ConfigManager:
    """Manages configuration loading and validation."""

    def __init__(self, config_path: str = "config"):
        self.config_path = Path(config_path)
        self.config: Dict[str, Any] | None = None

    def load_config(self) -> Dict[str, Any]:
        """Load and validate configuration."""
        try:
            if self.config_path.is_dir():
                self.config = self._load_directory()
            elif self.config_path.is_file():
                self.config = self._load_single_file()
            else:
                console.print(
                    f"[red]Error: Configuration path '{self.config_path}' not found[/red]"
                )
                return {}

            if not self.config:
                return {}

            valid = True
            for client_id, client_cfg in self.config.get("clients", {}).items():
                if not ConfigValidator.validate_client(client_id, client_cfg):
                    valid = False

            if not valid:
                return {}

            console.print("[green]✓ Configuration validation passed[/green]")
            return self.config

        except yaml.YAMLError as exc:
            console.print(f"[red]Error parsing YAML configuration: {exc}[/red]")
            return {}
        except Exception as exc:
            console.print(f"[red]Error loading configuration: {exc}[/red]")
            return {}

    def _load_directory(self) -> Dict[str, Any]:
        defaults_path = self.config_path / "defaults.yaml"
        clients_dir = self.config_path / "clients"

        defaults: Dict[str, Any] = {}
        if defaults_path.exists():
            with defaults_path.open("r", encoding="utf-8") as handle:
                defaults = yaml.safe_load(handle) or {}

        clients: Dict[str, Any] = {}
        if clients_dir.is_dir():
            for client_file in sorted(clients_dir.glob("*.yaml")):
                client_id = client_file.stem
                with client_file.open("r", encoding="utf-8") as handle:
                    client_data = yaml.safe_load(handle) or {}
                clients[client_id] = _deep_merge(defaults, client_data)

        return {"clients": clients}

    def _load_single_file(self) -> Dict[str, Any]:
        with self.config_path.open("r", encoding="utf-8") as handle:
            return yaml.safe_load(handle)

    def get_clients(self) -> List[str]:
        if not self.config:
            return []
        return list(self.config.get("clients", {}).keys())

    def get_client_config(self, client_id: str) -> Dict[str, Any]:
        if not self.config:
            return {}
        return self.config.get("clients", {}).get(client_id, {})

    def get_client_context(self, client_id: str) -> Dict[str, Any]:
        """Get the business context for a client, including per-brand context."""
        client_config = self.get_client_config(client_id)
        ctx = dict(client_config.get("context", {}) or {})

        brands_raw = (client_config.get("business") or {}).get("brands") or []
        brand_contexts = {}
        for entry in brands_raw:
            if not isinstance(entry, dict):
                continue
            name = str(entry.get("name", "")).strip()
            brand_ctx = entry.get("context")
            if name and brand_ctx:
                brand_contexts[name] = dict(brand_ctx)
        if brand_contexts:
            ctx["brands"] = brand_contexts

        return ctx

    def get_business_config(self, client_id: str) -> BusinessConfig:
        """Get typed business config for a specific client."""
        return parse_business_config(self.get_client_config(client_id))


def _parse_source_registry(sources_raw: Dict[str, Any]) -> SourceRegistry:
    google_ads = {
        alias: GoogleAdsSource(alias=alias, customer_id=str(raw.get("customer_id", "")).strip())
        for alias, raw in (sources_raw.get("google_ads") or {}).items()
    }
    meta = {
        alias: MetaSource(
            alias=alias,
            account_id=str(raw.get("account_id", "")).strip(),
            name=(str(raw.get("name", "")).strip() or None),
        )
        for alias, raw in (sources_raw.get("meta") or {}).items()
    }
    ga4 = {
        alias: GA4Source(alias=alias, property_id=str(raw.get("property_id", "")).strip())
        for alias, raw in (sources_raw.get("ga4") or {}).items()
    }
    search_console = {
        alias: SearchConsoleSource(alias=alias, site_url=str(raw.get("site_url", "")).strip())
        for alias, raw in (sources_raw.get("search_console") or {}).items()
    }
    return SourceRegistry(
        google_ads=google_ads,
        meta=meta,
        ga4=ga4,
        search_console=search_console,
    )


def _parse_filters(filters_raw: Dict[str, Any] | None) -> Dict[str, SourceFilterSet]:
    if not filters_raw:
        return {}
    filters: Dict[str, SourceFilterSet] = {}
    for alias, raw in filters_raw.items():
        if not isinstance(raw, dict):
            continue
        filters[str(alias).strip()] = SourceFilterSet(
            campaign_name_regex=str(raw.get("campaign_name_regex", ".*")),
            landing_page_regex=str(raw.get("landing_page_regex", ".*")),
            key_events=list(raw.get("key_events", []) or []),
            page_regex=str(raw.get("page_regex", ".*")),
            brand_terms=list(raw.get("brand_terms", []) or []),
        )
    return filters


def parse_business_config(client_config: Dict[str, Any]) -> BusinessConfig:
    """Build typed business config from YAML data."""
    sources = _parse_source_registry(client_config.get("sources") or {})
    business_raw = client_config.get("business") or {}

    brands = [
        BrandDefinition(
            name=str(item.get("name", "")).strip(),
            sources=[str(alias).strip() for alias in list(item.get("sources", []) or []) if str(alias).strip()],
            context=dict(item.get("context", {}) or {}),
            default_theme=(str(item.get("default_theme", "")).strip() or None),
            filters=_parse_filters(item.get("filters") or {}),
        )
        for item in business_raw.get("brands", [])
        if isinstance(item, dict)
    ]

    theme_rules = [
        ThemeRule(
            source=str(item.get("source", "")).strip(),
            theme=str(item.get("theme", "")).strip() or "Unmapped",
            campaign_name_regex=str(item.get("campaign_name_regex", ".*")),
            brand=(str(item.get("brand", "")).strip() or None),
        )
        for item in business_raw.get("theme_rules", [])
        if isinstance(item, dict)
    ]

    lead_rules_raw = business_raw.get("lead_rules") or {}
    google_raw = lead_rules_raw.get("google_ads") or {}
    meta_raw = lead_rules_raw.get("meta") or {}

    return BusinessConfig(
        sources=sources,
        brands=brands,
        theme_rules=theme_rules,
        lead_rules=LeadRules(
            google_ads=GoogleLeadRule(
                include_conversion_actions=list(
                    google_raw.get("include_conversion_actions", []) or []
                ),
                exclude_conversion_actions=list(
                    google_raw.get("exclude_conversion_actions", []) or []
                ),
            ),
            meta=MetaLeadRule(
                include_action_types=list(
                    meta_raw.get("include_action_types", []) or DEFAULT_META_ACTION_TYPES
                ),
            ),
        ),
        data_notes=list(business_raw.get("data_notes", []) or []),
    )
