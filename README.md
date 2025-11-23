# Test Fest Tracker

Real-time multi-user issue tracker for Test Fests. Left pane: submit issues. Right pane: live list of issues from everyone. Auth via Entra ID (SSO), data in Postgres, real-time via Socket.IO, optional Jira integration.

## Features

- Real-time updates across all connected users in a room
- Entra ID (Azure AD) OIDC login required to submit
- Rooms: Created by a Groupier; members join and report issues
- Groupier can tag issues (duplicate, as-designed, low-priority)
- Issues with duplicate/as-designed fade visually
- Upload images with each issue (5MB max, images only, validated)
- Comprehensive file upload security (MIME type validation, size limits)
- “Send to Jira” button (requires Jira config)

## Tech

- Node.js, Express, Socket.IO
- Postgres (schema auto-migrates on startup)
- Passport + openid-client for Entra ID
- Multer for uploads

## Setup

1. Prerequisites (local dev)

```
- Node.js 20+
- Postgres 13+ with psql CLI
```

2. Install dependencies

```bash
npm install
```

3. Create `.env` from the template values below

```text
PORT=3000
SESSION_SECRET=please_change_me

DATABASE_URL=postgres://username:password@localhost:5432/test_fest_tracker

# Entra ID OIDC
# Use https://login.microsoftonline.com/<tenant-id>/v2.0
ENTRA_ISSUER=
ENTRA_CLIENT_ID=
ENTRA_CLIENT_SECRET=
ENTRA_REDIRECT_URI=http://localhost:3000/auth/callback

# Comma-separated list of emails with Groupier powers (creator is groupier by default)
GROUPIER_EMAILS=

# Tag list editable here
TAGS=duplicate,as-designed,low-priority

# Jira (optional)
JIRA_BASE_URL=
JIRA_EMAIL=
JIRA_API_TOKEN=
JIRA_PROJECT_KEY=
JIRA_ISSUE_TYPE=Bug
```

4. Provision local database (optional but recommended for first run)

```bash
# create the database if it does not exist
createdb test_fest_tracker || true

# apply schema (uses testfest schema, not public)
psql "$DATABASE_URL" -f db/schema.sql
```

5. Run in development mode (Nodemon)

```bash
npm run dev
```

Open `http://localhost:3000`.

## API Documentation

Interactive API documentation is available via Swagger UI at:

```
http://localhost:3000/api-docs
```

The documentation includes:
- Complete endpoint reference for all REST API routes
- Request/response schemas and examples
- Authentication details
- Interactive API testing interface

For more details, see [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md).

### Entra ID setup for development

- Create an app registration in Azure Entra ID (Azure AD)
- Add a Web redirect URI: `http://localhost:3000/auth/callback`
- Configure client secret and set `ENTRA_CLIENT_SECRET`
- Set `ENTRA_ISSUER` to `https://login.microsoftonline.com/<tenant-id>/v2.0`
- Grant basic scopes (openid, profile, email). The app only requires standard OIDC claims

If you see “OIDC not configured” on login, ensure `ENTRA_ISSUER`, `ENTRA_CLIENT_ID`, and `ENTRA_CLIENT_SECRET` are set in `.env`.

## Database schema

You can pre-provision the DB with the SQL file to use a dedicated schema `testfest` (instead of `public`):

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

At runtime, the app will also create the schema/tables if they don’t exist, and sets `search_path` to `testfest,public`. You can override the schema via env var `DB_SCHEMA`.

## Notes

- File uploads are stored under `uploads/` and served via `/uploads/<file>`
- Session store is Postgres via `connect-pg-simple`
- Schema is created on startup if missing

## Containerization (Docker)

Build locally:

```bash
docker build -t test-fest-tracker:local .
docker run --env-file .env -p 3000:3000 test-fest-tracker:local
```

## Bitbucket Pipelines (AWS ECR)

`bitbucket-pipelines.yml` builds the image and pushes to AWS ECR repository `testfest-repo` on branch `main`.

Set these Bitbucket Repository Variables (Repository settings → Pipelines → Repository variables):

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_ACCOUNT_ID` (e.g., 123456789012)
- `AWS_DEFAULT_REGION` (e.g., us-east-1)

The pipeline will tag the image with the commit hash and `latest`.
