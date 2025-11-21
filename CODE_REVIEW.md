# Code Review: Multi-User Test Fest Issue Tracker

**Date:** November 21, 2025
**Reviewer:** GitHub Copilot

## 1. Executive Summary

The application is a Node.js/Express web application designed for tracking issues during "Test Fests". It features real-time updates via Socket.io, authentication via OpenID Connect (Entra ID), and uses PostgreSQL with Prisma ORM for data persistence.

Overall, the codebase is well-structured for a small-to-medium sized application. It demonstrates several best practices, such as centralized configuration validation, rate limiting, and containerization. However, there are areas for improvement regarding frontend architecture, security hardening, and code modularity.

## 2. Project Structure & Configuration

### 2.1 Strengths

- **Configuration Validation**: `src/config.js` provides robust validation of environment variables, preventing the app from starting with invalid or insecure configurations.
- **Dependencies**: The project uses standard, well-maintained libraries (`express`, `prisma`, `passport`, `socket.io`).
- **Containerization**: A `Dockerfile` is present, facilitating consistent deployment.

### 2.2 Recommendations

- **Dockerfile Security**: The current `Dockerfile` runs the application as the `root` user. It is recommended to switch to the `node` user provided by the image for better security.

  ```dockerfile
  # ... existing code ...
  USER node
  CMD ["node", "server.js"]
  ```

- **Scripts**: The `scripts` folder is a good place for utility scripts. Ensure `generate-session-secret.sh` is executable and documented.

## 3. Backend Architecture

### 3.1 Strengths

- **Rate Limiting**: `src/rateLimiter.js` implements granular rate limiting for API, Auth, and Issue Creation endpoints, protecting against abuse.
- **Middleware**: Authentication middleware is centralized in `src/middleware.js`.

### 3.2 Recommendations

- **Route Modularity**: `src/routes.js` is becoming a monolithic file (~700 lines). Consider splitting it into separate router files (e.g., `routes/auth.js`, `routes/issues.js`, `routes/rooms.js`) and mounting them in `server.js`.
- **Input Sanitization**: The `sanitizeHtml` function in `src/routes.js` is a manual implementation. Manual sanitization is error-prone.
  - **Action**: Replace with a dedicated library like `xss` or `dompurify` (via `jsdom`) to ensure comprehensive protection against XSS.
- **Security Headers**: The application lacks `helmet` middleware.
  - **Action**: Install and use `helmet` to set secure HTTP headers (HSTS, X-Frame-Options, etc.).

## 4. Database

### 4.1 Strengths

- **Prisma ORM**: Using Prisma provides type safety and a clear schema definition (`prisma/schema.prisma`).
- **Schema Isolation**: The application uses a dedicated `testfest` schema, keeping its tables separate from the `public` schema.

### 4.2 Recommendations

- **Schema Synchronization**: There is a `db/schema.sql` file alongside `prisma/schema.prisma`. This creates a risk of the two falling out of sync.
  - **Action**: Treat `prisma/schema.prisma` as the single source of truth. If raw SQL is needed for specific migrations, use Prisma Migrate's customization features.
- **Connection Management**: The application uses both `pg` (Pool) directly in `server.js` and `PrismaClient` in `src/prismaClient.js`. While `pg` is likely used for `connect-pg-simple`, ensure that connection pool limits are configured to avoid exhausting database connections, as two separate pools are being created.

## 5. Frontend

### 5.1 Strengths

- **Simplicity**: The vanilla JavaScript approach (`public/app.js`) avoids the build complexity of modern frameworks.
- **Real-time**: Effective use of Socket.io for live updates.

### 5.2 Recommendations

- **Maintainability**: `public/app.js` is nearly 1000 lines long. As the application grows, this will become difficult to maintain.
  - **Action**: Refactor `app.js` into smaller ES modules (e.g., `api.js`, `ui.js`, `socket.js`). Since this is a browser-based app without a bundler, you can use native ES modules (`<script type="module">`).
- **State Management**: State is managed via global variables (`me`, `currentRoomId`, etc.). This is fragile. Encapsulating state in a store object or class would be cleaner.

## 6. Security

### 6.1 Strengths

- **Session Security**: `SESSION_SECRET` is validated to ensure it's not the default value.
- **Authentication**: Uses standard OIDC for authentication.

### 6.2 Recommendations

- **Dev Mode Risk**: The `DISABLE_SSO` flag and `createDevAutoAuthMiddleware` allow bypassing authentication.
  - **Action**: Ensure this flag is strictly disabled in production environments. Consider adding a log warning when the server starts in this mode.
- **CSRF Protection**: While `SameSite` cookies provide some protection, explicit CSRF tokens (e.g., using `csurf` or similar) are recommended for state-changing requests (POST/PUT/DELETE), especially since the app uses session-based auth.

## 7. Summary of Action Items

1. **High Priority**

    - Add `helmet` for security headers.
    - Replace manual `sanitizeHtml` with a library.
    - Refactor `src/routes.js` into smaller modules.

2. **Medium Priority**

    - Refactor `public/app.js` into ES modules.
    - Update `Dockerfile` to run as a non-root user.
    - Consolidate database connection logic if possible, or tune pool sizes.

3. **Low Priority**

    - Remove `db/schema.sql` if it's redundant to Prisma.
    - Implement a more robust state management solution for the frontend.
