# Thunder Client API Tests - Quick Reference

## 📋 Complete Endpoint List

### System Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/health` | Health check | No |

### Authentication Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/me` | Get current user info | No |
| GET | `/auth/login` | Initiate SSO login | No |
| GET | `/auth/callback` | SSO callback handler | No |
| POST | `/auth/logout` | Logout current user | Yes |

### Room Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/script-library` | Get test scripts | Yes |
| GET | `/api/rooms` | Get all rooms | Yes |
| POST | `/api/rooms` | Create new room | Yes |
| POST | `/api/rooms/:roomId/join` | Join a room | Yes |
| GET | `/api/rooms/:roomId/test-script-lines` | Get test script lines | Yes |
| POST | `/api/test-script-lines/:lineId/progress` | Update progress | Yes |

### Issue Endpoints

| Method | Endpoint | Description | Auth Required | Permission |
|--------|----------|-------------|---------------|------------|
| GET | `/api/rooms/:roomId/issues` | Get room issues | Yes | Member |
| POST | `/api/rooms/:roomId/issues` | Create issue | Yes | Member |
| POST | `/api/issues/:id/status` | Update status | Yes | Groupier |
| POST | `/api/issues/:id/jira` | Create Jira ticket | Yes | Creator/Groupier |
| DELETE | `/api/issues/:id` | Delete issue | Yes | Creator/Groupier |

## 🚀 Quick Start

1. **Install Thunder Client** extension in VSCode
2. **Start the server**: `npm run dev`
3. **Get CSRF token** from browser cookies (`XSRF-TOKEN`)
4. **Set environment variable** `csrfToken` in Thunder Client
5. **Run tests** in order (Health Check → Get Current User → Create Room → ...)

## 🔑 Environment Variables

```text
baseUrl              = http://localhost:3000
csrfToken            = <get from browser cookies>
roomId               = <auto-populated>
issueId              = <auto-populated>
testScriptLineId     = <set manually>
timestamp            = {{$timestamp}}
```

## 📝 Sample Request Bodies

### Create Room

```json
{
  "name": "Test Room {{timestamp}}",
  "description": "API test room",
  "scriptId": null
}
```

### Create Issue

```text
Content-Type: multipart/form-data

scriptId: 1
description: Test issue description
is_issue: true
is_annoyance: false
is_existing_upper_env: false
is_not_sure_how_to_test: false
images: [optional files]
```

### Update Issue Status

```json
{
  "status": "duplicate",
  "roomId": "{{roomId}}"
}
```

### Update Test Script Progress

```json
{
  "is_checked": true,
  "notes": "Test completed successfully"
}
```

### Create Jira Ticket

```json
{
  "roomId": "{{roomId}}"
}
```

## 🎯 Test Execution Order

**Recommended flow for complete test coverage:**

```text
1. Health Check                    → Verify server
2. Get Current User               → Verify auth + get CSRF
3. Get Script Library             → (Optional) See available scripts
4. Create Room                    → Creates room, saves roomId
5. Join Room                      → Join created room
6. Get Test Script Lines          → (Optional) Get script lines
7. Update Test Script Progress    → (Optional) Requires testScriptLineId
8. Get Room Issues                → Should return []
9. Create Issue                   → Creates issue, saves issueId
10. Get Room Issues               → Should show created issue
11. Update Issue Status           → Requires Groupier permission
12. Clear Issue Status            → Requires Groupier permission
13. Create Jira Ticket            → Requires Jira config
14. Delete Issue                  → Cleanup
```

## 🔐 Authentication Setup

### Option 1: Dev Mode (Easiest)

`.env` file:

```text
DISABLE_SSO=true
DEV_USER_EMAIL=test@example.com
DEV_USER_NAME=Test User
```

### Option 2: Real SSO

1. Configure Entra ID in `.env`
2. Login via browser first
3. Copy session cookie (advanced)

## ⚠️ Common Issues

| Error | Cause | Solution |
|-------|-------|----------|
| 403 Forbidden | Invalid CSRF token | Update `csrfToken` variable |
| 401 Unauthorized | Not authenticated | Enable dev mode or login |
| 404 Not Found | Invalid ID | Run prerequisite tests first |
| 429 Too Many Requests | Rate limited | Wait 15 minutes |
| 500 Internal Error | Server issue | Check server logs |

## 🛠️ Dev Mode Setup

Add to `.env`:

```text
DISABLE_SSO=true
DEV_USER_EMAIL=admin@example.com
DEV_USER_NAME=Admin User
GROUPIER_EMAILS=admin@example.com
```

This gives you:

- ✅ Auto-authentication
- ✅ Groupier permissions
- ✅ No SSO required

## 📊 Response Codes

| Code | Meaning | When You'll See It |
|------|---------|-------------------|
| 200 | Success | Successful requests |
| 302 | Redirect | SSO login flow |
| 400 | Bad Request | Invalid input |
| 401 | Unauthorized | Not logged in |
| 403 | Forbidden | No permission or bad CSRF |
| 404 | Not Found | Resource doesn't exist |
| 429 | Rate Limited | Too many requests |
| 500 | Server Error | Internal error |

## 🔗 Useful Links

- **Swagger Docs**: http://localhost:3000/api-docs
- **Thunder Client Extension**: https://marketplace.visualstudio.com/items?itemName=rangav.vscode-thunder-client
- **Full README**: See `thunder-tests/README.md`

## 💡 Pro Tips

1. **CSRF Token**: Refresh it if you restart the server
2. **Environment**: Use "Local Development" for local testing
3. **Collections**: Right-click collection → "Run All" for full suite
4. **Variables**: Let tests auto-populate IDs, don't set manually
5. **Groupier**: Add your email to `GROUPIER_EMAILS` for admin tests
6. **File Upload**: Max 5 images, 5MB each, JPEG/PNG/GIF/WebP only
7. **Rate Limits**: 30 issues/15min, 10 uploads/15min, 5 auth/15min

## 📦 Files Overview

```text
thunder-tests/
├── README.md                    ← Full documentation
├── QUICK_REFERENCE.md          ← This file
├── thunderCollection.json      ← Collection structure
├── thunderclient.json          ← All API requests
├── thunderEnvironment.json     ← Environment variables
└── thunderActivity.json        ← Activity history
```
