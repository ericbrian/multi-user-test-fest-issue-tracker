# API Documentation

This project includes comprehensive OpenAPI 3.0 documentation for all API endpoints.

## Accessing the API Documentation

Once the server is running, you can access the interactive API documentation at:

```
http://localhost:3000/api-docs
```

The documentation is powered by Swagger UI and provides:
- **Interactive API testing** - Try out API endpoints directly from the browser
- **Complete schema definitions** - View request/response models
- **Authentication details** - Information about session-based authentication
- **Example requests** - Sample payloads for each endpoint

## API Overview

The Test Fest Issue Tracker API is organized into the following sections:

### Authentication
- `GET /auth/login` - Initiate SSO login via Microsoft Entra ID
- `GET /auth/callback` - OIDC callback endpoint
- `POST /auth/logout` - Logout current user
- `GET /me` - Get current user information and system configuration

### Rooms
- `GET /api/script-library` - Get all available test scripts
- `GET /api/rooms` - Get all test fest rooms
- `POST /api/rooms` - Create a new room
- `POST /api/rooms/{roomId}/join` - Join a room
- `GET /api/rooms/{roomId}/test-script-lines` - Get test script lines for a room
- `POST /api/test-script-lines/{lineId}/progress` - Update test script line progress

### Issues
- `GET /api/rooms/{roomId}/issues` - Get all issues for a room
- `POST /api/rooms/{roomId}/issues` - Create a new issue (with file uploads)
- `POST /api/issues/{id}/status` - Update issue status (Groupier only)
- `POST /api/issues/{id}/jira` - Create Jira ticket from issue
- `DELETE /api/issues/{id}` - Delete an issue

### System
- `GET /health` - Health check endpoint for container orchestration

## Authentication

The API uses **session-based authentication** with cookies. When testing via Swagger UI:

1. First authenticate by logging in through the web interface
2. Your session cookie will be automatically included in API requests
3. The `persistAuthorization` option is enabled to maintain your session across page refreshes

## Rate Limiting

The API implements rate limiting on various endpoints:
- **API routes**: 100 requests per 15 minutes
- **Authentication**: 5 requests per 15 minutes
- **Issue creation**: 30 requests per 15 minutes
- **File uploads**: 20 requests per 15 minutes

## Real-time Updates

In addition to the REST API, the application uses **Socket.IO** for real-time updates:
- Issue creation, updates, and deletion
- Test script line progress updates
- Room membership changes

Socket.IO events are documented in the code but not included in the OpenAPI specification.

## File Uploads

The `POST /api/rooms/{roomId}/issues` endpoint supports multipart/form-data for uploading images:
- Maximum 5 images per issue
- Images are stored in the `/uploads` directory
- File paths are returned in the issue response

## Development

### Updating the Documentation

The API documentation is generated from JSDoc comments in the route files. To update:

1. Edit the `@openapi` JSDoc comments in the route files (`src/routes/*.js`)
2. Update schema definitions in `src/swagger.js` if needed
3. Restart the server to see changes

### OpenAPI Specification

The raw OpenAPI specification is available at:

```javascript
const swaggerSpec = require('./src/swagger');
console.log(JSON.stringify(swaggerSpec, null, 2));
```

You can also export it to a JSON file for use with other tools:

```bash
node -e "console.log(JSON.stringify(require('./src/swagger'), null, 2))" > openapi.json
```

## Additional Resources

- [OpenAPI Specification](https://swagger.io/specification/)
- [Swagger UI Documentation](https://swagger.io/tools/swagger-ui/)
- [Project README](../README.md)
