---
name: heroku-deployment
description: Guidelines for deploying and managing the Unified   application on Heroku, including configuration and build troubleshooting.
---

# Heroku Deployment Skill

This skill covers the unified deployment of the monorepo (Frontend + Backend) to a single Heroku dyno.

## Deployment Strategy

- **Production (Heroku)**: The unified app runs in production mode. Backend serves static frontend assets.
- **Development (Local)**: FE and BE usually run separately (e.g., via `concurrently` in the root) for hot-reloading.
- **Unified Dyno**
- **Static Serving**
- **Catch-all Routing**: The backend handles React Router by serving `index.html` via middleware for all non-API GET requests.

## Key Configuration

### Environment Variables (Config Vars)

The following must be set on the Heroku app:

- `NODE_ENV`: `production`
- `DATABASE_URL`: The PostgreSQL connection string (usually provided by Heroku Postgres).
- `JWT_SECRET`: A long, random string for token signing.
- `NPM_CONFIG_PRODUCTION`: `false` (Required to install devDependencies for building).

### Build Details

- **Node Version**: Specified in `engines.node` in the root `package.json` (e.g., `22.x`).
- **Postinstall**: The root `package.json` contains a `postinstall` script that runs `npm install` in both subdirectories.
- **Build Script**: The root `package.json`'s `build` script triggers builds for both BE and FE.

## Troubleshooting Common Issues

### 1. Submodule Authentication

Heroku often fails to clone GitHub submodules due to authentication issues.

- **Solution**: Flatten the submodules into regular directories (remove `.gitmodules` and `.git` folders in sub-directories) and commit them directly to the main repository.

### 2. Express 5 Wildcard Routes

Express 5 uses a stricter URI parser (`path-to-regexp` v8).

- **Error**: `PathError [TypeError]: Missing parameter name at index 1` when using `app.get('*')`.
- **Solution**: Use `app.use((req, res, next) => ...)` middleware instead of `app.get('*')`. In the middleware, check if the request is a `GET` and doesn't start with `/api` or `/api-docs` before sending `index.html`.

### 3. Missing Dependencies

If the build fails with "vite: not found", ensure `NPM_CONFIG_PRODUCTION=false` is set so Heroku installs `devDependencies`.

## Example Requests

- "Check the Heroku logs for the latest deployment."
- "Set a new environment variable on Heroku."
- "Fix a routing issue that's causing 500 errors in production."
- "Update the deployment process to include a new build step."
- "Flatten the git submodules for Heroku compatibility."
