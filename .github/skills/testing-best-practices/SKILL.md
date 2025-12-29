---
name: testing-best-practices
description: Guidelines for writing unit and integration tests, including mocking strategies and coverage goals.
---

# Testing Best Practices Skill

This skill outlines the testing strategy, tools, and standards for the `test-fest-tracker`.

## When to use this skill

- When creating new features (write tests first or in parallel).
- When refactoring code (ensure tests pass).
- When debugging issues (create a reproduction test).

## Test Stack

- **Framework**: [Jest](https://jestjs.io/)
- **Integration Helper**: `supertest`
- **Location**: `__tests__/` directory.
  - `__tests__/unit/`: Service and utility tests.
  - `__tests__/integration/`: API endpoint tests.

## Running Tests

```bash
npm test                  # Run all tests
npm run test:watch        # Watch mode
npm run test:unit         # Only unit tests
npm test -- --coverage    # Run with coverage report
```

### Coverage Goals

- **Lines**: 40%
- **Branches**: 35%
- **Functions**: 30%
- **Statements**: 40%

## Integration Testing & Auth

Since SSO is mandatory, we handle authentication in tests using a special **Test Mode**.

### How it works

1. **Environment**: Tests must run with `NODE_ENV=test`.
2. **Middleware**: `createTestAuthMiddleware` in `src/middleware.js` bypasses Entra ID and auto-creates a mock user when `NODE_ENV=test`.
3. **Configuration**: `src/config.js` skips SSO config validation in test mode.

### Writing an Integration Test

```javascript
const request = require("supertest");
const app = require("../../server"); // Ensure server is exported
const { getPrisma } = require("../../src/prismaClient");

// Mock Prisma
jest.mock("../../src/prismaClient", () => ({
  getPrisma: jest.fn(() => mockPrismaClient),
}));

describe("GET /api/rooms", () => {
  it("should return 200 and a list of rooms", async () => {
    const res = await request(app).get("/api/rooms");
    expect(res.status).toBe(200);
  });
});
```

_Note: For multipart/form-data tests, additional mocking of `multer` may be required._

## Mocking Strategies

### Database (Prisma)

Always mock Prisma to avoid needing a running DB for unit tests.
Use `jest.mock('../../src/prismaClient')`.

### External Services (Jira, Axios)

Mock `axios` responses to simulate external APIs.

```javascript
jest.mock("axios");
axios.post.mockResolvedValue({ data: { key: "TEST-123" } });
```

## Procedures

### Creating a New Test Suite

1. Create a file in `__tests__/unit` or `__tests__/integration` ending in `.test.js`.
2. Use `describe` blocks to group tests by function or endpoint.
3. Use `it` or `test` for individual cases.
4. Follow **AAA**: Arrange, Act, Assert.

## Example Requests

- "Write a unit test for the new helper function."
- "Create an integration test for the POST /api/comments endpoint."
- "Debug why the coverage report is failing."
