# 🔐 API Credentials Setup Guide

This guide explains how to configure API credentials for real Meta (Facebook) Ads and Google Ads integration.

## 📋 Prerequisites

Before you begin, make sure you have:
- Admin access to Meta Business Manager
- Google Ads account with API access
- `.env.local` file in the project root (already created)

## 📘 Meta (Facebook) Ads API Setup

### 1. Create System User Access Token
For Meta Ads API with system users, you only need a **long-lived access token**:

1. Go to **Meta Business Settings**
2. Navigate to **Users** → **System Users**
3. Create a new System User or use existing one
4. Assign appropriate permissions:
   - `ads_read` - Read campaign data
   - `business_management` - Access business accounts
5. Click **Generate New Token**
6. Select **Long-lived token** (60 days expiration)
7. Copy the generated access token

### 2. Required Environment Variables

Add these to your `.env.local` file:

```bash
# Meta Ads API Credentials (minimal setup)
META_ACCESS_TOKEN=your_long_lived_access_token_here

# Optional: For business-level API calls
META_BUSINESS_ID=your_business_id_here
```

**Note**: You only need `META_ACCESS_TOKEN` for basic system user API access. The `META_BUSINESS_ID` is optional and only needed for business-level API calls.

### 3. Test Meta Credentials

```bash
uv run ads-report --check-creds
```

You should see:
```
✓ Meta (Facebook) Ads: Configured
✅ Meta API connection successful! User: your_username
```

## 🔍 Google Ads API Setup

### 1. Enable Google Ads API
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or use existing one
3. Enable **Google Ads API**
4. Create OAuth 2.0 credentials
5. Configure consent screen if needed

### 2. Create Test Manager Account
1. Set up a Google Ads Manager Account (MCC)
2. Get your Developer Token
3. Link client accounts to your manager account

### 3. Generate Refresh Token
1. Use OAuth 2.0 Playground or custom script
2. Get authorization code
3. Exchange for refresh token
4. Store refresh token securely

### 4. Required Environment Variables

Add these to your `.env.local` file:

```bash
# Google Ads API Credentials
GOOGLE_ADS_DEVELOPER_TOKEN=your_developer_token_here
GOOGLE_ADS_CLIENT_ID=your_oauth_client_id_here
GOOGLE_ADS_CLIENT_SECRET=your_oauth_client_secret_here
GOOGLE_ADS_REFRESH_TOKEN=your_long_lived_refresh_token_here
GOOGLE_ADS_MANAGER_ID=123-456-7890  # Your manager account ID
```

### 5. Test Google Ads Credentials

```bash
uv run ads-report --check-creds
```

## 🔒 Security Best Practices

### 1. Environment File Security
- ✅ `.env.local` is already in `.gitignore`
- ✅ Keep credentials out of version control
- ✅ Use different credentials for development/staging/production

### 2. Access Token Management
- ✅ Use long-lived access tokens (60 days)
- ✅ Store refresh tokens securely
- ✅ Implement token rotation if needed

### 3. API Permissions
- ✅ Use principle of least privilege
- ✅ Request only necessary permissions
- ✅ Regular audit of API access

## 🛠️ Integration Checklist

### Meta Ads
- [x] System User created with proper permissions
- [x] Long-lived access token generated
- [x] `META_ACCESS_TOKEN` configured in `.env.local`
- [x] API connection tested with `--check-creds`

### Google Ads
- [ ] Google Cloud project set up
- [ ] Google Ads API enabled
- [ ] OAuth 2.0 credentials created
- [ ] Developer token obtained
- [ ] Refresh token generated
- [ ] Environment variables configured
- [ ] API connection tested

## 🔍 Testing Credentials

### Credential Status Check
```bash
# Check all credential status
uv run ads-report --check-creds

# Run with verbose logging
uv run ads-report --check-creds --verbose
```

### Expected Outputs

#### Meta Only Configured
```
✓ Meta (Facebook) Ads: Configured
✗ Google Ads: Missing credentials
⚠️  Partial credentials configured
✅ Meta API connection successful! User: your_username
```

#### Both Configured
```
✓ Meta (Facebook) Ads: Configured
✓ Google Ads: Configured
✅ All credentials configured - real APIs available
✅ Meta API connection successful! User: your_username
✅ Google Ads API client loaded successfully!
```

### Real API Test
Once credentials are configured, run a normal report:
```bash
# Should now use real APIs instead of mock data
uv run ads-report --client your_client --days 30
```

You should see output like:
```
📘 Using real Meta API
🔍 Using real Google Ads API
```

## 🚨 Troubleshooting

### Common Issues

#### Meta API Issues
- **"Invalid OAuth access token"**: Token expired or invalid
  - Solution: Generate a new long-lived token from Business Settings
- **"Insufficient permissions"**: System user lacks required permissions
  - Solution: Add `ads_read` and `business_management` permissions
- **"App not approved"**: Not relevant for system user tokens

#### Google Ads API Issues
- **"INVALID_ARGUMENT"**: Incorrect customer ID format
  - Solution: Use format `123-456-7890` for manager IDs
- **"PERMISSION_DENIED"**: Insufficient API permissions
  - Solution: Check OAuth scopes and API enablement
- **"UNAUTHENTICATED"**: Invalid or expired refresh token
  - Solution: Generate new refresh token

### Debug Mode
Enable verbose logging to troubleshoot:
```bash
uv run ads-report --client your_client --verbose
```

### Log Files
Check detailed logs:
```bash
tail -f logs/ads_report.log
```

## 📚 Additional Resources

### Meta (Facebook) Documentation
- [System Users Guide](https://developers.facebook.com/docs/marketing-apis/system-users/)
- [Access Tokens](https://developers.facebook.com/docs/facebook-login/access-tokens/)
- [Marketing API Overview](https://developers.facebook.com/docs/marketing-apis/)

### Google Ads Documentation
- [Google Ads API Overview](https://developers.google.com/google-ads/api/docs/start)
- [OAuth 2.0 Setup](https://developers.google.com/google-ads/api/docs/first-call/overview)
- [Authentication](https://developers.google.com/google-ads/api/docs/authentication)

## ✅ Next Steps

Once credentials are configured and tested:

1. **Verify Real API Usage**: Run reports and check for "Using real X API" messages
2. **Add Error Handling**: The CLI already handles API errors gracefully
3. **Monitor API Usage**: Check Google Cloud Console and Meta Business Manager
4. **Token Rotation**: Set up calendar reminders to refresh access tokens

---

**Quick Test**: Run `uv run ads-report --check-creds` to verify your current setup!
