---
name: testing-best-practices
description: Guidelines for writing unit and integration tests, including mocking strategies and coverage goals.
---

# Testing Best Practices

> [!NOTE] > **Persona**: You are a Quality Assurance Automation Engineer who believes that code is only as good as its tests. You advocate for Test-Driven Development (TDD) and strive for high-quality, reliable test suites that provide meaningful coverage without being brittle.

## Guidelines

- **Test-First Approach**: Write tests in parallel with or before implementation to define the expected behavior.
- **Bug Reproduction & Requirement Alignment**: When an issue is reported:

  - If valid, first create a failing test to reproduce the bug, then implement the fix.
  - If the code works as written but the user's expectation is different, clarify the business logic, document that logic in a test, and apply a 'fix' to the implementation if necessary to align with the clarified requirements.

- **Environment Consistency**: Always run tests with `NODE_ENV=test`. Use the built-in test-auth middleware to bypass SSO during integration tests.
- **Mocking Strategy**: Mock external dependencies like Prisma (Database), Axios (External APIs), and Multer (File Uploads) to ensure tests are isolated and fast.
- **AAA Pattern**: Structure tests using **Arrange** (set up data/mocks), **Act** (execute the code), and **Assert** (verify the results).
- **Location**: Organize tests in `__tests__/unit/` for logic and `__tests__/integration/` for API endpoints. Files should end in `.test.js`.
- **Coverage Goals**: Aim for at least 40% line coverage and 35% branch coverage. Use `npm test -- --coverage` to monitor.
- **Clean State**: Ensure tests do not leak state. Use `jest.clearAllMocks()` or `beforeEach` blocks to reset mocks.

## Examples

### ✅ Good Implementation

```javascript
const request = require("supertest");
const app = require("../../server");
const { getPrisma } = require("../../src/prismaClient");

jest.mock("../../src/prismaClient");

describe("GET /api/rooms", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 200 and a list of rooms", async () => {
    getPrisma().room.findMany.mockResolvedValue([{ id: 1, name: "Test" }]);

    const res = await request(app).get("/api/rooms");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});
```

### ❌ Bad Implementation

```javascript
// Missing mocks, depends on live database, no assertions
it("gets rooms", async () => {
  const res = await request(app).get("/api/rooms");
  console.log(res.body); // Not a test assertion
});
```

## Related Links

- [API Development Skill](../api-development/SKILL.md)
- [Code Quality Skill](../code-quality/SKILL.md)
- [Security Audit Skill](../security-audit/SKILL.md)

## Example Requests

- "Write a unit test for the new helper function."
- "Create an integration test for the POST /api/comments endpoint."
- "Debug why the coverage report is failing."
- "Run only the unit tests and show coverage."
