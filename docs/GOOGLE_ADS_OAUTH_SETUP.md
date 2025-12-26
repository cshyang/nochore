# Google Ads OAuth Setup Guide

This guide will walk you through setting up Google Ads API credentials for the ads-report-automation tool.

## Prerequisites

- A Google Ads account with API access
- A Google Cloud Console account
- Your Google Ads Developer Token

---

## Step 1: Create OAuth 2.0 Credentials

### 1.1 Go to Google Cloud Console
Visit: https://console.cloud.google.com/

### 1.2 Create or Select a Project
- Click on the project dropdown at the top
- Either select an existing project or create a new one (e.g., "Ads Reporting")

### 1.3 Enable Google Ads API
1. Go to **APIs & Services** > **Library**
2. Search for "Google Ads API"
3. Click **Enable**

### 1.4 Create OAuth 2.0 Credentials
1. Go to **APIs & Services** > **Credentials**
2. Click **+ CREATE CREDENTIALS** > **OAuth client ID**
3. If prompted, configure the OAuth consent screen:
   - Choose **External** (unless you have a Google Workspace)
   - Fill in App name: "Ads Report Automation"
   - User support email: Your email
   - Developer contact: Your email
   - Click **Save and Continue** through all steps
4. Back in Credentials, click **+ CREATE CREDENTIALS** > **OAuth client ID**
5. Choose **Desktop app** as the application type
6. Name it "Ads Report CLI"
7. Click **Create**

### 1.5 Download Credentials
- You'll see a popup with your **Client ID** and **Client Secret**
- **Keep these safe** - you'll need them in Step 2

**Example:**
```
Client ID: 123456789-abc123xyz.apps.googleusercontent.com
Client Secret: GOCSPX-abc123xyz789
```

---

## Step 2: Generate Refresh Token

### 2.1 Open Google OAuth Playground
Visit: https://developers.google.com/oauthplayground/

### 2.2 Configure OAuth Playground
1. Click the **⚙️ Settings** icon (top right)
2. Check **"Use your own OAuth credentials"**
3. Enter your **OAuth Client ID** (from Step 1.5)
4. Enter your **OAuth Client Secret** (from Step 1.5)
5. Close settings

### 2.3 Select API Scope
1. In the left sidebar, scroll down to **"Google Ads API v16"**
2. Select: `https://www.googleapis.com/auth/adwords`
3. Click **"Authorize APIs"** (blue button)

### 2.4 Sign In and Authorize
1. A Google sign-in popup will appear
2. Sign in with the Google account that has access to your Google Ads accounts
3. Click **"Continue"** when it warns about unverified app
4. Grant all requested permissions
5. Click **"Allow"**

### 2.5 Exchange Authorization Code
1. You'll be redirected back to OAuth Playground
2. You should see **"Step 2: Exchange authorization code for tokens"**
3. Click **"Exchange authorization code for tokens"** (blue button)

### 2.6 Copy the Refresh Token
- In the right panel, you'll see a JSON response
- Find the line with **"refresh_token"**
- Copy the entire token value (it starts with `1//`)

**Example:**
```json
{
  "access_token": "...",
  "scope": "https://www.googleapis.com/auth/adwords",
  "token_type": "Bearer",
  "expires_in": 3599,
  "refresh_token": "1//0g-abc123xyz-ABCDEFGHIJKLMNOP"  ← Copy this
}
```

---

## Step 3: Add Credentials to .env.local

Open your `.env.local` file and add all the Google Ads credentials:

```bash
# Google Ads API OAuth Credentials
GOOGLE_ADS_DEVELOPER_TOKEN=your_developer_token_here
GOOGLE_ADS_CLIENT_ID=123456789-abc123xyz.apps.googleusercontent.com
GOOGLE_ADS_CLIENT_SECRET=GOCSPX-abc123xyz789
GOOGLE_ADS_REFRESH_TOKEN=1//0g-abc123xyz-ABCDEFGHIJKLMNOP
```

**Replace:**
- `GOOGLE_ADS_CLIENT_ID` with your Client ID from Step 1.5
- `GOOGLE_ADS_CLIENT_SECRET` with your Client Secret from Step 1.5
- `GOOGLE_ADS_REFRESH_TOKEN` with your Refresh Token from Step 2.6

---

## Step 4: Verify Setup

Run the credential checker:

```bash
uv run ads-report --check-creds
```

You should see:
```
✓ Meta (Facebook) Ads: Configured
✓ Google Ads: Configured

✅ All credentials configured - real APIs available
```

---

## Step 5: Test Real API Call

Run a test report:

```bash
uv run ads-report --client homescape --days 7
```

Watch for these log messages:
- ✅ `Initialized Google Ads API v21 for client homescape`
- ✅ `Fetching data for Google Ads customer: 107-310-0792`
- ✅ `Fetched X records from customer 107-310-0792`

If you see these, congratulations! Your Google Ads API is working with real data.

---

## Troubleshooting

### Error: "Your YAML file is incorrectly configured for OAuth2"
- Make sure all 4 credentials are in `.env.local`
- Check for typos or extra spaces
- Ensure the refresh token starts with `1//`

### Error: "Developer token not found"
- Verify `GOOGLE_ADS_DEVELOPER_TOKEN` is in `.env.local`

### Error: "Invalid refresh token"
- Your refresh token may have expired
- Go back to Step 2 and generate a new one

### Error: "Permission denied"
- Make sure the Google account you authorized has access to the Google Ads customer IDs in `clients.yaml`
- Check that the account has API access enabled

---

## Security Notes

- **Never commit `.env.local`** to version control (it's already in `.gitignore`)
- Keep your Client Secret and Refresh Token private
- The refresh token doesn't expire unless explicitly revoked
- You can revoke access at: https://myaccount.google.com/permissions

---

## Summary

Once completed, you'll have:
- ✅ OAuth Client ID and Secret from Google Cloud Console
- ✅ Refresh Token from OAuth Playground
- ✅ All credentials in `.env.local`
- ✅ Real Google Ads data flowing into your reports

This setup is **one-time only** - the refresh token will continue to work indefinitely unless revoked.
