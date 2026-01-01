const express = require('express');
const http = require('http');
const request = require('supertest');
const multer = require('multer');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

// Mocks
jest.mock('../../src/prismaClient');
jest.mock('../../src/services/issueService');
jest.mock('../../src/services/jiraService');
jest.mock('../../src/rateLimiter', () => ({
  issueCreationLimiter: (req, res, next) => next(),
  uploadLimiter: (req, res, next) => next(),
  apiLimiter: (req, res, next) => next(),
}));

const { getPrisma } = require('../../src/prismaClient');
const { IssueService } = require('../../src/services/issueService');
const { JiraService } = require('../../src/services/jiraService');

const registerIssueRoutes = require('../../src/routes/issues');

function onceWithTimeout(socket, event, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for socket event: ${event}`));
    }, timeoutMs);

    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function connectClient(baseUrl) {
  const socket = ioClient(baseUrl, {
    transports: ['websocket', 'polling'],
    forceNew: true,
    reconnection: false,
  });

  return socket;
}

async function joinRoom(socket, roomId) {
  if (!socket.connected) {
    await new Promise((resolve, reject) => {
      const onConnect = () => {
        socket.off('connect_error', onError);
        resolve();
      };
      const onError = (err) => {
        socket.off('connect', onConnect);
        reject(err);
      };
      socket.once('connect', onConnect);
      socket.once('connect_error', onError);
    });
  }

  await new Promise((resolve, reject) => {
    socket.emit('room:join', roomId, (ack) => {
      if (ack && ack.ok) return resolve();
      // If no ack is sent, still resolve to avoid hanging; but we expect ack in this test server.
      return resolve();
    });

    // Safety timeout in case the server never acks.
    setTimeout(() => resolve(), 250);

    socket.once('error', reject);
  });
}

describe('Realtime (Socket.IO) multi-user integration', () => {
  jest.setTimeout(15000);

  const upload = multer({ storage: multer.memoryStorage() });

  let app;
  let server;
  let io;
  let baseUrl;

  let mockIssueServiceInstance;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Minimal prisma mock for membership checks
    const mockPrisma = {
      roomMember: { findUnique: jest.fn() },
    };
    mockPrisma.roomMember.findUnique.mockResolvedValue({ is_groupier: false });
    getPrisma.mockReturnValue(mockPrisma);

    mockIssueServiceInstance = {
      createIssue: jest.fn().mockResolvedValue({
        id: 'issue-123',
        room_id: 'room-1',
        script_id: 42,
        description: 'Socket created issue',
        is_issue: true,
        created_by: 'user-1',
        files: [],
      }),
      cleanupFiles: jest.fn(),
    };
    IssueService.mockImplementation(() => mockIssueServiceInstance);

    JiraService.mockImplementation(() => ({
      isConfigured: jest.fn().mockReturnValue(false),
      createIssue: jest.fn(),
    }));

    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Attach an authenticated user (satisfies requireAuth)
    app.use((req, _res, next) => {
      req.user = { id: 'user-1', email: 'dev@example.com', name: 'Dev' };
      next();
    });

    server = http.createServer(app);
    io = new Server(server, {
      cors: { origin: '*' },
    });

    // Match production behavior, but add an ack to make tests deterministic.
    io.on('connection', (socket) => {
      socket.on('room:join', (roomId, cb) => {
        socket.join(roomId);
        if (typeof cb === 'function') cb({ ok: true });
      });
    });

    const router = express.Router();
    registerIssueRoutes(router, {
      io,
      upload,
      uploadsDir: '/tmp/uploads',
      TAGS: ['duplicate', 'as-designed'],
      JIRA_BASE_URL: null,
      JIRA_EMAIL: null,
      JIRA_API_TOKEN: null,
      JIRA_PROJECT_KEY: null,
      JIRA_ISSUE_TYPE: null,
    });
    app.use(router);

    await new Promise((resolve) => {
      server.listen(0, resolve);
    });

    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    if (io) {
      await new Promise((resolve) => io.close(resolve));
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('broadcasts new issue to all clients in the same room', async () => {
    const roomId = 'room-1';

    const clientA = connectClient(baseUrl);
    const clientB = connectClient(baseUrl);

    try {
      await Promise.all([joinRoom(clientA, roomId), joinRoom(clientB, roomId)]);

      const receivedA = onceWithTimeout(clientA, 'issue:new');
      const receivedB = onceWithTimeout(clientB, 'issue:new');

      const res = await request(app)
        .post(`/api/rooms/${roomId}/issues`)
        .field('scriptId', '42')
        .field('description', 'My new issue')
        .field('is_issue', 'true');

      expect(res.status).toBe(200);
      expect(mockIssueServiceInstance.createIssue).toHaveBeenCalled();

      const [payloadA, payloadB] = await Promise.all([receivedA, receivedB]);

      expect(payloadA).toHaveProperty('id', 'issue-123');
      expect(payloadB).toHaveProperty('id', 'issue-123');
    } finally {
      clientA.disconnect();
      clientB.disconnect();
    }
  });
});
