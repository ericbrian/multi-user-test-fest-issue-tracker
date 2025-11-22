const express = require('express');
const request = require('supertest');

// We'll mock prismaClient and service classes before requiring the routes
let mockPrisma;
let mockIssueServiceInstance;
let mockJiraServiceInstance;

beforeEach(() => {
  jest.resetModules();

  mockPrisma = {
    roomMember: { findUnique: jest.fn() },
    room: { findUnique: jest.fn() },
  };

  // Mock prismaClient.getPrisma
  jest.mock('../../src/prismaClient', () => ({
    getPrisma: () => mockPrisma,
  }));

  // Mock IssueService class
  mockIssueServiceInstance = {
    getRoomIssues: jest.fn().mockResolvedValue([
      { id: 'issue-1', script_id: 1, description: 'Test issue', created_by: 'user-1' }
    ]),
    createIssue: jest.fn().mockResolvedValue({ id: 'issue-2' }),
    updateStatus: jest.fn().mockResolvedValue({ id: 'issue-1', status: 'closed' }),
    updateJiraKey: jest.fn().mockResolvedValue({ id: 'issue-1', jira_key: 'PROJ-1' }),
    deleteIssue: jest.fn().mockResolvedValue(true),
    cleanupFiles: jest.fn(),
  };

  jest.mock('../../src/services/issueService', () => ({
    IssueService: jest.fn().mockImplementation(() => mockIssueServiceInstance),
  }));

  // Mock JiraService
  mockJiraServiceInstance = {
    isConfigured: jest.fn().mockReturnValue(true),
    createIssue: jest.fn().mockResolvedValue('PROJ-1'),
  };
  jest.mock('../../src/services/jiraService', () => ({
    JiraService: jest.fn().mockImplementation(() => mockJiraServiceInstance),
  }));
});

afterEach(() => {
  jest.resetModules();
});

test('GET /api/rooms/:roomId/issues returns issues', async () => {
  const registerIssueRoutes = require('../../src/routes/issues');
  const app = express();
  app.use(express.json());

  // simple auth middleware: attach dev user
  app.use((req, res, next) => {
    req.user = { id: 'user-1', email: 'dev@example.com', name: 'Dev' };
    next();
  });

  const router = express.Router();

  const uploadMock = { array: () => (req, res, next) => next() };

  registerIssueRoutes(router, {
    io: { to: () => ({ emit: jest.fn() }) },
    upload: uploadMock,
    uploadsDir: '/tmp/uploads',
    TAGS: ['duplicate', 'as-designed'],
    JIRA_BASE_URL: null,
    JIRA_EMAIL: null,
    JIRA_API_TOKEN: null,
    JIRA_PROJECT_KEY: null,
    JIRA_ISSUE_TYPE: null,
  });

  app.use(router);

  const res = await request(app).get('/api/rooms/room-1/issues');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  expect(res.body[0].id).toBe('issue-1');
});

test('POST /api/issues/:id/status updates status for groupier', async () => {
  const registerIssueRoutes = require('../../src/routes/issues');
  const app = express();
  app.use(express.json());

  // Mock prisma membership to show groupier
  mockPrisma.roomMember.findUnique.mockResolvedValue({ is_groupier: true });

  // attach user
  app.use((req, res, next) => {
    req.user = { id: 'user-1', email: 'dev@example.com', name: 'Dev' };
    next();
  });

  const router = express.Router();

  registerIssueRoutes(router, {
    io: { to: () => ({ emit: jest.fn() }) },
    upload: uploadMock,
    uploadsDir: '/tmp/uploads',
    TAGS: ['open', 'in-progress', 'closed'],
    JIRA_BASE_URL: null,
    JIRA_EMAIL: null,
    JIRA_API_TOKEN: null,
    JIRA_PROJECT_KEY: null,
    JIRA_ISSUE_TYPE: null,
  });

  app.use(router);

  const res = await request(app)
    .post('/api/issues/issue-1/status')
    .send({ status: 'closed', roomId: 'room-1' });

  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('id', 'issue-1');
  expect(res.body).toHaveProperty('status', 'closed');
});

test('POST /api/issues/:id/jira creates jira issue if permitted', async () => {
  const registerIssueRoutes = require('../../src/routes/issues');
  const app = express();
  app.use(express.json());

  // Mock issue and membership flow via prisma in middleware
  mockPrisma.issue = { findUnique: jest.fn().mockResolvedValue({ id: 'issue-1', room_id: 'room-1', created_by: 'user-1' }) };
  mockPrisma.roomMember.findUnique.mockResolvedValue({ is_groupier: true });
  mockPrisma.room.findUnique.mockResolvedValue({ id: 'room-1', name: 'Room Name' });

  app.use((req, res, next) => {
    req.user = { id: 'user-1', email: 'dev@example.com', name: 'Dev' };
    next();
  });

  const router = express.Router();

  registerIssueRoutes(router, {
    io: { to: () => ({ emit: jest.fn() }) },
    upload: uploadMock,
    uploadsDir: '/tmp/uploads',
    TAGS: ['open'],
    JIRA_BASE_URL: 'https://example.atlassian.net',
    JIRA_EMAIL: 'jira@example.com',
    JIRA_API_TOKEN: 'token',
    JIRA_PROJECT_KEY: 'PROJ',
    JIRA_ISSUE_TYPE: 'Bug',
  });

  app.use(router);

  const res = await request(app)
    .post('/api/issues/issue-1/jira')
    .send({ roomId: 'room-1' });

  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('jira_key', 'PROJ-1');
});
