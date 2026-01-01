---
name: security-audit
description: Analyze the codebase for security vulnerabilities, including dependency issues, improper data handling, and configuration risks.
---

# Security Audit Skill

This skill provides a systematic approach to identifying and addressing security vulnerabilities in the `test-fest-tracker` project.

## When to use this skill

- Before any deployment to production.
- When adding new dependencies.
- During code reviews of authentication or data-handling logic.
- Periodically to ensure compliance with project security standards.

## Security Standards & Checklist

### 1. Dependency Security

- **Action**: Run `npm audit` in the root directory.
- **Requirement**: Fix all 'high' and 'critical' vulnerabilities.
- **Tools**: Use `npm audit fix`.

### 2. Authentication & Authorization

- **OIDC (Entra ID)**: Ensure `passport-openidconnect` is correctly configured in `server.js`.
- **Middleware**: protected routes must use `requireAuth`, `requireGroupierByRoom`, etc. from `src/middleware.js`.
- **Session Security**: Verify `express-session` uses `httpOnly: true` and `secure: false` (since Heroku handles SSL termination, but consider `trust proxy` settings).

### 3. Data Protection

- **Sanitization**: Use `xss` library to sanitize user inputs (e.g., in `src/routes/issues.js` before saving).
- **Prisma**: Ensure `schema.prisma` is strict and no raw queries allow SQL injection (Prisma generally handles this, but be careful with raw SQL).
- **CSRF**: Verify `csurf` protection is active on all state-changing routes.

### 4. Logging & Privacy

- **Requirement**: Avoid logging sensitive data (session IDs, OIDC tokens, PII).
- **Requirement**: NEVER log the `process.env` object.

### 5. Secret Management

- **Requirement**: Check for hardcoded credentials using grep before every release.
- **Requirement**: Ensure `.env.example` documents keys like `ENTRA_CLIENT_SECRET` without values.
- **Requirement**: Verify `.gitignore` ignores `*.env`.

### 6. Web Security (Helmet & CSP)

**Helmet** must be configured in `server.js` with comprehensive Content Security Policy (CSP):

```javascript
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"], // No unsafe-inline for scripts
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "ws:", "wss:"], // For Socket.IO
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        frameAncestors: ["'none'"], // Prevent Clickjacking
      },
    },
  })
);
```

### 7. File Upload Security

Strict validation limits must be enforced via `multer`:

- **Max Size**: 5MB per file (`5 * 1024 * 1024`).
- **Max Files**: 5 files per upload.
- **Allowed Types**: `image/jpeg`, `image/png`, `image/gif`, `image/webp`.
- **Extension Check**: Must match MIME type.

### 8. Rate Limiting

- **General API**: 100 requests per 15 mins (`apiLimiter`).
- **Authentication**: 5 attempts (`authLimiter`).
- **Issue Creation**: 30 issues (`issueCreationLimiter`).
- **File Uploads**: 20 uploads (`uploadLimiter`).

## Procedures

### Vulnerability Scan

1. Run `npm audit` in project root.
2. Report and fix vulnerabilities.

### Route Security Check

1. Inspect `src/routes/`.
2. Ensure every API route has appropriate middleware (e.g., `requireAuth`).
3. Verify input sanitization is present on all POST/PUT bodies.

## Example Requests

- "Perform a full security audit of the backend."
- "Check dependencies for critical vulnerabilities."
- "Verify that the issue creation route is rate-limited."
- "Review the Helmet CSP configuration."
- "Audit file upload limits."
