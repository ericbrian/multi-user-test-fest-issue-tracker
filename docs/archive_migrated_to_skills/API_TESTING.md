# API Testing Guide

## Problem

With SSO now mandatory, the API tests cannot run without:
1. Valid Entra ID credentials
2. Proper authentication flow

## Solutions

### Option 1: Mock SSO for Testing (Recommended)

Create a test-specific middleware that simulates an authenticated user **only when NODE_ENV=test**.

#### Implementation

1. **Update `src/middleware.js`** - Add test auth middleware:

```javascript
// Test-only authentication (NODE_ENV=test only)
function createTestAuthMiddleware() {
  return async function testAuth(req, res, next) {
    // Only enable in test environment
    if (process.env.NODE_ENV !== 'test') return next();
    if (req.user) return next();
    
    try {
      const { getPrisma } = require("./prismaClient");
      const { v4: uuidv4 } = require("uuid");
      
      const sub = "test-user";
      const prisma = getPrisma();
      let user = await prisma.user.findUnique({ where: { sub } });
      
      if (!user) {
        user = await prisma.user.create({
          data: {
            id: uuidv4(),
            sub,
            name: process.env.TEST_USER_NAME || 'Test User',
            email: process.env.TEST_USER_EMAIL || 'test@example.com',
          },
        });
      }
      req.user = user;
    } catch (e) {
      console.error("Test auto-auth error:", e);
    }
    next();
  };
}

module.exports = {
  requireAuth,
  requireGroupierByRoom,
  requireIssueAndMembership,
  requireGroupierOrCreator,
  noCache,
  createTestAuthMiddleware  // Export for testing
};
```

2. **Update `server.js`** - Use test auth in test mode:

```javascript
// Test mode authentication (NODE_ENV=test only)
if (process.env.NODE_ENV === 'test') {
  const { createTestAuthMiddleware } = require('./src/middleware');
  app.use(createTestAuthMiddleware());
  console.warn('⚠️ TEST MODE: Using test authentication');
}
```

3. **Update `src/config.js`** - Allow missing SSO in test mode:

```javascript
// SSO Configuration validation - SSO is required except in test mode
const ENTRA_ISSUER = process.env.ENTRA_ISSUER;
const ENTRA_CLIENT_ID = process.env.ENTRA_CLIENT_ID;
const ENTRA_CLIENT_SECRET = process.env.ENTRA_CLIENT_SECRET;

if (process.env.NODE_ENV !== 'test') {
  if (!ENTRA_ISSUER || !ENTRA_CLIENT_ID || !ENTRA_CLIENT_SECRET) {
    errors.push('Entra ID SSO configuration is required. Please configure ENTRA_ISSUER, ENTRA_CLIENT_ID, and ENTRA_CLIENT_SECRET');
  }
} else {
  console.warn('⚠️ TEST MODE: SSO validation bypassed');
}
```

4. **Create test environment file** `.env.test`:

```bash
NODE_ENV=test
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/test_fest_tracker_test
SESSION_SECRET=test_secret_at_least_32_characters_long_for_testing
DB_SCHEMA=testfest

# Test user (auto-authenticated in test mode)
TEST_USER_EMAIL=test@example.com
TEST_USER_NAME=Test User

# Optional: Set dummy values for SSO (won't be used in test mode)
ENTRA_ISSUER=https://test
ENTRA_CLIENT_ID=test
ENTRA_CLIENT_SECRET=test
```

5. **Update package.json** - Add test script:

```json
{
  "scripts": {
    "api:test": "NODE_ENV=test node -r dotenv/config server.js dotenv_config_path=.env.test & sleep 3 && httpyac run api-tests/testfest-api.http --all --env api-tests/.httpyac.env.json; kill $!"
  }
}
```

### Option 2: Use Real SSO Credentials for Testing

If you have test Entra ID credentials:

1. **Create `.env.test`** with real credentials:
```bash
ENTRA_ISSUER=https://login.microsoftonline.com/YOUR_TEST_TENANT/v2.0
ENTRA_CLIENT_ID=your-test-client-id
ENTRA_CLIENT_SECRET=your-test-client-secret
```

2. **Authenticate manually** before running tests:
   - Start server: `npm start`
   - Visit `http://localhost:3000/auth/login`
   - Complete SSO login
   - Copy session cookie
   - Add to httpyac environment

### Option 3: Skip API Tests (Not Recommended)

Update package.json to skip API tests in CI:

```json
{
  "scripts": {
    "test": "jest --coverage",
    "test:all": "npm test && npm run api:test"
  }
}
```

## Recommendation

**Use Option 1** - It maintains the security improvement of mandatory SSO in production while allowing automated testing to work.

### Key Differences from Removed DISABLE_SSO

| Feature | Old DISABLE_SSO | New NODE_ENV=test |
|---------|-----------------|-------------------|
| Purpose | Development convenience | Testing only |
| When active | Any time if set | Only if NODE_ENV=test |
| Production risk | High (could be enabled) | None (never runs in production) |
| Documentation | For developers | For CI/test automation |

## Running API Tests

After implementing Option 1:

```bash
# Run API tests
npm run api:test

# Or manually
NODE_ENV=test npm start  # In one terminal
npm run api:test         # In another terminal
```

## Important Notes

⚠️ **NODE_ENV=test should NEVER be used in production**

✅ This approach:
- Keeps SSO mandatory for dev and production
- Allows automated testing
- Clearly separates testing from normal operation
- Prevents accidental bypass in production

❌ This is NOT the same as DISABLE_SSO:
- Only works with `NODE_ENV=test`
- Purpose-built for testing
- Well-documented limitations
- No convenience shortcuts for developers
