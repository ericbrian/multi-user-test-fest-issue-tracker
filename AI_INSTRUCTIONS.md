# Test Fest Tracker — AI Development Guide

This document orients future AI/code assistants to continue development efficiently.

## Overview
- Purpose: Multi-user, real-time bug/issue tracker for Test Fests.
- Stack: Node.js (Express), Socket.IO, Postgres, Multer (uploads), Passport + openid-client (Entra ID), Axios (Jira), Docker, Bitbucket Pipelines (ECR), Snyk scans.
- Frontend: Simple HTML (no framework) served from `public/index.html` with assets:
  - Styles in `public/styles.css`
  - Client logic in `public/app.js`
- Realtime: Socket.IO emits on new issues and updates.

## Key Files
- `server.js`: Main server, routes, sockets, OIDC, DB bootstrap, Jira integration.
- `public/index.html`: Minimal split-view UI (left: form/room controls, right: live issues).
- `db/schema.sql`: SQL to create `testfest` schema and tables.
- `Dockerfile`, `.dockerignore`: Containerization.
- `bitbucket-pipelines.yml`: Build/push to AWS ECR with Snyk scans.
- `README.md`: Setup, dev mode, Docker, pipelines.
- `.env.example`: Example env vars (copy to `.env`).

## Environment Variables (required/important)
- Server
  - `PORT` (default 3000)
  - `SESSION_SECRET` (required in prod)
  - `DISABLE_SSO` (dev convenience; `true` auto-auths a user)
  - `DEV_USER_EMAIL`, `DEV_USER_NAME` (used if SSO disabled)
- Database
  - `DATABASE_URL` (Postgres connection string)
  - `DB_SCHEMA` (default `testfest`)
- Entra ID (OIDC)
  - `ENTRA_ISSUER` (e.g., https://login.microsoftonline.com/<tenant-id>/v2.0)
  - `ENTRA_CLIENT_ID`
  - `ENTRA_CLIENT_SECRET`
  - `ENTRA_REDIRECT_URI` (default http://localhost:3000/auth/callback)
- Roles/Tags
  - `GROUPIER_EMAILS` (comma-separated emails; creators are groupiers by default)
  - `TAGS` (comma-separated, default: duplicate,as-designed,low-priority)
- Jira (optional)
  - `JIRA_BASE_URL` (e.g., https://your-domain.atlassian.net)
  - `JIRA_EMAIL`
  - `JIRA_API_TOKEN`
  - `JIRA_PROJECT_KEY`
  - `JIRA_ISSUE_TYPE` (default: Bug)

## Database
- Schema: Non-public `testfest` schema. On startup the app:
  - Creates schema if missing.
  - Sets `search_path` to `<DB_SCHEMA>, public` for each connection.
  - Creates tables if missing: `users`, `rooms`, `room_members`, `issues`.
- SQL provisioning: `psql "$DATABASE_URL" -f db/schema.sql`

## Auth
- Default: Entra ID OIDC using `openid-client` and Passport.
- Dev mode: Set `DISABLE_SSO=true` to bypass SSO and auto-inject a dev user.
- Session storage: `connect-pg-simple` backed by Postgres.

## Realtime
- Socket events:
  - Client → Server: `room:join` with `roomId`.
  - Server → Client: `issue:new` on new issues, `issue:update` on status/Jira changes.

## HTTP API (selected)
- Auth
  - `GET /auth/login` → OIDC login (no-op redirect when `DISABLE_SSO=true`)
  - `GET /auth/callback` → OIDC callback
  - `POST /auth/logout` → Logout
  - `GET /me` → `{ user, tags }`
- Rooms
  - `GET /api/rooms` → list rooms (auth)
  - `POST /api/rooms` → create room (auth, creator becomes Groupier)
  - `POST /api/rooms/:roomId/join` → join room (auth)
  - `GET /api/rooms/:roomId/issues` → list issues
- Issues
  - `POST /api/rooms/:roomId/issues` → create issue (multipart: `images[]`), emits `issue:new`
  - `POST /api/issues/:id/status` → set status (Groupier only), emits `issue:update`
  - `POST /api/issues/:id/jira` → create Jira issue (Groupier only), emits `issue:update`
- Health
  - `GET /health` → `{ status: 'ok' }`

## Frontend Behavior
- Left panel: login/logout, room selector + "Create a new Room", issue form. Form is hidden until a room is selected/created.
- Right panel: real-time issue list. Items are ordered by numeric Script ID (ascending), then by created time.
- Local persistence: last room stored in `localStorage` and auto-joined (user must explicitly choose after login per current UI gating).
- Each issue has a footer with status tags (left) and actions (right). If an issue has a `jira_key`, the footer hides actions and shows a Jira link instead.
- Clicking an image opens a lightbox (full-size view).

### Tags / Status logic (very important)
- Tags available are configured via `TAGS` env var.
- Applying ANY tag causes the issue to fade; clearing the status removes the fade.
- Clearing the status is done by posting `status: "clear-status"` to the server, which normalizes to `open`.
- The currently applied tag is rendered with an `active` style in the UI.
- The client refreshes the issue list on `issue:new`, `issue:update`, and `issue:delete` socket events to preserve Script ID ordering and reflect tag changes immediately.

### Delete permissions
- Delete allowed for the issue creator or a Groupier. Deletion emits `issue:delete` and attempts to remove uploaded files from disk.

## File Uploads
- Uses Multer to save images under `uploads/` and serves via `/uploads/...`.
- Consider moving to S3 in production (future enhancement).

## Docker & ECS
- Build: `docker build -t test-fest-tracker:local .`
- Run: `docker run --env-file .env -p 3000:3000 test-fest-tracker:local`
- Healthcheck: Container uses `/health`.
- ECS: Pushes to ECR repo `testfest-repo` via Bitbucket Pipelines; configure Task Definition to expose port 3000, set env vars, and attach a persistent storage or migrate to S3 for uploads.

## CI/CD (Bitbucket Pipelines)
- Multi-step pipeline:
  1) Snyk Open Source & Code scan (requires `SNYK_TOKEN`)
  2) Build Docker image (artifact)
  3) Snyk Container scan
  4) Push to AWS ECR repo `testfest-repo`
- Required repo variables: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ACCOUNT_ID`, `AWS_DEFAULT_REGION`, `SNYK_TOKEN` (optional `SNYK_SEVERITY_THRESHOLD`).

## Development
- Dev mode: `npm run dev` (Nodemon). Visit http://localhost:3000
- To disable SSO in dev: `DISABLE_SSO=true` (optional `DEV_USER_EMAIL`, `DEV_USER_NAME`).
- Pre-provision DB: `createdb test_fest_tracker || true && psql "$DATABASE_URL" -f db/schema.sql`

### UI/UX Preferences
- Avoid gradient backgrounds and gradient buttons. Use solid colors instead (already applied in `public/index.html`).

## Coding Guidelines
- Prefer clarity and explicit variable names.
- Keep routes small and error-handling explicit.
- Avoid deep nesting; prefer early returns.
- Frontend stays minimal (no framework) unless explicitly requested to expand.

## Known Gaps / Backlog
- Replace local uploads with S3 (signed URL uploads + public read or proxy).
- Add pagination or lazy-loading for issues.
- Add room access controls (private rooms, invites).
- Add server-side input validation (Joi/Zod) and max upload size limits.
- Rate limiting on write endpoints.
- Automated tests (unit/integration) and a simple test dataset/seed script.
- Observability: structured logging and metrics.

## Quick References
- Entry points: `GET /` serves `public/index.html`.
- Static: `public/`, `uploads/`.
- Status tags configurable via `TAGS` env var.
- Users are stored by OIDC `sub`; in dev, a fixed `sub` of `dev-user` is used.

This guide should equip an AI assistant to extend features, improve reliability, and integrate additional services with minimal context switching.
