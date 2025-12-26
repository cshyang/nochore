# Fix "unauthorized_client" Error

## Problem
Your OAuth client is created but not authorized to access Google Ads API.

## Solution Steps

### Step 1: Configure OAuth Consent Screen

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Go to **APIs & Services** > **OAuth consent screen**
4. You should see your app already configured

### Step 2: Add Scopes

1. Click **EDIT APP** button
2. Click **SAVE AND CONTINUE** on the first page
3. On the **Scopes** page, click **ADD OR REMOVE SCOPES**
4. Find and select: `https://www.googleapis.com/auth/adwords`
5. Click **UPDATE** at the bottom
6. Click **SAVE AND CONTINUE**

### Step 3: Add Test Users (If App is in Testing)

If your app status is "Testing":
1. Click **SAVE AND CONTINUE** until you reach "Test users"
2. Click **+ ADD USERS**
3. Add your Google account email (the one with Google Ads access)
4. Click **SAVE**
5. Click **SAVE AND CONTINUE**

### Step 4: Regenerate Refresh Token

Since you changed scopes, you need a new refresh token:

1. Go back to [OAuth Playground](https://developers.google.com/oauthplayground/)
2. Click ⚙️ Settings
3. Check "Use your own OAuth credentials"
4. Enter your Client ID and Secret
5. **IMPORTANT**: Scroll down and find `https://www.googleapis.com/auth/adwords`
6. Select it and click "Authorize APIs"
7. Sign in and grant permissions
8. Click "Exchange authorization code for tokens"
9. Copy the NEW refresh token
10. Update `.env.local` with the new token

### Step 5: Verify

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

## Common Issues

### "App is not verified"
- Click "Advanced" → "Go to [Your App] (unsafe)"
- This is normal for apps in testing mode

### Still getting "unauthorized_client"
- Make sure the Google account you authorized has access to the Google Ads customer ID `107-310-0792`
- Verify the scope `https://www.googleapis.com/auth/adwords` is added to your consent screen

### Scope not visible in OAuth Playground
- Make sure you added the scope in the OAuth consent screen first
- Wait 5-10 minutes for changes to propagate
