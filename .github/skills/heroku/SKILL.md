---
name: heroku-deployment
description: Guidelines for deploying and managing the application on Heroku, including configuration and build troubleshooting.
---

# Heroku Deployment Skill

This skill covers the deployment of the `test-fest-tracker` application (Express + Prisma) to a single Heroku dyno.

## Deployment Strategy

- **Production (Heroku)**: The app runs in production mode (`NODE_ENV=production`).
- **Static Serving**: The backend serves static assets (e.g., uploaded images) from configured directories.
- **Database**: Uses Heroku Postgres with Prisma ORM.

## Key Configuration

### Environment Variables (Config Vars)

The following must be set on the Heroku app:

- `NODE_ENV`: `production`
- `DATABASE_URL`: The PostgreSQL connection string (provided by Heroku Postgres).
- `SESSION_SECRET`: A long, random string for session signing.
- `NPM_CONFIG_PRODUCTION`: `false` (Required to install `devDependencies` like `prisma` for `heroku-postbuild`).

**Application Specific:**

- `ENTRA_ISSUER`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`: For OIDC Authentication.
- `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`: For Jira integration.

### Build Details

- **Node Version**: Specified in `engines.node` in `package.json` (e.g., `20.x`).
- **Postbuild**: The `heroku-postbuild` script runs `npm run prisma:generate` to generate the Prisma Client.

## Shared Database Configuration (Important)

This application is configured to share a Heroku Postgres instance with other apps safely via **Schema Isolation**.

### 1. Schema Isolation

- **Configuration**: The app uses a specific schema (`testfest`) defined in `prisma/schema.prisma` and `src/config.js`.
- **Safety**: It does **not** access the `public` schema. This prevents table name collisions with other apps.
- **Verification**: Ensure `DATABASE_URL` is correct. Prisma will automatically create the `testfest` schema on first run/migration.

### 2. Connection Limits (Critical)

- **The Issue**: Sharing a database means creating a new pool of connections.
- **Limit**: Standard-0/Mini plans have limited connections (e.g., 20-120).
- **Configuration**: Ensure the `pg` pool in `server.js` and Prisma connection pool do not exceed the database limit when combined with the other app's connections.
- **Mitigation**: If "Too many connections" errors occur, reduce the `max` pool config in `server.js` or upgrade the database plan.

## Troubleshooting Common Issues

### 1. Express 5 Wildcard Routes

Express 5 uses a stricter URI parser (`path-to-regexp` v8).

- **Error**: `PathError [TypeError]: Missing parameter name at index 1` when using `app.get('*')`.
- **Solution**: Use `app.use((req, res, next) => ...)` middleware instead of `app.get('*')`.

### 2. Missing Prisma Client

If the app fails to start with "Prisma Client could not be found", ensure `heroku-postbuild` is configured correctly and `NPM_CONFIG_PRODUCTION` is `false`.

## Example Requests

- "Check the Heroku logs for the latest deployment."
- "Set a new environment variable on Heroku."
- "Check if we are exceeding the database connection limit."
- "Verify that tables are being created in the 'testfest' schema."
