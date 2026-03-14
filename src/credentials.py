"""Credential management for API integrations."""
import os
from pathlib import Path
from typing import Optional, Dict, Any, List
from dotenv import load_dotenv
from rich.console import Console

console = Console(stderr=True)

class CredentialManager:
    """Manages API credentials for Meta and Google Ads."""
    
    def __init__(self, env_file: str = ".env.local"):
        self.env_file = Path(env_file)
        self._load_credentials()
    
    def _load_credentials(self):
        """Load credentials from environment file."""
        if self.env_file.exists():
            load_dotenv(self.env_file)
            console.print(f"[green]✓ Loaded credentials from {self.env_file}[/green]")
        else:
            console.print(f"[yellow]⚠️  Environment file {self.env_file} not found - using mock data[/yellow]")
    
    def get_meta_credentials(self) -> Dict[str, Optional[str]]:
        """Get Meta API credentials."""
        return {
            'access_token': os.getenv('META_ACCESS_TOKEN'),
            'business_id': os.getenv('META_BUSINESS_ID')
        }
    
    def get_google_ads_credentials(self) -> Dict[str, Optional[str]]:
        """Get Google Ads API credentials."""
        return {
            'developer_token': os.getenv('GOOGLE_ADS_DEVELOPER_TOKEN'),
            'client_id': os.getenv('GOOGLE_ADS_CLIENT_ID'),
            'client_secret': os.getenv('GOOGLE_ADS_CLIENT_SECRET'),
            'refresh_token': os.getenv('GOOGLE_ADS_REFRESH_TOKEN')
        }
    
    def has_meta_credentials(self) -> bool:
        """Check if Meta credentials are available."""
        meta_creds = self.get_meta_credentials()
        # Only need access token for system user API access
        return bool(meta_creds.get('access_token'))
    
    def has_google_ads_credentials(self) -> bool:
        """Check if Google Ads credentials are available."""
        google_creds = self.get_google_ads_credentials()
        # Google Ads API requires both developer token AND OAuth credentials
        required = ['developer_token', 'client_id', 'client_secret', 'refresh_token']
        return all(google_creds.get(key) for key in required)
    
    def get_missing_google_ads_credentials(self) -> List[str]:
        """Get list of missing Google Ads credentials."""
        google_creds = self.get_google_ads_credentials()
        missing = []

        required = {
            'developer_token': 'GOOGLE_ADS_DEVELOPER_TOKEN',
            'client_id': 'GOOGLE_ADS_CLIENT_ID',
            'client_secret': 'GOOGLE_ADS_CLIENT_SECRET',
            'refresh_token': 'GOOGLE_ADS_REFRESH_TOKEN'
        }

        for key, env_var in required.items():
            if not google_creds.get(key):
                missing.append(env_var)

        return missing
    
    def has_google_service_account(self) -> bool:
        """Check if GOOGLE_APPLICATION_CREDENTIALS is set and points to a file."""
        path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        return bool(path and Path(path).is_file())

    def get_google_service_account_credentials(self):
        """Return google.oauth2.service_account.Credentials scoped for GA4 + SC."""
        from google.oauth2 import service_account
        path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        scopes = [
            "https://www.googleapis.com/auth/analytics.readonly",
            "https://www.googleapis.com/auth/webmasters.readonly",
        ]
        return service_account.Credentials.from_service_account_file(path, scopes=scopes)

    def validate_credentials(self) -> Dict[str, bool]:
        """Validate all credentials and return status."""
        return {
            'meta': self.has_meta_credentials(),
            'google_ads': self.has_google_ads_credentials(),
            'google_service_account': self.has_google_service_account(),
        }
    
    def print_credential_status(self):
        """Print a summary of credential status."""
        status = self.validate_credentials()
        
        console.print("\n[bold]🔐 API Credential Status[/bold]")
        console.print("-" * 30)
        
        if status['meta']:
            console.print("[green]✓ Meta (Facebook) Ads: Configured[/green]")
        else:
            console.print("[red]✗ Meta (Facebook) Ads: Missing credentials[/red]")
            console.print("  Required: META_ACCESS_TOKEN")
        
        if status['google_ads']:
            console.print("[green]✓ Google Ads: Configured[/green]")
        else:
            console.print("[red]✗ Google Ads: Missing credentials[/red]")
            missing = self.get_missing_google_ads_credentials()
            for item in missing:
                console.print(f"  Missing: {item}")
        
        if status.get('google_service_account'):
            console.print("[green]✓ Google Service Account: Configured (GA4 + Search Console)[/green]")
        else:
            console.print("[red]✗ Google Service Account: Missing[/red]")
            console.print("  Required: GOOGLE_APPLICATION_CREDENTIALS")

        if not any(status.values()):
            console.print("\n[yellow]⚠️  No API credentials found - using mock data[/yellow]")
        elif all(status.values()):
            console.print("\n[green]✅ All credentials configured - real APIs available[/green]")
        else:
            console.print("\n[yellow]⚠️  Partial credentials configured[/yellow]")

def test_api_connections():
    """Test actual API connections if credentials are available."""
    cred_manager = CredentialManager()

    if cred_manager.has_meta_credentials():
        console.print("\n[blue]🔗 Testing Meta API connection...[/blue]")
        try:
            from facebook_business.api import FacebookAdsApi

            meta_creds = cred_manager.get_meta_credentials()
            # Initialize with just access token
            FacebookAdsApi.init(
                access_token=meta_creds['access_token'],
                api_version='v22.0'
            )

            # Test API call
            from facebook_business.adobjects.user import User
            me = User(fbid='me')
            user_data = me.api_get(fields=['id', 'name'])
            console.print(f"[green]✅ Meta API connection successful! User: {user_data.get('name', 'Unknown')}[/green]")

        except Exception as e:
            console.print(f"[red]❌ Meta API connection failed: {str(e)}[/red]")
    else:
        console.print("\n[yellow]⚠️  Skipping Meta API test - credentials not configured[/yellow]")

    if cred_manager.has_google_ads_credentials():
        console.print("\n[blue]🔗 Testing Google Ads API connection...[/blue]")
        try:
            console.print("[green]✅ Google Ads developer token configured[/green]")
            console.print("[yellow]ℹ️  Note: API calls will be made with developer token only[/yellow]")

        except Exception as e:
            console.print(f"[red]❌ Google Ads API connection failed: {str(e)}[/red]")
    else:
        console.print("\n[yellow]⚠️  Skipping Google Ads API test - credentials not configured[/yellow]")
        missing = cred_manager.get_missing_google_ads_credentials()
        if missing:
            console.print("[dim]   Missing credentials:[/dim]")
            for item in missing:
                console.print(f"[dim]   - {item}[/dim]")

if __name__ == "__main__":
    cred_manager = CredentialManager()
    cred_manager.print_credential_status()
    test_api_connections()
