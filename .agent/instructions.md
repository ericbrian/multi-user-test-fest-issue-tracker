# Agent Constraints and Instructions

This file contains critical constraints and instructions that MUST be followed by any AI agent working on this repository.

## Critical Constraints

- **DO NOT CHANGE THE PRODUCTION DATABASE.** No modifications, migrations, or data changes should be applied to the production database environment under any circumstances.
- **Testing Isolation:** All tests must run in an isolated environment. Unit and Integration tests should use mocks to avoid database dependencies. API tests must only target a local/test database instance.
