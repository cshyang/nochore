"""Client and reporting configuration management.

Supports two config layouts:
  1. Directory mode (preferred): ``config/defaults.yaml`` + ``config/clients/<id>.yaml``
  2. Single-file mode (legacy): ``clients.yaml`` with a top-level ``clients:`` key

In directory mode, defaults are merged into each client config before use.
List fields (``theme_rules``, ``notes``) are appended; dicts are deep-merged.
"""

from __future__ import annotations

import copy
import logging
from pathlib import Path
from typing import Any, Dict, List

import yaml
from rich.console import Console

from ..models import (
    BrandRule,
    GoogleLeadRule,
    MetaLeadRule,
    PrimaryLeadRules,
    ReportingConfig,
    ThemeRule,
)

logger = logging.getLogger(__name__)
console = Console()

DEFAULT_META_ACTION_TYPES = [
    "messaging_conversation_started_7d",
    "onsite_conversion.messaging_conversation_started_7d",
]


# ---------------------------------------------------------------------------
# Merge helpers
# ---------------------------------------------------------------------------

def _deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively merge *override* into a copy of *base*.

    - Dicts are merged recursively.
    - Lists are concatenated (base first, then override).
    - Scalars in *override* win.
    """
    result = copy.deepcopy(base)
    for key, val in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(val, dict):
            result[key] = _deep_merge(result[key], val)
        elif key in result and isinstance(result[key], list) and isinstance(val, list):
            result[key] = result[key] + val
        else:
            result[key] = copy.deepcopy(val)
    return result


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

class ConfigValidator:
    """Validates client configuration."""

    @classmethod
    def validate_client(cls, client_id: str, client_config: Dict[str, Any]) -> bool:
        if not isinstance(client_config, dict):
            console.print(f"[red]Error: Client '{client_id}' configuration must be a dictionary[/red]")
            return False

        has_meta = "meta" in client_config
        has_google_ads = "google_ads" in client_config
        if not has_meta and not has_google_ads:
            console.print(
                f"[red]Error: Client '{client_id}' must define at least one platform section: 'meta' and/or 'google_ads'[/red]"
            )
            return False

        if has_meta:
            meta_config = client_config.get("meta") or {}
            ad_accounts = meta_config.get("ad_accounts") or []
            if not isinstance(ad_accounts, list) or not ad_accounts:
                console.print(f"[red]Error: Client '{client_id}' missing or empty 'meta.ad_accounts'[/red]")
                return False
            for account in ad_accounts:
                if not isinstance(account, dict) or not account.get("id"):
                    console.print(f"[red]Error: Invalid ad account format for client '{client_id}'[/red]")
                    return False

        if has_google_ads:
            google_config = client_config.get("google_ads") or {}
            customer_ids = google_config.get("customer_ids") or []
            if not isinstance(customer_ids, list) or not customer_ids:
                console.print(f"[red]Error: Client '{client_id}' missing or empty 'google_ads.customer_ids'[/red]")
                return False

        if "reporting" in client_config and not isinstance(client_config["reporting"], dict):
            console.print(f"[red]Error: Client '{client_id}' reporting config must be a mapping[/red]")
            return False

        reporting_config = client_config.get("reporting") or {}
        if reporting_config:
            if not cls._validate_rule_list(
                client_id, reporting_config.get("theme_rules"), {"platform", "theme"}, "theme_rules"
            ):
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
                f"[red]Error: Client '{client_id}' reporting.{field_name} must be a list[/red]"
            )
            return False
        for item in rules:
            if not isinstance(item, dict):
                console.print(
                    f"[red]Error: Client '{client_id}' reporting.{field_name} entries must be mappings[/red]"
                )
                return False
            missing = [field for field in required_fields if not str(item.get(field, "")).strip()]
            if missing:
                console.print(
                    f"[red]Error: Client '{client_id}' reporting.{field_name} is missing {', '.join(missing)}[/red]"
                )
                return False
        return True


# ---------------------------------------------------------------------------
# ConfigManager
# ---------------------------------------------------------------------------

class ConfigManager:
    """Manages configuration loading and validation.

    Accepts either a directory path (``config/``) containing
    ``defaults.yaml`` and ``clients/*.yaml``, or a single YAML file
    (legacy ``clients.yaml``).
    """

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
                console.print(f"[red]Error: Configuration path '{self.config_path}' not found[/red]")
                return {}

            if not self.config:
                return {}

            # Validate all clients
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
        """Load config from directory: defaults.yaml + clients/*.yaml."""
        defaults_path = self.config_path / "defaults.yaml"
        clients_dir = self.config_path / "clients"

        defaults: Dict[str, Any] = {}
        if defaults_path.exists():
            with defaults_path.open("r", encoding="utf-8") as f:
                defaults = yaml.safe_load(f) or {}

        clients: Dict[str, Any] = {}
        if clients_dir.is_dir():
            for client_file in sorted(clients_dir.glob("*.yaml")):
                client_id = client_file.stem
                with client_file.open("r", encoding="utf-8") as f:
                    client_data = yaml.safe_load(f) or {}
                clients[client_id] = _deep_merge(defaults, client_data)

        return {"clients": clients}

    def _load_single_file(self) -> Dict[str, Any]:
        """Load config from a single YAML file (legacy format)."""
        with self.config_path.open("r", encoding="utf-8") as handle:
            return yaml.safe_load(handle)

    def get_clients(self) -> List[str]:
        """Get list of client IDs."""
        if not self.config:
            return []
        return list(self.config.get("clients", {}).keys())

    def get_client_config(self, client_id: str) -> Dict[str, Any]:
        """Get configuration for a specific client."""
        if not self.config:
            return {}
        return self.config.get("clients", {}).get(client_id, {})

    def get_client_context(self, client_id: str) -> Dict[str, Any]:
        """Get the business context for a client (optimization goals, notes, etc.)."""
        client_config = self.get_client_config(client_id)
        return dict(client_config.get("context", {}))

    def get_reporting_config(self, client_id: str) -> ReportingConfig:
        """Get typed reporting config for a specific client."""
        return parse_reporting_config(self.get_client_config(client_id))


# ---------------------------------------------------------------------------
# Reporting config parser
# ---------------------------------------------------------------------------

def _parse_brands(brands_raw: list) -> List[BrandRule]:
    """Convert the new ``brands`` format to flat BrandRule objects.

    New format groups sources by brand::

        brands:
          - name: "Homescape"
            sources:
              - platform: "google_ads"
                account_id: "107-310-0792"
              - platform: "meta"
                account_id: "act_123"
            default_theme: "Always On"

    Produces one BrandRule per (brand, platform) pair.
    """
    rules: List[BrandRule] = []
    for brand_entry in brands_raw:
        if not isinstance(brand_entry, dict):
            continue
        brand_name = str(brand_entry.get("name", "")).strip()
        default_theme = brand_entry.get("default_theme")
        if default_theme:
            default_theme = str(default_theme).strip() or None
        for source in brand_entry.get("sources", []):
            if not isinstance(source, dict):
                continue
            rules.append(BrandRule(
                platform=str(source.get("platform", "")).strip(),
                brand=brand_name,
                source_account_ids=[str(source.get("account_id", "")).strip()],
                default_theme=default_theme,
            ))
    return rules


def parse_reporting_config(client_config: Dict[str, Any]) -> ReportingConfig:
    """Build typed reporting config from YAML data."""
    reporting_raw = client_config.get("reporting") or {}

    # Support both old `brand_rules` format and new `brands` format
    if "brands" in reporting_raw:
        brand_rules = _parse_brands(reporting_raw["brands"])
    else:
        brand_rules = [
            BrandRule(
                platform=str(item.get("platform", "")).strip(),
                brand=str(item.get("brand", "")).strip(),
                source_account_ids=[
                    str(account_id).strip()
                    for account_id in list(item.get("source_account_ids", []) or [])
                    if str(account_id).strip()
                ],
                campaign_name_regex=str(item.get("campaign_name_regex", ".*")),
                default_theme=(str(item.get("default_theme", "")).strip() or None),
            )
            for item in reporting_raw.get("brand_rules", [])
            if isinstance(item, dict)
        ]

    theme_rules = [
        ThemeRule(
            platform=str(item.get("platform", "")).strip(),
            theme=str(item.get("theme", "")).strip() or "Unmapped",
            campaign_name_regex=str(item.get("campaign_name_regex", ".*")),
            brand=(str(item.get("brand", "")).strip() or None),
        )
        for item in reporting_raw.get("theme_rules", [])
        if isinstance(item, dict)
    ]

    primary_raw = reporting_raw.get("primary_lead_rules") or {}
    google_raw = primary_raw.get("google_ads") or {}
    meta_raw = primary_raw.get("meta") or {}

    google_rules = GoogleLeadRule(
        include_conversion_actions=list(google_raw.get("include_conversion_actions", []) or []),
        exclude_conversion_actions=list(google_raw.get("exclude_conversion_actions", []) or []),
    )
    meta_rules = MetaLeadRule(
        include_action_types=list(meta_raw.get("include_action_types", []) or DEFAULT_META_ACTION_TYPES),
    )

    return ReportingConfig(
        brand_rules=brand_rules,
        theme_rules=theme_rules,
        primary_lead_rules=PrimaryLeadRules(
            google_ads=google_rules,
            meta=meta_rules,
        ),
        data_notes=list(reporting_raw.get("data_notes", []) or []),
    )
