# Future Development Ideas (v2.0+)

This document captures high-level ideas, technical debt, and feature requests for the next major iteration of the Multi-User Test Fest Issue Tracker.

## 🏗 Architectural & Developer Experience (DX)

- **TypeScript Migration**: Convert the entire backend and frontend to TypeScript for better type safety, self-documenting code, and catching errors at compile-time.
- **ES Modules (ESM) Backend**: Move away from CommonJS to use native `import`/`export` across the entire stack.
- **Zod/Joi Integration**: Implement declarative schema validation for all API routes to replace manual validation logic.
- **Frontend Componentization**: Transition from manual DOM manipulation towards a reactive component-based architecture (e.g., React, Vue, or a lightweight custom component system).
- **Service Layer Expansion**: Continue decoupling business logic from routes into isolated, fully unit-tested services.

## ✨ Feature Enhancements

- **Mobile Companion App**: A dedicated mobile interface (or PWA improvements) for testers to report issues directly from handheld devices.
- **Enhanced Leaderboard Gamification**: Add badges, milestones, or "streaks" for consistent contributors during the Test Fest.
- **Jira Two-Way Sync**: Automatically update the status in the tracker when the associated Jira issue is moved to "Done."
- **Exporting Reports**: Generate PDF or Excel summaries of all issues found during a specific Test Fest session.
- **Rich Text / Bold Descriptions**: Move from a plain textarea to a lightweight Markdown or Rich Text editor for issue descriptions.

## 🛠 Stability & Operations

- **E2E Testing Suite**: Implement Playwright or Cypress tests to cover the "happy path" of creating a room, joining, and reporting an issue from a real browser.
- **Dockerized Environment**: Standardize local development further with a full `docker-compose` setup for the app, DB, and Redis.
- **Advanced Monitoring**: Expand Prometheus metrics to include business KPIs (e.g., "Issues reported per hour").

---

_Note: Sticking with the stable v1.x branch for the upcoming Test Fest!_
