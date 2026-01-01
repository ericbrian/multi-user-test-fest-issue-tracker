---
name: api-development
description: Standards for API development, documentation, and maintenance using OpenAPI 3.0.
---

# API Development Skill

This skill defines the standards for developing, documenting, and maintaining the REST API for the `test-fest-tracker`.

## When to use this skill

- When adding new API endpoints.
- When modifying existing request/response structures.
- When updating API documentation.
- When configuring API-related features like rate limiting or file uploads.

## API Documentation Standards (OpenAPI 3.0)

The project uses **Swagger UI** for interactive documentation.

- **Location**: `/api-docs` (local: http://localhost:3000/api-docs)
- **Source**: JSDoc comments in route files (e.g., `src/routes/*.js`).
- **Configuration**: `src/swagger.js`.

### How to Document an Endpoint

Use the `@openapi` JSDoc tag above the route definition.
Example:

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
router.get('/api/rooms', ...);
```

### Updating Documentation

1. Edit the JSDoc comments in the relevant route file.
2. If data models change, update schemas in `src/swagger.js`.
3. Restart the server.

## API Architecture

### Authentication

- **Mechanism**: Session-based cookies (`connect.sid`).
- **SSO**: Microsoft Entra ID (OIDC).
- **Testing**: Use `NODE_ENV=test` to bypass strict SSO requirements (see `testing-best-practices` skill).

### Rate Limiting

- **Global API**: 100 requests / 15 mins.
- **Auth**: 5 requests / 15 mins.
- **Issue Creation**: 30 requests / 15 mins.
- **File Uploads**: 20 requests / 15 mins.

## File Uploads

Uploads are handled via `multer` in `src/routes/issues.js`.

- **Endpoint**: `POST /api/rooms/{roomId}/issues`
- **Format**: `multipart/form-data`
- **Response**: File paths are returned in the issue object.

## Response Standardization

All API responses should follow the standardized format defined in `src/utils/apiResponse.js`.
See the **code-quality** skill for details on error handling.

## Example Requests

- "Add a new endpoint for fetching user stats."
- "Update the Swagger documentation for the issue creation route."
- "Implement rate limiting for the new search API."
