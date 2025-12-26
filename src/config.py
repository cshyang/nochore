"""Configuration management for ads report automation."""
import logging
import yaml
from pathlib import Path
from typing import Dict, Any, List
from rich.console import Console

logger = logging.getLogger(__name__)
console = Console()

class ConfigValidator:
    """Validates client configuration."""
    
    REQUIRED_FIELDS = {
        'clients': dict,
        'meta.system_user_id': str,
        'meta.ad_accounts': list,
        'google_ads.customer_ids': list
    }
    
    @classmethod
    def validate_config(cls, config: Dict[str, Any]) -> bool:
        """Validate the configuration structure."""
        try:
            if 'clients' not in config:
                console.print("[red]Error: 'clients' section not found in configuration[/red]")
                return False
            
            for client_id, client_config in config['clients'].items():
                if not cls._validate_client(client_id, client_config):
                    return False
            
            console.print("[green]✓ Configuration validation passed[/green]")
            return True
            
        except Exception as e:
            console.print(f"[red]Configuration validation error: {e}[/red]")
            return False
    
    @classmethod
    def _validate_client(cls, client_id: str, client_config: Dict[str, Any]) -> bool:
        """Validate a single client configuration."""
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

        # Validate Meta section (if present)
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

        # Validate Google Ads section (if present)
        if has_google_ads:
            google_config = client_config.get("google_ads") or {}
            customer_ids = google_config.get("customer_ids") or []
            if not isinstance(customer_ids, list) or not customer_ids:
                console.print(f"[red]Error: Client '{client_id}' missing or empty 'google_ads.customer_ids'[/red]")
                return False

        return True

class ConfigManager:
    """Manages configuration loading and validation."""
    
    def __init__(self, config_path: str = "clients.yaml"):
        self.config_path = Path(config_path)
        self.config = None
        
    def load_config(self) -> Dict[str, Any]:
        """Load and validate configuration."""
        try:
            if not self.config_path.exists():
                console.print(f"[red]Error: Configuration file '{self.config_path}' not found[/red]")
                return {}
            
            with open(self.config_path, 'r') as f:
                self.config = yaml.safe_load(f)
            
            if not ConfigValidator.validate_config(self.config):
                return {}
            
            return self.config
            
        except yaml.YAMLError as e:
            console.print(f"[red]Error parsing YAML configuration: {e}[/red]")
            return {}
        except Exception as e:
            console.print(f"[red]Error loading configuration: {e}[/red]")
            return {}
    
    def get_clients(self) -> List[str]:
        """Get list of client IDs."""
        if not self.config:
            return []
        return list(self.config.get('clients', {}).keys())
    
    def get_client_config(self, client_id: str) -> Dict[str, Any]:
        """Get configuration for a specific client."""
        if not self.config:
            return {}
        return self.config.get('clients', {}).get(client_id, {})
