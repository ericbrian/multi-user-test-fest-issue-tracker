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

- [ ] If using SSO, all Entra ID variables are configured:
  - [ ] ENTRA_ISSUER
  - [ ] ENTRA_CLIENT_ID
  - [ ] ENTRA_CLIENT_SECRET
  - [ ] ENTRA_REDIRECT_URI

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

## ✅ Database

- [ ] Database schema is created and up to date

  ```bash
  npm run prisma:migrate
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
  
- [ ] Jira integration works (if configured)
  
- [ ] Rate limiting blocks excessive requests

## ✅ Security Audit (Production)

- [ ] Review all environment variables are set correctly
  
- [ ] Verify no default/test credentials in use
  
- [ ] Check that error messages don't leak sensitive info
  
- [ ] Ensure HTTPS is enabled (if applicable)
  
- [ ] Review CORS settings for Socket.IO
  
- [ ] Check that file upload restrictions are in place

---

## Quick Start Commands

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# Run tests
npm test

# Start application
npm start

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
