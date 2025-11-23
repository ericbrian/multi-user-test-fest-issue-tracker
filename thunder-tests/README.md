# ThunderClient API Tests

This directory contains comprehensive API tests for all Test Fest Tracker endpoints using ThunderClient for VSCode.

## Installation

1. Install the [Thunder Client extension](https://marketplace.visualstudio.com/items?itemName=rangav.vscode-thunder-client) for VSCode
2. The tests will automatically be detected by Thunder Client

## Test Structure

The tests are organized into four main categories:

### 1. **System** (`tf_system`)
- **Health Check** - Verifies the application is running

### 2. **Authentication** (`tf_auth`)
- **Get Current User** - Fetches current user info and system config
- **SSO Login** - Initiates Microsoft Entra ID login flow
- **Logout** - Destroys user session

### 3. **Rooms** (`tf_rooms`)
- **Get Script Library** - Retrieves available test scripts
- **Get All Rooms** - Lists all test fest rooms
- **Create Room** - Creates a new test fest room
- **Join Room** - Joins a user to a room
- **Get Test Script Lines** - Gets test script lines for a room
- **Update Test Script Progress** - Updates progress on a test script line

### 4. **Issues** (`tf_issues`)
- **Get Room Issues** - Retrieves all issues for a room
- **Create Issue** - Creates a new issue (text only)
- **Create Issue with Images** - Creates an issue with image attachments
- **Update Issue Status** - Updates issue status (groupier only)
- **Clear Issue Status** - Clears issue status
- **Create Jira Ticket** - Creates a Jira ticket from an issue
- **Delete Issue** - Deletes an issue

## Environment Variables

Two environments are pre-configured:

### Local Development (Default)
- `baseUrl`: `http://localhost:3000`
- `csrfToken`: Auto-populated from responses
- `roomId`: Auto-populated when creating/joining rooms
- `issueId`: Auto-populated when creating issues
- `testScriptLineId`: Manually set for progress updates
- `timestamp`: Dynamic timestamp for unique names

### Production
- Update `baseUrl` to your production URL
- Same variables as Local Development

## CSRF Token Handling

This application uses CSRF protection. The CSRF token is:
1. Sent via the `XSRF-TOKEN` cookie by the server
2. Must be included in the `X-XSRF-TOKEN` header for POST/DELETE requests

**To get your CSRF token:**
1. Open your browser's Developer Tools (F12)
2. Go to the Application/Storage tab
3. Find Cookies → `http://localhost:3000`
4. Copy the value of `XSRF-TOKEN`
5. Set it in Thunder Client environment as `csrfToken`

Alternatively, you can use a browser extension to extract cookies.

## Authentication

The tests assume you're already authenticated. Two options:

### Option 1: Dev Mode (Recommended for Testing)
Set in your `.env` file:
```
DISABLE_SSO=true
DEV_USER_EMAIL=test@example.com
DEV_USER_NAME=Test User
```
This automatically authenticates you without SSO.

### Option 2: SSO Authentication
1. Open `http://localhost:3000` in your browser
2. Complete SSO login
3. Copy your session cookie (`connect.sid`)
4. Add it to Thunder Client's collection settings (not currently configured in these tests)

## Running the Tests

### Running Individual Tests
1. Open Thunder Client in VSCode (Activity Bar icon)
2. Navigate to Collections → Test Fest Tracker API
3. Click on any request to run it individually

### Running Full Test Suite
1. Right-click on "Test Fest Tracker API" collection
2. Select "Run All"
3. View results in the Test Results tab

### Recommended Test Sequence

Run tests in this order for the best results:

1. **Health Check** - Verify server is running
2. **Get Current User** - Verify authentication and get CSRF token
3. **Create Room** - Creates a room and saves `roomId`
4. **Join Room** - Joins the created room
5. **Get Room Issues** - Should return empty array
6. **Create Issue** - Creates an issue and saves `issueId`
7. **Update Issue Status** - Updates the issue status (requires groupier permission)
8. **Create Jira Ticket** - Links issue to Jira (requires Jira config)
9. **Delete Issue** - Cleans up test data

## Test Assertions

Each test includes automatic assertions:
- **Status Code Checks** - Validates expected HTTP status
- **Content-Type Checks** - Ensures JSON responses
- **Response Body Validation** - Verifies key fields exist
- **Environment Variable Updates** - Automatically captures IDs for chaining

## Permissions

Some endpoints require specific permissions:

| Endpoint | Permission Required |
|----------|-------------------|
| Update Issue Status | Groupier (admin) |
| Create Jira Ticket | Issue creator or Groupier |
| Delete Issue | Issue creator or Groupier |

**To become a Groupier:**
Add your email to the `GROUPIER_EMAILS` environment variable:
```
GROUPIER_EMAILS=your.email@example.com
```

## File Uploads

The "Create Issue with Images" test demonstrates file upload:
1. Click on the request
2. Go to the "Body" tab
3. Find the "images" file field
4. Click "Choose File" to select an image
5. Send the request

**Supported formats:** JPEG, PNG, GIF, WebP  
**Maximum size:** 5MB per file  
**Maximum count:** 5 files per upload

## Rate Limiting

Be aware of rate limits:
- **Issue Creation:** 30 requests per 15 minutes
- **File Upload:** 10 requests per 15 minutes
- **Authentication:** 5 requests per 15 minutes

If you hit a rate limit, you'll receive a 429 response. Wait for the time window to reset.

## Jira Integration

To test Jira integration, configure in `.env`:
```
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your.email@example.com
JIRA_API_TOKEN=your_api_token
JIRA_PROJECT_KEY=PROJ
JIRA_ISSUE_TYPE=Bug
```

## Troubleshooting

### 403 Forbidden Errors
- **Cause:** Missing or invalid CSRF token
- **Solution:** Update the `csrfToken` environment variable (see CSRF Token Handling above)

### 401 Unauthorized Errors
- **Cause:** Not authenticated
- **Solution:** Enable dev mode or complete SSO login in browser

### 404 Not Found Errors
- **Cause:** Invalid roomId, issueId, or testScriptLineId
- **Solution:** Run the "Create Room" or "Create Issue" tests first to populate these variables

### 500 Internal Server Error
- **Cause:** Server-side issue (check server logs)
- **Solution:** Check console output for detailed error messages

### CORS Errors
- **Cause:** Browser security (shouldn't happen with Thunder Client)
- **Solution:** Thunder Client bypasses CORS; if you see this, verify you're using Thunder Client, not a browser

## API Documentation

For detailed API documentation, visit:
```
http://localhost:3000/api-docs
```

This provides Swagger/OpenAPI documentation with request/response schemas, authentication details, and more.

## Notes

- Tests use dynamic timestamps to create unique room names
- IDs are automatically extracted and saved to environment variables for chaining requests
- All POST/DELETE requests include CSRF token headers
- The tests demonstrate both JSON and multipart/form-data request types

## Contributing

When adding new endpoints:
1. Add the request to the appropriate folder (System, Authentication, Rooms, or Issues)
2. Include proper headers (Content-Type, CSRF token if needed)
3. Add response assertions (status code, content-type, key fields)
4. Update this README with the new endpoint documentation

## Support

For issues or questions:
1. Check the server logs: `npm run dev`
2. Review the Swagger documentation: `http://localhost:3000/api-docs`
3. Check the Thunder Client output for detailed error messages
