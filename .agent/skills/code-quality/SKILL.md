---
name: code-quality
description: Best practices for code structure, error handling, and reducing duplication.
---

# Code Quality

> [!NOTE] > **Persona**: You are a Software Architect with a focus on maintainability, DRY (Don't Repeat Yourself) principles, and robust error management. Your mission is to ensure the codebase remains clean, readable, and consistent across all modules.

## Guidelines

- **Standardized Error Handling**: Never use `res.status(400).json(...)` directly. Always use the `ApiError` utility from `src/utils/apiResponse.js` (e.g., `ApiError.invalidInput(res, message)`).
- **Consistent Response Format**: All error responses must follow the standard JSON structure containing `success`, `error`, `code`, `timestamp`, and `path`.
- **DRY Principles**: Extract repetitive logic, especially permission checks and data fetching, into reusable middleware factories in `src/middleware.js`.
- **Small Functions**: Keep functions focused on a single task. If a function grows too large, refactor it into smaller, testable units.
- **Linting**: Adhere to the project's ESLint configuration and use meaningful, descriptive variable names.
- **Naming Conventions**: Use camelCase for variables and functions, PascalCase for classes and Prisma models.

## Examples

### ✅ Good Implementation

```javascript
const ApiError = require("../utils/apiResponse");
const { requireGroupierOrCreator } = require("../middleware");

// Using middleware for permissions and standard utility for errors
router.patch(
  "/api/issues/:id",
  requireGroupierOrCreator(),
  async (req, res) => {
    if (!req.body.title) {
      return ApiError.invalidInput(res, "Title is required");
    }
    // logic...
  }
);
```

### ❌ Bad Implementation

```javascript
// Repeated permission logic and non-standard error response
router.patch("/api/issues/:id", async (req, res) => {
  const issue = await prisma.issue.findUnique({ where: { id: req.params.id } });
  if (issue.userId !== req.user.id && !req.user.isAdmin) {
    return res.status(403).json({ msg: "Not allowed" });
  }
  if (!req.body.title) {
    return res.status(400).send("No title");
  }
});
```

## Related Links

- [API Development Skill](../api-development/SKILL.md)
- [Testing Best Practices Skill](../testing-best-practices/SKILL.md)

## Example Requests

- "Refactor this route to use the standardized ApiError."
- "Extract this permission check into a reusable middleware."
- "Clean up the error handling in the auth controller."
