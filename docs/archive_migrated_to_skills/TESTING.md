# Testing Guide

This document describes the testing setup and how to run tests for the Test Fest Issue Tracker.

## Overview

The project uses **Jest** as the testing framework with the following test types:

- **Unit Tests**: Test individual functions and modules in isolation
- **Integration Tests**: Test API endpoints and component interactions (placeholder examples)

## Setup

Install dependencies:

```bash
npm install
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode (during development)
```bash
npm run test:watch
```

### Run only unit tests
```bash
npm run test:unit
```

### Run with coverage report
```bash
npm test -- --coverage
```

## Test Structure

```
__tests__/
├── unit/              # Unit tests for services and utilities
│   ├── config.test.js          # Configuration validation tests
│   ├── middleware.test.js      # Authentication middleware tests
│   └── jiraService.test.js     # Jira integration service tests
└── integration/       # Integration tests for API endpoints
    └── auth.test.js            # Authentication endpoint tests
```

## Coverage Goals

Current enforced Jest coverage thresholds:
- **Branches**: 35%
- **Functions**: 30%
- **Lines**: 40%
- **Statements**: 40%

## Writing Tests

### Unit Test Example

```javascript
const { JiraService } = require('../../src/services/jiraService');

describe('JiraService', () => {
  let jiraService;

  beforeEach(() => {
    jiraService = new JiraService(config);
  });

  test('should generate valid label from room name', () => {
    const label = jiraService.generateRoomLabel('My Test Room');
    expect(label).toBe('testfest-my-test-room');
  });
});
```

### Integration Test Setup (TODO)

Integration tests require additional setup:

1. **Test Database**: Create a separate test database
2. **Mock Authentication**: Use test tokens or mock passport
3. **Clean State**: Reset database between tests

Example structure:

```javascript
describe('POST /api/rooms', () => {
  beforeEach(async () => {
    // Set up test database
    await setupTestDB();
  });

  afterEach(async () => {
    // Clean up
    await cleanupTestDB();
  });

  test('should create a new room', async () => {
    const response = await request(app)
      .post('/api/rooms')
      .set('Authorization', 'Bearer test-token')
      .send({ name: 'Test Room' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('id');
  });
});
```

## Current Test Coverage

### Completed Tests

✅ **Config Validation**
- Required environment variables
- Schema validation
- Port validation
- Default values

✅ **Middleware**
- requireAuth function
- Dev auto-auth middleware

✅ **Jira Service**
- Configuration checks
- Label generation
- Issue creation
- Error handling

### TODO: Tests to Add

- [ ] IssueService unit tests
- [ ] RoomService unit tests
- [ ] Rate limiter configuration tests
- [ ] Full integration tests with test database
- [ ] Socket.IO event tests
- [ ] File upload tests
- [ ] XSS sanitization tests

## Mocking

### Mocking Prisma

```javascript
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  room: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
};

jest.mock('../src/prismaClient', () => ({
  getPrisma: () => mockPrisma,
}));
```

### Mocking Axios

```javascript
jest.mock('axios');
const axios = require('axios');

axios.post.mockResolvedValueOnce({ data: { key: 'TEST-123' } });
```

## Best Practices

1. **Isolate tests**: Each test should be independent
2. **Clean up**: Always restore mocks and clear state after tests
3. **Descriptive names**: Use clear, descriptive test names
4. **AAA Pattern**: Arrange, Act, Assert
5. **Mock external dependencies**: Database, HTTP calls, file system
6. **Test edge cases**: Not just happy paths

## CI/CD Integration

Tests run automatically in Bitbucket Pipelines:

```yaml
script:
  - npm install
  - npm test
```

## Debugging Tests

Run specific test file:
```bash
npx jest __tests__/unit/config.test.js
```

Run with verbose output:
```bash
npm test -- --verbose
```

Run single test:
```bash
npx jest -t "should generate valid label"
```

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
