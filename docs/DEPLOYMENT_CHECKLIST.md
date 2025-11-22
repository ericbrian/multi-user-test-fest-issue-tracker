# Pre-Deployment Checklist

Use this checklist before deploying to production.

## ✅ Configuration

- [ ] **SESSION_SECRET** is set to a secure random value (minimum 32 characters)

  ```bash
  # Generate with:
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'));"
  ```
  
- [ ] **DATABASE_URL** is set correctly for production database
  
- [ ] **DB_SCHEMA** is set (default: `testfest`)
  
- [ ] **PORT** is set appropriately for your environment
  
- [ ] **DISABLE_SSO** is set to `false` for production (use real auth)

- [ ] **NODE_ENV** is set to `production` and `COOKIE_SECURE`/`HTTPS` are enabled
  - Note: `server.js` sets session cookie `secure: false` for local/dev; in production behind TLS set `cookie.secure: true` (or use a `COOKIE_SECURE=true` env var) and ensure `app.set('trust proxy', 1)` when behind a proxy/load balancer.

- [ ] If using SSO, all Entra ID variables are configured:
  - [ ] ENTRA_ISSUER
  - [ ] ENTRA_CLIENT_ID
  - [ ] ENTRA_CLIENT_SECRET
  - [ ] ENTRA_REDIRECT_URI
  - [ ] Consider configuring logout to call the identity provider's `end_session_endpoint` (so app logout triggers provider logout), and set `post_logout_redirect_uri`.
  - [ ] Consider enabling PKCE (`usePKCE: true`) in the OIDC client unless your confidential client prohibits it.

- [ ] If using Jira integration, all Jira variables are configured:
  - [ ] JIRA_BASE_URL
  - [ ] JIRA_EMAIL
  - [ ] JIRA_API_TOKEN
  - [ ] JIRA_PROJECT_KEY
  - [ ] JIRA_ISSUE_TYPE (optional, defaults to 'Bug')

- [ ] **GROUPIER_EMAILS** is set with appropriate admin emails

- [ ] **TAGS** is configured (optional, has defaults)

## ✅ Dependencies

- [ ] Run `npm install` to ensure all dependencies are installed
  
- [ ] Verify `express-rate-limit` is installed
  
- [ ] Verify `jest` and `supertest` are installed (devDependencies)

## ✅ Testing

- [ ] Run all tests: `npm test`
  
- [ ] Verify all tests pass
  
- [ ] Review test coverage report
  
- [ ] Check that coverage meets thresholds (50% minimum)

## ✅ Security

- [ ] SESSION_SECRET is NOT the default value
  
- [ ] Database schema name is whitelisted (`testfest` or `public`)
  
- [ ] Rate limiting is enabled on all API routes
  
- [ ] XSS sanitization is in place for user inputs
  
- [ ] File upload limits are configured (5 images max)
  
- [ ] Authorization checks are in place for protected endpoints

- [ ] Review session cookie settings
  - Ensure `httpOnly: true`, `sameSite` is appropriate (`'lax'` is recommended), and `secure: true` in production.
- [ ] Secrets management
  - Do not commit `.env` to source control. Use secret management (Azure Key Vault, AWS Secrets Manager, HashiCorp Vault) for `SESSION_SECRET`, `ENTRA_CLIENT_SECRET`, `DATABASE_URL`, `JIRA_API_TOKEN`, etc.

## ✅ Database

- [ ] Database schema is created and up to date

  ```bash
  # In production use the deploy command (run after taking backups)
  npx prisma migrate deploy
  ```
  
- [ ] Database connection is tested
  
- [ ] Prisma client is generated

  ```bash
  npm run prisma:generate
  ```
  
- [ ] Consider adding indexes for performance (see recommendations)

## ✅ File System

- [ ] `uploads/` directory exists or will be created automatically
  
- [ ] Ensure uploads directory has proper permissions
  
- [ ] Consider using cloud storage (S3, etc.) for production

- [ ] Avoid using local disk for uploads when running in containers
  - Use durable object storage (S3/Azure Blob/GCS) or persistent volumes and ensure backups if local storage is unavoidable.

## ✅ Docker (if using)

- [ ] Build Docker image successfully

  ```bash
  docker build -t test-fest-tracker:latest .
  ```
  
- [ ] Test Docker container locally

  ```bash
  docker run --env-file .env -p 3000:3000 test-fest-tracker:latest
  ```
  
- [ ] Health check endpoint responds: `http://localhost:3000/health`

- [ ] Configure readiness and liveness probes for your orchestrator
  - Use `/health` for basic liveness; add a readiness probe that verifies DB connectivity before routing traffic.

## ✅ Application Startup

- [ ] Application starts without errors

  ```bash
  npm start
  ```
  
- [ ] Configuration validation passes (no errors on startup)
  
- [ ] Database connection successful
  
- [ ] Server listens on expected port

## ✅ Monitoring & Logging

- [ ] Set up log aggregation (e.g., CloudWatch, Datadog, etc.)
  
- [ ] Monitor for uncaught exceptions in logs
  
- [ ] Monitor for unhandled promise rejections
  
- [ ] Set up alerts for application errors
  
- [ ] Monitor rate limit rejections

- [ ] Centralized logging and error monitoring
  - Integrate a log/monitoring service (Sentry, Datadog, CloudWatch) to capture `uncaughtException` and `unhandledRejection` and application metrics.

## ✅ Load Testing (Optional but Recommended)

- [ ] Test API endpoints under load
  
- [ ] Verify rate limiting works as expected
  
- [ ] Check database connection pool behavior
  
- [ ] Monitor memory usage under load

## ✅ Backup & Recovery

- [ ] Database backup strategy in place
  
- [ ] Tested database restore procedure
  
- [ ] Uploads directory backup strategy (if not using cloud storage)

## ✅ Documentation

- [ ] README.md is up to date
  
- [ ] SECURITY_FIXES.md reviewed
  
- [ ] IMPLEMENTATION_SUMMARY.md reviewed
  
- [ ] TESTING.md reviewed
  
- [ ] Environment variables documented

## ✅ CI/CD Pipeline

- [ ] Bitbucket Pipelines configured (if using)
  
- [ ] AWS credentials set in repository variables (if using ECR)
  
- [ ] Tests run automatically on push
  
- [ ] Docker image builds and pushes to registry

## ✅ Post-Deployment

- [ ] Health check endpoint responds: `/health`
  
- [ ] Authentication works (login/logout)
  
- [ ] Room creation works
  
- [ ] Issue creation works
  
- [ ] File uploads work
  
- [ ] Real-time updates work (Socket.IO)
  - [ ] Verify WebSocket support through any reverse proxy (nginx, ALB). If using multiple app replicas without sticky sessions, consider using a Socket.IO adapter (Redis) or centralized pub/sub.
  
- [ ] Jira integration works (if configured)
  
- [ ] Rate limiting blocks excessive requests

## ✅ Security Audit (Production)

- [ ] Review all environment variables are set correctly
  
- [ ] Verify no default/test credentials in use
  
- [ ] Check that error messages don't leak sensitive info
  
- [ ] Ensure HTTPS is enabled (if applicable)
  
- [ ] Review CORS settings for Socket.IO
  
- [ ] Check that file upload restrictions are in place

- [ ] OIDC logout and CSP
  - Ensure the app logout flow optionally calls the OIDC provider `end_session_endpoint` to fully sign users out.
  - Enable a Content Security Policy for production (the app currently disables CSP in `helmet`); document required script/style exceptions or use nonces/hashes.
- [ ] Socket.IO CORS & proxy settings
  - Confirm Socket.IO CORS origin(s) are configured correctly and WebSocket proxying is enabled if using a reverse proxy. The server currently uses `cors: { origin: false }` so update in production if necessary.
- [ ] Session store & scaling
  - If running multiple replicas, use a shared session store (Redis or DB-backed store). `connect-pg-simple` works but watch DB connection pool and session load.

---

## Quick Start Commands

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Run database migrations (production-safe)
npx prisma migrate deploy

# Run tests
npm test

# Start application
# Development: `npm start`
# Production example (set NODE_ENV and ensure secure cookies):
# NODE_ENV=production COOKIE_SECURE=true npm start

# Development mode with auto-reload
npm run dev
```

---

## Troubleshooting

### Application won't start

1. Check environment variables: `SESSION_SECRET` and `DATABASE_URL` are required
2. Verify database is accessible
3. Check port is not already in use
4. Review startup logs for specific errors

### Tests failing

1. Ensure all dependencies are installed: `npm install`
2. Check that test database is configured (if using integration tests)
3. Review test output for specific failures
4. Run with verbose output: `npm test -- --verbose`

### Rate limiting issues

1. Check rate limiter configuration in `src/rateLimiter.js`
2. Review rate limit headers in API responses
3. Adjust limits if legitimate traffic is being blocked

### Database connection issues

1. Verify DATABASE_URL is correct
2. Check database server is running
3. Verify network connectivity to database
4. Check database user has proper permissions

---

## Support

For issues or questions:

1. Review documentation in repository
2. Check application logs
3. Review git history for recent changes
4. Contact development team
