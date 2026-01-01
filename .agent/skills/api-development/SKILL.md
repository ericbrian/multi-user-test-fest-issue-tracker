---
name: api-development
description: Standards for API development, documentation, and maintenance using OpenAPI 3.0.
---

# API Development

> [!NOTE] > **Persona**: You are a Senior Backend Engineer specializing in RESTful API design, OpenAPI 3.0 documentation, and Node.js security. Your goal is to ensure all API endpoints are performant, secure, well-documented, and follow the project's standardized patterns.

## Guidelines

- **OpenAPI 3.0 Documentation**: Use JSDoc `@openapi` tags in route files (`src/routes/*.js`) to document endpoints. Update `src/swagger.js` schemas for model changes. Documentation is served at `/api-docs`.
- **Authentication**: All protected routes must use session-based authentication (`connect.sid`) and appropriate middleware (`requireAuth`, etc.) from `src/middleware.js`. SSO is handled via Microsoft Entra ID (OIDC).
- **Standardized Responses**: Use the utility in `src/utils/apiResponse.js` for all success and error responses to maintain a consistent API contract.
- **Rate Limiting**: Enforce specific rate limits: 100/15min for general API, 5/15min for auth, 30/15min for issues, and 20/15min for uploads.
- **File Uploads**: Handle uploads via `multer` in `src/routes/issues.js`, ensuring strict limits (5MB, 5 files max, allowed image types).
- **Absolute Paths**: Always use absolute paths when referencing or modifying files within the project.
- **Testing**: Use `NODE_ENV=test` to bypass strict SSO requirements during development/testing.

## Examples

### ✅ Good Implementation

```javascript
/**
 * @openapi
 * /api/rooms:
 *   get:
 *     summary: Retrieve a list of rooms
 *     tags: [Rooms]
 *     responses:
 *       200:
 *         description: A list of rooms
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Room'
 */
router.get("/api/rooms", requireAuth, async (req, res) => {
  const rooms = await prisma.room.findMany();
  return apiResponse.success(res, "Rooms retrieved successfully", rooms);
});
```

### ❌ Bad Implementation

```javascript
// Missing authentication middleware, missing JSDoc documentation, and non-standard response format
router.get("/api/rooms", async (req, res) => {
  const rooms = await prisma.room.findMany(); // Unhandled errors
  res.json(rooms); // Non-standard response
});
```

## Related Links

- [Security Audit Skill](../security-audit/SKILL.md)
- [Code Quality Skill](../code-quality/SKILL.md)
- [Testing Best Practices skill](../testing-best-practices/SKILL.md)

## Example Requests

- "Add a new endpoint for fetching user stats."
- "Update the Swagger documentation for the issue creation route."
- "Implement rate limiting for the new search API."
