const express = require('express');
const request = require('supertest');

// We'll mock prismaClient and service classes before requiring the routes
let mockPrisma;
let mockIssueServiceInstance;
let mockJiraServiceInstance;
let uploadMock;

beforeEach(() => {
  jest.resetModules();

  mockPrisma = {
    roomMember: { findUnique: jest.fn() },
    room: { findUnique: jest.fn() },
    issue: { findUnique: jest.fn() },
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
    createIssue: jest.fn().mockResolvedValue({
      id: 'issue-2',
      script_id: 42,
      description: 'New test issue',
      is_issue: true,
      created_by: 'user-1',
      files: []
    }),
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

  // Mock rate limiters to pass through
  jest.mock('../../src/rateLimiter', () => ({
    issueCreationLimiter: (req, res, next) => next(),
    uploadLimiter: (req, res, next) => next(),
  }));

  // Mock upload middleware
  uploadMock = {
    array: () => (req, res, next) => {
      req.files = [];
      next();
    }
  };
});

afterEach(() => {
  jest.resetModules();
});

describe('Issues API Integration Tests', () => {
  describe('GET /api/rooms/:roomId/issues', () => {
    test('returns issues for a room', async () => {
      const registerIssueRoutes = require('../../src/routes/issues');
      const app = express();
      app.use(express.json());

      app.use((req, res, next) => {
        req.user = { id: 'user-1', email: 'dev@example.com', name: 'Dev' };
        next();
      });

      const router = express.Router();

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
      expect(mockIssueServiceInstance.getRoomIssues).toHaveBeenCalledWith('room-1');
    });

    test('returns 500 on service error', async () => {
      mockIssueServiceInstance.getRoomIssues.mockRejectedValue(new Error('Database error'));

      const registerIssueRoutes = require('../../src/routes/issues');
      const app = express();
      app.use(express.json());

      app.use((req, res, next) => {
        req.user = { id: 'user-1', email: 'dev@example.com', name: 'Dev' };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: '/tmp/uploads',
        TAGS: [],
      });

      app.use(router);

      const res = await request(app).get('/api/rooms/room-1/issues');
      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error', 'Failed to fetch issues');
    });
  });

  describe('POST /api/rooms/:roomId/issues', () => {
    test('creates issue with valid data', async () => {
      const registerIssueRoutes = require('../../src/routes/issues');
      const app = express();
      app.use(express.json());
      app.use(express.urlencoded({ extended: true }));

      app.use((req, res, next) => {
        req.user = { id: 'user-1', email: 'dev@example.com', name: 'Dev' };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: '/tmp/uploads',
        TAGS: ['duplicate'],
      });

      app.use(router);

      const res = await request(app)
        .post('/api/rooms/room-1/issues')
        .field('scriptId', '42')
        .field('description', 'Test issue description')
        .field('is_issue', 'true');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', 'issue-2');
      expect(mockIssueServiceInstance.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          roomId: 'room-1',
          userId: 'user-1',
          scriptId: 42,
          description: 'Test issue description',
          isIssue: true,
        })
      );
    });

    test('returns 400 for missing scriptId', async () => {
      const registerIssueRoutes = require('../../src/routes/issues');
      const app = express();
      app.use(express.json());
      app.use(express.urlencoded({ extended: true }));

      app.use((req, res, next) => {
        req.user = { id: 'user-1', email: 'dev@example.com', name: 'Dev' };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: '/tmp/uploads',
        TAGS: [],
      });

      app.use(router);

      const res = await request(app)
        .post('/api/rooms/room-1/issues')
        .field('description', 'Test issue');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Script ID is required and must be numeric');
    });

    test('returns 400 for invalid scriptId', async () => {
      const registerIssueRoutes = require('../../src/routes/issues');
      const app = express();
      app.use(express.json());
      app.use(express.urlencoded({ extended: true }));

      app.use((req, res, next) => {
        req.user = { id: 'user-1', email: 'dev@example.com', name: 'Dev' };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: '/tmp/uploads',
        TAGS: [],
      });

      app.use(router);

      const res = await request(app)
        .post('/api/rooms/room-1/issues')
        .field('scriptId', 'not-a-number')
        .field('description', 'Test issue');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Script ID is required and must be numeric');
    });

    test('returns 400 for missing description', async () => {
      const registerIssueRoutes = require('../../src/routes/issues');
      const app = express();
      app.use(express.json());
      app.use(express.urlencoded({ extended: true }));

      app.use((req, res, next) => {
        req.user = { id: 'user-1', email: 'dev@example.com', name: 'Dev' };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: '/tmp/uploads',
        TAGS: [],
      });

      app.use(router);

      const res = await request(app)
        .post('/api/rooms/room-1/issues')
        .field('scriptId', '42');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Issue Description is required');
    });
  });

  describe('POST /api/issues/:id/status', () => {
    test('updates status for groupier', async () => {
      mockPrisma.roomMember.findUnique.mockResolvedValue({ is_groupier: true });

      const registerIssueRoutes = require('../../src/routes/issues');
      const app = express();
      app.use(express.json());

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
      });

      app.use(router);

      const res = await request(app)
        .post('/api/issues/issue-1/status')
        .send({ status: 'closed', roomId: 'room-1' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', 'issue-1');
      expect(res.body).toHaveProperty('status', 'closed');
    });

    test('returns 403 for non-groupier', async () => {
      mockPrisma.roomMember.findUnique.mockResolvedValue({ is_groupier: false });

      const registerIssueRoutes = require('../../src/routes/issues');
      const app = express();
      app.use(express.json());

      app.use((req, res, next) => {
        req.user = { id: 'user-1', email: 'dev@example.com', name: 'Dev' };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: '/tmp/uploads',
        TAGS: ['open', 'closed'],
      });

      app.use(router);

      const res = await request(app)
        .post('/api/issues/issue-1/status')
        .send({ status: 'closed', roomId: 'room-1' });

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error', 'Forbidden');
    });

    test('returns 400 for invalid status', async () => {
      mockPrisma.roomMember.findUnique.mockResolvedValue({ is_groupier: true });

      const registerIssueRoutes = require('../../src/routes/issues');
      const app = express();
      app.use(express.json());

      app.use((req, res, next) => {
        req.user = { id: 'user-1', email: 'dev@example.com', name: 'Dev' };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: '/tmp/uploads',
        TAGS: ['open', 'closed'],
      });

      app.use(router);

      const res = await request(app)
        .post('/api/issues/issue-1/status')
        .send({ status: 'invalid-status', roomId: 'room-1' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Invalid status');
    });
  });

  describe('POST /api/issues/:id/jira', () => {
    test('creates jira issue for groupier', async () => {
      mockPrisma.issue.findUnique.mockResolvedValue({
        id: 'issue-1',
        room_id: 'room-1',
        created_by: 'user-1',
        jira_key: null
      });
      mockPrisma.roomMember.findUnique.mockResolvedValue({ is_groupier: true });
      mockPrisma.room.findUnique.mockResolvedValue({ id: 'room-1', name: 'Room Name' });

      const registerIssueRoutes = require('../../src/routes/issues');
      const app = express();
      app.use(express.json());

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

    test('creates jira issue for creator', async () => {
      mockPrisma.issue.findUnique.mockResolvedValue({
        id: 'issue-1',
        room_id: 'room-1',
        created_by: 'user-1',
        jira_key: null
      });
      mockPrisma.roomMember.findUnique.mockResolvedValue({ is_groupier: false });
      mockPrisma.room.findUnique.mockResolvedValue({ id: 'room-1', name: 'Room Name' });

      const registerIssueRoutes = require('../../src/routes/issues');
      const app = express();
      app.use(express.json());

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

    test('returns 403 for non-creator non-groupier', async () => {
      mockPrisma.issue.findUnique.mockResolvedValue({
        id: 'issue-1',
        room_id: 'room-1',
        created_by: 'user-2'  // Different user
      });
      mockPrisma.roomMember.findUnique.mockResolvedValue({ is_groupier: false });

      const registerIssueRoutes = require('../../src/routes/issues');
      const app = express();
      app.use(express.json());

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

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error', 'Forbidden');
    });

    test('returns 404 for non-existent issue', async () => {
      mockPrisma.issue.findUnique.mockResolvedValue(null);

      const registerIssueRoutes = require('../../src/routes/issues');
      const app = express();
      app.use(express.json());

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

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Issue not found');
    });

    test('returns 500 when Jira not configured', async () => {
      mockPrisma.issue.findUnique.mockResolvedValue({
        id: 'issue-1',
        room_id: 'room-1',
        created_by: 'user-1'
      });
      mockPrisma.roomMember.findUnique.mockResolvedValue({ is_groupier: true });
      mockJiraServiceInstance.isConfigured.mockReturnValue(false);

      const registerIssueRoutes = require('../../src/routes/issues');
      const app = express();
      app.use(express.json());

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
        JIRA_BASE_URL: null,
        JIRA_EMAIL: null,
        JIRA_API_TOKEN: null,
        JIRA_PROJECT_KEY: null,
        JIRA_ISSUE_TYPE: null,
      });

      app.use(router);

      const res = await request(app)
        .post('/api/issues/issue-1/jira')
        .send({ roomId: 'room-1' });

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error', 'Jira not configured');
    });

    test('returns existing jira_key if already linked', async () => {
      mockPrisma.issue.findUnique.mockResolvedValue({
        id: 'issue-1',
        room_id: 'room-1',
        created_by: 'user-1',
        jira_key: 'EXISTING-123'
      });
      mockPrisma.roomMember.findUnique.mockResolvedValue({ is_groupier: true });

      const registerIssueRoutes = require('../../src/routes/issues');
      const app = express();
      app.use(express.json());

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
      expect(res.body).toHaveProperty('jira_key', 'EXISTING-123');
      expect(mockJiraServiceInstance.createIssue).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/issues/:id', () => {
    test('deletes issue for creator', async () => {
      mockPrisma.issue.findUnique.mockResolvedValue({
        id: 'issue-1',
        room_id: 'room-1',
        created_by: 'user-1'
      });
      mockPrisma.roomMember.findUnique.mockResolvedValue({ is_groupier: false });

      const registerIssueRoutes = require('../../src/routes/issues');
      const app = express();
      app.use(express.json());

      app.use((req, res, next) => {
        req.user = { id: 'user-1', email: 'dev@example.com', name: 'Dev' };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: '/tmp/uploads',
        TAGS: [],
      });

      app.use(router);

      const res = await request(app).delete('/api/issues/issue-1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
      expect(mockIssueServiceInstance.deleteIssue).toHaveBeenCalledWith('issue-1');
    });

    test('deletes issue for groupier', async () => {
      mockPrisma.issue.findUnique.mockResolvedValue({
        id: 'issue-1',
        room_id: 'room-1',
        created_by: 'user-2'  // Different user
      });
      mockPrisma.roomMember.findUnique.mockResolvedValue({ is_groupier: true });

      const registerIssueRoutes = require('../../src/routes/issues');
      const app = express();
      app.use(express.json());

      app.use((req, res, next) => {
        req.user = { id: 'user-1', email: 'dev@example.com', name: 'Dev' };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: '/tmp/uploads',
        TAGS: [],
      });

      app.use(router);

      const res = await request(app).delete('/api/issues/issue-1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
    });

    test('returns 403 for non-creator non-groupier', async () => {
      mockPrisma.issue.findUnique.mockResolvedValue({
        id: 'issue-1',
        room_id: 'room-1',
        created_by: 'user-2'
      });
      mockPrisma.roomMember.findUnique.mockResolvedValue({ is_groupier: false });

      const registerIssueRoutes = require('../../src/routes/issues');
      const app = express();
      app.use(express.json());

      app.use((req, res, next) => {
        req.user = { id: 'user-1', email: 'dev@example.com', name: 'Dev' };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: '/tmp/uploads',
        TAGS: [],
      });

      app.use(router);

      const res = await request(app).delete('/api/issues/issue-1');

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error', 'Forbidden');
    });

    test('returns 404 for non-existent issue', async () => {
      mockPrisma.issue.findUnique.mockResolvedValue(null);

      const registerIssueRoutes = require('../../src/routes/issues');
      const app = express();
      app.use(express.json());

      app.use((req, res, next) => {
        req.user = { id: 'user-1', email: 'dev@example.com', name: 'Dev' };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: '/tmp/uploads',
        TAGS: [],
      });

      app.use(router);

      const res = await request(app).delete('/api/issues/issue-1');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Issue not found');
    });
  });
});
