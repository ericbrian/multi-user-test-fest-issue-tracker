---
name: code-quality
description: Best practices for code structure, error handling, and reducing duplication.
---

# Code Quality Skill

This skill defines standards for code structure, error management, and maintainability.

## When to use this skill

- When writing or refactoring backend logic.
- When implementing error handling in routes.
- When extracting common logic into middleware.

## Error Handling Standardization

All API errors must use the `ApiError` utility class from `src/utils/apiResponse.js`. This ensures consistent JSON responses with error codes, timestamps, and request paths.

### Standard Format

```json
{
  "success": false,
  "error": "Human-readable message",
  "code": "ERROR_CODE",
  "timestamp": "ISO_DATE",
  "path": "/request/path"
}
```

### Usage Guidelines

**Do NOT** use `res.status(400).json(...)` directly.
**Use**:

```javascript
const ApiError = require("../utils/apiResponse");

// Validation Error
ApiError.invalidInput(res, "Field X is required");

// Permission Error
ApiError.insufficientPermissions(res, "User not authorized");

// Not Found
ApiError.notFound(res, "Issue");

// Server Error
ApiError.internal(res, "Something went wrong");
```

## DRY Principles & Middleware

Avoid duplicating permission checks or business logic.

### Permission Checks

Use reusable middleware factories in `src/middleware.js`.
Example: `requireGroupierOrCreator()` checks if the user is a Groupier OR the creator of the resource.

**Bad:**

```javascript
// Repeated in every route
if (!req.membership.is_groupier && req.issue.created_by !== req.user.id) { ... }
```

**Good:**

```javascript
router.post("/path", requireGroupierOrCreator(), controller);
```

## Linting & Formatting

- Ensure code follows the project's ESLint configuration.
- Use meaningful variable names.
- Keep functions small and focused.

## Example Requests

- "Refactor this route to use the standardized ApiError."
- "Extract this permission check into a reusable middleware."
- "Clean up the error handling in the auth controller."
