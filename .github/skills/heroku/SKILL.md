---
name: heroku-deployment
description: Guidelines for deploying and managing the application on Heroku, including configuration and build troubleshooting.
---

# Heroku Deployment Skill

This skill covers the deployment of the `test-fest-tracker` application (Express + Prisma) to a single Heroku dyno.

## Deployment Strategy

- **Production (Heroku)**: The app runs in production mode (`NODE_ENV=production`).
- **Static Serving**: The backend serves static assets (e.g., uploaded images) from configured directories.
- **Database**: Uses Postgres via `DATABASE_URL` (often an external/shared Postgres) with Prisma ORM.

## Key Configuration

### Environment Variables (Config Vars)

The following must be set on the Heroku app:

- `NODE_ENV`: `production`
- `DATABASE_URL`: The PostgreSQL connection string (often sourced from `.env.production`).
- `SESSION_SECRET`: A long, random string for session signing.

Optional (recommended for external/hosted Postgres):

- `DATABASE_SSL_REJECT_UNAUTHORIZED`: Set to `true` only if your Postgres provider supports full certificate verification.

**Application Specific:**

- `ENTRA_ISSUER`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`: For OIDC Authentication.
- `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`: For Jira integration.

### Build Details

- **Node Version**: Specified in `engines.node` in `package.json` (e.g., `20.x`).
- **Postbuild**: The `heroku-postbuild` script runs `npm run prisma:generate` to generate the Prisma Client.

### Release Phase (Prisma Migrations)

This app uses a Heroku release phase (see `Procfile`) to run Prisma migrations.

- Current behavior: the release command runs `node scripts/heroku-release.js`.
- If the target database schema is already populated (common with external/shared DBs), Prisma may return `P3005` (schema not empty).
	- In that case, the release script logs a warning and allows the release to proceed so the app can boot.
	- To properly manage migrations, baseline the existing DB with Prisma (see “Baselining” below).

## Shared Database Configuration (Important)

This application is configured to share a Heroku Postgres instance with other apps safely via **Schema Isolation**.

In practice, the safest configuration is to share a Postgres *cluster* but isolate this app in the `testfest` schema.

### 1. Schema Isolation

- **Configuration**: The app uses a specific schema (`testfest`) defined in `prisma/schema.prisma` and `src/config.js`.
- **Safety**: It does **not** access the `public` schema. This prevents table name collisions with other apps.
- **Verification**: Ensure `DATABASE_URL` points at the intended database and that the configured schema is `testfest`.

### 2. Connection Limits (Critical)

- **The Issue**: Sharing a database means creating a new pool of connections.
- **Limit**: Standard-0/Mini plans have limited connections (e.g., 20-120).
- **Configuration**: Ensure the `pg` pool in `server.js` and Prisma connection pool do not exceed the database limit when combined with the other app's connections.
- **Mitigation**: If "Too many connections" errors occur, reduce the `max` pool config in `server.js` or upgrade the database plan.

### 3. TLS/SSL (Required for Many Hosted Postgres)

Many hosted Postgres providers require encrypted connections.

- Symptom: `no pg_hba.conf entry ... no encryption`
- Mitigations:
	- Prefer adding `?sslmode=require` to `DATABASE_URL` (provider-dependent).
	- The app also enables TLS for its session `pg` pool when `NODE_ENV=production`.
	- Only set `DATABASE_SSL_REJECT_UNAUTHORIZED=true` if your DB’s certificate chain is verifiable.

### 4. Avoid Attaching Heroku Postgres (If Using External DB)

If you are using an external/shared database, do **not** attach a Heroku Postgres add-on to this app.

- Attaching an add-on can reset/override `DATABASE_URL` and accidentally point the app at the wrong database.
- Source of truth should be `.env.production` + the config sync script: `scripts/heroku-set-config-from-env-production.sh`.

## Baselining an Existing Database (Prisma)

If the target DB already has tables, Prisma may refuse to apply migrations (`P3005`). To bring it under migration control:

1. Confirm the DB matches the expected schema (tables/columns) for this app.
2. Mark existing migrations as applied using Prisma (example):
	 - `npx prisma migrate resolve --applied <migration_folder_name>`
3. Redeploy; `prisma migrate deploy` should then run cleanly.

Only baseline a DB you’re confident already matches the intended Prisma schema.

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
