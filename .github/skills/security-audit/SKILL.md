---
name: security-audit
description: Analyze the codebase for security vulnerabilities, including dependency issues, improper data handling, and configuration risks.
---

# Security Audit Skill

This skill provides a systematic approach to identifying and addressing security vulnerabilities in the Numis project.

## When to use this skill

-   Before any deployment to production.
-   When adding new dependencies.
-   During code reviews of authentication or data-handling logic.
-   Periodically to ensure compliance with project security standards.

## Security Standards & Checklist

### 1. Dependency Security

-   **Action**: Run `npm audit` in `numis-be`, `numis-fe` and `numis-etls`.
-   **Requirement**: Fix all 'high' and 'critical' vulnerabilities.
-   **Tools**: Use `npm audit fix`.

### 2. Authentication & JWT

-   **Requirement**: Ensure `authenticateToken` and `checkUserStatus` middleware are applied to all protected routes in `numis-be/routes/v1/`.
-   **Requirement**: Verify JWT secrets are not hardcoded and are generated using strong entropy (min 128 characters).
-   **Review**: Check `utils/tokenBlacklist.js` integration for logout/revocation.

### 3. Data Protection

-   **Requirement**: Use `bcrypt` with at least 10 rounds for password hashing.
-   **Requirement**: Never expose stack traces in production (handled by `middleware/errorHandler.js`).
-   **Requirement**: Use `serializePrismaData()` to prevent BigInt/Decimal serialization issues that might leak sensitive object structures.

### 4. Logging & Privacy

-   **Requirement**: NEVER use `console.log()`. Use `logInfo()` and `logError()` from `utils/sanitizedLogging.js`.
-   **Requirement**: Ensure PII (Personally Identifiable Information, like emails, cleartext passwords, or private addresses) is not logged.
-   **Requirement**: NEVER log the `process.env` object or any object containing secrets.

### 5. Secret Management

-   **Requirement**: Check for hardcoded credentials using grep before every release:
    -   `grep -rE "password|secret|api_key|token|DATABASE_URL" . | grep -v "node_modules\|.env"`
-   **Requirement**: Ensure `.env.example` files exist in each submodule (`numis-be`, `numis-fe`) to document required keys WITHOUT including actual values.
-   **Requirement**: Verify that the `.gitignore` correctly patterns `*.env*` and `**/.env`.

### 6. Web Security (Frontend)

-   **Requirement**: Verify `Helmet` configuration in `numis-be/app.js` for proper CSP headers.
-   **Requirement**: Check for potential XSS in React components (avoid `dangerouslySetInnerHTML` unless sanitized).

### 7. Rate Limiting (Production)

-   **General API**: 100 requests per 15 mins.
-   **Authentication**: 5 attempts per 15 mins (stricter for logins/resets).
-   **File Uploads**: 20 operations per 15 mins.
-   **Write Operations**: 50 operations per 15 mins (POST/PUT/DELETE).

## Procedures

### Vulnerability Scan

1. Navigate to `numis-be` and run `npm audit`.
2. Navigate to `numis-fe` and run `npm audit`.
3. Navigate to `numis-etls` and run `npm audit`.
4. Report any unfixable vulnerabilities.

### Middleware Check

1. Inspect `numis-be/routes/v1/api-routes.js`.
2. Ensure every route group (except `/auth/login` and `/auth/register`) uses the authentication middleware chain.

## Example Requests

-   "Perform a full security audit of the backend before we deploy the new release."
-   "Check if any of our dependencies have critical vulnerabilities."
-   "Verify that the new 'file-upload' route is correctly protected by the authentication chain."
-   "Are we logging any sensitive user information in the production logs?"
-   "Review the CSP headers implementation in the backend to prevent XSS."
