# Code Review: Multi-User Test Fest Issue Tracker

**Date:** November 22, 2025
**Reviewer:** GitHub Copilot

## Executive Summary

The codebase is a well-structured Node.js/Express application using Prisma and PostgreSQL. It demonstrates a good separation of concerns with a clear distinction between routes, services, and middleware. The frontend is a lightweight, vanilla JavaScript Single Page Application (SPA) that effectively manages state without heavy framework dependencies.

**Overall Health:** 🟢 **Good**, with one critical security finding.

## 1. Security Audit

### 🔴 Critical: Missing CSRF Protection

* **Finding:** The application relies on cookies for session management (`express-session` with `connect-pg-simple`) but does not appear to have Cross-Site Request Forgery (CSRF) protection.
* **Risk:** An attacker could trick a logged-in user into executing unwanted actions (e.g., deleting an issue, joining a room) by visiting a malicious site.
* **Recommendation:** Implement `csurf` or a similar middleware. Since this is an SPA, you might need to expose a route to fetch the CSRF token and include it in the headers of your `fetch` requests in `api.js`.

### 🟢 Positive Security Measures

* **XSS Prevention:** The application correctly uses the `xss` library to sanitize user inputs (e.g., issue descriptions, room names) before storing them.
* **Content Security Policy (CSP):** `helmet` is configured with a strict CSP, which significantly reduces the risk of XSS and other injection attacks.
* **Rate Limiting:** `express-rate-limit` is applied to API routes, with specific stricter limits for issue creation and file uploads.
* **File Uploads:** `multer` is configured with file size limits (5MB) and strict MIME type/extension validation (images only).
* **Authorization:** Middleware (`requireGroupierByRoom`, `requireGroupierOrCreator`) enforces granular permissions effectively.

## 2. Architecture & Code Quality

### Backend Structure

* **Separation of Concerns:** The project follows a classic Controller-Service-Repository pattern (where Prisma acts as the repository). Logic is well-encapsulated in `src/services/`, keeping routes in `src/routes/` clean.
* **Error Handling:** The `ApiError` class provides a consistent way to handle and format errors. Global error handlers in `server.js` ensure the app doesn't crash unexpectedly.
* **Configuration:** `src/config.js` provides robust validation of environment variables at startup, preventing the app from running with misconfigurations.

### Database (Prisma)

* **Schema:** The schema is normalized and makes good use of PostgreSQL features (UUIDs, JSON types).
* **Relations:** Relationships between `User`, `Room`, `Issue`, and `TestScript` are correctly defined with appropriate cascading delete rules.

### Frontend Structure

* **State Management:** The custom `Store` class in `public/js/state.js` is a simple yet effective implementation of the Observer pattern. It avoids the complexity of Redux/Vuex for a project of this size.
* **Modularity:** The frontend code is split logically into `api.js`, `ui.js`, `socket.js`, and `main.js`.

## 3. Specific Code Observations

### `src/services/roomService.js`

* **Logic:** The `createTestScript` method handles both copying from a library and creating empty scripts gracefully.
* **Optimization:** `getTestScriptLines` efficiently fetches lines and the current user's progress in a single query using Prisma's `include` and `where` clauses.

### `src/routes/issues.js`

* **Validation:** Input validation is manual (e.g., `if (!scriptId || !/^\d+$/.test(String(scriptId)))`).
  * *Improvement:* Consider using a schema validation library like `zod` or `joi` to make validation more declarative and robust.

### `public/js/ui.js`

* **DOM Manipulation:** The code relies heavily on direct DOM manipulation. While fine for this scale, as the app grows, this can become hard to maintain.
* **XSS Safety:** The `escapeHtml` helper is used correctly when rendering user content in `renderTestScriptLines`.

## 4. Recommendations

### Immediate Actions (High Priority)

1. **Implement CSRF Protection:** Add `csurf` middleware to the Express app. Update `public/js/api.js` to include the CSRF token in the headers of all non-GET requests.

### Improvements (Medium Priority)

1. **Schema Validation:** Replace manual input checks in routes with a library like `zod`. This reduces boilerplate and ensures consistent validation rules.
2. **Frontend Error Feedback:** While `alert()` is used for errors, a non-blocking toast notification system would improve the user experience.
3. **Jira Integration:** The Jira service handles errors, but ensure that the `JIRA_API_TOKEN` is rotated regularly and stored securely.

### Housekeeping (Low Priority)

1. **Testing:** Ensure that the `__tests__` directory covers the critical paths, especially the authorization middleware and the complex logic in `RoomService`.
2. **Cleanup:** The `cleanupFiles` method in `IssueService` is a good practice. Ensure there's a cron job or similar mechanism to clean up "orphaned" files that might be missed if the server crashes mid-upload.

## Conclusion

This is a solid, production-ready application foundation. The code is clean, readable, and follows Node.js best practices. Addressing the CSRF vulnerability is the only critical step needed to secure the application fully.
