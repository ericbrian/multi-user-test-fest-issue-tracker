# SSO Enforcement - Migration Guide

**Date**: November 23, 2025

## Summary

The ability to disable SSO authentication has been removed from the application. SSO via Microsoft Entra ID (Azure AD) is now **always required**.

## What Changed

### 1. **Removed DISABLE_SSO Environment Variable**
- The `DISABLE_SSO` environment variable is no longer supported
- SSO configuration is now mandatory for both development and production

### 2. **Removed Dev Auto-Auth Middleware**
- The development auto-authentication middleware has been removed
- You can no longer bypass authentication by setting `DISABLE_SSO=true`
- `DEV_USER_EMAIL` and `DEV_USER_NAME` are no longer used

### 3. **Updated Configuration Validation**
- Missing SSO credentials now result in a **startup error** (previously a warning)
- The application will not start without proper Entra ID configuration

### 4. **Files Modified**
- `src/config.js` - Removed DISABLE_SSO validation, SSO now required
- `src/middleware.js` - Removed `createDevAutoAuthMiddleware` function
- `src/routes/auth.js` - Removed DISABLE_SSO bypass in login route
- `server.js` - Removed dev auto-auth middleware usage
- `README.md` - Removed DISABLE_SSO from setup instructions
- `docs/DEPLOYMENT_CHECKLIST.md` - Updated SSO checklist items
- `docs/IMPLEMENTATION_SUMMARY.md` - Removed DISABLE_SSO references
- `__tests__/unit/middleware.test.js` - Removed dev auto-auth tests

## Migration Steps

### For Development Environments

1. **Set up Entra ID App Registration** (if not already done):
   ```bash
   # In Azure Portal:
   # 1. Create an App Registration
   # 2. Add redirect URI: http://localhost:3000/auth/callback
   # 3. Create a client secret
   # 4. Note down: Tenant ID, Client ID, Client Secret
   ```

2. **Update your `.env` file**:
   ```env
   # Remove these lines (no longer supported):
   # DISABLE_SSO=true
   # DEV_USER_EMAIL=dev@example.com
   # DEV_USER_NAME=Dev User

   # Add these (required):
   ENTRA_ISSUER=https://login.microsoftonline.com/<your-tenant-id>/v2.0
   ENTRA_CLIENT_ID=<your-client-id>
   ENTRA_CLIENT_SECRET=<your-client-secret>
   ENTRA_REDIRECT_URI=http://localhost:3000/auth/callback
   ```

3. **Test the SSO flow**:
   ```bash
   npm start
   # Navigate to http://localhost:3000
   # Click login - you should be redirected to Microsoft login
   ```

### For Production Environments

No changes needed if SSO was already configured. Ensure all Entra ID variables are set.

## Breaking Changes

⚠️ **BREAKING**: The following environment variables are no longer supported:
- `DISABLE_SSO`
- `DEV_USER_EMAIL`
- `DEV_USER_NAME`

⚠️ **BREAKING**: The application will **fail to start** if SSO is not configured.

## Rationale

This change improves security by:
1. **Enforcing authentication** - No bypasses in any environment
2. **Simplifying configuration** - One authentication path for all environments
3. **Reducing attack surface** - Removing dev-only authentication paths
4. **Ensuring consistency** - Same auth flow in dev and production

## Troubleshooting

### Application won't start
**Error**: "Entra ID SSO configuration is required"

**Solution**: Configure all required Entra ID environment variables:
- `ENTRA_ISSUER`
- `ENTRA_CLIENT_ID`
- `ENTRA_CLIENT_SECRET`

### Login redirects to error page

**Solution**: 
1. Verify redirect URI is configured in Azure App Registration
2. Check that `ENTRA_REDIRECT_URI` matches the configured redirect URI
3. Ensure client secret is valid and not expired

### "OIDC not configured" error

**Solution**: Verify that all Entra ID environment variables are set correctly and restart the application.

## Support

For issues:
1. Check the [README.md](../README.md) for Entra ID setup instructions
2. Review the [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)
3. Verify all environment variables are set correctly

---

**Note**: If you need a development environment without SSO for testing purposes, consider setting up a test Azure tenant or using Azure AD B2C with local accounts.
